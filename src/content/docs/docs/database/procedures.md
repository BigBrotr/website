---
title: Stored Functions
description: BigBrotr's 25 database functions for mutations, queries, and maintenance.
---

BigBrotr uses 25 stored functions for all database mutations. Application code never executes raw INSERT, UPDATE, or DELETE statements. All functions accept bulk array parameters for batch efficiency.

## Function Categories

### Utility (1 function)

| Function | Purpose |
|----------|---------|
| `tags_to_tagvalues(JSONB)` | Converts JSONB tag arrays to a searchable `TEXT[]` format. Used by the `tagvalues` generated column on the `event` table. |

### CRUD (10 functions)

These handle the core data operations — inserting relays, events, metadata, and service state.

**Level 1 — Single-table operations:**

| Function | Purpose |
|----------|---------|
| `relay_insert` | Insert or update relays (bulk `TEXT[]`, `TEXT[]`, `BIGINT[]` arrays) |
| `event_insert` | Insert events (bulk `BYTEA[]`, `INTEGER[]`, `JSONB[]`, `TEXT[]` arrays) |
| `metadata_insert` | Insert metadata objects (bulk `BYTEA[]`, `TEXT[]`, `JSONB[]` arrays) |
| `event_relay_insert` | Insert event-relay associations |
| `relay_metadata_insert` | Insert relay-metadata associations |
| `service_state_upsert` | Insert or update service state checkpoints (returns affected row count) |
| `service_state_get` | Query service state (returns `TABLE(state_key, state_value, updated_at)`) |
| `service_state_delete` | Remove service state entries |

**Level 2 — Cascade operations (atomic multi-table):**

| Function | Purpose |
|----------|---------|
| `event_relay_insert_cascade` | Atomic insert across `relay` + `event` + `event_relay` |
| `relay_metadata_insert_cascade` | Atomic insert across `relay` + `metadata` + `relay_metadata` |

### Cleanup (2 functions)

Batched cleanup operations for removing orphaned data.

| Function | Purpose |
|----------|---------|
| `orphan_metadata_delete` | Remove metadata not referenced by any relay (configurable batch size) |
| `orphan_event_delete` | Remove events without relay associations (configurable batch size) |

### Refresh (12 functions)

One refresh function per materialized view, plus a coordinated refresh-all function. Function names follow the `<view_name>_refresh()` pattern.

| Function | View |
|----------|------|
| `relay_metadata_latest_refresh` | Latest metadata per relay per type |
| `event_stats_refresh` | Global event statistics |
| `relay_stats_refresh` | Per-relay statistics |
| `kind_counts_refresh` | Event counts by kind |
| `kind_counts_by_relay_refresh` | Event counts by kind per relay |
| `pubkey_counts_refresh` | Unique pubkey counts |
| `pubkey_counts_by_relay_refresh` | Unique pubkeys per relay |
| `network_stats_refresh` | Per-network statistics |
| `relay_software_counts_refresh` | Relay software distribution |
| `supported_nip_counts_refresh` | NIP support distribution |
| `event_daily_counts_refresh` | Daily event counts |
| `all_statistics_refresh` | Refresh all views in dependency order |

## Calling Convention

All stored functions are called through `Brotr._call_procedure()`, which handles parameter serialization, timeout management, and error handling. Query functions in `services/common/queries.py` wrap these calls with domain-specific logic.

## Bulk Parameters

All CRUD functions accept PostgreSQL array parameters (`TEXT[]`, `BYTEA[]`, `INTEGER[]`, `BIGINT[]`, `JSONB[]`) for batch operations. This minimizes round trips — a single function call can insert hundreds of records.

## Security

All functions use `SECURITY INVOKER` (PostgreSQL default). They execute with the permissions of the calling user (`writer` or `reader`), not the function owner.

## Next Steps

- [Materialized Views](/docs/database/views/) — the 11 pre-computed analytics views.
- [Schema Overview](/docs/database/schema/) — table definitions and relationships.
