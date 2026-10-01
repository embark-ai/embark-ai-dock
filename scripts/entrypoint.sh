#!/bin/sh
# Container entrypoint.
#   mcp    (default) EmbarkAI MCP server on stdio — what MCP clients run with `docker run -i`
#   init   create or recover the wallet and back it up
#   check  print the wallet state without changing anything
#
# stdout belongs to the MCP protocol in `mcp` mode: nothing here may print to it.
set -e

cmd="${1:-mcp}"
[ $# -gt 0 ] && shift

case "$cmd" in
  mcp)
    exec node /app/node_modules/@embarkai/mcp/dist/bin.js "$@"
    ;;
  init)
    exec node /app/scripts/init.mjs "$@"
    ;;
  check)
    exec node /app/scripts/init.mjs --check "$@"
    ;;
  *)
    exec "$cmd" "$@"
    ;;
esac
