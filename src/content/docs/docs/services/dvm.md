---
title: Dvm
description: NIP-90 Data Vending Machine for native Nostr protocol access to BigBrotr data.
sidebar:
  order: 9
---

The Dvm (Data Vending Machine) is a **continuous** service that implements [NIP-90](https://github.com/nostr-protocol/nips/blob/master/90.md) to provide native Nostr protocol access to BigBrotr data. Any Nostr client can query relay data over WebSocket without HTTP.

## Purpose

The Dvm answers: *How can Nostr-native clients access BigBrotr data?* While the Api service provides HTTP access, the Dvm enables queries directly from Nostr clients using the standardized NIP-90 Data Vending Machine protocol.

## How It Works

1. Connects to a configurable list of Nostr relays.
2. Subscribes to NIP-90 job request events (kind 5050).
3. For each job request:
   - Parses query parameters from event tags.
   - Validates the bid against per-table pricing.
   - Executes a safe parameterized query against the database.
   - Publishes the result as a kind 6050 event (or kind 7000 feedback on error).
4. Optionally publishes a NIP-89 announcement event (kind 31990) for discoverability.

### Event Kinds

| Kind | Type | Description |
|------|------|-------------|
| 5050 | Job Request | Consumed by the Dvm — query parameters in event tags |
| 6050 | Job Result | Published by the Dvm — query results as JSON |
| 7000 | Feedback | Published on error or payment-required |
| 31990 | Handler Info | NIP-89 announcement for client discoverability |

### Query Parameters

Job requests include query parameters as event tags:

| Tag | Required | Description |
|-----|----------|-------------|
| `table` | Yes | Target table or materialized view |
| `limit` | No | Maximum rows (default: 100, max: 1000) |
| `offset` | No | Skip rows for pagination (default: 0) |
| `filter` | No | Comma-separated filters: `col=op:value` |
| `sort` | No | Sort column and direction: `col:asc` or `col:desc` |
| `bid` | No | Amount in millisats for per-table pricing |

### Pricing

The Dvm supports per-table pricing in millisats. When a job request includes a `bid` tag, the Dvm validates it against the configured price for the requested table. If the bid is insufficient, a kind 7000 feedback event is published with a `payment-required` status.

### Security

All queries use parameterized SQL to prevent injection. The Dvm uses the same `Catalog` facade as the Api service, which raises `CatalogError` instead of raw database exceptions.

## Configuration

```yaml
# config/services/dvm.yaml
interval: 60  # seconds between polling cycles

name: "BigBrotr DVM"
about: "Read-only access to the BigBrotr relay observatory"
d_tag: "bigbrotr-dvm"

relays:
  - wss://relay.damus.io
  - wss://nos.lol

kind: 5050                # NIP-90 request kind (5000-5999)
announce: true            # publish NIP-89 handler info at startup
allow_insecure: false     # SSL fallback for invalid certificates
fetch_timeout: 30.0       # event fetch timeout

default_page_size: 100
max_page_size: 1000

tables:
  relay:
    enabled: true
    price: 0
  relay_stats:
    enabled: true
    price: 0
  event_stats:
    enabled: true
    price: 100
  kind_counts:
    enabled: true
    price: 50
```

## Usage

```bash
# Run continuously
python -m bigbrotr dvm

# Run a single polling cycle
python -m bigbrotr dvm --once
```

## NIP-89 Integration

When `announce` is true, the Dvm publishes a kind 31990 event on startup. This event advertises the Dvm's capabilities to Nostr clients that support NIP-89 handler discovery, making the Dvm discoverable without out-of-band configuration.
