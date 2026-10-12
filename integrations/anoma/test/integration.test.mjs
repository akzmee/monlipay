import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  createUserKeyring, extractUserPublicKeys, encodePayAddress, TransferBuilder,
  Resource, NullifierKey, MerkleTree, AuthorityVerifyingKey, AuthoritySignature,
} from '@anomaorg/anoma-app-sdk';
import reference from '../monad-reference.json' with { type: 'json' };
import { initNodeSdk } from '../src/node.mjs';
import { newPrivateLink, decodePrivateLink, keyringForLink, encodePrivateLink } from '../src/links.mjs';
import { AnomaClient, validateConfiguration, wireParameters, parametersForQuote } from '../src/client.mjs';
import { preparePrivateSend, prepareWithdrawal, prepareDeposit, PERMIT2 } from '../src/transactions.mjs';
import { privateKeyToAccount } from 'viem/accounts';
import { hashTypedData, recoverTypedDataAddress, encodeEventTopics, encodeAbiParameters } from 'viem';
import { actionRoot, adapterAbi, confirmAction, discoveryRegistration, confirmedResources, confirmResource, resourceNullifier } from '../src/resources.mjs';

const chain = () => validateConfiguration({ configurations: [structuredClone(reference)] }, reference);
before(initNodeSdk);
async function fixture() {
  const config = chain(), token = config.tokens[0], keyring = createUserKeyring(new Uint8Array(32).fill(7));
  const builder = await TransferBuilder.init(config.transferLogicVerifyingKey, config.trivialLogicVerifyingKey);
  // Synthetic, unfunded resource. A real chain does NOT contain this note.
  const mint = builder.client.createMintResources({ userAddress: '0x0000000000000000000000000000000000000001', forwarderAddress: config.forwarderAddress, token: token.address, quantity: 10_000_000n, keyring });
  const resource = { ...mint.createdResource.encode(), chainId: 143, network: 'monad', forwarder: config.forwarderAddress, erc20TokenAddress: token.address };
  const link = newPrivateLink(token.address);
  return { chain: config, token, keyring, resources: [resource], payAddress: link.payAddress, amount: 1_000_000n, fee: 100_000n };
}

test('random claim accounts recover from fragments, without public URL secrets', () => {
  const link = newPrivateLink(reference.tokens[0].address);
  const decoded = decodePrivateLink(link.url);
  assert.equal(decoded.chainId, 143);
  assert.deepEqual(decoded.seed, link.seed);
  assert.equal(encodePayAddress(extractUserPublicKeys(keyringForLink(decoded.seed))), link.payAddress);
  assert.equal(new URL(link.url).search, '');
  assert.equal(new URL(link.url).pathname, '/claim/private');
  assert.notEqual(newPrivateLink(reference.tokens[0].address).payAddress, link.payAddress);
});
test('link parser rejects credentials, queries, unknown versions/chains and malformed secrets', () => {
  const value = newPrivateLink(reference.tokens[0].address).url;
  for (const invalid of [value.replace('monlipay.xyz', 'evil.example'), value.replace('#', '?tracking=1#'), value.replace('1.143.', '1.10143.'), value.replace('#p=1.', '#p=2.'), value.slice(0, -1), value.replace('https://', 'https://name:password@')])
    assert.throws(() => decodePrivateLink(invalid));
  assert.throws(() => encodePrivateLink(new Uint8Array(16), reference.tokens[0].address));
});
test('configuration fails closed on protocol, fee destination, token and chain changes', () => {
  for (const field of ['forwarderAddress', 'transferLogicVerifyingKey', 'feeAuthorityPk']) {
    const changed = structuredClone(reference); changed[field] = '0x' + 'f'.repeat(40);
    assert.throws(() => validateConfiguration({ configurations: [changed] }, reference));
  }
  for (const mutate of [c => c.testnet = true, c => c.enabled = false, c => c.chainId = 10143, c => c.tokens[0].decimals = 18, c => c.tokens[1] = c.tokens[0]]) {
    const changed = structuredClone(reference); mutate(changed);
    assert.throws(() => validateConfiguration({ configurations: [changed] }, reference));
  }
});
test('private send conserves value, splits fees/change, and stays unsigned until authorize', async () => {
  const args = await fixture(), draft = await preparePrivateSend(args);
  const inputs = draft.parameters.consumedResources.filter(x => !x.resource.isEphemeral);
  const outputs = draft.parameters.createdResources.filter(x => !x.resource.isEphemeral);
  assert.equal(inputs.reduce((sum, x) => sum + x.resource.quantity, 0n), outputs.reduce((sum, x) => sum + x.resource.quantity, 0n));
  assert.deepEqual(outputs.map(x => x.resource.quantity).sort((a,b)=>a>b?1:-1), [100_000n, 1_000_000n, 8_900_000n]);
  assert.equal(inputs[0].witnessData.TokenTransferPersistent.senderAuthorizationSignature, '');
  assert.equal(JSON.stringify(draft.parameters, (_,v)=>typeof v==='bigint'?v.toString():v).includes(Buffer.from(args.keyring.authorityKeyPair.privateKey).toString('base64')), false);
  const signed = draft.authorize();
  const witness = signed.consumedResources.find(x => !x.resource.isEphemeral).witnessData.TokenTransferPersistent;
  const leaves = signed.consumedResources.flatMap((input, i) => [Resource.decode(input.resource).nullifier(NullifierKey.fromBase64(input.nullifierKey)), Resource.decode(signed.createdResources[i].resource).commitment()]);
  const verifyingKey = new AuthorityVerifyingKey(args.keyring.authorityKeyPair.publicKey);
  const signature = AuthoritySignature.fromBytes(Buffer.from(witness.senderAuthorizationSignature, 'base64'));
  verifyingKey.verify('TokenTransferAuthorization', new MerkleTree(leaves).root().toBytes(), signature);
  const changed = signed.createdResources[0].resource;
  leaves[1] = Resource.decode({ ...changed, quantity: changed.quantity + 1n }).commitment();
  assert.throws(() => verifyingKey.verify('TokenTransferAuthorization', new MerkleTree(leaves).root().toBytes(), signature));
});
test('withdrawal binds its public recipient and amount; no timed-refund promise', async () => {
  const args = await fixture();
  const recipient = '0x0000000000000000000000000000000000000002';
  const draft = await prepareWithdrawal({ ...args, recipient });
  const burn = draft.parameters.createdResources.find(x => x.witnessData.TokenTransferEphemeralUnwrap);
  assert.equal(burn.witnessData.TokenTransferEphemeralUnwrap.receiverWalletAddress, recipient);
  assert.equal(burn.resource.quantity, args.amount);
  assert.equal(draft.summary.operation, 'withdraw');
  await assert.rejects(prepareWithdrawal({ ...args, recipient, expiresAt: 123 }), /do not enforce/);
  await assert.rejects(prepareWithdrawal({ ...args, recipient: '0x0000000000000000000000000000000000000000' }));
});
test('foreign resources, duplicate inputs, shared sender account and insufficient funds are rejected', async () => {
  const args = await fixture();
  for (const change of [{ chainId: 10143 }, { erc20TokenAddress: args.chain.tokens[1].address }, { nkCommitment: 'wrong' }, { isEphemeral: true }, { quantity: -1n }])
    await assert.rejects(preparePrivateSend({ ...args, resources: [{ ...args.resources[0], ...change }] }));
  await assert.rejects(preparePrivateSend({ ...args, resources: [args.resources[0], args.resources[0]] }), /Duplicate/);
  await assert.rejects(preparePrivateSend({ ...args, amount: 20_000_000n }));
  await assert.rejects(preparePrivateSend({ ...args, payAddress: encodePayAddress(extractUserPublicKeys(args.keyring)) }), /separate account/);
});
test('wire format translates resource field names and preserves witness casing', async () => {
  const p = (await preparePrivateSend(await fixture())).parameters;
  const wire = wireParameters(p);
  assert.equal(wire.consumedResources[0].resource.logic_ref, p.consumedResources[0].resource.logicRef);
  assert.equal('logicRef' in wire.consumedResources[0].resource, false);
  assert.ok(wire.consumedResources[0].witnessData.TokenTransferPersistent);
});
test('transport avoids cookies/redirects and redacts request URLs and provider bodies', async () => {
  let options;
  const c = new AnomaClient(reference, { fetchImpl: async (_, o) => { options = o; return new Response('sensitive provider detail', { status: 503 }); } });
  await assert.rejects(c.health(), error => error.message === 'Anoma service returned HTTP 503.');
  assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
  const unavailable = new AnomaClient(reference, { fetchImpl: async () => { throw Error('URL contains secret'); } });
  await assert.rejects(unavailable.health(), error => !error.message.includes('secret'));
});
test('fee estimates cannot switch tokens or accept negative amounts', async () => {
  const params = (await preparePrivateSend(await fixture())).parameters;
  const client = response => new AnomaClient(reference, { fetchImpl: async () => Response.json(response) });
  assert.equal((await client({ baseFee: '200', percentageFee: '3', token: { symbol: 'USDC', decimals: 6 } }).estimateFee(params, 'USDC')).total, 203n);
  await assert.rejects(client({ baseFee: '-1', percentageFee: '0', token: { symbol: 'USDC', decimals: 6 } }).estimateFee(params, 'USDC'));
  await assert.rejects(client({ baseFee: '1', percentageFee: '0', token: { symbol: 'WMON', decimals: 18 } }).estimateFee(params, 'USDC'));
});
test('quoting strips spend authorization without mutating the signed transaction', async () => {
  const args = await fixture(), draft = await preparePrivateSend(args);
  const signed = draft.authorize(), quote = parametersForQuote(signed);
  const originalSignature = signed.consumedResources[0].witnessData.TokenTransferPersistent.senderAuthorizationSignature;
  assert.notEqual(quote.consumedResources[0].witnessData.TokenTransferPersistent.senderAuthorizationSignature, originalSignature);
  const leaves = signed.consumedResources.flatMap((input, i) => [Resource.decode(input.resource).nullifier(NullifierKey.fromBase64(input.nullifierKey)), Resource.decode(signed.createdResources[i].resource).commitment()]);
  const signature = AuthoritySignature.fromBytes(Buffer.from(quote.consumedResources[0].witnessData.TokenTransferPersistent.senderAuthorizationSignature, 'base64'));
  assert.throws(() => new AuthorityVerifyingKey(args.keyring.authorityKeyPair.publicKey).verify('TokenTransferAuthorization', new MerkleTree(leaves).root().toBytes(), signature));
  assert.equal(signed.consumedResources[0].witnessData.TokenTransferPersistent.senderAuthorizationSignature, originalSignature);
  let body;
  const client = new AnomaClient(reference, { fetchImpl: async (_, options) => {
    body = JSON.parse(options.body);
    return Response.json({ baseFee: '1', percentageFee: '0', token: { symbol: 'USDC', decimals: 6 } });
  } });
  await client.estimateFee(signed, args.token.symbol);
  assert.equal(body.feeToken, args.token.address);
  assert.equal(optionsContain(body, originalSignature), false);
});
function optionsContain(value, needle) { return JSON.stringify(value).includes(needle); }

test('deposit permit binds network, exact quantity, forwarder and resource tree', async () => {
  // Public, unfunded fixture key; never a user wallet.
  const account = privateKeyToAccount(`0x${'1'.repeat(64)}`);
  const args = await fixture();
  const deposit = await prepareDeposit({ ...args, owner: account.address, now: 1_000_000 });
  const data = deposit.typedData;
  assert.equal(data.domain.chainId, 143);
  assert.equal(data.domain.verifyingContract, PERMIT2);
  assert.equal(data.message.permitted.amount, args.amount);
  assert.equal(data.message.spender, reference.forwarderAddress);
  assert.equal(data.message.deadline, 1600n);
  const signature = await account.signTypedData(data);
  assert.equal(await recoverTypedDataAddress({ ...data, signature }), account.address);
  const signed = deposit.attachPermit(signature);
  const wrap = signed.consumedResources[0].witnessData.TokenTransferEphemeralWrap;
  assert.equal(Buffer.from(wrap.permit2Data.signature, 'base64').toString('hex'), signature.slice(2));
  assert.equal(BigInt(`0x${Buffer.from(wrap.permit2Data.nonce, 'base64').toString('hex')}`), data.message.nonce);
  const leafIn = signed.consumedResources[0], leafOut = signed.createdResources[0];
  assert.equal(`0x${new MerkleTree([Resource.decode(leafIn.resource).nullifier(NullifierKey.fromBase64(leafIn.nullifierKey)), Resource.decode(leafOut.resource).commitment()]).root().toHex()}`, data.message.witness.actionTreeRoot);
  for (const mutate of [
    d => d.domain.chainId = 10143,
    d => d.message.permitted.amount += 1n,
    d => d.message.spender = PERMIT2,
    d => d.message.witness.actionTreeRoot = `0x${'0'.repeat(64)}`,
  ]) {
    const changed = structuredClone(data); mutate(changed);
    assert.notEqual(hashTypedData(changed), hashTypedData(data));
    assert.notEqual(await recoverTypedDataAddress({ ...changed, signature }), account.address);
  }
  const quote = parametersForQuote(signed);
  assert.equal(Buffer.from(quote.consumedResources[0].witnessData.TokenTransferEphemeralWrap.permit2Data.signature, 'base64').every(x => x === 0), true);
  assert.throws(() => deposit.attachPermit('0x00'));
  await assert.rejects(prepareDeposit({ ...args, owner: account.address, amount: 0n }));
  await assert.rejects(prepareDeposit({ ...args, owner: account.address, chain: { ...args.chain, chainId: 10143 } }));
});
test('proof generation is not settlement; completed status requires successful pinned-chain receipt', async () => {
  const id = '00000000-0000-4000-8000-000000000000', hash = `0x${'1'.repeat(64)}`;
  const root = actionRoot((await preparePrivateSend(await fixture())).parameters);
  const log = { address: reference.protocolAdapterAddress, topics: encodeEventTopics({ abi: adapterAbi, eventName: 'ActionExecuted' }), data: encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint256' }], [root, 6n]) };
  let result = { status: 'proofGeneration', transactionHash: hash };
  const client = new AnomaClient(reference, { fetchImpl: async () => Response.json(result) });
  const rpc = { getChainId: async () => 143, getTransactionReceipt: async () => ({ status: 'success', to: reference.protocolAdapterAddress, logs: [log] }) };
  await assert.rejects(client.verifyCompletion(id, rpc, reference.protocolAdapterAddress, root));
  result = { status: 'completed', transactionHash: hash };
  assert.equal((await client.verifyCompletion(id, rpc, reference.protocolAdapterAddress, root)).status, 'success');
  await assert.rejects(client.verifyCompletion(id, { ...rpc, getChainId: async () => 10143 }, reference.protocolAdapterAddress, root));
  await assert.rejects(client.verifyCompletion(id, { ...rpc, getTransactionReceipt: async () => ({ status: 'reverted', to: reference.protocolAdapterAddress }) }, reference.protocolAdapterAddress, root));
  await assert.rejects(client.verifyCompletion(id, rpc, reference.protocolAdapterAddress, hash), /expected private payment/);
  assert.throws(() => confirmAction({ status: 'success', logs: [{ ...log, address: PERMIT2 }] }, reference.protocolAdapterAddress, root));
});

test('discovery registration delegates only the discovery key', async () => {
  const { keyring } = await fixture();
  const registration = discoveryRegistration(keyring);
  assert.deepEqual(Object.keys(registration), ['public_key', 'secret_key']);
  assert.equal(registration.secret_key, `0x${Buffer.from(keyring.discoveryKeyPair.privateKey).toString('hex')}`);
  for (const secret of [keyring.authorityKeyPair.privateKey, keyring.encryptionKeyPair.privateKey, keyring.nullifierKeyPair.nk])
    assert.equal(optionsContain(registration, Buffer.from(secret).toString('hex')), false);
});
test('resource discovery rejects malformed groups and a different verification chain', async () => {
  const args = await fixture(), rpc = { getChainId: async () => 143 };
  assert.deepEqual(await confirmedResources({ ...args, rpc, response: { resources: [] } }), []);
  await assert.rejects(confirmedResources({ ...args, rpc, response: {} }));
  await assert.rejects(confirmedResources({ ...args, rpc: { getChainId: async () => 10143 }, response: { resources: [] } }));
  await assert.rejects(confirmedResources({ ...args, rpc, response: { resources: [{ chain: 143, contract: reference.protocolAdapterAddress, resources: [{ resource_payload: { blob: 'invalid' }, transaction_hash: 'invalid' }] }] } }));
});
test('indexer resource must match the exact commitment, ciphertext and adapter log', async () => {
  const args = await fixture(), resource = Resource.decode(args.resources[0]);
  const commitment = `0x${resource.commitment().toHex()}`;
  assert.equal(resourceNullifier(resource, args.keyring), `0x${resource.nullifier(new NullifierKey(args.keyring.nullifierKeyPair.nk)).toHex()}`);
  // This is a receipt-binding test; the blob is not a decryption fixture.
  const payload = '0x010203';
  const log = { address: reference.protocolAdapterAddress, topics: encodeEventTopics({ abi: adapterAbi, eventName: 'ResourcePayload', args: { tag: commitment } }), data: encodeAbiParameters([{ type: 'uint256' }, { type: 'bytes' }], [0n, payload]) };
  const receipt = { status: 'success', logs: [log] };
  confirmResource(receipt, reference.protocolAdapterAddress, commitment, payload);
  assert.throws(() => confirmResource(receipt, reference.protocolAdapterAddress, `0x${'0'.repeat(64)}`, payload));
  assert.throws(() => confirmResource(receipt, reference.protocolAdapterAddress, commitment, '0x040506'));
  assert.throws(() => confirmResource({ ...receipt, logs: [{ ...log, address: PERMIT2 }] }, reference.protocolAdapterAddress, commitment, payload));
  assert.throws(() => confirmResource({ ...receipt, status: 'reverted' }, reference.protocolAdapterAddress, commitment, payload));
});
test('submission sends once and never automatically retries ambiguous network failure', async () => {
  const parameters = (await preparePrivateSend(await fixture())).authorize();
  let calls = 0;
  const client = new AnomaClient(reference, { fetchImpl: async () => { calls++; throw Error('network dropped'); } });
  await assert.rejects(client.submit(parameters), /No automatic submission retry/);
  assert.equal(calls, 1);
});

test('binds the default fetch receiver for browser Window implementations', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async function () {
    assert.equal(this, globalThis, 'browser fetch requires its Window receiver');
    return Response.json({status:'ok'});
  };
  try { assert.deepEqual(await new AnomaClient(reference).health(), {status:'ok'}); }
  finally { globalThis.fetch = previous; }
});
