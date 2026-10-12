import { deserializeResourcesPayload, NullifierKey, Resource, MerkleTree } from '@anomaorg/anoma-app-sdk';
import { bytesToHex, parseAbi, parseEventLogs } from 'viem';

export const adapterAbi = parseAbi([
  'function isNullifierContained(bytes32 nullifier) view returns (bool)',
  'function isEmergencyStopped() view returns (bool)',
  'event ResourcePayload(bytes32 indexed tag, uint256 index, bytes blob)',
  'event ActionExecuted(bytes32 actionTreeRoot, uint256 actionTagCount)',
]);
const hex = value => `0x${String(value).replace(/^0x/, '').toLowerCase()}`;
export function actionRoot(parameters) {
  return hex(new MerkleTree(parameters.consumedResources.flatMap((input, i) => [
    Resource.decode(input.resource).nullifier(NullifierKey.fromBase64(input.nullifierKey)),
    Resource.decode(parameters.createdResources[i].resource).commitment(),
  ])).root().toHex());
}
export function confirmAction(receipt, adapter, expectedRoot) {
  if (receipt.status !== 'success') throw new Error('Private transaction reverted.');
  const logs = parseEventLogs({ abi: adapterAbi, eventName: 'ActionExecuted', logs: receipt.logs ?? [] });
  if (!logs.some(l => l.address.toLowerCase() === adapter.toLowerCase() && l.args.actionTreeRoot.toLowerCase() === expectedRoot.toLowerCase()))
    throw new Error('Receipt does not contain the expected private payment.');
}
export function resourceNullifier(resource, keyring) {
  return hex(resource.nullifier(new NullifierKey(keyring.nullifierKeyPair.nk)).toHex());
}
export function confirmResource(receipt, adapter, commitment, payload) {
  const logs = parseEventLogs({ abi: adapterAbi, eventName: 'ResourcePayload', logs: receipt.logs ?? [] });
  if (receipt.status !== 'success' || !logs.some(l => l.address.toLowerCase() === adapter.toLowerCase() && l.args.tag.toLowerCase() === commitment.toLowerCase() && l.args.blob.toLowerCase() === payload.toLowerCase()))
    throw new Error('Indexer resource is not proven by the Monad receipt.');
}

/** Untrusted indexer payloads are decrypted locally, then matched against the
 * adapter's actual receipt logs and current onchain spent status. The indexer
 * can omit/delay notes; it cannot manufacture a funded balance with this API. */
export async function confirmedResources({ response, keyring, chain, token, rpc }) {
  if (await rpc.getChainId() !== 143) throw new Error('Wrong resource verification network.');
  if (!Array.isArray(response?.resources)) throw new Error('Invalid indexer resource response.');
  const group = response.resources.filter(g => g.chain === 143 && hex(g.contract) === chain.protocolAdapterAddress.toLowerCase());
  const entries = group.flatMap(g => {
    if (!Array.isArray(g.resources)) throw new Error('Invalid indexer resource group.');
    return g.resources;
  });
  if (entries.length > 500) throw new Error('Too many private resources for this MVP.');
  const receipts = new Map(), seen = new Set(), result = [];
  for (const entry of entries) {
    const payload = hex(entry.resource_payload?.blob), hash = hex(entry.transaction_hash);
    if (!/^0x([a-f0-9]{2}){1,8192}$/.test(payload) || !/^0x[a-f0-9]{64}$/.test(hash))
      throw new Error('Invalid encrypted resource metadata.');
    const decoded = await deserializeResourcesPayload(keyring.encryptionKeyPair.privateKey, [{ payload, transactionHash: hash, transactionTimestamp: 0, chainId: 143 }]);
    for (const item of decoded) {
      if (item.encoded.isEphemeral || item.forwarder.toLowerCase() !== chain.forwarderAddress.toLowerCase() || item.erc20TokenAddress.toLowerCase() !== token.address.toLowerCase()) continue;
      const commitment = hex(item.resource.commitment().toHex());
      if (seen.has(commitment)) continue;
      if (!receipts.has(hash)) receipts.set(hash, await rpc.getTransactionReceipt({ hash }));
      const receipt = receipts.get(hash);
      confirmResource(receipt, chain.protocolAdapterAddress, commitment, payload);
      const nullifier = resourceNullifier(item.resource, keyring);
      const spent = await rpc.readContract({ address: chain.protocolAdapterAddress, abi: adapterAbi, functionName: 'isNullifierContained', args: [nullifier] });
      seen.add(commitment);
      if (!spent) result.push({ ...item.encoded, forwarder: item.forwarder, erc20TokenAddress: item.erc20TokenAddress, chainId: 143, network: 'monad', transactionHash: hash });
    }
  }
  return result;
}

export function discoveryRegistration(keyring) {
  // Discovery is delegated to Galileo by design. Encryption and authority keys
  // never belong in this request. Do not serialize the complete keyring.
  return { public_key: bytesToHex(keyring.discoveryKeyPair.publicKey), secret_key: bytesToHex(keyring.discoveryKeyPair.privateKey) };
}
