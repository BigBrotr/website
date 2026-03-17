---
title: "Finding 16,000 Exposed Private Keys Across the Nostr Network"
date: 2026-03-17
authors:
  - bigbrotr
tags:
  - analysis
  - nostr
  - security
  - research
description: BigBrotr's event archive reveals over 16,000 valid Nostr private keys published in plaintext across the network — most by a single automated attacker, hundreds more by users who confused nsec with npub. A data-driven breakdown of how, where, and why private keys end up in public events.
excerpt: BigBrotr's event archive reveals over 16,000 valid Nostr private keys published in plaintext across the network — most by a single automated attacker, hundreds more by users who confused nsec with npub. A data-driven breakdown of how, where, and why private keys end up in public events.
---

Your Nostr identity is a key pair. The `npub` is public — share it everywhere. The `nsec` is private — lose it and you lose your account, leak it and anyone can impersonate you. There is no password reset, no support ticket, no recovery. The nsec *is* the account.

So what happens when thousands of them end up published in plaintext on the very network they're supposed to protect?

## The Dataset

BigBrotr continuously archives events from every reachable relay on the Nostr network. After two days of synchronization across **1,079 relays** (out of 2,006 discovered), the database contained over **40 million events** collected from clearnet, Tor, and I2P networks.

We searched every event — both the `content` field and `tags` — for strings matching the `nsec1` Bech32 prefix. Each match was then validated by attempting to derive a public key from it using the secp256k1 curve. The synchronizer had not yet reached all relays, meaning the actual number of exposed keys across the full network is likely higher.

| Metric | Count |
|---|---|
| Events containing `nsec1` | 17,666 |
| Unique nsec strings found | 16,870 |
| Valid private keys | **16,531** |
| Invalid (truncated or fake) | 339 |
| Leaked keys with at least one event posted | 16,432 |
| Leaked keys with at least one follower | 450 |

16,531 valid Nostr private keys, published in plaintext, recoverable by anyone with access to a relay archive.

## How They Were Leaked

Not all leaks are equal. We categorized every event containing a valid nsec by examining its structure, content, and context.

| Category | nsec Count | Description |
|---|---|---|
| **Bot harvester (`Mr.nsec`)** | 15,232 | Automated attacker republishing collected keys |
| **Profile field confusion** | 871 | Users pasting nsec into name, picture, or about fields |
| **AI agent testing** | 200 | Automated agents publishing logs containing credentials |
| **CLI command exposure** | 45 | Commands like `nak event --sec nsec1...` posted in notes |
| **Bare nsec posts** | 35 | Users posting their nsec with no other context |
| **Intentional sharing** | 26 | Shared accounts (NostrWall-style experiments) |
| **Contact list relay field** | 24 | nsec pasted as a relay URL in Kind 3 events |
| **nsec in tags only** | 23 | Private keys embedded in event tags, not content |
| **Reposts** | 12 | Reposts of events already containing nsec |
| **Other** | 63 | Chat messages, long-form articles, status updates |

Three patterns dominate: a single automated attacker, confused users, and careless AI agents.

### The `Mr.nsec` Bot: 15,232 Keys Republished

The largest single source is an automated operation responsible for over 90% of all leaked nsec events. The pattern is mechanical:

1. A new Nostr account is created (unique pubkey, never reused)
2. A single Kind 0 (profile) event is published with the name `Mr.{nsec}` and the bio `"Just your average nostr enjoyer"`
3. The account is never used again

15,232 unique bot accounts, each publishing exactly one event, each exposing a different private key. The bot doesn't generate these keys — it collects nsec strings already exposed elsewhere on the network and republishes them in a more discoverable format.

This means the bot is a *second-order* threat: it amplifies leaks that already happened through other channels. But it also means that any key appearing in the `Mr.nsec` dataset was already compromised before the bot found it.

### Profile Field Confusion: 871 Keys

The second largest category is users who paste their `nsec` into profile fields — the `name`, `picture` URL, or `about` text of their Kind 0 event. This almost certainly happens when users confuse `nsec` (private) with `npub` (public). The two strings look similar: both start with a prefix, followed by a long alphanumeric string.

Some clients now warn users when they detect an nsec in a profile field. Not all do.

### AI Agents and CLI Leaks: 245 Keys

A growing category. Automated agents — often LLM-powered — publish their operational logs as Nostr events (Kind 1 or Kind 1111). These logs contain commands like:

```
nak event -k 1063 --sec nsec1qxwkwn5fueyzf0h...
```

The agent faithfully publishes its execution log, including the private key passed as a CLI argument. In other cases, agents publish entire conversation transcripts that include nsec strings shared during testing.

This is a new class of key leak that didn't exist before AI agents started operating on Nostr.

### Intentional Sharing: 26 Keys

A small number of nsec strings are published deliberately. The most notable example is **NostrWall** — an account created as a public experiment where the creator shared the nsec so anyone could log in and post. The announcement reads:

> "Was inspired to create #NostrWall account and share the private key so everyone across the globe can log in and post the note whatever they want"

The creator published the nsec of a *separate* account (not their own), so their personal identity remains protected. Similar experiments exist in Japanese Nostr communities ("tree hole" accounts) and as testing fixtures.

## Impact: Who Is Affected?

Most leaked keys belong to low-activity accounts. But not all.

| Metric | Value |
|---|---|
| Total events posted by leaked accounts | 313,574 |
| Leaked accounts with >1,000 events | 18 |
| Leaked accounts with >100 followers | 32 |
| Most-followed leaked account | 18,435 followers |

The top 5 leaked accounts by follower count:

| npub | Followers | Events | How Leaked |
|---|---|---|---|
| [`npub14ktn...fhukks`](https://njump.me/npub14ktnsqc2hpxqflawce9t4htvc6pvkdgp6xf6tlcujjuswuy324vqfhukks) | 18,435 | 5,279 | Republished by `Mr.nsec` bot |
| [`npub1fv9u...8tdz3p`](https://njump.me/npub1fv9u4drq4hdrr7k45vn0krqy7mkgy8ajf059m0wq8szvcrsjlsrs8tdz3p) | 13,608 | 1,521 | Republished by `Mr.nsec` bot |
| [`npub1s6z7...qrdwk4c`](https://njump.me/npub1s6z7hmmx2vud66f3utxd70qem8cwtggx0jgc7gh8pqwz2k8cltuqrdwk4c) | 3,878 | 4,484 | Republished by `Mr.nsec` bot |
| [`npub138gu...wk36k`](https://njump.me/npub138guayty78ch9k42n3uyz5ch3jcaa3u390647hwq0c83m2lypekq6wk36k) | 2,513 | 7,139 | Republished by `Mr.nsec` bot |
| [`npub1dnzz...ptwg3qj4x52h`](https://njump.me/npub1dnzzyhmewrzkh862z7z2shwmhh5htx0rvkagepj2fkgst9ptwg3qj4x52h) | 2,494 | 3,194 | Republished by `Mr.nsec` bot |

Every account in the top 20 by followers was republished by the `Mr.nsec` bot — but the bot only aggregates keys that were already leaked elsewhere. The original leak source for these high-follower accounts is likely profile field confusion or a compromised client.

## What Clients and Relay Operators Can Do

This isn't a protocol vulnerability — Nostr's key-based identity model is sound. The leaks are user errors, client oversights, and a new category of AI agent carelessness. Mitigations exist at every layer:

**Clients** should reject nsec strings in profile fields before signing the event. Some already do. All should. A simple regex check (`/nsec1[a-z0-9]{58}/`) on Kind 0 content before broadcast would eliminate the second largest leak category entirely.

**Relay operators** could reject events containing valid nsec strings. This is more aggressive and has trade-offs (false positives on educational content, shared accounts), but it would neutralize the `Mr.nsec` bot completely.

**AI agent developers** should sanitize logs before publishing them as events. Private keys, tokens, and credentials have no place in broadcast messages.

**Users** should understand the difference: `npub` is your address, `nsec` is your password. If you've ever pasted an `nsec` into a profile field, generate a new key pair immediately.

## Methodology

All data was collected by BigBrotr's Synchronizer service over two days of continuous operation, archiving events from 1,079 relays using cursor-based pagination with binary-split windowing. The analysis was performed against a PostgreSQL database containing over 40 million events.

nsec validation was performed using the `nostr-sdk` Python library — each candidate string was parsed and checked against the secp256k1 curve. Follower counts were computed from the latest Kind 3 (contact list) event per pubkey, counting how many contact lists contain each leaked pubkey in their `p` tags.

The full dataset (nsec strings, pubkeys, event counts, follower counts, leak categories, and source events) is available for researchers upon request.
