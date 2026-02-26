---
title: Validator
description: Continuous service that tests relay connectivity and promotes candidates.
---

The Validator is a **continuous** service that tests relay candidates with a live WebSocket handshake and promotes successful ones to the relay table.

## Purpose

Not every URL discovered by the Seeder or Finder is an active Nostr relay. URLs may be stale, point to non-Nostr services, or be unreachable. The Validator filters candidates by attempting a real WebSocket connection and verifying that the endpoint speaks the Nostr protocol.

## How It Works

1. Fetches a batch of unvalidated candidate URLs from the database.
2. For each candidate, grouped by network type (clearnet, Tor, I2P, Lokinet):
   - Opens a WebSocket connection (with appropriate proxy for overlay networks).
   - Sends a Nostr protocol handshake.
   - Verifies the response indicates a valid Nostr relay.
3. Promotes successful candidates to the `relay` table.
4. Marks failed candidates for retry with exponential backoff.
5. Sleeps, then repeats.

## Configuration

```yaml
# config/services/validator.yaml
interval: 120  # seconds between cycles

processing:
  chunk_size: 100    # candidates per cycle

networks:
  clearnet:
    timeout: 15
    max_tasks: 50
  tor:
    enabled: true
    timeout: 45
    max_tasks: 10
    proxy_url: socks5://tor:9050
  i2p:
    enabled: true
    timeout: 60
    max_tasks: 5
    proxy_url: socks5://i2p:4447
  loki:
    enabled: true
    timeout: 45
    max_tasks: 5
    proxy_url: socks5://lokinet:1080

cleanup:
  enabled: false
  max_failures: 100
```

## Usage

```bash
# Run continuously
python -m bigbrotr validator

# Run a single validation cycle
python -m bigbrotr validator --once
```

## Metrics

The Validator exposes Prometheus metrics on port 8002:

- `service_counter{name="validated"}` — total relays successfully validated
- `service_counter{name="failed"}` — total validation failures
- `service_gauge{name="candidates_pending"}` — current unvalidated candidates
- `cycle_duration_seconds` — time per validation cycle
