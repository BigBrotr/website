---
title: Data Flow
description: How data moves through BigBrotr's six independent services via the shared database.
---

BigBrotr's six services are independent processes that share a PostgreSQL database. There is no direct communication between services. Data flows through the database: one service writes, another reads.

## Relay Lifecycle

A relay URL progresses through several states as different services process it:

```
Seed files / APIs / NIP-65 events
        │
        ▼
┌───────────────┐
│   Candidate   │  Seeder and Finder insert URLs
│   (URL only)  │  into the candidate pool
└───────┬───────┘
        │
        ▼
┌───────────────┐
│   Validated   │  Validator tests WebSocket connectivity
│    Relay      │  and promotes to the relay table
└───────┬───────┘
        │
        ▼
┌───────────────┐
│   Monitored   │  Monitor fetches NIP-11 metadata and
│    Relay      │  runs NIP-66 health tests
└───────┬───────┘
        │
        ▼
┌───────────────┐
│   Synced      │  Synchronizer collects events
│    Relay      │  using cursor-based pagination
└───────────────┘
```

Each transition is independent. A relay can be validated but not yet monitored. A relay can be monitored but not yet synced. Services pick up work based on their own schedules and the current state of the database.

## Data Entities

### Relay Discovery

The Seeder and Finder insert relay URLs. These services detect the network type (clearnet, Tor, I2P, Lokinet) from the URL structure:

- `wss://relay.example.com` → clearnet
- `ws://abc...xyz.onion` → Tor
- `ws://abc...xyz.b32.i2p` → I2P
- `ws://abc...xyz.loki` → Lokinet

### Metadata Collection

The Monitor produces multiple metadata types per relay through NIP-11 and NIP-66:

| Source | Metadata Types |
|--------|---------------|
| NIP-11 | Relay information document (software, version, supported NIPs, limitations) |
| NIP-66 RTT | WebSocket round-trip time |
| NIP-66 SSL | Certificate validity and expiration |
| NIP-66 DNS | Resolution time and IP addresses |
| NIP-66 Geo | Geographic location via GeoIP |
| NIP-66 Net | Network/ASN information |
| NIP-66 HTTP | HTTP status and headers |

All metadata is content-addressed using SHA-256. The hash is computed from canonical JSON of the data field. Same data always produces the same hash, providing automatic deduplication.

### Event Collection

The Synchronizer collects Nostr events from validated relays. Events are stored in the `event` table with relay associations in the `event_relay` junction table. The cascade function `event_relay_insert_cascade` atomically inserts across relay, event, and junction tables in a single SQL call.

### Materialized Views

The Refresher periodically refreshes 11 materialized views that pre-compute analytics:

| View | Purpose |
|------|---------|
| `relay_metadata_latest` | Most recent metadata per relay per type |
| `event_stats` | Global event statistics |
| `relay_stats` | Per-relay statistics |
| `kind_counts` | Event counts by kind |
| `kind_counts_by_relay` | Event counts by kind per relay |
| `pubkey_counts` | Unique pubkey counts |
| `pubkey_counts_by_relay` | Unique pubkey counts per relay |
| `network_stats` | Statistics by network type |
| `relay_software_counts` | Relay software distribution |
| `supported_nip_counts` | NIP support distribution |
| `event_daily_counts` | Daily event counts |

## Cascade Operations

BigBrotr uses two cascade functions for atomic multi-table inserts:

**`event_relay_insert_cascade`**: Given arrays of relay URLs, event data, and associations, inserts into `relay`, `event`, and `event_relay` in a single call.

**`relay_metadata_insert_cascade`**: Given arrays of relay URLs, metadata objects, and associations, inserts into `relay`, `metadata`, and `relay_metadata` in a single call.

These eliminate partial inserts and maintain referential integrity without application-level transaction management.

## Next Steps

- [Database Schema](/database/schema/) — table definitions and relationships.
- [Stored Functions](/database/procedures/) — the 25 database functions.
- [Materialized Views](/database/views/) — pre-computed analytics.
