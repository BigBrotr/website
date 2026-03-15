---
title: "Self-Hosting BigBrotr: From Bare Metal to Production in One Afternoon"
date: 2026-03-15
authors:
  - bigbrotr
tags:
  - tutorial
  - self-hosting
  - infrastructure
  - postgresql
description: A complete walkthrough for deploying BigBrotr on your own hardware — Proxmox, ZFS storage pools tuned for PostgreSQL, Docker Compose orchestration, Cloudflare Tunnel for zero-port API exposure, and production hardening. No cloud, no monthly bill, full control.
excerpt: A complete walkthrough for deploying BigBrotr on your own hardware — Proxmox, ZFS storage pools tuned for PostgreSQL, Docker Compose orchestration, Cloudflare Tunnel for zero-port API exposure, and production hardening. No cloud, no monthly bill, full control.
---

Running a Nostr relay observatory means storing a lot of data. Events, metadata, health checks, materialized views — the database grows by gigabytes per day once all eight services are humming. Cloud hosting works, but the storage costs add up fast, and you're always one `terraform destroy` away from losing your dataset.

Self-hosting solves that. A dedicated machine with a few terabytes of SSD storage, a properly tuned PostgreSQL, and a Cloudflare Tunnel for secure API exposure gives you everything a cloud deployment would, minus the recurring bill and with the added benefit of full control over your data.

This post walks through the entire deployment: from a fresh Proxmox install to a fully operational BigBrotr instance serving `api.yourdomain.com` over HTTPS with zero inbound ports. It's the same process we used for our own production deployment.

> The full step-by-step guide with every command is available at [Self-Hosting Guide](/docs/guides/self-hosting/).

---

## The Hardware

You don't need anything exotic. A used server or a mini PC with enough RAM and a few SSDs is plenty. Here's the minimum and what we actually used:

| Component | Minimum | Our Setup |
|-----------|---------|-----------|
| CPU | 8 cores | 16 cores / 32 threads |
| RAM | 32 GB | 96 GB |
| Boot | 1x SSD (any size) | 2x NVMe 1TB (ZFS mirror) |
| Database | 2x SSD, 1TB+ (mirror) | 4x 4TB SATA SSD (ZFS RAID10) |
| Backups | Any spare disk | 2x 4TB SATA SSD (ZFS stripe) |

The CPU isn't the bottleneck — PostgreSQL and the services are mostly I/O-bound. RAM matters a lot (it's PostgreSQL's buffer cache), and SSD IOPS matter for write-heavy workloads like event archiving.

---

## Why ZFS?

Every disk in the system runs ZFS. Not because it's trendy, but because it solves real problems for a database workload:

**Data integrity**. ZFS checksums every block. A silent bit flip on a SATA disk doesn't corrupt your `relay` table — ZFS detects it and repairs from the mirror.

**Compression**. LZ4 compression is practically free on modern CPUs and PostgreSQL data compresses well (~1.5-2x). That 4TB disk effectively holds 6-8TB of database pages.

**Tunable record size**. PostgreSQL uses 8KB pages. We set `recordsize=8K` on the database pool, so every ZFS block maps exactly to one PostgreSQL page. No read-modify-write amplification, no wasted space.

**Metadata-only caching**. PostgreSQL manages its own buffer cache via `shared_buffers`. Having ZFS also cache the same data in ARC wastes RAM. Setting `primarycache=metadata` tells ZFS to only cache filesystem metadata, leaving the actual data caching to PostgreSQL where it belongs.

The database pool is RAID10 (two mirrored pairs striped) — fast reads, fast writes, survives a disk failure in each pair. The backup pool is a stripe (no redundancy) because dump files are reproducible.

---

## The VM Architecture

BigBrotr runs in a single Proxmox VM with three virtual disks, each backed by a different ZFS pool:

```
┌──────────────────────────────────────────────────┐
│              Proxmox Host (NVMe)                 │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │         VM "bigbrotr" (Debian 13)          │  │
│  │                                            │  │
│  │  scsi0  →  NVMe pool  →  OS (50 GiB)       │  │
│  │  scsi1  →  datapool   →  /mnt/pgdata       │  │
│  │  scsi2  →  workpool   →  /mnt/work         │  │
│  │                                            │  │
│  │  Docker Compose (15 containers)            │  │
│  │  cloudflared (Cloudflare Tunnel)           │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

The OS disk lives on fast NVMe (for Docker image pulls, container startups, and general OS operations). The database data directory is symlinked to `/mnt/pgdata`, which is an XFS filesystem on a dedicated virtual disk backed by the RAID10 pool. The work disk holds dump files and research exports.

**Why a VM instead of bare metal?** Proxmox lets you snapshot the entire VM before risky operations, easily resize disks, and run additional VMs (like a research environment) on the same hardware. The overhead of KVM virtualization with VirtIO paravirtualized devices is negligible for this workload.

**Why XFS inside the VM?** The virtual disk already sits on ZFS (which handles checksumming, compression, and mirroring). Inside the VM, XFS adds journal tuning options (`logbufs=8,logbsize=256k`) that improve PostgreSQL write throughput. It's one of the few filesystems that performs well under sustained sequential writes from WAL and checkpoint I/O.

---

## PostgreSQL Tuning — It's Mostly About RAM

The shipped `postgresql.conf` is tuned for a small 4GB development environment. For production, the most impactful changes are memory-related:

```ini
# 64GB RAM example
shared_buffers = 16GB          # 25% of RAM
effective_cache_size = 48GB    # 75% of RAM (includes OS page cache)
work_mem = 64MB                # per-sort/hash, generous for analytics
maintenance_work_mem = 2GB     # fast VACUUM and CREATE INDEX
```

The 25% rule for `shared_buffers` is well-established PostgreSQL wisdom — going higher rarely helps because the OS page cache handles the rest, and that's what `effective_cache_size` tells the query planner about.

For a write-heavy workload like BigBrotr (the Synchronizer can insert thousands of events per cycle), these settings matter:

```ini
synchronous_commit = off       # async commits, ~10ms data risk
checkpoint_timeout = 15min     # less frequent checkpoints
max_wal_size = 8GB             # more WAL before forced checkpoint
```

`synchronous_commit = off` is the single biggest performance lever. It means PostgreSQL acknowledges commits before the WAL is flushed to disk. You could lose up to ~10ms of recent transactions in a crash. For Nostr event archiving, this is perfectly acceptable — events can be re-fetched from relays.

The autovacuum settings are also aggressive because BigBrotr tables see constant inserts and updates:

```ini
autovacuum_naptime = 30s
autovacuum_vacuum_scale_factor = 0.05
autovacuum_vacuum_cost_delay = 2ms
autovacuum_vacuum_cost_limit = 2000
```

This tells PostgreSQL: check for dead tuples every 30 seconds, vacuum after just 5% of rows are dead, and don't throttle vacuum I/O. On a dedicated server, there's no reason to hold back.

---

## Zero-Port API Exposure with Cloudflare Tunnel

The traditional way to expose a web service is: open a port, get a certificate, configure a reverse proxy. Each step is a potential attack surface.

Cloudflare Tunnel flips this. Instead of opening inbound ports, a daemon (`cloudflared`) inside the VM creates an outbound HTTPS connection to Cloudflare's edge network. Cloudflare then routes incoming requests for `api.yourdomain.com` through this tunnel to your local API.

```
User  ──HTTPS──▶  Cloudflare Edge  ──encrypted tunnel──▶  cloudflared  ──HTTP──▶  localhost:8080
                  (TLS, WAF, DDoS)                        (inside VM)              (FastAPI)
```

The result:
- **Zero open inbound ports** on the server
- **Free TLS certificates** managed by Cloudflare
- **DDoS protection** on the free tier
- **No firewall rules to maintain** for the API

The last hop — cloudflared to localhost:8080 — is plain HTTP, which is fine because it never leaves the VM. Setting HTTPS here would just add unnecessary TLS overhead for a loopback connection.

Setup is three steps: add your domain to Cloudflare, create a tunnel in the Zero Trust dashboard, install `cloudflared` with the provided token. Five minutes, and your API is live on `https://api.yourdomain.com`.

---

## Security Layers

Defense in depth, not a single point of trust:

1. **Cloudflare Tunnel** — No inbound ports, DDoS protection, WAF
2. **UFW Firewall** — Default deny incoming, allow only SSH (custom port) and local-network services
3. **SSH hardening** — Key-only authentication, non-standard port, fail2ban (24-hour ban after 3 failures)
4. **PostgreSQL roles** — Four database roles with least-privilege access (admin, writer, reader, refresher)
5. **PGBouncer** — Connection pooling with SCRAM-SHA-256 authentication
6. **Docker isolation** — All services run as non-root users inside containers

The firewall allows PostgreSQL, Grafana, and Prometheus only from the local subnet — for research queries and monitoring. Everything else is denied.

---

## The Production Deployment Folder

One lesson from deploying: keep your production configuration separate from the repository. BigBrotr ships with `deployments/bigbrotr/` as a template. For production, we copy it to `deployments/production/` and add that to `.gitignore`:

```bash
cp -r deployments/bigbrotr deployments/production
echo "deployments/production/" >> .gitignore
```

Now `git pull` updates source code and the Dockerfile but never touches your PostgreSQL config, `.env` secrets, or port bindings. Updating becomes:

```bash
git pull origin main
cd deployments/production
docker compose build && docker compose up -d
```

No merge conflicts, no accidental config overwrites.

---

## What It Looks Like Running

After starting all services with `docker compose up -d`, you get 14 healthy containers:

- **PostgreSQL 16** — the shared database, tuned for your hardware
- **PGBouncer** — connection pooling in transaction mode
- **Tor** — SOCKS5 proxy for .onion relay monitoring
- **8 BigBrotr services** — seeder, finder, validator, monitor, synchronizer, refresher, api, dvm
- **Prometheus + Alertmanager + Grafana** — full observability stack
- **postgres-exporter** — database metrics

The Seeder runs once and inserts ~7,500 known relay URLs as candidates. The Validator starts checking them via WebSocket — clearnet relays at 50 concurrent connections, Tor relays at 10 (through the SOCKS5 proxy). Within 30 minutes, validated relays start appearing in the database. The Monitor begins health-checking them, the Synchronizer starts archiving events, and the Refresher keeps the materialized views up to date.

The API is reachable at `https://api.yourdomain.com/health` — no port forwarding, no NGINX config, no Let's Encrypt renewal scripts.

---

## Lessons From the First Boot

No deployment survives first contact without surprises. Here's what bit us on the actual production bring-up.

**The vanishing DNS resolver.** We configured a static IP in `/etc/network/interfaces` and everything worked — until the first reboot. Turns out, when you switch from DHCP to static, nothing populates `/etc/resolv.conf` anymore. It was empty after boot. Cloudflared couldn't resolve its SRV records and crashed in a restart loop, `apt` couldn't reach any repository, and the services that needed to reach external APIs quietly failed. The fix is dead simple: write your nameservers manually and lock the file with `chattr +i /etc/resolv.conf` so nothing overwrites it.

**Docker's 64MB shared memory trap.** We tuned PostgreSQL with `shared_buffers = 16GB` and everything looked fine — until the Refresher tried to refresh materialized views. Three out of eleven views failed with `could not resize shared memory segment: No space left on device`. Confusing, because the data disk had 7TB free. The problem is Docker's default `/dev/shm` size: 64MB. PostgreSQL parallel workers need shared memory segments proportional to `shared_buffers`. The fix is one line in docker-compose: `shm_size: 16g` on the postgres service. Match it to your `shared_buffers`.

**GeoLite2 permission denied.** The Monitor downloads MaxMind GeoIP databases on first run to geolocate relay IPs. It tried to write them to the `static/` directory — which is bind-mounted from the host and owned by root. The container runs as uid 1000. Permission denied, five consecutive failures, service stops. A `chown -R 1000:1000` on the host directory fixed it permanently.

**CPU thermal imbalance on multi-CCD AMD.** Our Ryzen 9 9955HX has two CCDs. Without NUMA awareness, Proxmox scheduled all 12 vCPUs on the first chiplet. CCD1 hit 93°C while CCD2 sat at 52°C. Enabling `qm set 100 --numa 1` on the Proxmox host and rebooting the VM distributed the load across both chiplets. CCD1 dropped to 60°C, CCD2 came up to 47°C. Not every setup needs this, but if you're running a multi-CCD CPU under sustained load, check your per-CCD temperatures with `sensors`.

None of these are BigBrotr bugs — they're infrastructure gotchas that apply to any Docker + PostgreSQL deployment on self-hosted hardware. But they're the kind of thing that wastes hours if you don't know to look for them.

---

## What's Next

If you're interested in running your own instance:

1. Check the [Self-Hosting Guide](/docs/guides/self-hosting/) for every command, line by line
2. The [Architecture Deep Dive](/docs/blog/inside-bigbrotr/) explains the service design
3. Open an issue on [GitHub](https://github.com/BigBrotr/bigbrotr) if you run into problems

BigBrotr is designed to run unattended. Once deployed, the services handle their own lifecycle — retrying failed connections, rotating through relays, refreshing views on schedule. Your main ongoing tasks are checking Grafana occasionally, running `docker compose logs` if an alert fires, and doing a `git pull && docker compose build` when a new release drops.

The Nostr network is growing. The more independent observers we have, the better picture we get. Run your own BigBrotr. Own your data.
