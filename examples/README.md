# MCP client examples

Every client runs the same command: `docker run -i --rm --env-file <abs path>/.env -v embark-data:/data embarkai/agent-sandbox`.
`-i` keeps stdin open for the MCP protocol; `embark-data` is the volume `init` wrote the keyshare to.

| Client | File | Where it goes |
|---|---|---|
| Claude Code | [`claude-code.sh`](./claude-code.sh) | run once |
| Claude Code (project) | [`mcp.json`](./mcp.json) | `.mcp.json` in the project root |
| Claude Desktop | [`mcp.json`](./mcp.json) | `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`) |
| Cursor | [`mcp.json`](./mcp.json) | `.cursor/mcp.json` or `~/.cursor/mcp.json` |
| Codex CLI | [`codex.toml`](./codex.toml) | `~/.codex/config.toml` |
| Your own agent | [`custom-agent.mjs`](./custom-agent.mjs) | `npm i @modelcontextprotocol/sdk`, then `node custom-agent.mjs` |
