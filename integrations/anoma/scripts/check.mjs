import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createPublicClient, http } from 'viem';
import { monad } from 'viem/chains';
import reference from '../monad-reference.json' with { type: 'json' };
import { initNodeSdk } from '../src/node.mjs';
import { AnomaClient } from '../src/client.mjs';
import { newPrivateLink, decodePrivateLink, keyringForLink } from '../src/links.mjs';
import { extractUserPublicKeys, encodePayAddress } from '@anomaorg/anoma-app-sdk';
import { adapterAbi } from '../src/resources.mjs';

// No wallet keys, resource registration, signatures, transactions or transfers.
await initNodeSdk();
const client = new AnomaClient(reference);
const [config, health] = await Promise.all([client.configuration(), client.health()]);
if (health.status !== 'ok' || !health.indexed_contracts?.some(c => c.chain_id === 143 && c.contract_address.toLowerCase() === config.protocolAdapterAddress.slice(2).toLowerCase()))
  throw new Error('Anoma indexer does not cover the pinned Monad adapter.');
const chain = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') });
if (await chain.getChainId() !== 143 || await chain.readContract({ address: config.protocolAdapterAddress, abi: adapterAbi, functionName: 'isEmergencyStopped' }))
  throw new Error('Pinned Monad adapter is unavailable.');
const contracts = {};
for (const [name, address] of Object.entries({ adapter: config.protocolAdapterAddress, forwarder: config.forwarderAddress })) {
  const code = await chain.getCode({ address });
  if (!code || code === '0x') throw new Error(`No code at pinned ${name}.`);
  contracts[name] = { address, codeBytes: (code.length - 2) / 2 };
}
const link = newPrivateLink(config.tokens[0].address);
const recovered = keyringForLink(decodePrivateLink(link.url).seed);
if (encodePayAddress(extractUserPublicKeys(recovered)) !== link.payAddress) throw new Error('Claim account recovery mismatch.');
link.seed.fill(0);
const lock = await readFile(new URL('../package-lock.json', import.meta.url));
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(), sdk: '1.2.0', lockSha256: createHash('sha256').update(lock).digest('hex'),
  wasmAndLinkRecovery: 'pass', providerConfiguration: 'matches pinned reference',
  chainId: 143, testnetAvailable: false, indexer: 'ok', tokens: config.tokens.map(t => t.symbol), contracts,
  livePrivateTransfer: 'NOT TESTED', productionFeatureEnabled: false,
  privacy: 'Shielded transfers hide parties from public chain observers. Proving operators receive witness data. Deposits and withdrawals remain public.',
}, null, 2));
