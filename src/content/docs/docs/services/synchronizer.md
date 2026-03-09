---
title: Synchronizer
description: Continuous service that collects events from validated relays.
---

The Synchronizer is a **continuous** service that collects Nostr events from validated relays using binary-split windowing with cursor-based resumption. It is the primary data ingestion service, responsible for building BigBrotr's event archive.

## Purpose

The Synchronizer answers: *What events are relays publishing?* It connects to validated relays, subscribes to events, and stores them in the database with relay association metadata.

## How It Works

1. Fetches all validated relays, shuffles them (`random.shuffle` to prevent thundering herd).
2. Loads per-relay cursor state from `service_state`.
3. For each relay (concurrently via `ConcurrentStreamMixin`, bounded by per-network semaphores):
   - Opens a WebSocket connection (with SSL fallback if `allow_insecure`).
   - Streams events via the `stream_events()` windowing algorithm from `utils/streaming.py`.
   - Buffers events, batch-inserts via `event_relay_insert_cascade` (atomic multi-table insert).
   - Updates the sync cursor in `service_state` (batched writes every `flush_interval` relays).
4. Sleeps, then repeats.

### Data-Driven Windowing

The Synchronizer uses a windowing algorithm with completeness guarantees. For each relay, the time range is divided into windows. After fetching events in a window, the algorithm **verifies completeness** by re-fetching at `min(created_at)`. If the relay's response appears incomplete (e.g., the relay enforces a lower internal limit), the window is split in half (binary split) and retried. This ensures no events are missed even from high-volume relays.

### Cursor-Based Resumption

Each relay maintains its own `SyncCursor(key, timestamp, id)` stored in the `service_state` table. On restart, the Synchronizer resumes where it left off. Cursor writes are batched (flushed every `flush_interval` relays) with a mutex protecting concurrent buffer access.

### Content-Addressed Storage

Events are stored by their Nostr event ID (a SHA-256 hash). If the same event is received from multiple relays, it is stored once in the `event` table with multiple entries in the `event_relay` junction table. This tracks which relays have which events without duplicating event data.

## Configuration

```yaml
# config/services/synchronizer.yaml
interval: 300  # seconds between cycles

limit: 500             # max events per relay window
flush_interval: 50     # flush cursors every N relays
allow_insecure: false  # SSL fallback for invalid certificates

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
  clearnet: 1800       # per-relay sync timeout (clearnet)
  tor: 3600            # per-relay sync timeout (Tor)
  max_duration: null   # overall phase time cap (null = unlimited)
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
