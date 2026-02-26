---
title: Refresher
description: Scheduled service that orchestrates materialized view refresh cycles.
---

The Refresher is a **scheduled** service that orchestrates the refresh of BigBrotr's 11 materialized views. These views pre-compute analytics queries that would otherwise be expensive to run on demand.

## Purpose

Materialized views store the result of a query physically on disk. Unlike regular views, they do not re-execute the query on every access. However, they become stale as underlying data changes. The Refresher keeps them current by periodically triggering `REFRESH MATERIALIZED VIEW CONCURRENTLY` for each view.

## How It Works

1. Reads the configured refresh interval and view list.
2. For each materialized view, in dependency order:
   - Calls `REFRESH MATERIALIZED VIEW CONCURRENTLY` (non-blocking for reads).
   - Records the refresh duration.
3. Sleeps for the configured interval, then repeats.

The `CONCURRENTLY` keyword ensures that reads on the materialized view are not blocked during refresh. This requires a unique index on each view, which BigBrotr's schema provides.

## Materialized Views

| View | Purpose |
|------|---------|
| `relay_metadata_latest` | Most recent metadata per relay per type |
| `event_stats` | Global event statistics |
| `relay_stats` | Per-relay aggregate statistics |
| `kind_counts` | Event counts grouped by kind |
| `kind_counts_by_relay` | Event counts by kind per relay |
| `pubkey_counts` | Unique pubkey counts |
| `pubkey_counts_by_relay` | Unique pubkeys per relay |
| `network_stats` | Statistics aggregated by network type |
| `relay_software_counts` | Distribution of relay software |
| `supported_nip_counts` | NIP support distribution across relays |
| `event_daily_counts` | Daily event ingestion counts |

## Configuration

```yaml
# config/services/refresher.yaml
interval: 3600  # seconds between refresh cycles (1 hour)

refresh:
  views:
    - relay_metadata_latest
    - event_stats
    - relay_stats
    - kind_counts
    - kind_counts_by_relay
    - pubkey_counts
    - pubkey_counts_by_relay
    - network_stats
    - event_daily_counts
    - relay_software_counts
    - supported_nip_counts
```

The view list can be customized to refresh only a subset. Refresh timeouts are controlled by the core `TimeoutsConfig.refresh` setting in the Brotr configuration.

## Usage

```bash
# Run continuously
python -m bigbrotr refresher

# Run a single refresh cycle
python -m bigbrotr refresher --once
```
