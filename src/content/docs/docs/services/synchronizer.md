---
title: Synchronizer
description: Continuous service that collects events from validated relays.
---

The Synchronizer is a **continuous** service that collects Nostr events from validated relays using cursor-based pagination. It is the primary data ingestion service, responsible for building BigBrotr's event archive.

## Purpose

The Synchronizer answers: *What events are relays publishing?* It connects to validated relays, subscribes to events, and stores them in the database with relay association metadata.

## How It Works

1. Fetches a batch of validated relays to synchronize.
2. For each relay, grouped by network type:
   - Retrieves the sync cursor (last seen event timestamp) from `service_state`.
   - Opens a WebSocket connection to the relay.
   - Subscribes to events newer than the cursor.
   - Receives events until the relay signals end-of-stored-events (EOSE).
   - Stores events via `event_relay_insert_cascade` (atomic multi-table insert).
   - Updates the sync cursor in `service_state`.
3. Sleeps, then repeats.

### Cursor-Based Pagination

Each relay maintains its own sync cursor stored in the `service_state` table. The cursor is a Unix timestamp representing the most recent event collected from that relay. On each cycle, the Synchronizer requests only events newer than the cursor, avoiding re-downloading previously collected events.

### Content-Addressed Storage

Events are stored by their Nostr event ID (a SHA-256 hash). If the same event is received from multiple relays, it is stored once in the `event` table with multiple entries in the `event_relay` junction table. This tracks which relays have which events without duplicating event data.

## Configuration

```yaml
# config/services/synchronizer.yaml
interval: 300  # seconds between cycles

filter:
  limit: 500   # max events per relay request

time_range:
  use_relay_state: true
  lookback_seconds: 86400

networks:
  clearnet:
    timeout: 10
    max_tasks: 25
  tor:
    enabled: true
    timeout: 30
    max_tasks: 5
    proxy_url: socks5://tor:9050

timeouts:
  relay_clearnet: 1800
  relay_tor: 3600
```

## Usage

```bash
# Run continuously
python -m bigbrotr synchronizer

# Run a single sync cycle
python -m bigbrotr synchronizer --once
```

## Metrics

When metrics are enabled, the Synchronizer exposes Prometheus metrics:

- `service_counter{name="events_collected"}` — total events stored
- `service_counter{name="relays_synced"}` — total relay sync operations
- `cycle_duration_seconds` — time per synchronization cycle
