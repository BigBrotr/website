---
title: "NIP-11: Relay Information"
description: How BigBrotr fetches and processes NIP-11 Relay Information Documents.
---

[NIP-11](https://github.com/nostr-protocol/nips/blob/master/11.md) defines a standard for relays to publish their capabilities and metadata as a JSON document accessible via HTTP(S) at the relay's WebSocket URL.

## What NIP-11 Provides

When a client sends an HTTP GET request with `Accept: application/nostr+json` to a relay's URL, compliant relays return a JSON document containing:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Relay name |
| `description` | string | Human-readable description |
| `pubkey` | string | Relay operator's public key |
| `contact` | string | Contact information |
| `supported_nips` | int[] | List of supported NIP numbers |
| `software` | string | Software implementation URL |
| `version` | string | Software version string |
| `limitation` | object | Rate limits, message sizes, subscription limits |
| `retention` | object[] | Data retention policies |
| `relay_countries` | string[] | ISO 3166-1 country codes |
| `language_tags` | string[] | BCP 47 language tags |
| `tags` | string[] | Relay category tags |
| `posting_policy` | string | URL to posting policy |
| `payments_url` | string | URL to payment information |

## BigBrotr Implementation

The `Nip11` class in `bigbrotr.nips.nip11` handles:

1. **Fetching** — HTTP GET with `Accept: application/nostr+json` header. Handles timeouts, SSL errors, connection failures, and non-JSON responses.
2. **Parsing** — JSON parsing with field validation. Extracts software name and version from the `software` URL.
3. **Storage** — Produces a `Metadata` object with `MetadataType.NIP11` containing the parsed data.

### Error Handling

NIP-11 fetch methods never raise exceptions. Instead, the result object includes a `logs.success` flag:

```python
result = await nip11.fetch(relay_url)
if result.logs.success:
    # Use result.metadata
else:
    # Log failure, skip relay
```

This pattern ensures that one relay's failure never crashes the monitoring cycle.

### Software Detection

The `software` field in NIP-11 documents is typically a URL like `git+https://github.com/hoytech/strfry`. BigBrotr extracts the software name from the URL path, enabling the `relay_software_counts` materialized view to show the distribution of relay implementations across the network.

## Data Flow

```
Relay → HTTP GET → NIP-11 JSON → Parse → Metadata(type=NIP11) → relay_metadata_insert_cascade
```

The NIP-11 metadata is stored content-addressed: if a relay's NIP-11 document hasn't changed since the last check, the same SHA-256 hash is produced and no duplicate metadata row is created. Only the `relay_metadata` junction row is updated with the new `generated_at` timestamp.
