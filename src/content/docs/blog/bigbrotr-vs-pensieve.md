---
title: "BigBrotr vs Pensieve: Two Approaches to Indexing the Nostr Network"
date: 2026-03-15
authors:
  - bigbrotr
tags:
  - analysis
  - nostr
  - infrastructure
  - comparison
description: A deep technical comparison of two open-source projects that index the Nostr network — BigBrotr (Python/PostgreSQL relay observatory) and Pensieve (Rust/ClickHouse event archive). Same network, different questions, radically different architectures.
excerpt: A deep technical comparison of two open-source projects that index the Nostr network — BigBrotr (Python/PostgreSQL relay observatory) and Pensieve (Rust/ClickHouse event archive). Same network, different questions, radically different architectures.
---

The Nostr network has no central authority, no canonical event store, no official list of relays. If you want to understand what's happening on the network — how many relays exist, what events are flowing through them, who's publishing, what's growing — you have to build your own observation infrastructure.

Two open-source projects tackle this problem from fundamentally different angles: **BigBrotr** and **Pensieve**. Both connect to Nostr relays, both store events, both produce analytics. But they ask different questions, make different trade-offs, and arrive at architectures that barely resemble each other.

This post is a detailed technical comparison — not a "which is better" piece, but an honest look at what each does, how, and why.

---

## The Core Question

**BigBrotr** asks: *What relays exist on the Nostr network, how healthy are they, and what events are they publishing?*

**Pensieve** asks: *What events exist on the Nostr network, and how fast can we archive all of them?*

BigBrotr is a **relay observatory** — relay health, relay metadata, relay distribution, with events as one dimension of relay analysis. Pensieve is an **event archive** — capture every event as fast as possible, with relay management as a means to maximize coverage.

This distinction shapes everything that follows.

| | BigBrotr | Pensieve |
|--|----------|----------|
| Language | Python 3.11+ (asyncio) | Rust 2024 edition (tokio) |
| Codebase | ~18,000 lines | ~12,000 lines |
| License | MIT | PolyForm Noncommercial 1.0.0 |
| Primary database | PostgreSQL 16 | ClickHouse + notepack archive |
| Event fetching | Cursor-based crawler with completeness verification | Live subscription (firehose) |

---

## How They Fetch Events

This is the most fundamental architectural difference — not what they store, but how they get events from relays.

### BigBrotr: Systematic Crawling

BigBrotr's Synchronizer does not subscribe to live events. It operates as a **systematic crawler**: for each validated relay, it opens a connection, requests a precise time window `[since, until]`, fetches events, and then **verifies the response is complete** before advancing the cursor.

1. Request events in window `[cursor_timestamp, end_time]` with a limit (default 500)
2. Receive the events — verify Ed25519 signatures, match NIP-01 filters, deduplicate in memory
3. **Verify completeness**: re-fetch at the boundary timestamp and confirm no events were missed. This catches relay truncation that would otherwise be invisible
4. If the relay truncated: **binary split** — halve the time window and retry each half recursively, down to single-second granularity if needed
5. Only after verification: yield the events, record which relay had them, advance the cursor

Each relay has an independent cursor stored in the database. A relay that has never been synced starts at timestamp 0 — BigBrotr will crawl its *entire history*. On restart, each relay resumes from its last verified position. Intentionally, the Synchronizer stays one day behind real-time (`end_lag=86400`) to let events settle on relays before crawling.

### Pensieve: Live Subscription

Pensieve opens a WebSocket subscription with `Filter::new()` — "send me everything." The relay pushes events in real time. For catch-up after restart, a `since` filter is applied based on the last checkpoint. Events flow through the pipeline as they arrive: dedupe → notepack → gzip → ClickHouse.

Fast and simple. But the relay decides what to send and how much. If a relay silently truncates, enforces an internal limit, or drops events under load, Pensieve has no way to detect the gap.

NIP-77 (Negentropy) is the recovery mechanism — periodically, Pensieve performs set reconciliation with trusted relays to identify missing events. But this is separate from live ingestion, works only with relays that support NIP-77 (very few currently), and covers only a configurable lookback window (default 14 days). A separate `--catchup` mode uses checkpoint-based resumption, though most relays don't efficiently serve historical data.

When a new relay is added, Pensieve only receives events published *after* the connection. There is no historical backfill.

### The Trade-off

| | BigBrotr | Pensieve |
|--|----------|----------|
| Completeness | Verified per time window, per relay | Best-effort (relay decides what to send) |
| Historical coverage | Full history from epoch, per relay | From connection time + 14-day negentropy lookback |
| New relay added | Synchronized from the beginning | Only future events |
| Truncation detection | Binary-split fallback, automatic | Not detected |
| Throughput | Lower (verification overhead) | Higher (passive reception) |
| Latency | Minutes to hours behind real-time | Real-time |

Pensieve optimizes for **volume and speed**. BigBrotr optimizes for **completeness and accuracy**. Everything else — storage engines, analytics, APIs — follows from this choice.

---

## Architecture

### BigBrotr: Eight Independent Services, One Database

```
     Seeder    Finder    Validator    Monitor    Synchronizer    Refresher    API    DVM
       │         │          │           │            │              │          │      │
       └─────────┴──────────┴───────────┴────────────┴──────────────┴──────────┴──────┘
                                        │
                                   PostgreSQL
```

All eight services are independent processes — no imports between them, no message queues, no shared state outside the database. Each reads what it needs from PostgreSQL, does its work, writes results back. A service can crash, restart, or scale without affecting the others.

Each service is a separate Docker container. You start only what you need — `docker compose up -d seeder monitor refresher api` is a valid deployment. This modularity, combined with deep YAML configurability, means the same codebase serves very different purposes:

- **Full observatory**: all services, all health checks, all events. The default.
- **Relay health only**: Seeder + Finder + Validator + Monitor + Refresher + API. No Synchronizer means no events stored, no event_relay tracking. Minimal storage, maximum relay intelligence.
- **Event archive only**: Seeder + Validator + Synchronizer + Refresher + API. No Monitor, no health checks. Just events and their relay distribution.
- **Kind-specific archive**: NIP-01 filters on the Synchronizer — archive only specific event kinds, authors, or tag patterns. The same filter syntax relays understand.
- **No junction tracking**: override the `event_relay_insert_cascade` stored procedure to skip the `event_relay` table. All mutations flow through stored procedures, so this is a SQL-level change — no Python modifications.
- **Lightweight mode (LilBrotr)**: a separate deployment variant that stores only event metadata (id, pubkey, created_at, kind, tagvalues) without tags, content, or signatures — ~60% disk savings.

The internal architecture follows a strict **diamond DAG**: services at the top, core/nips/utils in the middle, pure frozen dataclass models at the bottom. Imports flow strictly downward, enforced by linter rules.

### Pensieve: Pipeline with Archive as Source of Truth

```
Sources (Relays | JSONL | Protobuf)
    → DedupeIndex (RocksDB)
    → SegmentWriter (notepack binary files)
    → Compression (gzip, background thread)
    → ClickHouseIndexer (background thread)
    → rclone sync (offsite backup)
```

The notepack archive (compressed binary segments on disk) is the **source of truth**. ClickHouse is a derived index — if corrupted, it can be rebuilt from the archive. This "archive-first" design means Pensieve can survive database loss, something PostgreSQL-based BigBrotr cannot do without backups.

Four Rust crates: `pensieve-core` (shared types, event validation, notepack encoding), `pensieve-ingest` (the pipeline), `pensieve-serve` (analytics API), and `pensieve-preview` (Open Graph previews and JSON API for Nostr events).

Beyond live relay ingestion, Pensieve supports **JSONL and Protobuf backfill** from external archives (including S3 with resumable progress), and ships **maintenance utilities**: `relay-cleanup` (URL normalization, duplicate merging, dry-run mode) and `repair-dedupe` (RocksDB repair, integrity checks, data recovery).

---

## Storage

### BigBrotr: One Database, Full Relational Model

Everything lives in PostgreSQL 16: 6 tables, 25 stored procedures, 11 materialized views, 31 indexes, 4 least-privilege database roles. PGBouncer handles connection pooling. All mutations go through stored procedures for atomicity — cascade functions insert across multiple tables in a single SQL call.

The most distinctive structure is the **event_relay junction table**: a many-to-many relationship between events and relays. When the Synchronizer fetches an event from a relay, it records `(event_id, relay_url, seen_at)`. The same event on 50 relays produces 50 junction rows. This enables queries no other Nostr indexer can answer: replication factor per event, exclusive content per relay, distribution patterns by kind or network.

Metadata is **content-addressed** — SHA-256 hashed, so identical health check results across time or relays deduplicate automatically. The relay_metadata junction is time-series: the same relay accumulates metadata records over time, building a complete health history.

The trade-off: PostgreSQL gives ACID, arbitrary JOINs, a massive ecosystem (Grafana, psql, pandas, any language with a PostgreSQL driver). But it's a row store — full scans over hundreds of millions of events are slower than columnar, and storage is less compact.

### Pensieve: Five Storage Engines

| Engine | Purpose |
|--------|---------|
| RocksDB (dedupe) | Event ID → status. Bloom filters (10 bits/key) for fast "not seen" checks |
| RocksDB (sync state) | NIP-77 Negentropy state. Timestamp-keyed for range scans |
| Notepack segments | Gzipped binary archive. Immutable, ~128 bytes smaller per event than JSON |
| ClickHouse | Columnar analytics. ReplacingMergeTree, 3 projections, ZSTD(3) on content |
| SQLite | Relay quality metrics. Hourly/daily stats with automatic rollup |

Events are checked against the dedupe index *before* notepack serialization — since ~90% of events from multiple relays are duplicates, this avoids wasting CPU on packing events that will be discarded.

ClickHouse's columnar storage excels at analytics: scanning only the `kind` column for a count-by-kind query, ZSTD compression on content, projections for pre-sorted alternate orderings. Materialized views use SummingMergeTree for incremental aggregation (reactions, comments, reposts) and AggregatingMergeTree for efficient unique counting — no full refresh needed.

The trade-off: five storage engines means five failure modes and five backup strategies. If a segment fails to compress (fire-and-forget background thread) or ClickHouse indexing fails (no retry), data can be left inconsistent. The notepack archive doesn't include checksums or format version headers.

---

## Relay Management

### BigBrotr: Deep Health Profiling

Three dedicated services handle relays:

**Finder** discovers relays from external HTTP APIs (nostr.watch by default, with JMESPath extraction and per-source cooldowns) and by scanning tagvalues of all archived events for relay URLs — not just kind:10002 NIP-65 events, but any tag in any event kind that contains a relay URL.

**Validator** checks each candidate via WebSocket protocol handshake (including NIP-42 AUTH acceptance), promotes valid ones to the relay table, and tracks failures with exponential backoff. After 720 failures (~30 days at hourly checks), candidates are permanently removed.

**Monitor** performs 7 health checks per relay per cycle, each with independent retry configuration (exponential backoff + jitter):

| Check | Data Collected |
|-------|---------------|
| NIP-11 | 20+ fields: name, software, version, supported NIPs, limitations (13 subfields), fees, countries, languages |
| RTT | Three-phase: connection open, event read, event write with publish verification. Respects relay's PoW difficulty |
| SSL | Issuer, expiry, SANs, cipher, protocol, SHA-256 fingerprint. Two-connection methodology |
| DNS | A/AAAA/CNAME/NS/PTR records, TTL |
| Geolocation | Country, city, coordinates, timezone, geohash (precision 9) via GeoLite2 (auto-downloaded) |
| Network/ASN | IPv4/IPv6, ASN number and organization, network range |
| HTTP | Server and X-Powered-By headers from WebSocket upgrade |

Results are published to the Nostr network as **Kind 30166** relay discovery events (with NIP-32 labels for ASN/country/timezone, relay type tags, requirement tags for auth/payment/PoW, geohash `g` tags for spatial indexing), **Kind 10166** monitor announcements, and **Kind 0** operator profiles. Each publishing type has independent relay lists and intervals.

### Pensieve: Coverage-Optimized Relay Rotation

Pensieve doesn't profile relays for external consumption — it manages them to **maximize unique event capture**:

```
novel_normalized = min(novel_rate_7d / network_median_novel_rate, 2.0)
score = (novel_normalized * 0.7) + (uptime_7d * 0.3)
```

Every 5 minutes, the optimizer can swap up to 5% of connected relays, with 3 exploration slots reserved for untested relays. Seed relays get a minimum score floor and are never evicted. The SQLite-backed `RelayManager` tracks hourly and daily statistics with automatic rollup.

A thorough `ConnectionGuard` provides security: SSRF protection (private IPs, CGNAT, documentation, and reserved ranges), port filtering (only standard web ports), per-IP deduplication (max 2 connections per IP), connection rate limiting, and URL blocklisting (including Umbrel detection for misconfigured home servers).

---

## Analytics and Data Access

### BigBrotr: SQL + REST API + Nostr DVM

Three access paths to the same data:

1. **Direct SQL** — connect to PostgreSQL from any compatible client. Full JOINs, CTEs, window functions. The `reader` role has SELECT-only access.

2. **REST API** (FastAPI) — schema-aware route generation from database introspection. Every table and materialized view gets automatic endpoints with filtering, sorting, and pagination. 16 resources exposed.

3. **NIP-90 DVM** — native Nostr access. Clients query data by publishing Kind 5050 job requests; BigBrotr responds with Kind 6050 results. Per-table pricing in millisats. NIP-89 handler announcements for discoverability.

11 materialized views cover: global event statistics with rolling windows (1h/24h/7d/30d), per-relay stats (event counts, unique pubkeys, average RTT), kind and pubkey distributions (global and per-relay), network-level aggregates, relay software and NIP support distributions, daily time-series counts, and the latest metadata snapshot per relay.

### Pensieve: ClickHouse + REST API + Preview Pages

1. **ClickHouse SQL** — direct columnar queries. Excellent for aggregations over billions of rows.

2. **REST API** (Axum) — 30+ bearer-token authenticated endpoints: event/pubkey/kind totals, throughput (7-day rolling average), hourly activity patterns, per-kind breakdowns with content length and time windows, new users per period, **retention cohort analysis** (weekly and monthly), DAU/WAU/MAU segmented by user quality (has profile, has follow list, has both — excluding throwaway keys), zap statistics with amount histograms, long-form content analytics, top publishers, relay distribution from NIP-65 lists. ETag-based caching.

3. **Preview pages** — HTML pages for notes, profiles, articles, videos, reposts with inline quote cards. **Dynamic OG image generation** (SVG-to-PNG with author avatar compositing). JSON API (append `.json` to any preview URL) with full event data, author profile, mentioned profiles, and engagement counts. `llms.txt` convention for AI agent discoverability.

ClickHouse views include: flattened tag analytics (via ARRAY JOIN), incremental engagement counters (SummingMergeTree), NIP-09 deletion tracking, video content analytics (trending, hashtags, top creators), first-seen tracking for new user analysis, and scheduled cohort retention refreshes.

The retention cohort analysis is the data source behind recent Nostr network reports — it answers "of users who first appeared in week X, what percentage returned in weeks X+1, X+2, etc." with user quality segmentation to distinguish real users from throwaway keys.

---

## Network Support

| Network | BigBrotr | Pensieve |
|---------|----------|----------|
| Clearnet (wss://) | 50 concurrent tasks | Up to 30 relays |
| Tor (.onion) | SOCKS5, 10 tasks | Supported via `--tor-proxy` |
| I2P (.i2p) | SOCKS5, 5 tasks | Not supported |
| Lokinet (.loki) | SOCKS5, 5 tasks | Not supported |

BigBrotr auto-detects network type from relay URLs using full RFC 3986 parsing (TLD for overlays, IP range checks against 27 IANA ranges). Per-network semaphores control concurrency. Clearnet relays with invalid SSL certificates are handled via a 15-pattern SSL error classifier that falls back to a custom insecure WebSocket transport — configurable per-service.

---

## Engineering and Operations

### Monitoring

BigBrotr runs a full **Prometheus + Grafana + Alertmanager** stack with per-service metrics, 7 alert rules, postgres-exporter with custom queries, and auto-provisioned dashboards. Pensieve exposes Prometheus metrics with 5-second rolling rate calculations and three Grafana dashboards (ingestion, backfill, user analytics).

### Deployment

BigBrotr runs entirely in Docker Compose (15 containers). Pensieve uses a hybrid model: Docker for infrastructure (ClickHouse, Grafana, Prometheus, Caddy), native Rust binaries with systemd for the ingestion and serving layers.

### Testing and CI/CD

| | BigBrotr | Pensieve |
|--|----------|----------|
| Tests | ~2,955 (2,739 unit + 216 integration) | Minimal |
| Coverage | 80% branch minimum (enforced) | None |
| CI matrix | Python 3.11–3.14 | Single Rust version |
| Pre-commit | 23 hooks (ruff, mypy, detect-secrets, hadolint, sqlfluff, codespell, ...) | Standard Rust toolchain |
| Security | Trivy scanning, CodeQL analysis, SBOM generation, dependency auditing | N/A |
| Distribution | PyPI + multi-arch Docker (amd64 + arm64) to GHCR | Native binary |

### NIP Support

| NIP | BigBrotr | Pensieve |
|-----|----------|----------|
| NIP-01 | Event model, validation, protocol | Event validation, signature verification |
| NIP-09 | — | Deletion tracking (materialized view) |
| NIP-11 | Full info document fetch (20+ fields) | — |
| NIP-32 | Labels in published events | — |
| NIP-42 | Recognized during validation | Automatic auth with ephemeral keys |
| NIP-65 | Relay URLs from event tags (Finder) | Relay discovery via nostr-sdk |
| NIP-66 | 6 health check types + event publishing | — |
| NIP-77 | — | Negentropy set reconciliation |
| NIP-89 | DVM handler announcements | — |
| NIP-90 | Data Vending Machine | — |

---

## Trade-offs and Limitations

Every architectural choice has a cost. Here's where each project pays.

**BigBrotr's costs:**
- PostgreSQL row store is less efficient than columnar for pure analytics over billions of rows
- No incremental materialized view refresh — full `REFRESH CONCURRENTLY` each cycle
- Single PostgreSQL instance — horizontal scaling requires read replicas or partitioning
- The completeness-first crawling approach means higher latency (events arrive minutes to hours after publication, not real-time) and lower raw throughput than a firehose

**Pensieve's costs:**
- Event-relay attribution is lost in the archive (notepack doesn't store relay source)
- If a segment write fails after the dedupe mark, the event is permanently lost. 8MB BufWriter buffer means up to 8MB lost on unclean shutdown
- The global dedupe mutex serializes all event processing — bottleneck above ~10K events/sec
- Failed ClickHouse indexing is not retried — recovery requires manual re-indexing from archive
- Fire-and-forget compression threads can leave corrupt files on crash
- No archive checksums or format version headers
- Five storage engines means five failure modes and five backup strategies
- Relay scoring cold start: new relays always score 0, takes ~11.5 days to try 10K discovered relays at 3 exploration slots per 5-minute cycle

---

## Complementary, Not Competing

These projects answer different questions and would be most valuable running side by side.

BigBrotr tells you about the **infrastructure** of Nostr — which relays are healthy, what software they run, how fast they respond, what NIPs they support, which events they carry, how events are distributed across the network. It's the tool for understanding the relay landscape, detecting outages, tracking network growth, and building relay recommendation systems.

Pensieve tells you about the **content** of Nostr — what events exist, who's active, what kinds are trending, how users retain, how zaps flow. It's the tool for understanding user behavior, measuring network health from a social perspective, and producing the analytics that appear in network reports.

A BigBrotr instance could feed validated relay URLs to Pensieve. A Pensieve instance could feed event data back into BigBrotr's analytics. BigBrotr's event_relay junction answers distribution questions that Pensieve's architecture cannot. Pensieve's ClickHouse-powered retention cohorts answer behavioral questions that BigBrotr's PostgreSQL views don't address.

Different tools. Different questions. Same network. The Nostr ecosystem benefits from having multiple independent observers with different perspectives — just like the protocol itself benefits from having multiple independent relays.

Build what you need. Run what answers your questions. Or run both.
