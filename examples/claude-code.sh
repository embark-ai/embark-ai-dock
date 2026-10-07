# Register the sandbox as an MCP server in Claude Code.
# Use an absolute path to .env: the MCP client starts the container from its own working directory.
claude mcp add embarkai -- docker run -i --rm --env-file /absolute/path/to/.env -v embark-data:/data embarkai/agent-sandbox
