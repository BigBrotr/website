---
title: "NIP-66: Relay Monitoring"
description: How BigBrotr implements NIP-66 health tests and publishes monitoring events.
---

[NIP-66](https://github.com/nostr-protocol/nips/blob/master/66.md) defines a standard for relay monitoring events. BigBrotr implements six health tests and optionally publishes the results as Nostr events.

## Six Health Tests

The `Nip66` class in `bigbrotr.nips.nip66` runs independent health tests, each producing a specific `MetadataType`:

### RTT (Round-Trip Time)

Measures WebSocket latency in three phases: **open** (connection establishment), **read** (first message receipt), and **write** (message send acknowledgment). Each phase is timed independently. If any phase fails, subsequent phases are skipped (cascading failure).

| MetadataType | `NIP66_RTT` |
|---|---|
| Measures | Open/read/write latency in milliseconds (3-phase) |
| Network support | All (clearnet, Tor, I2P, Lokinet) |

### SSL (Certificate Validation)

Inspects the relay's SSL/TLS certificate using a two-connection methodology. Captures certificate validity, expiration date, issuer chain, Subject Alternative Names (SANs), cipher suite, protocol version, and SHA-256 fingerprint.

| MetadataType | `NIP66_SSL` |
|---|---|
| Measures | Certificate validity, expiration, issuer, SANs, cipher, fingerprint |
| Network support | Clearnet only (overlay networks use different transport) |

### DNS (Resolution)

Resolves the relay's hostname and collects DNS record types: A, AAAA, CNAME, NS, and PTR records with TTL values.

| MetadataType | `NIP66_DNS` |
|---|---|
| Measures | A/AAAA/CNAME/NS/PTR records, TTL |
| Network support | Clearnet only |

### Geo (Geographic Location)

Looks up the relay's IP address in the MaxMind GeoLite2-City database to determine geographic location, including geohash (precision 9) and timezone.

| MetadataType | `NIP66_GEO` |
|---|---|
| Measures | Country, city, coordinates, timezone, geohash |
| Dependencies | MaxMind GeoLite2-City.mmdb |
| Network support | Clearnet only |

### Net (Network Information)

Identifies the relay's IPv4/IPv6 addresses, Autonomous System (AS) number, organization, and network ranges.

| MetadataType | `NIP66_NET` |
|---|---|
| Measures | IP addresses, ASN, organization, network ranges |
| Dependencies | MaxMind GeoLite2-ASN.mmdb |
| Network support | Clearnet only |

### HTTP (Headers)

Captures the `Server` and `X-Powered-By` HTTP headers from the WebSocket upgrade response using trace hooks.

| MetadataType | `NIP66_HTTP` |
|---|---|
| Measures | Server header, X-Powered-By header |
| Network support | All |

## Event Publishing

When the Monitor is configured with Nostr keys, it publishes monitoring results as Nostr events:

### Kind 10166 — Monitor Announcement

A replaceable event announcing the monitor's capabilities, supported networks, and configuration. Each new publication replaces the previous one.

### Kind 22456 — Ephemeral Relay Test

An ephemeral event containing individual health test results. Not stored long-term by relays.

### Kind 30166 — Relay Discovery

A parameterized replaceable (addressable) event where the `d` tag identifies the relay. Contains aggregated health data per relay, enabling clients to subscribe to monitoring data for specific relays.

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
