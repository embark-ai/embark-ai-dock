// Minimal agent-side client: starts the sandbox and calls its tools directly.
// Replace the direct calls with your LLM's tool-calling loop: pass `tools` to the model,
// run `client.callTool` for each tool call it makes.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolve } from 'node:path';

const transport = new StdioClientTransport({
  command: 'docker',
  args: ['run', '-i', '--rm', '--env-file', resolve('.env'), '-v', 'embark-data:/data', 'embarkai/agent-sandbox'],
});

const client = new Client({ name: 'my-agent', version: '1.0.0' });
await client.connect(transport);

const { tools } = await client.listTools();
console.log('Tools:', tools.map((t) => t.name).join(', '));

const wallet = await client.callTool({ name: 'get_wallet_info', arguments: {} });
console.log(wallet.content[0].text);

const balance = await client.callTool({ name: 'get_balance', arguments: {} });
console.log(balance.content[0].text);

await client.close();
