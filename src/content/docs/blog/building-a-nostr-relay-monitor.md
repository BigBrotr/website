---
title: Building a Nostr Relay Monitor with BigBrotr
date: 2026-03-13
authors:
  - bigbrotr
tags:
  - tutorial
  - nostr
  - monitoring
  - nip-66
excerpt: There's a wealth of data you can extract from a Nostr relay — why settle for less? Build a fully NIP-66 compliant monitor in under 80 lines of Python.
---

There's a surprising amount of information you can extract from a Nostr relay beyond just "is it online." RTT latency across WebSocket open, read, and write. TLS certificate details and chain validity. DNS records, reverse lookups, nameservers. IP geolocation down to city level. ASN and network operator. The actual server software from HTTP headers. The relay's self-reported capabilities, limitations, and supported NIPs.

All of this data is useful — for relay operators debugging their infrastructure, for clients picking the best relay, for researchers mapping the Nostr network. Why leave any of it on the table?

## Everything, or Just What You Need

BigBrotr lets you collect all of it. Or just the parts you care about. Both NIP-11 and NIP-66 checks are controlled by selection objects:

```python
# Run everything (default)
nip66_selection = Nip66Selection()

# Or pick exactly what you need
nip66_selection = Nip66Selection(
    rtt=True,
    ssl=True,
    dns=False,
    geo=True,
    net=False,
    http=True,
)
```

Same for NIP-11 — `Nip11Selection(info=True)` fetches the relay information document, `info=False` skips it. Mix and match however you want. Checks you disable don't run at all — no wasted time, no wasted bandwidth.

Once you've collected the data, `build_relay_discovery()` packages exactly what you computed into a kind 30166 event fully compliant with NIP-66. No manual tag construction, no guessing at the spec. The announcement event (kind 10166) automatically declares which checks you have enabled via `c` (capability) tags and `timeout` tags per check type, so other clients know what to expect from your monitor.

## The Code

The full example is in [examples/monitor_relays.py](https://github.com/BigBrotr/examples/blob/main/monitor_relays.py) — under 80 lines for a complete, working monitor:

```python
import geoip2.database
from nostr_sdk import Client, Keys, NostrSigner, RelayUrl

from bigbrotr.models.constants import NetworkType
from bigbrotr.models.relay import Relay
from bigbrotr.nips.event_builders import (
    build_monitor_announcement,
    build_profile_event,
    build_relay_discovery,
)
from bigbrotr.nips.nip11 import Nip11, Nip11Selection
from bigbrotr.nips.nip66 import Nip66, Nip66Dependencies, Nip66Selection

# 1. Prepare dependencies (reused across all relays)
city_reader = geoip2.database.Reader("GeoLite2-City.mmdb")
asn_reader = geoip2.database.Reader("GeoLite2-ASN.mmdb")
deps = Nip66Dependencies(city_reader=city_reader, asn_reader=asn_reader)

# 2. Connect and announce
signer = NostrSigner.keys(Keys.generate())
client = Client(signer)
await client.add_relay(RelayUrl.parse("wss://nos.lol"))
await client.connect()

await client.send_event_builder(build_profile_event(name="My Monitor"))
await client.send_event_builder(
    build_monitor_announcement(
        interval=3600,
        timeout_ms=10000,
        enabled_networks=[NetworkType.CLEARNET],
        nip11_selection=Nip11Selection(),
        nip66_selection=Nip66Selection(),
    )
)

# 3. Monitor and publish
for url in ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.nostr.band"]:
    relay = Relay(url)
    nip11 = await Nip11.create(relay)
    nip66 = await Nip66.create(relay, deps=deps)
    await client.send_event_builder(build_relay_discovery(relay, nip11, nip66))
```

Three calls per relay. `Nip11.create()` and `Nip66.create()` are async factory methods that **never raise** — all errors are captured in their respective `logs` fields, so you can iterate over hundreds of relays without a single try/except. `build_relay_discovery()` takes whatever data was successfully collected and serializes it into a fully tagged NIP-66 event.

`Nip66Dependencies` bundles the GeoIP readers and a throwaway keypair used for the RTT write test, so they can be reused across all relays without repeated initialization.

---

## NIP-11: Relay Information

`Nip11.create()` fetches the relay's information document over HTTP. It converts the WebSocket URL to its HTTP equivalent (`wss://` → `https://`) and sends a request with `Accept: application/nostr+json`.

The response is validated for correct Content-Type (`application/nostr+json` or `application/json`), maximum size (64 KB), and JSON structure (must be a dict, not a list or scalar). The resulting `Nip11InfoData` model captures the relay's name, description, pubkey, contact, supported NIPs, software, version, and limitations.

For relays with certificate issues, the `allow_insecure` option enables SSL fallback. Overlay networks (Tor, I2P, Lokinet) automatically use a non-validating SSL context since the proxy layer provides encryption.

---

## NIP-66: Six Concurrent Health Checks

`Nip66.create()` runs up to six checks **in parallel** via `asyncio.gather()`. Each check is independent — a failure in one doesn't affect the others. Checks for which the required dependency is missing (e.g. no `city_reader` for geo) are silently skipped.

### RTT (Round-Trip Time)

Three sequential phases measuring actual WebSocket performance — not just a ping, but real protocol-level operations:

- **Open** — measures connection establishment time via `connect_relay()`. If this fails, read and write are automatically marked as failed with the same reason (cascading failure).
- **Read** — streams events with a `limit(1)` filter and measures time to first event. Times out if no events arrive.
- **Write** — publishes a kind 22456 ephemeral test event and **verifies** it was stored by immediately re-querying. Reports the total time including verification. Distinguishes between rejection (relay refused), unverified (accepted but not retrievable), and success.

Output: `rtt_open`, `rtt_read`, `rtt_write` in milliseconds.

### SSL (Certificate Inspection)

A two-connection strategy:

1. **Extraction** — connects with `ssl.CERT_NONE` to read the certificate regardless of chain validity. Parses with `cryptography.x509` to extract subject CN, issuer, validity dates, SANs, serial number, fingerprint (`SHA256:AA:BB:CC:...`), TLS protocol version, and cipher details.
2. **Validation** — a separate connection with the system default SSL context to validate the certificate chain against the trust store.

Both connections run in a thread pool to avoid blocking the event loop. Clearnet only — overlay networks get an immediate skip.

### DNS (Resolution)

Comprehensive lookups via `dnspython`:

- **A records** (IPv4 addresses + TTL)
- **AAAA records** (IPv6 addresses)
- **CNAME** (canonical name)
- **NS records** — resolved against the **registered domain** (uses `tldextract` to identify the public suffix, so `relay.damus.io` queries NS for `damus.io`)
- **PTR** (reverse DNS from the first IPv4 address)

Each record type is queried independently — a failure in one doesn't prevent the others. Synchronous DNS operations run in a thread pool.

### Geo (Geolocation)

Resolves the relay's hostname to an IP (preferring IPv4, falling back to IPv6), then looks it up in the GeoLite2 City database. Extracts country (ISO 3166-1 alpha-2, preferring physical over registered country), continent, city, region, postal code, coordinates, accuracy radius, and timezone. Computes a [geohash](https://en.wikipedia.org/wiki/Geohash) at precision 9 (~5 m accuracy) from the coordinates.

### Net (Network/ASN)

Resolves both IPv4 and IPv6 addresses, then looks up the ASN in the GeoLite2 ASN database. IPv4 data takes priority — IPv6 ASN/org is used only as fallback when no IPv4 is available. Records the autonomous system number, organization name, and network CIDRs for both address families.

### HTTP (Header Capture)

Initiates a WebSocket connection and intercepts the HTTP upgrade response using `aiohttp`'s `TraceConfig` hooks. Captures the `Server` and `X-Powered-By` headers, then immediately closes. This reveals the relay's actual software stack without relying on self-reported NIP-11 data.

---

## What Gets Published

### Kind 10166 — Monitor Announcement

Declares what your monitor does: check interval, timeout, enabled networks, and `c` (capability) tags for each active check — `open`, `read`, `write`, `nip11`, `ssl`, `dns`, `geo`, `net`, `http`. Clients reading your monitor events know exactly what data to expect.

### Kind 30166 — Relay Discovery

One event per relay. The content is the NIP-11 information document as canonical JSON. The tags carry all NIP-66 health check results:

- **RTT**: `rtt-open`, `rtt-read`, `rtt-write` (milliseconds)
- **SSL**: `ssl` (valid/invalid), `ssl-expires` (Unix timestamp), `ssl-issuer`
- **DNS**: `dns-ip`, `dns-ip6`, `dns-cname`, `dns-ttl`
- **Geo**: `g` (geohash), `geo-country`, `geo-city`, `geo-lat`, `geo-lon`, `geo-tz`, plus NIP-32 `l` labels for country and continent
- **Net**: `net-ip`, `net-ipv6`, `net-asn`, `net-asn-org`, plus NIP-32 `l` labels
- **HTTP**: `http-server`, `http-powered-by`
- **NIP-11 derived**: `N` tags for supported NIPs, `R` tags for requirements (auth, payment, pow), `T` tags for relay type classification (Search, Community, Paid, etc.)

All tag names and semantics follow the NIP-66 specification — no custom extensions, full interoperability with any NIP-66 aware client.

---

## Prerequisites

The geo and net checks require [GeoLite2 databases](https://github.com/P3TERX/GeoLite.mmdb). Download `GeoLite2-City.mmdb` and `GeoLite2-ASN.mmdb` into the examples directory. If they're missing, those checks are silently skipped — the rest still run.

## Running It

```bash
cd examples
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python monitor_relays.py
```

The script prints the full NIP-11 and NIP-66 results as JSON for each relay, and publishes kind 30166 events to the target relay. Here's what a complete NIP-66 output looks like for `wss://nos.lol`:

```json
{
  "rtt": {
    "data": {
      "rtt_open": 197,
      "rtt_read": 64,
      "rtt_write": 82
    },
    "logs": {
      "open_success": true,
      "open_reason": null,
      "read_success": true,
      "read_reason": null,
      "write_success": true,
      "write_reason": null
    }
  },
  "ssl": {
    "data": {
      "ssl_valid": true,
      "ssl_subject_cn": "nos.lol",
      "ssl_issuer": "Let's Encrypt",
      "ssl_issuer_cn": "R13",
      "ssl_expires": 1777079086,
      "ssl_not_before": 1769303087,
      "ssl_san": ["nos.lol"],
      "ssl_serial": "6CCA2CA89CFC918B9759546D124552CE936",
      "ssl_version": 2,
      "ssl_fingerprint": "SHA256:FB:0B:35:B5:03:B3:54:36:3C:DC:56:8F:E3:38:E5:61:A6:0E:BA:49:4E:A2:51:5B:E0:C8:50:97:B2:71:A9:A8",
      "ssl_protocol": "TLSv1.3",
      "ssl_cipher": "TLS_AES_256_GCM_SHA384",
      "ssl_cipher_bits": 256
    },
    "logs": { "success": true, "reason": null }
  },
  "geo": {
    "data": {
      "geo_country": "DE",
      "geo_country_name": "Germany",
      "geo_continent": "EU",
      "geo_continent_name": "Europe",
      "geo_is_eu": true,
      "geo_region": "Saxony",
      "geo_city": "Falkenstein",
      "geo_postal": "08223",
      "geo_lat": 50.4777,
      "geo_lon": 12.3649,
      "geo_accuracy": 20,
      "geo_tz": "Europe/Berlin",
      "geo_hash": "u2bz1m5vg",
      "geo_geoname_id": 2927913
    },
    "logs": { "success": true, "reason": null }
  },
  "net": {
    "data": {
      "net_ip": "5.9.78.12",
      "net_ipv6": "::ffff:5.9.78.12",
      "net_asn": 24940,
      "net_asn_org": "Hetzner Online GmbH",
      "net_network": "5.9.0.0/16",
      "net_network_v6": "::ffff:5.9.0.0/112"
    },
    "logs": { "success": true, "reason": null }
  },
  "dns": {
    "data": {
      "dns_ips": ["5.9.78.12"],
      "dns_ips_v6": null,
      "dns_cname": null,
      "dns_reverse": "f56.nos.lol",
      "dns_ns": ["kiki.bunny.net", "coco.bunny.net"],
      "dns_ttl": 1105
    },
    "logs": { "success": true, "reason": null }
  },
  "http": {
    "data": {
      "http_server": "nginx/1.18.0 (Ubuntu)",
      "http_powered_by": null
    },
    "logs": { "success": true, "reason": null }
  }
}
```

Every check carries both `data` and `logs` — when a check fails, `logs.reason` tells you exactly why while the rest of the checks still complete normally.

## Going Further

This example uses randomly generated keys. For a production monitor, use a persistent keypair so clients can verify and trust your results over time. BigBrotr's Monitor service builds on the same primitives — adding scheduled execution, database persistence, configurable check selections, and overlay network support via SOCKS5 proxies.
