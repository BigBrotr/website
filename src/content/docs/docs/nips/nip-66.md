---
title: "NIP-66: Relay Monitoring"
description: How BigBrotr implements NIP-66 health tests and publishes monitoring events.
---

[NIP-66](https://github.com/nostr-protocol/nips/blob/master/66.md) defines a standard for relay monitoring events. BigBrotr implements six health tests and optionally publishes the results as Nostr events.

## Six Health Tests

The `Nip66` class in `bigbrotr.nips.nip66` runs independent health tests, each producing a specific `MetadataType`:

### RTT (Round-Trip Time)

Opens a WebSocket connection to the relay and measures the round-trip time in milliseconds. This indicates the relay's responsiveness.

| MetadataType | `NIP66_RTT` |
|---|---|
| Measures | WebSocket handshake duration (ms) |
| Network support | All (clearnet, Tor, I2P, Lokinet) |

### SSL (Certificate Validation)

Inspects the relay's SSL/TLS certificate for validity, expiration, and issuer information.

| MetadataType | `NIP66_SSL` |
|---|---|
| Measures | Certificate validity, expiration date, issuer chain |
| Network support | Clearnet only (overlay networks use different transport) |

### DNS (Resolution)

Resolves the relay's hostname and measures DNS resolution time.

| MetadataType | `NIP66_DNS` |
|---|---|
| Measures | Resolution time, IP addresses, DNSSEC status |
| Network support | Clearnet only |

### Geo (Geographic Location)

Looks up the relay's IP address in MaxMind GeoIP databases to determine geographic location.

| MetadataType | `NIP66_GEO` |
|---|---|
| Measures | Country, city, ASN, latitude/longitude |
| Dependencies | MaxMind GeoLite2-City.mmdb |

### Net (Network Information)

Identifies the relay's Autonomous System (AS) number, ISP, and network prefix.

| MetadataType | `NIP66_NET` |
|---|---|
| Measures | AS number, ISP name, network prefix |
| Dependencies | MaxMind GeoLite2-ASN.mmdb |

### HTTP (Status Check)

Sends an HTTP request to the relay's URL and records the response status, headers, and redirect chain.

| MetadataType | `NIP66_HTTP` |
|---|---|
| Measures | HTTP status code, headers, redirects |
| Network support | All |

## Event Publishing

When the Monitor is configured with Nostr keys, it publishes monitoring results as Nostr events:

### Kind 10166 — Replaceable Relay Monitor

A replaceable event containing the overall monitoring status for a relay. Each new publication replaces the previous one.

### Kind 30166 — Parameterized Replaceable Relay Monitor

A parameterized replaceable event where the `d` tag identifies the relay. This enables clients to subscribe to monitoring data for specific relays.

### Event Structure

```json
{
  "kind": 30166,
  "tags": [
    ["d", "wss://relay.example.com"],
    ["rtt", "45"],
    ["ssl", "valid"],
    ["dns", "resolved"]
  ],
  "content": "",
  "created_at": 1700000000
}
```

Events are broadcast to configured relays using `broadcast_events()` from `bigbrotr.utils.protocol`.

## Error Handling

Like NIP-11, all NIP-66 test methods never raise exceptions. Each test returns a result with `logs.success` indicating whether the test completed successfully. Failed tests produce no metadata — they are simply logged and skipped.

## GeoIP Databases

The Geo and Net tests require MaxMind GeoLite2 databases:

- `GeoLite2-City.mmdb` — for geographic location
- `GeoLite2-ASN.mmdb` — for network/ASN information

These are managed by the `GeoReaders` mixin in `services/common/mixins.py`, which handles database file loading and lifecycle management. Database paths are configured in the Monitor's YAML config.
