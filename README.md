# EmbarkAI Agent Sandbox

> A ready-made Docker environment that lets any AI agent work on-chain — with a real wallet, under rules you control.

**Status:** early preview. A multi-arch image (linux/amd64, linux/arm64) is published to GitHub Container Registry on every push to `main`; you can also build it locally (step 3 below).

## What it is

The sandbox is a Docker image with everything an AI agent needs to act on a blockchain through [EmbarkAI](https://docs.embarkai.io):

- Node.js 22 and the EmbarkAI packages (`@embarkai/core`, `@embarkai/mcp`) installed and pinned;
- the EmbarkAI MCP server, which exposes wallet and chain operations as tools any MCP client understands (Claude, Codex, Cursor, your own agent);
- an init command that creates the agent's **server wallet** and backs it up;
- an `llms.txt` and agent instructions, so a coding agent can read this repository and set the sandbox up on its own.

You bring three values from the EmbarkAI dashboard and a password. You run three commands. Your agent has a wallet.

No digging through the API reference, no hand-written signing code, no key management of your own.

## Why it is safe to hand an agent a wallet

An EmbarkAI wallet has no private key anywhere. The key is split by MPC (DKLS23 threshold signatures) into two shares:

| Share | Where it lives | Who controls it |
|---|---|---|
| Client share | Inside the sandbox, in an encrypted Docker volume | You |
| Server share | EmbarkAI TSS service | EmbarkAI, enforcing your policies |

A transaction needs **both** shares to be signed. Before EmbarkAI signs with its share, it checks the operation against the policies set for the project in the dashboard:

- **destinations** — allow and deny lists of addresses the wallet may send to;
- **limits** — per transaction, per day, per month, and number of transactions per day;
- **chains** — which networks the wallet may operate on.

If the agent tries to step outside the sandbox — a wrong address, too much money, too many transactions — EmbarkAI simply does not sign. The agent cannot get around this, because it never holds a full key. Every signing decision is recorded in the signing history, so what the agent did and what was refused can be audited afterwards.

The client share on disk alone is not enough to move funds, which is what makes a file-based share acceptable for an experiment. For production, move it to a secrets manager (HashiCorp Vault, AWS KMS and similar).

## How it works

```
 Your AI client                     Sandbox container                    EmbarkAI
 (Claude, Codex,      stdio      ┌──────────────────────────┐   HTTPS   ┌──────────────┐
  Cursor, own agent) ──────────► │ @embarkai/mcp            │ ────────► │ TSS service  │
                      MCP tools  │   wallet, balances,      │  2-party  │  server share│
                                 │   transfers, contracts   │  signing  │  + policies  │
                                 │                          │           └──────┬───────┘
                                 │ /data  (Docker volume)   │                  │
                                 │   encrypted client share │           ┌──────▼───────┐
                                 └──────────────────────────┘           │ Bundler +    │
                                                                        │ paymaster    │──► chain
                                                                        └──────────────┘
```

1. Your MCP client starts the container with `docker run -i` and talks to the MCP server over stdio.
2. The agent calls tools: `get_wallet_info`, `get_balance`, `transfer`, `write_contract`, and others.
3. For a transaction, the sandbox builds an ERC-4337 UserOperation and signs it together with EmbarkAI. EmbarkAI checks your policies first.
4. The UserOperation goes to the bundler. On supported networks the paymaster covers gas, so the wallet does not need native tokens for fees.

The wallet is a smart account. The same wallet works on every supported chain: Lumia Prism (mainnet), Lumia Pulsar (testnet, default), Lumia Beam (legacy testnet), Sepolia, BSC Testnet, Arbitrum Sepolia, Base Sepolia.

> **Slow confirmations on Lumia Pulsar are normal.** The testnet produces a block about once a minute, while a write tool (`transfer`, `write_contract`, `send_transaction`) waits up to 45 seconds for confirmation. So a write often returns `Timeout waiting for UserOperation receipt` together with a `userOpHash`. The operation was submitted and usually lands within a minute: the agent should check `get_transaction_status` with that hash, not send it again. You can raise the wait with `EMBARK_RECEIPT_TIMEOUT_MS`, but only together with your MCP client's tool timeout (usually ~60 seconds): if the client gives up first, the agent gets no hash at all.

## Quick start

You need Docker and an EmbarkAI account.

**1. Get your credentials.** Sign up at [dashboard.embarkai.io](https://dashboard.embarkai.io), create a project, open **Server Wallets** and create an API key (`lp_...`). It is shown only once.

**2. Configure.** Copy `.env.example` to `.env` and fill it in:

```bash
EMBARK_API_KEY=lp_...                  # project API key from the dashboard
EMBARK_WALLET_ID=my-research-agent     # any unique name for the agent's wallet
EMBARK_KEYSHARE_PASSWORD=...           # encrypts the client share on disk
EMBARK_WALLET_BACKUP_PASSWORD=...      # encrypts the backup in EmbarkAI ShareVault
EMBARK_CHAIN_ID=1279885899             # Lumia Pulsar testnet
```

**3. Get the image and create the wallet.**

```bash
docker pull ghcr.io/embark-ai/embark-ai-dock:latest
docker tag ghcr.io/embark-ai/embark-ai-dock:latest embarkai/agent-sandbox
docker run --rm --env-file .env -v embark-data:/data embarkai/agent-sandbox init
```

Or build it yourself from this repository: `docker build -t embarkai/agent-sandbox .` (the rest of this README uses the `embarkai/agent-sandbox` name either way).

`init` creates the server wallet, stores the encrypted client share in the `embark-data` volume, backs it up to ShareVault and prints the wallet address. Running it again is safe: it only reports the state, or restores the share from ShareVault if the volume is new. `check` prints the state without changing anything.

See it work before connecting an agent:

```bash
docker run --rm --env-file .env -v embark-data:/data embarkai/agent-sandbox demo
```

`demo` starts the MCP server and calls its tools the way an agent does: lists the chains, reads the wallet address and balance, and reads the latest block from a contract. It sends no transactions.

**4. Connect your agent.** For Claude Code:

```bash
claude mcp add embarkai -- docker run -i --rm --env-file /path/to/.env -v embark-data:/data embarkai/agent-sandbox
```

For Claude Desktop, Cursor, Codex or your own agent, use the same `docker run -i ...` command in the client's MCP config. Examples are in [`examples/`](./examples/README.md). The path to `.env` must be absolute.

**5. Talk to it.** Ask your agent: *"What is my wallet address and balance?"*

**6. Set the rules.** In the dashboard, add policies for the wallet: which addresses it may pay, and how much per day. Then try to break them, and watch EmbarkAI refuse.

### Let your agent do the setup

Point Claude Code, Codex or another coding agent at this repository and say *"set up the EmbarkAI sandbox"*. It reads [`llms.txt`](./llms.txt) and [`AGENTS.md`](./AGENTS.md), asks you for the API key and passwords, and runs the steps above.

## What to try

Start small, then give the agent more room:

1. **Primitives.** Wallet address, balances, chain switching, reading a contract.
2. **Payments.** Send test tokens to an allowed address; then to a denied one, or over the daily limit, and see the refusal.
3. **Monitoring.** Have the agent watch balances or contract state and report changes.
4. **Treasury agent.** Give the agent a small portfolio and a mandate ("keep 30% in stablecoins, rebalance weekly"), with policies limiting where funds may go and how much may move per day.

Which strategy the agent follows is up to you and your agent. The sandbox makes sure it can act, and that it acts only within the rules you set.

## Repository layout

```
.
├── .github/workflows/  # CI: builds the image for amd64 and arm64 on PRs, publishes it to GHCR from main
├── Dockerfile          # Node 22, pinned @embarkai/* packages (package-lock.json), non-root user
├── docker-compose.yml  # init/check via compose
├── .env.example
├── scripts/
│   ├── entrypoint.sh   # mcp (default) | init | check | demo
│   ├── init.mjs        # create or restore the wallet, back up to ShareVault, print address
│   └── demo.mjs        # read-only walkthrough of the MCP tools, no AI model needed
├── examples/           # MCP client configs: Claude Code, Claude Desktop, Cursor, Codex, custom agent
├── llms.txt            # entry point for coding agents
└── AGENTS.md           # step-by-step setup instructions for coding agents
```

## MCP tools

| Tool | What it does |
|---|---|
| `get_wallet_info` | Wallet addresses and active chain |
| `get_balance` | Native or ERC-20 balance of the wallet or any address |
| `transfer` | Send native or ERC-20 tokens |
| `read_contract` | Call a view/pure function of any contract |
| `write_contract` | Call a state-changing contract function (approve, deposit, swap, ...) |
| `send_transaction` | Send one or more calls, batched atomically (e.g. approve + deposit) |
| `get_transaction_status` | Status of a submitted UserOperation |
| `list_supported_chains`, `switch_chain` | Networks |

Full schemas: [`@embarkai/mcp` README](https://www.npmjs.com/package/@embarkai/mcp).

## Security notes

- The client share is encrypted with `EMBARK_KEYSHARE_PASSWORD` and stored in a Docker volume. Anyone with both the volume and the password holds one of the two shares, so treat them like a credential.
- The ShareVault backup is the only way to recover the client share if the volume is lost. Keep `EMBARK_WALLET_BACKUP_PASSWORD` somewhere other than the machine running the sandbox.
- Never commit `.env`. Write its values without quotes: `docker run --env-file` keeps the quotes, `docker compose` strips them, and a password that differs between the two cannot decrypt the keyshare.
- Keep the keyshare in a named volume (`-v embark-data:/data`), as in every command above. A bind mount such as `-v ./data:/data` works on Docker Desktop, but on a Linux host the directory must be owned by uid 1000 (the `node` user in the image) or the container cannot write to it.
- Start on testnet. Move to mainnet only with policies in place.

## Contributing and security

Issues and pull requests are welcome. Security problems go through [SECURITY.md](./SECURITY.md), not public issues. The code is released under the [MIT License](./LICENSE).

## Links

- Documentation: [docs.embarkai.io](https://docs.embarkai.io)
- AI agents and MCP: [docs.embarkai.io/ai-agents](https://docs.embarkai.io/ai-agents)
- Server wallets: [docs.embarkai.io/core-sdk/server-wallets](https://docs.embarkai.io/core-sdk/server-wallets)
- Dashboard: [dashboard.embarkai.io](https://dashboard.embarkai.io)
- Packages: [`@embarkai/mcp`](https://www.npmjs.com/package/@embarkai/mcp), [`@embarkai/core`](https://www.npmjs.com/package/@embarkai/core)
