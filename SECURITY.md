# Security policy

This sandbox gives an AI agent a wallet that can hold funds. If you find a way for an agent, a container, or a third party to move funds outside the policies set in the EmbarkAI dashboard, to read a keyshare or password it should not see, or to escape the container, please report it privately.

## Reporting a vulnerability

- Preferred: open a private report at <https://github.com/embark-ai/embark-ai-dock/security/advisories/new>. Only the EmbarkAI maintainers can see it.
- Alternatively, email <hello@embarkai.io> with "Security" in the subject.

Please do not open a public issue for security problems.

Include what you can: affected files or commands, the chain and wallet type you used, steps to reproduce, and what an attacker gains. A proof of concept on a testnet is welcome; please do not test against wallets or projects you do not own.

## What to expect

- We acknowledge reports within 3 business days.
- We keep you informed while we investigate and fix the problem, and we credit you in the release notes if you wish.
- Issues in the EmbarkAI packages (`@embarkai/core`, `@embarkai/mcp`) or the EmbarkAI services are handled through the same channels; we will route them.

## Scope notes

- The MPC design means a client keyshare alone cannot sign. A report that only shows reading an encrypted keyshare from the volume is still welcome, but is lower severity than one that bypasses signing policies.
- Secrets live in `.env`, which is git-ignored. Please check your own `.env` and Docker volumes before sharing logs.
