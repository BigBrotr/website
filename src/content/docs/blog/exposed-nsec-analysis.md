---
title: "Uncovering Exposed Private Keys Across the Nostr Network"
date: 2026-03-18
authors:
  - bigbrotr
tags:
  - analysis
  - nostr
  - security
  - research
description: We searched 41 million Nostr events for private keys published in plaintext. The headline number — 16,599 valid keys — is misleading. After filtering for real identities, 86 accounts are genuinely at risk, 40 of them still active.
excerpt: We searched 41 million Nostr events for private keys published in plaintext. The headline number — 16,599 valid keys — is misleading. After filtering for real identities, 86 accounts are genuinely at risk, 40 of them still active.
---

Your Nostr identity is a key pair. The `npub` is public — share it everywhere. The `nsec` is private — leak it and anyone can impersonate you. There is no password reset, no support ticket, no recovery. The nsec *is* the account.

So what happens when private keys end up published in plaintext on the very network they're supposed to protect?

## The Headline Number Is Misleading

We searched over **41 million events** archived by BigBrotr from **1,085 relays** for strings matching the `nsec1` Bech32 prefix. We found **16,599 valid private keys** published in plaintext.

That sounds alarming. But raw key counts are misleading — anyone can publish a private key, and a single bot accounts for 92% of them. The real question is: **how many real, active identities have their private key publicly exposed?**

The answer: **86** — and **40 of them are still posting**.

## From 16,599 to 86

Most leaked keys belong to empty accounts with no followers, no profile, and no social presence. The funnel from raw count to real impact:

| Filter | Keys | % of total |
|--------|-----:|-----------:|
| nsec1 strings found | 16,941 | 100% |
| Valid private keys | 16,599 | 98.0% |
| With at least 1 follower | 463 | 2.7% |
| Real identity at risk | 86 | 0.5% |
| Still active (last 90 days) | 40 | 0.24% |

The 2.7% figure is itself inflated by the bot — when we exclude bot-generated keys, **35% of organically leaked keys** belong to accounts with at least one follower.

These 86 at-risk accounts collectively have over **90,000 followers**. Thirteen have more than 1,000 followers, and the most-followed has 20,141.

## The Bot That Inflated the Numbers

A single automated operation — the "Mr.nsec" bot — is responsible for **15,285 of 16,599** leaked keys (92%). The pattern is mechanical:

1. Create a new Nostr identity (unique pubkey, never reused)
2. Publish one Kind 0 profile event with the name `Mr.{nsec}` and the bio `"Just your average nostr enjoyer"`
3. Never use the account again

15,285 throwaway accounts, each exposing a different private key. But here's the critical insight: **these keys belong to accounts with almost no followers**. By key count, the bot dominates. By social reach — the metric that actually matters — it accounts for just **0.1%** of exposed followers.

The bot is noise, not signal. The real risk lies elsewhere.

## Self-Leak vs Third-Party: A Paradox

The most important split is **who published the nsec** — the account owner, or someone else?

| Authorship | Keys | % of keys | Followers exposed | % of followers |
|------------|-----:|----------:|------------------:|---------------:|
| Self-leak | 16,027 | 96.6% | 26,982 | 30% |
| Third-party | 571 | 3.4% | 63,944 | **70%** |

**96.6% of leaked keys are self-leaks** — the account owner published their own nsec, most commonly by pasting it into a profile field, confusing it with their npub. But the 3.4% of third-party leaks cause **70% of all follower exposure**. Third parties — bots, attackers, or agents publishing logs — disproportionately expose keys belonging to accounts with social presence.

## Keys Are Leaked Early

When we look at *where in an account's lifespan* the key exposure occurs, the pattern is consistent: **keys are typically exposed early**. Accounts with high follower counts and accounts with zero followers both tend to leak their keys in the first portion of their life.

This is consistent with new users making the nsec/npub mistake shortly after creating their account — before they understand the distinction.

## Popular Accounts' Keys Spread Further

The median leaked key is available on just 1 relay. But accounts with 1,000+ followers see their leak events replicated across 10–30+ relays. For these accounts, deleting the event from one relay doesn't help — the key is already cached across the network. **Key rotation is the only effective remediation.**

## AI Agents: A New Leak Vector

A growing category of leaks comes from automated agents — often LLM-powered — that publish their operational logs as Nostr events. These logs contain commands like:

```
nak event -k 1063 --sec nsec1qxwkwn5fueyzf0h...
```

The agent faithfully publishes its execution log, including the private key passed as a CLI argument. This is a new class of key leak that didn't exist before AI agents started operating on Nostr.

## Check If Your Key Is Exposed

We deployed an [nsec-leak-checker](https://github.com/BigBrotr/nsec-leak-checker) — a Nostr DVM (Data Vending Machine) that lets you check if your private key has been found in public events. Send a Kind 5300 event signed with your keys (with a `p` tag pointing to the DVM's pubkey), and it responds with a NIP-44 encrypted message — only you can read the result.

## What Clients and Relay Operators Can Do

This isn't a protocol vulnerability — Nostr's key-based identity model is sound. The leaks are user errors, client oversights, and AI agent carelessness.

**Clients** should reject nsec strings in profile fields before signing the event. Some already do. All should. A regex check on Kind 0 content before broadcast would eliminate the largest real-impact leak category.

**Relay operators** could reject events containing valid nsec strings. This is more aggressive and has trade-offs, but it would neutralize the bot entirely.

**AI agent developers** should sanitize logs before publishing them as events. Private keys and credentials have no place in broadcast messages.

**Users** should understand the difference: `npub` is your address, `nsec` is your password. If you've ever pasted an nsec into a profile field, **generate a new key pair immediately**.

## Methodology

All data was collected by BigBrotr's Synchronizer service over approximately 48 hours of continuous operation, archiving events from 1,085 relays. The analysis was performed against a PostgreSQL database containing over 41 million events.

nsec validation was performed using the `nostr-sdk` Python library. Follower counts were computed from the latest Kind 3 (contact list) event per pubkey. Profile data was extracted from the latest Kind 0 event. Recent activity was defined as any event published in the last 90 days.

The Tier 1 ("real, at-risk") classification requires: at least 10 followers, a profile with a name, at least 10 events published, and the nsec not published by the account itself. This filter is conservative — some self-leakers are genuine victims of UX confusion, not intentional sharers.
