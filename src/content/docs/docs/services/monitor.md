---
title: Monitor
description: Continuous service that performs NIP-11 and NIP-66 health checks.
---

The Monitor is a **continuous** service that performs comprehensive health checks on validated relays using NIP-11 and NIP-66 protocols. It is the most complex service in BigBrotr, producing multiple metadata types per relay per cycle.

## Purpose

Knowing that a relay exists is not enough. The Monitor answers: *How healthy is this relay right now?* It collects relay information documents (NIP-11), runs six different health tests (NIP-66), stores results as content-addressed metadata, and optionally publishes monitoring data as Nostr events.

## How It Works

For each validated relay in the current batch:

### NIP-11: Relay Information

Fetches the NIP-11 Relay Information Document via HTTP(S). This JSON document describes the relay's capabilities, limitations, and software:

- Relay name and description
- Software name and version
- Supported NIPs list
- Relay limitations (max message length, max subscriptions, etc.)
- Payment/admission policies

### NIP-66: Health Tests

Runs six independent health tests:

| Test | What It Measures |
|------|-----------------|
| **RTT** | WebSocket round-trip time in milliseconds |
| **SSL** | Certificate validity, expiration date, issuer chain |
| **DNS** | Resolution time, resolved IP addresses, DNSSEC status |
| **Geo** | Country, city, ASN, coordinates (MaxMind GeoIP) |
| **Net** | Autonomous System number, ISP name, network prefix |
| **HTTP** | HTTP status code, response headers, redirect chain |

### Result Storage

Each test produces a `Metadata` object with a specific `MetadataType`. Metadata is content-addressed: the SHA-256 hash of the canonical JSON data field becomes the `id`. Same data always produces the same `id`, providing automatic deduplication.

Results are stored via `relay_metadata_insert_cascade`, which atomically inserts across `relay`, `metadata`, and `relay_metadata` tables.

### Event Publishing

When configured with Nostr keys, the Monitor publishes monitoring results as Nostr events:

- **Kind 10166** — replaceable relay monitoring event
- **Kind 30166** — parameterized replaceable relay monitoring event

These events are broadcast to configured relays, allowing other Nostr clients to consume health data.

## Configuration

```yaml
# config/services/monitor.yaml
interval: 600  # seconds between cycles

processing:
  chunk_size: 200
  allow_insecure: false
  compute:
    nip11_info: true
    nip66_rtt: true
    nip66_ssl: true
    nip66_geo: true
    nip66_net: true
    nip66_dns: true
    nip66_http: true

networks:
  clearnet:
    timeout: 30
    max_tasks: 100
  tor:
    enabled: true
    timeout: 90
    max_tasks: 10
    proxy_url: socks5://tor:9050

geo:
  city_database_path: static/GeoLite2-City.mmdb
  asn_database_path: static/GeoLite2-ASN.mmdb
  geohash_precision: 9
```

## Usage

```bash
# Run continuously
python -m bigbrotr monitor

# Run a single monitoring cycle
python -m bigbrotr monitor --once

# With debug logging for troubleshooting
python -m bigbrotr monitor --log-level DEBUG
```

## Metrics

The Monitor exposes Prometheus metrics on port 8003:

- `service_counter{name="relays_checked"}` — total health checks performed
- `service_counter{name="nip11_success"}` — successful NIP-11 fetches
- `service_counter{name="events_published"}` — monitoring events broadcast
- `cycle_duration_seconds` — time per monitoring cycle
