---
title: Service Configuration
description: Per-service YAML configuration with network-specific settings.
---

Each service has its own YAML configuration file in `config/services/`. All configurations are validated through Pydantic models, ensuring type safety and sensible defaults.

## Common Parameters

Every continuous service configuration includes:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `interval` | `float` | `300.0` | Seconds between run cycles (minimum 60) |
| `max_consecutive_failures` | `int` | `10` | Failures before the service stops |
| `metrics.enabled` | `bool` | `false` | Enable Prometheus metrics endpoint |
| `metrics.port` | `int` | `8000` | Metrics HTTP port |
| `metrics.host` | `str` | `127.0.0.1` | Metrics bind address |

## Network Configuration

Services that perform network I/O include per-network blocks nested under a `networks:` key:

```yaml
networks:
  clearnet:
    timeout: 30
    max_tasks: 50

  tor:
    enabled: true
    timeout: 60
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
```

Each network type has its own Pydantic model:

| Model | Fields |
|-------|--------|
| `ClearnetConfig` | `enabled`, `timeout`, `max_tasks`, `proxy_url` |
| `TorConfig` | `enabled`, `timeout`, `max_tasks`, `proxy_url` |
| `I2pConfig` | `enabled`, `timeout`, `max_tasks`, `proxy_url` |
| `LokiConfig` | `enabled`, `timeout`, `max_tasks`, `proxy_url` |

## Service-Specific Configuration

### Seeder

```yaml
# config/services/seeder.yaml
seed:
  file_path: seeds/relays.txt
  to_validate: true
```

### Finder

```yaml
# config/services/finder.yaml
interval: 300

events:
  enabled: true
  limit: 500

api:
  sources:
    - url: https://api.nostr.watch/v1/online
      jmespath: "[].url"
      timeout: 30
      connect_timeout: 10
      allow_insecure: false
  cooldown: 3600
  request_delay: 1.0

networks:
  clearnet:
    timeout: 10
    max_tasks: 25
```

### Validator

```yaml
# config/services/validator.yaml
interval: 120

processing:
  chunk_size: 100
  allow_insecure: false  # SSL fallback for invalid certificates

networks:
  clearnet:
    timeout: 15
    max_tasks: 50
  tor:
    enabled: true
    timeout: 45
    max_tasks: 10
    proxy_url: socks5://tor:9050

cleanup:
  enabled: false
  max_failures: 100
```

### Monitor

```yaml
# config/services/monitor.yaml
interval: 600

processing:
  chunk_size: 200
  allow_insecure: false
  compute:
    nip11_info: true
    nip66_rtt: true
    nip66_ssl: true
    nip66_geo: true
    nip66_net: true
    nip66_dns: true
    nip66_http: true

networks:
  clearnet:
    timeout: 30
    max_tasks: 100

geo:
  city_database_path: static/GeoLite2-City.mmdb
  asn_database_path: static/GeoLite2-ASN.mmdb
  geohash_precision: 9
```

### Refresher

```yaml
# config/services/refresher.yaml
interval: 3600

refresh:
  views:
    - relay_metadata_latest
    - event_stats
    - relay_stats
    - kind_counts
    - kind_counts_by_relay
    - pubkey_counts
    - pubkey_counts_by_relay
    - network_stats
    - relay_software_counts
    - supported_nip_counts
    - event_daily_counts
```

### Synchronizer

```yaml
# config/services/synchronizer.yaml
interval: 300

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

### Api

```yaml
# config/services/api.yaml
title: "BigBrotr API"
host: 0.0.0.0
port: 8080
route_prefix: /v1

cors_origins:
  - "https://bigbrotr.com"

request_timeout: 30.0
max_page_size: 1000
default_page_size: 100

tables:
  relay:
    enabled: true
  event:
    enabled: true
  metadata:
    enabled: true
  relay_stats:
    enabled: true
  event_stats:
    enabled: true
  kind_counts:
    enabled: true
  network_stats:
    enabled: true
  relay_software_counts:
    enabled: true
  supported_nip_counts:
    enabled: true
```

### Dvm

```yaml
# config/services/dvm.yaml
interval: 60

name: "BigBrotr DVM"
about: "Read-only access to the BigBrotr relay observatory"
d_tag: "bigbrotr-dvm"

relays:
  - wss://relay.damus.io
  - wss://nos.lol

kind: 5050
announce: true
allow_insecure: false
fetch_timeout: 30.0

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

## Validation

All configurations are validated at load time through Pydantic. Invalid values (wrong types, missing required fields, out-of-range numbers) cause an immediate error with a clear message. The Monitor's Nostr key configuration is validated with a `model_validator` that ensures the key is valid at startup, not at first use.

## Next Steps

- [Core Configuration](/docs/configuration/core/) — pool, Brotr, and timeout settings.
- [Deployments](/docs/configuration/deployments/) — BigBrotr vs LilBrotr.
