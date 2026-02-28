---
title: Introduction
description: What BigBrotr is, why it exists, and what problems it solves.
---

BigBrotr is a distributed relay observatory for the Nostr network. It tackles the network through five pillars:

1. **Discovery** — Find relays across clearnet, Tor, I2P, and Lokinet.
2. **Monitoring** — Seven health checks per relay: NIP-11 info, RTT, SSL, DNS, geolocation, network/ASN, HTTP.
3. **Archiving** — Cursor-based event synchronization with content-addressed deduplication.
4. **Analytics** — 11 materialized views pre-computing aggregate statistics.
5. **Data Access** — REST API for HTTP clients and NIP-90 Data Vending Machine for native Nostr queries.

## Why BigBrotr?

Nostr is a decentralized protocol where events are scattered across hundreds of independent relays. Each relay is ephemeral and can disappear at any time. No single entity sees the whole picture, and unreplicated events are lost forever.

BigBrotr provides complete network visibility by running eight independent services that share a PostgreSQL database. There are no message queues, no inter-service APIs, and no complex orchestration layers. Each service has a single responsibility and can run, scale, and fail independently.

## Five Pillars

### Discovery

The Seeder loads relay URLs from seed files and known relay lists. The Finder continuously discovers new relay URLs from events and public APIs. The Validator tests each candidate with a live WebSocket handshake and promotes valid relays to the relay table.

### Monitoring

The Monitor performs continuous health checks using NIP-11 relay information documents and NIP-66 relay monitoring events — seven tests per relay: RTT latency, SSL certificate validity, DNS resolution, geographic location, network/ASN info, and HTTP headers. Results are stored as content-addressed metadata and published as kind 10166/30166 Nostr events.

### Event Archiving

The Synchronizer uses cursor-based pagination to collect and archive Nostr events from validated relays. Content-addressed metadata deduplication (SHA-256) ensures storage efficiency.

### Analytics

The Refresher orchestrates periodic refresh cycles for 11 materialized views that pre-compute aggregate statistics: event distribution by kind, per-relay stats, author counts, NIP adoption, software distribution, and daily time series. These views power the API responses without expensive JOINs at runtime.

### Data Access

Two parallel interfaces expose the same data: the Api service provides a REST API with automatic schema discovery, filtering, sorting, and pagination. The Dvm service provides a NIP-90 Data Vending Machine, allowing any Nostr client to query BigBrotr over WebSocket without HTTP.

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Language | Python 3.11+ with full async/await |
| Database | PostgreSQL 16+ with asyncpg |
| Connection Pooling | PgBouncer (transaction mode) |
| Configuration | Pydantic models from YAML files |
| Metrics | Prometheus exposition format |
| Containerization | Docker with parametric Dockerfile |
| Overlay Networks | Tor, I2P, Lokinet via SOCKS5 proxy |

## Who Is This For?

- **Researchers** studying Nostr network topology, relay behavior, and event propagation patterns.
- **Developers** building applications that need relay recommendations, health data, or event archives.
- **Relay operators** wanting to understand their relay's position in the network.
- **Protocol designers** testing NIP implementations against real-world data.
- **Anyone** who wants to run their own Nostr network observatory.

## Next Steps

- [Quick Start](/docs/getting-started/quick-start/) — get BigBrotr running in minutes with Docker Compose.
- [Installation](/docs/getting-started/installation/) — install from source for development.
- [Architecture Overview](/docs/architecture/overview/) — understand the diamond DAG design.
