# Setting up the EmbarkAI Agent Sandbox

Instructions for a coding agent (Claude Code, Codex, Cursor, ...) asked to set up this sandbox for a user.
Goal: the user's AI client gets an `embarkai` MCP server backed by an EmbarkAI server wallet.

## Rules

- Never print, log or commit the values of `EMBARK_API_KEY`, `EMBARK_KEYSHARE_PASSWORD` or `EMBARK_WALLET_BACKUP_PASSWORD`. They live only in `.env`, which is git-ignored.
- Never delete the `embark-data` Docker volume or anything under `/data`. It holds the wallet's keyshare; losing it without a backup loses the wallet and its funds.
- Use testnet (`EMBARK_CHAIN_ID=1279885899`, Lumia Pulsar) unless the user explicitly asks for mainnet.
- Ask the user before sending any transaction.

## Steps

1. **Check Docker.** `docker info` must succeed. If it does not, ask the user to install or start Docker.

2. **Get the API key from the user.** You cannot create it. Tell them:
   sign up at https://dashboard.embarkai.io, create a project, open **Server Wallets**, click **Create API Key**, copy the `lp_...` key.

3. **Create `.env`.** Copy `.env.example` to `.env`. Fill in:
   - `EMBARK_API_KEY` — the key from step 2;
   - `EMBARK_WALLET_ID` — ask the user, or use a descriptive name such as `research-agent-1`;
   - `EMBARK_KEYSHARE_PASSWORD` and `EMBARK_WALLET_BACKUP_PASSWORD` — generate two different random strings (e.g. `openssl rand -hex 32`) and tell the user to store `EMBARK_WALLET_BACKUP_PASSWORD` in their password manager.

4. **Build the image.** `docker build -t embarkai/agent-sandbox .`

5. **Create the wallet.** `docker run --rm --env-file .env -v embark-data:/data embarkai/agent-sandbox init`
   It prints the smart account address. Show it to the user.
   If it says the wallet already exists but the volume has no keyshare, do not pick a new wallet ID on your own: ask the user.

6. **Register the MCP server** in the user's client, using the absolute path of `.env`. Configs for each client are in `examples/`. For Claude Code:
   `claude mcp add embarkai -- docker run -i --rm --env-file <ABSOLUTE_PATH>/.env -v embark-data:/data embarkai/agent-sandbox`

7. **Verify.** Call `get_wallet_info` and `list_supported_chains`. The wallet address must match the one from step 5.

8. **Suggest policies.** Tell the user that in the dashboard they can restrict the wallet: allowed destination addresses, per-transaction and per-day limits, allowed chains. EmbarkAI refuses to sign anything outside them.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `EMBARK_API_KEY environment variable is required` | `.env` not found: the `--env-file` path must be absolute |
| `Chain ... is not supported` | Use a chain ID from `list_supported_chains` |
| Wallet exists, no keyshare | Mount the right volume (`-v embark-data:/data`), or set `EMBARK_WALLET_BACKUP_PASSWORD` and rerun `init` to restore from ShareVault |
| `Timeout waiting for UserOperation receipt` with a `userOpHash` | Expected on Lumia Pulsar (a block about once a minute; tools wait 45s). The operation was submitted: check `get_transaction_status` with that hash, do not resend |
| More detail needed | Set `EMBARK_DEBUG=true`; logs go to stderr |
| Wallet state | `docker run --rm --env-file .env -v embark-data:/data embarkai/agent-sandbox check` |
