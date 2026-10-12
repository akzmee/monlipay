import { hexToBytes, isAddress, bytesToHex } from 'viem';
import { AuthoritySigningKey } from '@anomaorg/anoma-app-sdk';
import { confirmAction, discoveryRegistration } from './resources.mjs';

export const BACKEND = 'https://pay.prod.heliax.app';
export const INDEXER = 'https://galileo.prod.heliax.app';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hex = value => `0x${String(value).replace(/^0x/, '')}`;

export function validateConfiguration(response, reference) {
  const found = response?.configurations?.filter(c => c.chainId === 143);
  if (!found || found.length !== 1) throw new Error('Monad configuration is missing or ambiguous.');
  const c = found[0];
  if (c.chain !== 'monad' || c.enabled !== true || c.testnet !== false)
    throw new Error('Monad private payments are unavailable.');
  const pinned = ['protocolAdapterAddress', 'forwarderAddress', 'trivialLogicVerifyingKey', 'transferLogicVerifyingKey', 'feeDiscoveryPk', 'feeEncryptionPk', 'feeAuthorityPk', 'feeNullifierKeyCommitment'];
  for (const field of pinned)
    if (typeof c[field] !== 'string' || c[field].toLowerCase() !== reference[field]?.toLowerCase())
      throw new Error(`Anoma configuration changed: ${field}. Review before funding.`);
  if (!Array.isArray(c.tokens) || c.tokens.length !== reference.tokens.length)
    throw new Error('Anoma token configuration changed.');
  const seen = new Set();
  for (const token of c.tokens) {
    const expected = reference.tokens.find(t => t.address.toLowerCase() === token.address?.toLowerCase());
    if (!expected || !isAddress(token.address) || token.symbol !== expected.symbol || token.decimals !== expected.decimals || token.feeEnabled !== true || seen.has(token.address.toLowerCase()))
      throw new Error('Anoma token configuration changed.');
    seen.add(token.address.toLowerCase());
  }
  return {
    ...c, network: c.chain, tokens: c.tokens.map(t => ({ ...t, network: c.chain })),
    feePublicKeys: {
      authorityPublicKey: hexToBytes(hex(c.feeAuthorityPk)),
      discoveryPublicKey: hexToBytes(hex(c.feeDiscoveryPk)),
      encryptionPublicKey: hexToBytes(hex(c.feeEncryptionPk)),
      nullifierKeyCommitment: hexToBytes(hex(c.feeNullifierKeyCommitment)),
    },
  };
}

export function wireParameters(parameters) {
  const format = ({ resource, ...rest }) => ({ ...rest, resource: Object.fromEntries(Object.entries(resource).map(([key, value]) => [key.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`), value])) });
  return { consumedResources: parameters.consumedResources.map(format), createdResources: parameters.createdResources.map(format) };
}

export function parametersForQuote(parameters) {
  const copy = structuredClone(parameters);
  // The service requires a parseable signature even for fee estimation. This
  // public fixture key signs a DIFFERENT domain/message, so it cannot authorize
  // the user's resource consumption. Never send a spend signature to quote.
  const signature = AuthoritySigningKey.fromBytes(new Uint8Array(32).fill(1))
    .sign('monlipay:fee-quote-only:v1', new Uint8Array(32));
  const encoded = btoa(String.fromCharCode(...signature.toBytes()));
  for (const item of copy.consumedResources) {
    if (item.witnessData.TokenTransferPersistent)
      item.witnessData.TokenTransferPersistent.senderAuthorizationSignature = encoded;
    if (item.witnessData.TokenTransferEphemeralWrap)
      item.witnessData.TokenTransferEphemeralWrap.permit2Data.signature = btoa(String.fromCharCode(...new Uint8Array(65)));
  }
  return copy;
}

export class AnomaClient {
  constructor(reference, { fetchImpl = globalThis.fetch.bind(globalThis) } = {}) { this.reference = reference; this.fetch = fetchImpl; }
  async request(origin, path, body) {
    let response;
    try {
      response = await this.fetch(origin + path, {
        method: body === undefined ? 'GET' : 'POST', credentials: 'omit', redirect: 'error',
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body, (_, v) => typeof v === 'bigint' ? v.toString() : v),
        cache: 'no-store', signal: AbortSignal.timeout(15_000),
      });
    } catch { throw new Error('Anoma service could not be reached. No automatic submission retry was made.'); }
    // Never propagate provider response bodies or key-bearing request URLs.
    if (!response.ok) throw new Error(`Anoma service returned HTTP ${response.status}.`);
    try { return await response.json(); } catch { throw new Error('Anoma service returned an invalid response.'); }
  }
  async configuration() { return validateConfiguration(await this.request(BACKEND, '/api/v1/configuration/all'), this.reference); }
  async health() { return this.request(INDEXER, '/health'); }
  async registerDiscovery(keyring) {
    const result = await this.request(INDEXER, '/add_key', discoveryRegistration(keyring));
    if (result.status !== 'ok') throw new Error('Private account discovery could not be registered.');
  }
  async discover(keyring) {
    return this.request(INDEXER, `/tags/${bytesToHex(keyring.discoveryKeyPair.privateKey)}`);
  }
  async submit(parameters) {
    // Exactly one POST; the caller must durably record intent BEFORE calling.
    // A dropped response is ambiguous, not an invitation to submit again.
    const result = await this.request(BACKEND, '/api/v1/transactions/monad', wireParameters(parameters));
    if (!UUID.test(result.requestId ?? '')) throw new Error('Submission outcome is unknown. Check the action onchain before retrying.');
    return result.requestId;
  }
  async estimateFee(parameters, token) {
    const expected = this.reference.tokens.find(t => t.symbol === token);
    if (!expected) throw new Error('Unsupported fee token.');
    const quote = await this.request(BACKEND, '/api/v1/transactions/monad/estimate-fee', { feeToken: expected.address, transaction: wireParameters(parametersForQuote(parameters)) });
    if (![quote.baseFee, quote.percentageFee].every(v => typeof v === 'string' && /^(0|[1-9][0-9]*)$/.test(v)))
      throw new Error('Anoma fee quote is invalid.');
    if (quote.token?.symbol !== token || quote.token?.decimals !== expected.decimals)
      throw new Error('Anoma fee quote uses a different token.');
    return { ...quote, total: BigInt(quote.baseFee) + BigInt(quote.percentageFee) };
  }
  async transactionResult(id) {
    if (!UUID.test(id)) throw new Error('Invalid Anoma request ID.');
    return this.request(BACKEND, `/api/v1/transactions/${id}`);
  }
  async verifyCompletion(id, rpc, expectedAdapter, expectedRoot) {
    const result = await this.transactionResult(id);
    if (result.status !== 'completed' || !/^0x[0-9a-f]{64}$/i.test(result.transactionHash ?? ''))
      throw new Error('Private payment has not been confirmed onchain.');
    if (await rpc.getChainId() !== 143) throw new Error('Wrong verification network.');
    const receipt = await rpc.getTransactionReceipt({ hash: result.transactionHash });
    if (receipt.status !== 'success' || receipt.to?.toLowerCase() !== expectedAdapter.toLowerCase())
      throw new Error('Private payment receipt does not match the protocol.');
    if (!/^0x[0-9a-f]{64}$/i.test(expectedRoot ?? '')) throw new Error('Expected private action is required for settlement verification.');
    confirmAction(receipt, expectedAdapter, expectedRoot);
    return receipt;
  }
}
