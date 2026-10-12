import {
  TransferBuilder, ParametersDraftResolver, PayloadBuilder, extractUserPublicKeys,
  decodePayAddress, Resource, Digest, calculateLabelRef, calculateValueRefFromAuth,
  AuthorityVerifyingKey,
} from '@anomaorg/anoma-app-sdk';
import { bytesToHex, hexToBytes, isAddress, zeroAddress } from 'viem';

export const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

/** Deposit authorization binds exact token, quantity, pool, network and action
 * tree. The caller must separately approve only this quantity to Permit2. */
export async function prepareDeposit({ keyring, chain, token, amount, owner, now = Date.now() }) {
  if (!positive(amount) || !isAddress(owner) || owner.toLowerCase() === zeroAddress || chain.chainId !== 143 || chain.network !== 'monad' || !chain.enabled || chain.testnet)
    throw new Error('Invalid Monad deposit.');
  if (!chain.tokens.some(t => t.address.toLowerCase() === token.address?.toLowerCase() && t.decimals === token.decimals && t.network === token.network))
    throw new Error('Unsupported deposit token.');
  const builder = await TransferBuilder.init(chain.transferLogicVerifyingKey, chain.trivialLogicVerifyingKey);
  const resources = builder.client.createMintResources({ keyring, userAddress: owner, forwarderAddress: chain.forwarderAddress, token: token.address, quantity: amount });
  const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = BigInt(bytesToHex(nonceBytes));
  const deadline = Math.floor(now / 1000) + 600;
  const typedData = {
    domain: { name: 'Permit2', chainId: 143, verifyingContract: PERMIT2 },
    primaryType: 'PermitWitnessTransferFrom',
    types: {
      TokenPermissions: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }],
      Witness: [{ name: 'actionTreeRoot', type: 'bytes32' }],
      PermitWitnessTransferFrom: [
        { name: 'permitted', type: 'TokenPermissions' }, { name: 'spender', type: 'address' },
        { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }, { name: 'witness', type: 'Witness' },
      ],
    },
    message: { permitted: { token: token.address, amount }, spender: chain.forwarderAddress, nonce, deadline: BigInt(deadline), witness: { actionTreeRoot: `0x${resources.actionTree.root().toHex().replace(/^0x/, '')}` } },
  };
  function parameters(signature) {
    return builder.buildMintParameters(resources, { deadline, nonce: base64(nonceBytes), signature: base64(signature) }, owner, token.address, keyring);
  }
  return {
    typedData, parameters: parameters(new Uint8Array(65)),
    attachPermit(signature) {
      if (!/^0x[0-9a-f]{130}$/i.test(signature)) throw new Error('Invalid wallet permit signature.');
      return parameters(hexToBytes(signature));
    },
  };
}

const base64 = bytes => btoa(String.fromCharCode(...bytes));
const positive = n => typeof n === 'bigint' && n > 0n && n < (1n << 128n);
function checkedResources(resources, chain, token, keyring) {
  if (chain.chainId !== 143 || chain.network !== 'monad' || !chain.enabled || chain.testnet)
    throw new Error('Private payment preparation requires Monad mainnet.');
  const expectedToken = chain.tokens.find(t => t.address.toLowerCase() === token.address?.toLowerCase());
  if (!expectedToken || token.decimals !== expectedToken.decimals || token.network !== chain.network)
    throw new Error('Token does not match the approved Monad configuration.');
  if (!Array.isArray(resources) || !resources.length || resources.length > 50)
    throw new Error('Supply 1–50 confirmed unspent resources.');
  const expected = {
    logicRef: base64(Digest.fromHex(chain.transferLogicVerifyingKey).toBytes()),
    labelRef: base64(calculateLabelRef(chain.forwarderAddress, token.address).toBytes()),
    valueRef: base64(calculateValueRefFromAuth(new AuthorityVerifyingKey(keyring.authorityKeyPair.publicKey), bytesToHex(keyring.encryptionKeyPair.publicKey)).toBytes()),
    nkCommitment: base64(keyring.nullifierKeyPair.cnk),
  };
  const seen = new Set();
  for (const r of resources) {
    if (r.chainId !== 143 || r.network !== 'monad' || r.forwarder?.toLowerCase() !== chain.forwarderAddress.toLowerCase() || r.erc20TokenAddress?.toLowerCase() !== token.address.toLowerCase() || r.isEphemeral || !positive(r.quantity))
      throw new Error('A resource is from the wrong pool, token, or network.');
    for (const [field, value] of Object.entries(expected))
      if (r[field] !== value) throw new Error('Resource ownership or protocol binding does not match.');
    const id = Resource.decode(r).commitment().toHex();
    if (seen.has(id)) throw new Error('Duplicate input resource.');
    seen.add(id);
  }
}

/** Local preparation only. Resource inclusion/unspent state still needs provider
 * and chain checks; a locally valid payload is not a completed private payment. */
async function prepare({ keyring, resources, chain, token, amount, fee, receiver, expiresAt }) {
  if (expiresAt !== undefined) throw new Error('Anoma bearer links do not enforce an expiry or timed refund.');
  if (!positive(amount) || typeof fee !== 'bigint' || fee < 0n || fee >= (1n << 128n))
    throw new Error('Invalid payment amount or fee.');
  checkedResources(resources, chain, token, keyring);
  const builder = await TransferBuilder.init(chain.transferLogicVerifyingKey, chain.trivialLogicVerifyingKey);
  const resolver = new ParametersDraftResolver(builder, extractUserPublicKeys(keyring), keyring.nullifierKeyPair.nk, chain);
  resolver.addReceiver({ ...receiver, quantity: amount, token });
  if (fee) resolver.addReceiver({ type: 'AnomaAddress', userPublicKeys: chain.feePublicKeys, quantity: fee, token });
  const payload = new PayloadBuilder(resolver.build(resources));
  // Quoting carries no authority signature. Calling authorize is a separate step
  // for a caller that has already obtained approval for this amount/recipient.
  return {
    parameters: payload.build(),
    summary: Object.freeze({ chainId: 143, token: token.address, amount: amount.toString(), fee: fee.toString(), operation: receiver.type === 'EvmAddress' ? 'withdraw' : 'private-send' }),
    authorize: () => payload.withAuthorization(keyring.authorityKeyPair.privateKey).build(),
  };
}
export async function preparePrivateSend(options) {
  const keys = decodePayAddress(options.payAddress);
  if (bytesToHex(keys.authorityPublicKey) === bytesToHex(options.keyring.authorityKeyPair.publicKey))
    throw new Error('A shareable claim link must use a separate account from the sender.');
  return prepare({ ...options, receiver: { type: 'AnomaAddress', userPublicKeys: keys } });
}
export async function prepareWithdrawal(options) {
  if (!isAddress(options.recipient) || options.recipient.toLowerCase() === zeroAddress)
    throw new Error('Choose a valid withdrawal wallet.');
  return prepare({ ...options, receiver: { type: 'EvmAddress', address: options.recipient } });
}
