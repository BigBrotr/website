---
title: Finder
description: Continuous service that discovers relay URLs from events and APIs.
---

The Finder is a **continuous** service that discovers new relay URLs from multiple sources. It runs in a loop, scanning for new relay URLs and inserting them as candidates for validation.

## Purpose

The Nostr network is constantly growing. New relays appear daily. The Finder ensures BigBrotr's relay list stays current by discovering URLs from two sources:

1. **NIP-65 events** — Nostr events of kind 10002 that declare relay lists.
2. **Public APIs** — External services that aggregate relay information.

## How It Works

### Event Scanning

The Finder scans collected Nostr events for relay URLs. NIP-65 events (kind 10002) contain lists of relays that users write to or read from. The Finder extracts these URLs and inserts any previously unseen URLs as candidates.

It also scans other event kinds that may contain relay URLs in their tags (e.g., NIP-65 relay list metadata, relay recommendation events).

### API Discovery

The Finder queries public APIs that aggregate relay information. API endpoints are configured per-source, and responses are parsed using JMESPath expressions for flexible extraction regardless of API response format.

## Configuration

```yaml
# config/services/finder.yaml
sleep_interval: 300  # seconds between cycles

clearnet:
  timeout: 30
  max_concurrent: 50

tor:
  timeout: 60
  max_concurrent: 10
  proxy_url: socks5://tor-proxy:9050

apis:
  - url: https://api.nostr.watch/v1/online
    jmespath: "[].url"
  - url: https://api.example.com/relays
    jmespath: "data[].relay_url"
```

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

The Finder exposes Prometheus metrics on port 8001:

- `service_counter{name="candidates_found"}` — total new relay URLs discovered
- `service_counter{name="apis_queried"}` — total API requests made
- `cycle_duration_seconds` — time per discovery cycle
