---
title: Welcome to BigBrotr
date: 2026-01-15
authors:
  - bigbrotr
tags:
  - announcement
description: Introducing BigBrotr — a distributed relay observatory for the Nostr network built with Python and PostgreSQL.
excerpt: Introducing BigBrotr — a distributed relay observatory for the Nostr network built with Python and PostgreSQL.
---

BigBrotr is a relay observatory for the Nostr network. It discovers relays across four networks, monitors their health with NIP-11 and NIP-66 checks, archives events, pre-computes analytics through materialized views, and exposes everything through a REST API and a native Nostr Data Vending Machine.

## What We Built

BigBrotr tackles the Nostr network through five pillars:

1. **Discovery** — find relays across clearnet, Tor, I2P, and Lokinet using seed files, external APIs, and event tag mining
2. **Monitoring** — 7 health checks per relay: NIP-11 info fetch, RTT latency (WebSocket open/read/write), SSL certificate inspection, DNS records, IP geolocation, network/ASN info, and HTTP headers
3. **Archiving** — cursor-based event synchronization with binary-split windowing for completeness verification
4. **Analytics** — 11 materialized views pre-computing aggregate statistics refreshed concurrently by a dedicated service
5. **Data Access** — REST API (FastAPI) for HTTP clients and a NIP-90 Data Vending Machine for native Nostr clients over WebSocket

## Architecture

The system follows a diamond DAG dependency structure — imports flow strictly downward, enforced by linter rules:

- **models** — pure frozen dataclasses with fail-fast validation, content-addressed deduplication (SHA-256), zero I/O
- **core** — asyncpg connection pool with retry/backoff, database facade (Brotr) wrapping 25 stored procedures, base service with lifecycle management
- **nips** — NIP-11 relay information fetch with graceful degradation, NIP-66 health monitoring (6 concurrent tests per relay)
- **utils** — DNS resolution, HTTP/WebSocket transport with SSL fallback, Nostr key management, relay protocol helpers
- **services** — eight independent services communicating exclusively through PostgreSQL

## Eight Services

Each service runs independently — no direct service-to-service dependencies, all communication via the database:

| Service | Role | Description |
|---------|------|-------------|
| Seeder | Bootstrap | One-shot: loads relay URLs from seed files as candidates |
| Finder | Discovery | Discovers relays from external APIs and mines URLs from archived event tags |
| Validator | Validation | Tests WebSocket connectivity, promotes candidates to validated relays |
| Monitor | Health | NIP-11 info + 6 NIP-66 tests per relay, publishes results to the Nostr network |
| Synchronizer | Archiving | Cursor-based event collection with binary-split windowing and per-relay progress |
| Refresher | Analytics | Refreshes 11 materialized views concurrently in dependency order |
| Api | HTTP access | FastAPI REST API with automatic schema discovery, filtering, sorting, pagination |
| Dvm | Nostr access | NIP-90 Data Vending Machine: responds to Nostr job requests over WebSocket |

## Get Started

Check out the [Quick Start guide](/docs/getting-started/quick-start/) to run BigBrotr with Docker Compose, or read the [full technical deep dive](/blog/inside-bigbrotr/) for a comprehensive look at the architecture and design decisions.

The full source code is available on [GitHub](https://github.com/BigBrotr/bigbrotr) under the MIT license.
