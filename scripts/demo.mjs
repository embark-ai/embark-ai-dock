// Read-only walkthrough of the sandbox without an AI model: starts the MCP server and calls its
// tools over stdio, exactly as an agent's MCP client would. Sends no transactions.
//
//   node scripts/demo.mjs

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { FileKeyshareStorage } from '@embarkai/core/clients/node';
import { resolveConfig } from '@embarkai/mcp';

// Multicall3 is deployed at the same address on every supported chain.
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
const GET_BLOCK_NUMBER_ABI = [{
  type: 'function', name: 'getBlockNumber', stateMutability: 'view', inputs: [], outputs: [{ name: 'blockNumber', type: 'uint256' }],
}];

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

let config;
try {
  config = resolveConfig();
} catch (error) {
  fail(`${error.message}. Copy .env.example to .env and fill it in.`);
}

// Without a local keyshare the server would create a new wallet on the first call: leave that to init.
const storage = new FileKeyshareStorage({ storageDir: config.keyshareDir, encryptionPassword: config.keysharePassword ?? '' });
const log = console.log;
console.log = () => {}; // FileKeyshareStorage announces its directory on stdout
await storage.init();
console.log = log;
if (!config.keysharePassword || !(await storage.has(config.walletId))) {
  fail(`No keyshare for wallet "${config.walletId}" on this volume. Run init first.`);
}

const client = new Client({ name: 'embark-sandbox-demo', version: '1.0.0' });
await client.connect(new StdioClientTransport({
  command: process.execPath,
  args: ['/app/node_modules/@embarkai/mcp/dist/bin.js'],
  env: process.env,
  stderr: config.debug ? 'inherit' : 'ignore',
}));

async function call(name, args = {}, label = name) {
  console.log(`\n→ ${label}`);
  const result = await client.callTool({ name, arguments: args });
  const data = JSON.parse(result.content[0].text);
  if (result.isError) fail(`${name} failed: ${data.error}`);
  return data;
}

console.log('embarkAI sandbox demo: talking to the MCP server the way an AI agent does.');

const { tools } = await client.listTools();
console.log(`\nThe server offers ${tools.length} tools: ${tools.map((t) => t.name).join(', ')}`);

const { chains, activeChainId } = await call('list_supported_chains');
console.log(`  ${chains.length} chains, active: ${chains.find((c) => c.id === activeChainId).name} (${activeChainId})`);

const wallet = await call('get_wallet_info');
console.log(`  smart account ${wallet.smartAccountAddress}`);
console.log(`  explorer      ${wallet.chain.blockExplorerUrl.replace(/\/$/, '')}/address/${wallet.smartAccountAddress}`);

const balance = await call('get_balance');
console.log(`  ${balance.formatted} ${balance.symbol}`);

const block = await call('read_contract', { address: MULTICALL3, abi: GET_BLOCK_NUMBER_ABI, functionName: 'getBlockNumber' }, 'read_contract Multicall3.getBlockNumber()');
console.log(`  latest block ${block.result}`);

await client.close();

console.log(`
Done. Your agent gets the same tools, plus transfer, write_contract and send_transaction.
Connect it with: docker run -i --rm --env-file <ABSOLUTE_PATH>/.env -v embark-data:/data embarkai/agent-sandbox
`);
