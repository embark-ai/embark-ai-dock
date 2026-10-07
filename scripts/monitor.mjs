// On-chain portfolio monitor without an AI model: polls the wallet's balances through the MCP
// server, exactly as an agent would, and reports what changed since the last poll.
//
//   node scripts/monitor.mjs          poll every MONITOR_INTERVAL_SEC seconds until stopped
//   node scripts/monitor.mjs --once   one snapshot, then exit
//
// Configuration (all optional, see .env.example):
//   MONITOR_CHAINS         chain IDs to watch, comma separated (default: EMBARK_CHAIN_ID)
//   MONITOR_TOKENS         ERC-20 tokens as <chainId>:<address>, comma separated
//   MONITOR_INTERVAL_SEC   seconds between polls (default 600)
//   MONITOR_THRESHOLD_PCT  report a change only if it exceeds this percentage (default 1)
//
// The last snapshot is kept in /data/monitor-last.json, so a restarted monitor still compares
// against the previous run. Sends no transactions.

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { FileKeyshareStorage } from '@embarkai/core/clients/node';
import { resolveConfig } from '@embarkai/mcp';

const once = process.argv.includes('--once');

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

const chains = (process.env.MONITOR_CHAINS ?? String(config.chainId))
  .split(',').map((s) => Number(s.trim())).filter(Boolean);
const tokens = (process.env.MONITOR_TOKENS ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean)
  .map((entry) => {
    const [chainId, address] = entry.split(':');
    if (!chainId || !address?.startsWith('0x')) fail(`MONITOR_TOKENS entry "${entry}" must look like <chainId>:<0xAddress>`);
    return { chainId: Number(chainId), address };
  });
const intervalSec = Number(process.env.MONITOR_INTERVAL_SEC ?? 600);
const thresholdPct = Number(process.env.MONITOR_THRESHOLD_PCT ?? 1);
const snapshotFile = join(dirname(config.keyshareDir), 'monitor-last.json');

// Without a local keyshare the server would create a new wallet on the first call: leave that to init.
const storage = new FileKeyshareStorage({ storageDir: config.keyshareDir, encryptionPassword: config.keysharePassword ?? '' });
const log = console.log;
console.log = () => {}; // FileKeyshareStorage announces its directory on stdout
await storage.init();
console.log = log;
if (!config.keysharePassword || !(await storage.has(config.walletId))) {
  fail(`No keyshare for wallet "${config.walletId}" on this volume. Run init first.`);
}

const client = new Client({ name: 'embark-sandbox-monitor', version: '1.0.0' });
await client.connect(new StdioClientTransport({
  command: process.execPath,
  args: ['/app/node_modules/@embarkai/mcp/dist/bin.js'],
  env: process.env,
  stderr: config.debug ? 'inherit' : 'ignore',
}));

async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const data = JSON.parse(result.content[0].text);
  if (result.isError) throw new Error(`${name}: ${data.error}`);
  return data;
}

// One snapshot: { "<chainId>:native" | "<chainId>:<token>": { chain, symbol, formatted } }
async function takeSnapshot() {
  const snapshot = {};
  for (const chainId of chains) {
    await call('switch_chain', { chainId });
    const native = await call('get_balance');
    snapshot[`${chainId}:native`] = { chain: native.chain.name, symbol: native.symbol, formatted: native.formatted };
    for (const token of tokens.filter((t) => t.chainId === chainId)) {
      const erc20 = await call('get_balance', { tokenAddress: token.address });
      snapshot[`${chainId}:${token.address.toLowerCase()}`] = { chain: erc20.chain.name, symbol: erc20.symbol, formatted: erc20.formatted };
    }
  }
  return snapshot;
}

async function loadPrevious() {
  try {
    return JSON.parse(await readFile(snapshotFile, 'utf8'));
  } catch {
    return null;
  }
}

// A change is worth reporting when it crosses the threshold, or when a balance appears or vanishes.
function describeChange(previous, current) {
  if (!previous) return 'new';
  const before = Number(previous.formatted);
  const after = Number(current.formatted);
  if (before === after) return null;
  if (before === 0 || after === 0) return `${before} -> ${after}`;
  const pct = ((after - before) / before) * 100;
  if (Math.abs(pct) < thresholdPct) return null;
  return `${before} -> ${after} (${pct > 0 ? '+' : ''}${pct.toFixed(2)}%)`;
}

const { smartAccountAddress } = await call('get_wallet_info');
log(`Monitoring ${smartAccountAddress} on ${chains.length} chain(s), ${tokens.length} token(s)` +
  (once ? ', single snapshot.' : `, every ${intervalSec}s. Changes over ${thresholdPct}% are reported.`));

let previous = await loadPrevious();
for (;;) {
  const started = new Date();
  let current;
  try {
    current = await takeSnapshot();
  } catch (error) {
    log(`${started.toISOString()}  poll failed: ${error.message}`);
    if (once) process.exit(1);
    await new Promise((r) => setTimeout(r, intervalSec * 1000));
    continue;
  }

  log(`\n${started.toISOString()}`);
  for (const [key, entry] of Object.entries(current)) {
    const change = describeChange(previous?.[key], entry);
    log(`  ${entry.chain.padEnd(24)} ${entry.formatted.padStart(16)} ${entry.symbol.padEnd(6)}${change ? `  changed: ${change}` : ''}`.trimEnd());
  }
  for (const key of Object.keys(previous ?? {})) {
    if (!current[key]) log(`  ${key}: no longer watched`);
  }

  await writeFile(snapshotFile, JSON.stringify(current, null, 2));
  previous = current;
  if (once) break;
  await new Promise((r) => setTimeout(r, intervalSec * 1000));
}

await client.close();
