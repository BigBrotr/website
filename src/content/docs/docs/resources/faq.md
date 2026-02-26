---
title: FAQ
description: Frequently asked questions about BigBrotr.
---

## General

### What is BigBrotr?

BigBrotr is a modular system for discovering, monitoring, and archiving the Nostr relay network. It runs six independent services that share a PostgreSQL database to provide complete network visibility.

### Is BigBrotr a relay?

No. BigBrotr is a network observatory — it connects to relays to collect data about them. However, the data BigBrotr collects can be used to build a relay, an API, a DVM (Data Vending Machine), or any other Nostr application.

### What networks does BigBrotr support?

Clearnet (wss://), Tor (.onion), I2P (.b32.i2p), and Lokinet (.loki). Each network type has its own configuration for timeouts and proxy settings.

### What Nostr events does the Monitor publish?

When configured with Nostr keys, the Monitor publishes kind 10166 (replaceable relay monitor) and kind 30166 (parameterized replaceable relay monitor) events containing health check results.

## Architecture

### Why six independent services instead of a monolith?

Each service has a single responsibility and can run, scale, and fail independently. You can run only the services you need — for example, skip the Synchronizer if you only need relay health data.

### Why PostgreSQL and not a message queue?

The database is the single source of truth and the only communication channel. This eliminates distributed system failure modes (message loss, ordering issues, backpressure) and makes the system easier to reason about, debug, and operate.

### Why not use an ORM?

BigBrotr uses stored functions with bulk array parameters for all mutations. This provides precise control over SQL execution, enables batch operations that ORMs typically handle poorly, and keeps the data layer explicit.

### Why content-addressed metadata?

SHA-256 hashing ensures that identical data produces identical IDs. This provides automatic deduplication without application-level coordination. If a relay's NIP-11 document hasn't changed, no duplicate is stored.

## Operations

### How much disk space does BigBrotr need?

It depends on the deployment configuration. A full BigBrotr instance collecting events from the entire network can use over 1 TB. A LilBrotr instance focused on relay health monitoring uses significantly less.

### Can I run BigBrotr without Docker?

Yes. Install from source with `uv sync` and run services directly with `python -m bigbrotr <service>`. You need a PostgreSQL instance with the schema applied.

### How do I add a new deployment?

Copy an existing deployment directory, modify the YAML configs, and build with `docker build --build-arg DEPLOYMENT=yourdeployment`. See [Deployments](/docs/configuration/deployments/).

### How do I contribute?

See the [Contributing](/docs/development/contributing/) guide for development setup, coding standards, and PR workflow.
