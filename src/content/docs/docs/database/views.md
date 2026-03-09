---
title: Materialized Views
description: BigBrotr's 11 materialized views for pre-computed analytics.
---

BigBrotr maintains 11 materialized views that pre-compute expensive analytics queries. These views are refreshed periodically by the [Refresher](/docs/services/refresher/) service using `REFRESH MATERIALIZED VIEW CONCURRENTLY`.

## View Catalog

### relay_metadata_latest

The most recent metadata per relay per type. This is the primary view for querying current relay health status.

```sql
-- Example: get latest NIP-11 info for a relay
SELECT data FROM relay_metadata_latest
WHERE relay_url = 'wss://relay.example.com' AND metadata_type = 'NIP11_INFO';
```

### event_stats

Global event statistics: total events, total unique pubkeys, total event-relay associations, date range.

### relay_stats

Per-relay aggregate statistics: event count, unique pubkey count, first/last event timestamps, event kinds served.

### kind_counts

Event counts grouped by Nostr event kind. Answers: *How many kind 1 events exist? How many kind 7?*

### kind_counts_by_relay

Event counts by kind per relay. Answers: *Which relays serve the most kind 1 events?*

### pubkey_counts

Unique pubkey counts across the entire archive. Answers: *How many unique authors are in the archive?*

### pubkey_counts_by_relay

Unique pubkey counts per relay. Answers: *Which relays serve the most diverse author set?*

### network_stats

Statistics aggregated by network type (clearnet, Tor, I2P, Lokinet). Answers: *How does the Tor relay network compare to clearnet in size and activity?*

### relay_software_counts

Distribution of relay software implementations. Answers: *How many relays run strfry vs nostr-rs-relay vs others?*

### supported_nip_counts

NIP support distribution across relays. Answers: *How many relays support NIP-50 search? NIP-42 authentication?*

### event_daily_counts

Daily event ingestion counts over time. Answers: *What is the event volume trend? Are there anomalous spikes?*

## Concurrent Refresh

All views are refreshed using `REFRESH MATERIALIZED VIEW CONCURRENTLY`, which:

- Does **not** lock the view for reads during refresh.
- Requires a **unique index** on each view (provided by the schema).
- Takes longer than a non-concurrent refresh but avoids blocking consumers.

The `all_statistics_refresh` function refreshes all views in dependency order in a single call.

## Refresh Schedule

The Refresher service controls the refresh cycle. By default, all 11 views are refreshed once per hour. Views are refreshed in dependency order — `relay_metadata_latest` first (since other views may depend on its data), then the rest.

## Deployments

Both BigBrotr and LilBrotr deployments include all 11 materialized views. The schema initialization scripts create the views and their required unique indexes.

## Next Steps

- [Refresher Service](/docs/services/refresher/) — the service that manages refresh cycles.
- [Schema Overview](/docs/database/schema/) — table definitions and relationships.
