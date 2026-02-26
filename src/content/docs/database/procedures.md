---
title: Stored Procedures
description: BigBrotr's 25 database functions for mutations, queries, and maintenance.
---

BigBrotr uses 25 stored procedures for all database mutations. Application code never executes raw INSERT, UPDATE, or DELETE statements. All procedures accept bulk array parameters for batch efficiency.

## Function Categories

### Utility (1 function)

| Function | Purpose |
|----------|---------|
| `tags_to_tagvalues` | Converts JSONB tag arrays to a searchable tagvalue format |

### CRUD (10 functions)

These handle the core data operations — inserting relays, events, metadata, and service state.

| Function | Purpose |
|----------|---------|
| `relay_insert` | Insert or update relays (bulk array parameters) |
| `relay_delete` | Remove relays by URL |
| `event_insert` | Insert events (bulk array parameters) |
| `event_relay_insert` | Insert event-relay associations |
| `event_relay_insert_cascade` | Atomic insert across relay + event + event_relay |
| `metadata_insert` | Insert metadata objects (bulk array parameters) |
| `relay_metadata_insert` | Insert relay-metadata associations |
| `relay_metadata_insert_cascade` | Atomic insert across relay + metadata + relay_metadata |
| `service_state_upsert` | Insert or update service state checkpoints |
| `service_state_delete` | Remove service state entries |

### Cleanup (2 functions)

Batched cleanup operations for data hygiene.

| Function | Purpose |
|----------|---------|
| `relay_cleanup` | Remove relays not seen within a configurable window |
| `metadata_cleanup` | Remove orphaned metadata not referenced by any relay |

### Refresh (12 functions)

One refresh function per materialized view, plus a coordinated refresh-all function.

| Function | Purpose |
|----------|---------|
| `refresh_relay_metadata_latest` | Refresh the latest metadata per relay per type |
| `refresh_event_stats` | Refresh global event statistics |
| `refresh_relay_stats` | Refresh per-relay statistics |
| `refresh_kind_counts` | Refresh event counts by kind |
| `refresh_kind_counts_by_relay` | Refresh event counts by kind per relay |
| `refresh_pubkey_counts` | Refresh unique pubkey counts |
| `refresh_pubkey_counts_by_relay` | Refresh unique pubkeys per relay |
| `refresh_network_stats` | Refresh per-network statistics |
| `refresh_relay_software_counts` | Refresh relay software distribution |
| `refresh_supported_nip_counts` | Refresh NIP support distribution |
| `refresh_event_daily_counts` | Refresh daily event counts |
| `refresh_all` | Refresh all materialized views in dependency order |

## Calling Convention

All stored procedures are called through `Brotr._call_procedure()`, which handles:

- Parameter serialization (Python types to PostgreSQL arrays)
- Timeout management (configurable via `TimeoutsConfig`)
- Error handling and logging

```python
# Example: inserting relays via stored procedure
await brotr._call_procedure(
    "relay_insert",
    urls,          # TEXT[]
    networks,      # TEXT[]
    first_seens,   # TIMESTAMPTZ[]
    last_seens,    # TIMESTAMPTZ[]
)
```

Query functions in `services/common/queries.py` wrap these procedure calls with domain-specific logic, providing a clean API for services.

## Bulk Parameters

All CRUD procedures accept PostgreSQL array parameters (`TEXT[]`, `INT[]`, `TIMESTAMPTZ[]`, `JSONB[]`) for batch operations. This minimizes round trips — a single procedure call can insert hundreds of records.

## Security

All procedures use `SECURITY INVOKER` (PostgreSQL default). They execute with the permissions of the calling user (`writer` or `reader`), not the function owner.

## Next Steps

- [Materialized Views](/database/views/) — the 11 pre-computed analytics views.
- [Schema Overview](/database/schema/) — table definitions and relationships.
