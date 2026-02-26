---
title: Seeder
description: One-shot service that bootstraps relay discovery from seed files.
---

The Seeder is a **one-shot** service that bootstraps the relay discovery process. It loads relay URLs from static seed files and known relay lists, then inserts them as candidates for validation.

## Purpose

Before the Finder can discover relays from NIP-65 events and APIs, there must be initial relay URLs in the database. The Seeder provides this bootstrap by loading curated seed files containing known relay URLs.

## How It Works

1. Reads seed file paths from its configuration.
2. Parses each file for relay URLs (one URL per line, comments and blank lines ignored).
3. Validates each URL against BigBrotr's relay URL rules (RFC 3986 compliance, network type detection, local IP rejection).
4. Inserts valid URLs into the database as candidates.
5. Exits after a single cycle (one-shot mode).

## Configuration

```yaml
# config/services/seeder.yaml
seed_files:
  - seeds/relays.txt
  - seeds/additional.txt
```

## Usage

```bash
# Run the seeder (always one-shot)
python -m bigbrotr seeder --once
```

The `--once` flag is the natural mode for the Seeder since it only needs to run once to load initial data. After seeding, the Finder takes over continuous discovery.

## When to Re-Run

Re-run the Seeder when:

- Setting up a fresh BigBrotr instance.
- Adding new seed files with additional relay URLs.
- After a database reset that cleared the candidate pool.
