---
title: Schema Overview
description: BigBrotr's database schema with tables, relationships, and design principles.
---

BigBrotr uses PostgreSQL 16 with a schema designed around immutability, content-addressed deduplication, and cascade atomicity. All mutations go through stored procedures.

## Entity Relationship Diagram

```
relay                           event
├─ url (PK, TEXT)               ├─ id (PK, TEXT)
├─ network (TEXT)               ├─ pubkey (TEXT)
├─ first_seen (TIMESTAMPTZ)    ├─ created_at (TIMESTAMPTZ)
└─ last_seen (TIMESTAMPTZ)     ├─ kind (INT)
     │                          ├─ tags (JSONB)
     │                          ├─ content (TEXT)
     │                          └─ sig (TEXT)
     │                               │
     ├──────────┐    ┌───────────────┘
     ▼          ▼    ▼
relay_metadata       event_relay
├─ relay_url (FK)    ├─ event_id (FK → event)
├─ metadata_id (FK)  ├─ relay_url (FK → relay)
├─ metadata_type(FK) └─ first_seen (TIMESTAMPTZ)
└─ generated_at
     │
     ▼
metadata                    service_state
├─ id (PK, TEXT)            ├─ service (TEXT)
├─ type (PK, TEXT)          ├─ relay_url (TEXT)
└─ data (JSONB)             ├─ state_type (TEXT)
                            └─ state_value (JSONB)
```

## Tables

### relay

The canonical relay registry. Every validated relay has exactly one row.

| Column | Type | Description |
|--------|------|-------------|
| `url` | `TEXT` (PK) | WebSocket URL (wss:// or ws://) |
| `network` | `TEXT` | Network type: clearnet, tor, i2p, loki, local |
| `first_seen` | `TIMESTAMPTZ` | When the relay was first validated |
| `last_seen` | `TIMESTAMPTZ` | Most recent successful contact |

### event

Nostr events identified by their SHA-256 event ID.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `TEXT` (PK) | Nostr event ID (SHA-256 hash) |
| `pubkey` | `TEXT` | Author's public key (hex) |
| `created_at` | `TIMESTAMPTZ` | Event creation timestamp |
| `kind` | `INT` | Event kind number |
| `tags` | `JSONB` | Event tags array |
| `content` | `TEXT` | Event content |
| `sig` | `TEXT` | Schnorr signature |

### event_relay

Junction table tracking which relays have which events.

| Column | Type | Description |
|--------|------|-------------|
| `event_id` | `TEXT` (FK → event) | Event ID |
| `relay_url` | `TEXT` (FK → relay) | Relay URL |
| `first_seen` | `TIMESTAMPTZ` | When event was first seen on this relay |

### metadata

Content-addressed metadata store. Same data always produces the same ID via SHA-256.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `TEXT` (composite PK) | SHA-256 hash of canonical JSON `data` |
| `type` | `TEXT` (composite PK) | Metadata type (nip11, open_timestamp, ssl, dns, etc.) |
| `data` | `JSONB` | Metadata payload |

The composite primary key `(id, type)` means deduplication operates within each metadata type.

### relay_metadata

Junction table linking relays to their metadata with timestamps.

| Column | Type | Description |
|--------|------|-------------|
| `relay_url` | `TEXT` (FK → relay) | Relay URL |
| `metadata_id` | `TEXT` (compound FK) | References metadata.id |
| `metadata_type` | `TEXT` (compound FK) | References metadata.type |
| `generated_at` | `TIMESTAMPTZ` | When metadata was generated |

### service_state

Service checkpoint storage for cursor-based operations and service state tracking.

| Column | Type | Description |
|--------|------|-------------|
| `service` | `TEXT` | Service name (seeder, finder, etc.) |
| `relay_url` | `TEXT` | Associated relay (optional) |
| `state_type` | `TEXT` | State type identifier |
| `state_value` | `JSONB` | State payload |

## Design Principles

### No CHECK Constraints

Validation happens in the Python model layer, not in the database. This keeps the schema simple and avoids duplicating validation logic.

### Hash Computed in Python

SHA-256 hashes for content-addressed metadata are computed in Python, not via pgcrypto. This ensures consistency across the application and makes the hashing algorithm explicit in the codebase.

### All Mutations via Stored Procedures

No raw INSERT/UPDATE/DELETE statements in application code. All mutations go through the 25 stored procedures, which accept bulk array parameters for efficiency.

### Cascade Functions

Two cascade functions handle atomic multi-table inserts:

- **`event_relay_insert_cascade`** — inserts across `relay`, `event`, and `event_relay` in a single call.
- **`relay_metadata_insert_cascade`** — inserts across `relay`, `metadata`, and `relay_metadata` in a single call.

## Next Steps

- [Stored Procedures](/database/procedures/) — the 25 database functions.
- [Materialized Views](/database/views/) — 11 pre-computed analytics views.
