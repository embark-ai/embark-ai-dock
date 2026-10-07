// Creates (or recovers) the agent's server wallet and backs up its client keyshare.
//
//   node scripts/init.mjs          create the wallet if needed, back it up, print its addresses
//   node scripts/init.mjs --check  print the wallet state without changing anything
//
// Reads the same EMBARK_* variables as @embarkai/mcp, so the MCP server started afterwards
// picks up the keyshare written here.

import { createServerWalletManager } from '@embarkai/core/clients';
import { FileKeyshareStorage } from '@embarkai/core/clients/node';
import { getChainConfig } from '@embarkai/core/read';
import { resolveConfig } from '@embarkai/mcp';

const checkOnly = process.argv.includes('--check');

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function step(message) {
  console.log(`• ${message}`);
}

let config;
try {
  config = resolveConfig();
} catch (error) {
  fail(`${error.message}. Copy .env.example to .env and fill it in.`);
}

if (!config.keysharePassword) {
  fail(
    'EMBARK_KEYSHARE_PASSWORD is required. Without it the keyshare lives only in memory: ' +
      'after a restart the wallet can no longer sign and its funds are lost.',
  );
}

const chain = getChainConfig(config.chainId);
if (!chain) {
  fail(`Chain ${config.chainId} is not supported. Run with EMBARK_CHAIN_ID=1279885899 (Lumia Pulsar testnet).`);
}

const storage = new FileKeyshareStorage({
  storageDir: config.keyshareDir,
  encryptionPassword: config.keysharePassword,
});
await storage.init();

// Same settings as the MCP server's ChainManager, so both resolve the same smart account.
const manager = createServerWalletManager({
  apiKey: config.apiKey,
  storage,
  chainId: chain.id,
  bundlerUrl: chain.bundlerUrl,
  rpcUrl: chain.rpcUrls[0],
  factoryAddress: chain.factoryAddress,
  entryPointAddress: chain.entryPointV07Address,
  paymasterAddress: chain.paymasterAddress,
  debug: config.debug,
});

const walletId = config.walletId;
const backupPassword = config.walletBackupPassword;

try {
  const existsRemotely = await manager.walletExists(walletId);
  const hasLocal = existsRemotely && (await manager.hasKeyshare(walletId));
  const { hasBackup } = existsRemotely ? await manager.checkBackupExists(walletId) : { hasBackup: false };

  if (checkOnly) {
    console.log(JSON.stringify({ walletId, existsRemotely, hasLocalKeyshare: hasLocal, hasBackup }, null, 2));
    if (existsRemotely && hasLocal) await printWallet();
    process.exit(0);
  }

  if (!existsRemotely) {
    step(`Creating wallet "${walletId}" (MPC key generation with EmbarkAI, takes a few seconds)…`);
    await manager.createWallet(walletId);
    step(`Client keyshare encrypted and saved to ${config.keyshareDir}`);
  } else if (hasLocal) {
    step(`Wallet "${walletId}" already exists and its keyshare is in ${config.keyshareDir}`);
  } else if (hasBackup && backupPassword) {
    step(`Wallet "${walletId}" exists but this volume has no keyshare. Restoring it from ShareVault…`);
    await manager.restoreFromVault(walletId, backupPassword);
    step(`Keyshare restored to ${config.keyshareDir}`);
  } else {
    fail(
      `Wallet "${walletId}" already exists in this project, but this volume has no keyshare` +
        (hasBackup
          ? ' and EMBARK_WALLET_BACKUP_PASSWORD is not set. Set it to restore the keyshare from ShareVault.'
          : ' and there is no ShareVault backup. Mount the volume that holds it, or pick a new EMBARK_WALLET_ID.'),
    );
  }

  if (!backupPassword) {
    step('EMBARK_WALLET_BACKUP_PASSWORD is not set: skipping the ShareVault backup. If you lose this volume, the wallet is lost.');
  } else if (!hasBackup) {
    step('Backing up the keyshare to EmbarkAI ShareVault…');
    await manager.backupToVault(walletId, backupPassword);
    step('Backup done. Keep EMBARK_WALLET_BACKUP_PASSWORD somewhere safe, away from this machine.');
  } else {
    step('ShareVault backup already exists');
  }

  await printWallet();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

async function printWallet() {
  const wallet = await manager.getWallet(walletId);
  const explorer = chain.blockExplorerUrl ? `${chain.blockExplorerUrl.replace(/\/$/, '')}/address/${wallet.smartAccountAddress}` : null;

  console.log('');
  console.log(`  Wallet ID      ${walletId}`);
  console.log(`  Chain          ${chain.name} (${chain.id})`);
  console.log(`  Smart account  ${wallet.smartAccountAddress}   ← fund this address`);
  console.log(`  Owner (MPC)    ${wallet.ownerAddress}`);
  if (explorer) console.log(`  Explorer       ${explorer}`);
  console.log('');
}
