---
title: Schema Overview
description: BigBrotr's database schema with tables, relationships, and design principles.
---

BigBrotr uses PostgreSQL 16 with a schema designed around immutability, content-addressed deduplication, and cascade atomicity. All mutations go through stored functions. All timestamps are stored as `BIGINT` Unix epoch seconds, and binary identifiers use `BYTEA`.

## Entity Relationship Diagram

```
relay                           event
├─ url (PK, TEXT)               ├─ id (PK, BYTEA)
├─ network (TEXT)               ├─ pubkey (BYTEA)
└─ discovered_at (BIGINT)      ├─ created_at (BIGINT)
     │                          ├─ kind (INTEGER)
     │                          ├─ tags (JSONB)
     │                          ├─ tagvalues (TEXT[], generated)
     │                          ├─ content (TEXT)
     │                          └─ sig (BYTEA)
     │                               │
     ├──────────┐    ┌───────────────┘
     ▼          ▼    ▼
relay_metadata       event_relay
├─ relay_url (FK)    ├─ event_id (FK → event)
├─ metadata_id (FK)  ├─ relay_url (FK → relay)
├─ metadata_type(FK) └─ seen_at (BIGINT)
└─ generated_at
     │
     ▼
metadata                    service_state
├─ id (PK, BYTEA)          ├─ service_name (TEXT)
├─ metadata_type (PK,TEXT) ├─ state_type (TEXT)
└─ data (JSONB)            ├─ state_key (TEXT)
                           ├─ state_value (JSONB)
                           └─ updated_at (BIGINT)
```

## Tables

### relay

The canonical relay registry. Every validated relay has exactly one row.

| Column | Type | Description |
|--------|------|-------------|
| `url` | `TEXT` (PK) | WebSocket URL (wss:// or ws://) |
| `network` | `TEXT` | Network type: clearnet, tor, i2p, loki, local |
| `discovered_at` | `BIGINT` | Unix epoch timestamp when the relay was first discovered |

### event

Nostr events identified by their SHA-256 event ID.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `BYTEA` (PK) | Nostr event ID (SHA-256 hash, binary) |
| `pubkey` | `BYTEA` | Author's public key (binary) |
| `created_at` | `BIGINT` | Event creation Unix timestamp |
| `kind` | `INTEGER` | Event kind number |
| `tags` | `JSONB` | Event tags array |
| `tagvalues` | `TEXT[]` | Generated column: searchable tag values extracted via `tags_to_tagvalues()` |
| `content` | `TEXT` | Event content |
| `sig` | `BYTEA` | Schnorr signature (binary) |

### event_relay

Junction table tracking which relays have which events.

| Column | Type | Description |
|--------|------|-------------|
| `event_id` | `BYTEA` (FK → event) | Event ID |
| `relay_url` | `TEXT` (FK → relay) | Relay URL |
| `seen_at` | `BIGINT` | Unix timestamp when event was first seen on this relay |

Composite PK: `(event_id, relay_url)`. Both foreign keys cascade on delete.

### metadata

Content-addressed metadata store. Same data always produces the same ID via SHA-256.

| Column | Type | Description |
|--------|------|-------------|
| `id` | `BYTEA` (composite PK) | SHA-256 hash of canonical JSON `data` field |
| `metadata_type` | `TEXT` (composite PK) | Metadata type (nip11_info, nip66_rtt, nip66_ssl, etc.) |
| `data` | `JSONB` | Metadata payload |

The composite primary key `(id, metadata_type)` means deduplication operates within each metadata type.

### relay_metadata

Junction table linking relays to their metadata with timestamps.

| Column | Type | Description |
|--------|------|-------------|
| `relay_url` | `TEXT` (FK → relay) | Relay URL |
| `metadata_id` | `BYTEA` (compound FK) | References metadata.id |
| `metadata_type` | `TEXT` (compound FK) | References metadata.metadata_type |
| `generated_at` | `BIGINT` | Unix timestamp when metadata was generated |

Composite PK: `(relay_url, generated_at, metadata_type)`. Compound FK `(metadata_id, metadata_type)` references `metadata(id, metadata_type)`.

### service_state

Service checkpoint storage for cursor-based operations and service state tracking.

| Column | Type | Description |
|--------|------|-------------|
| `service_name` | `TEXT` | Service name (seeder, finder, validator, etc.) |
| `state_type` | `TEXT` | State type identifier |
| `state_key` | `TEXT` | State key (e.g., relay URL, cursor name) |
| `state_value` | `JSONB` | State payload (default `'{}'`) |
| `updated_at` | `BIGINT` | Unix timestamp of last update |

Composite PK: `(service_name, state_type, state_key)`.

## Design Principles

### No CHECK Constraints

Validation happens in the Python model layer, not in the database. This keeps the schema simple and avoids duplicating validation logic.

### BIGINT Timestamps

All timestamps are stored as `BIGINT` Unix epoch seconds, not `TIMESTAMPTZ`. This avoids timezone ambiguity and aligns with the Nostr protocol's timestamp format.

### Binary Identifiers

Event IDs, public keys, and signatures are stored as `BYTEA` (binary), not hex-encoded `TEXT`. Metadata IDs (SHA-256 hashes) are also `BYTEA`. This is more space-efficient and matches the protocol's binary format.

### Hash Computed in Python

SHA-256 hashes for content-addressed metadata are computed in Python, not via pgcrypto. This ensures consistency across the application and makes the hashing algorithm explicit in the codebase.

### All Mutations via Stored Functions

No raw INSERT/UPDATE/DELETE statements in application code. All mutations go through the 25 stored functions, which accept bulk array parameters for efficiency.

### Cascade Functions

Two cascade functions handle atomic multi-table inserts:

- **`event_relay_insert_cascade`** — inserts across `relay`, `event`, and `event_relay` in a single call.
- **`relay_metadata_insert_cascade`** — inserts across `relay`, `metadata`, and `relay_metadata` in a single call.

## Next Steps

- [Stored Functions](/docs/database/procedures/) — the 25 database functions.
- [Materialized Views](/docs/database/views/) — 11 pre-computed analytics views.
