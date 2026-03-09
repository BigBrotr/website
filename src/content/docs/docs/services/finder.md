---
title: Finder
description: Continuous service that discovers relay URLs from events and APIs.
---

The Finder is a **continuous** service that discovers new relay URLs from multiple sources. It runs in a loop, scanning for new relay URLs and inserting them as candidates for validation.

## Purpose

The Nostr network is constantly growing. New relays appear daily. The Finder ensures BigBrotr's relay list stays current by discovering URLs from two sources:

1. **Event tag mining** — scans archived events for relay URLs in tag values (kind-agnostic, not limited to NIP-65).
2. **External APIs** — HTTP endpoints that aggregate relay information, parsed with configurable JMESPath expressions.

## How It Works

### Event Scanning

The Finder scans archived events for relay URLs embedded in tag values. This is **kind-agnostic** — it extracts relay URLs from all event tags, not just NIP-65 relay lists. For each relay in the database, the Finder cursor-paginates through events using composite cursors `(seen_at, event_id)` for deterministic ordering. Cursors are persisted in the `service_state` table, so the Finder resumes where it left off after restarts.

Event scanning runs concurrently across relays via `ConcurrentStreamMixin`, bounded by a configurable `parallel_relays` semaphore.

### API Discovery

The Finder queries public APIs that aggregate relay information. API endpoints are configured per-source with individual `timeout`, `connect_timeout`, and `allow_insecure` settings. Responses are parsed using JMESPath expressions for flexible extraction regardless of API response format. A configurable `cooldown` prevents re-querying the same source too frequently, and `request_delay` adds politeness between API calls.

### Cleanup

Each cycle starts with cleanup: `delete_stale_cursors()` removes cursor state for deleted relays, and `delete_stale_api_checkpoints()` removes state for removed API sources.

## Configuration

```yaml
# config/services/finder.yaml
interval: 300  # seconds between cycles

events:
  enabled: true
  batch_size: 100
  parallel_relays: 50
  max_relay_time: null   # per-relay time limit
  max_duration: 86400    # overall event scan time limit

api:
  enabled: true
  cooldown: 86400        # seconds before re-querying a source
  request_delay: 1.0     # politeness delay between API calls
  max_response_size: 5242880
  sources:
    - url: https://api.nostr.watch/v1/online
      expression: "[*]"
      timeout: 30
      allow_insecure: false
```

The Finder does not use per-network configuration since it queries APIs over HTTP and scans events from the local database.

## Usage

```bash
# Run continuously
python -m bigbrotr finder

# Run a single discovery cycle
python -m bigbrotr finder --once

# With debug logging
python -m bigbrotr finder --log-level DEBUG
```

## Metrics

When metrics are enabled in the service configuration, the Finder exposes Prometheus metrics:

- `service_counter{name="candidates_found"}` — total new relay URLs discovered
- `service_counter{name="apis_queried"}` — total API requests made
- `cycle_duration_seconds` — time per discovery cycle
