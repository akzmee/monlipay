// Live MAINNET smoke test. Requires separately authorized funds. Not run by
// npm test/check/plan or the web app. Never prints secrets, payloads, or URLs.
import { createPublicClient, createWalletClient, encodeFunctionData, erc20Abi, formatEther, hexToBytes, bytesToHex, http, keccak256, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monad } from 'viem/chains';
import { createUserKeyringFromIkm } from '@anomaorg/anoma-app-sdk';
import reference from '../monad-reference.json' with { type: 'json' };
import { initNodeSdk } from '../src/node.mjs';
import { AnomaClient } from '../src/client.mjs';
import { actionRoot, adapterAbi, confirmedResources } from '../src/resources.mjs';
import { keyringForLink, newPrivateLink, decodePrivateLink } from '../src/links.mjs';
import { prepareDeposit, preparePrivateSend, prepareWithdrawal, PERMIT2 } from '../src/transactions.mjs';
import { openPilotJournal, PILOT, reserveFee } from '../src/pilot-state.mjs';

const report = (step, status, hash) => console.log(JSON.stringify({ step, status, ...(hash ? { hash } : {}) }));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
class Pending extends Error {}
let journal, activeStep = 'preflight';
try {
  if (process.env.MONLIPAY_ANOMA_APPROVED_MAX_MON !== '1.1') throw new Error('Explicit pilot budget is missing.');
  if (!process.env.MONLIPAY_ANOMA_JOURNAL_DIR) throw new Error('Private recovery directory is required.');
  if (!/^0x[0-9a-f]{64}$/i.test(process.env.MONLIPAY_ANOMA_TEST_PRIVATE_KEY ?? '')) throw new Error('Pilot signer is unavailable.');
  const account = privateKeyToAccount(process.env.MONLIPAY_ANOMA_TEST_PRIVATE_KEY);
  delete process.env.MONLIPAY_ANOMA_TEST_PRIVATE_KEY;
  if (account.address.toLowerCase() !== PILOT.owner.toLowerCase()) throw new Error('Pilot signer does not match the reviewed wallet.');
  await initNodeSdk();
  const client = new AnomaClient(reference), chain = await client.configuration();
  const token = chain.tokens.find(t => t.symbol === 'WMON');
  const rpc = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz', { timeout: 15_000, retryCount: 0 }) });
  const wallet = createWalletClient({ account, chain: monad, transport: http('https://rpc.monad.xyz', { timeout: 15_000, retryCount: 0 }) });
  if (await rpc.getChainId() !== PILOT.chainId) throw new Error('Wrong pilot network.');
  if (await rpc.readContract({ address: chain.protocolAdapterAddress, abi: adapterAbi, functionName: 'isEmergencyStopped' })) throw new Error('Protocol is stopped.');
  const balance = () => rpc.readContract({ address: token.address, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });
  const allowance = () => rpc.readContract({ address: token.address, abi: erc20Abi, functionName: 'allowance', args: [account.address, PERMIT2] });
  journal = await openPilotJournal(process.env.MONLIPAY_ANOMA_JOURNAL_DIR);
  let state = await journal.read();
  if (!state) {
    if (await rpc.getBalance({ address: account.address }) < PILOT.deposit + PILOT.gasCap) throw new Error('Insufficient pilot budget.');
    if (await allowance() !== 0n) throw new Error('Review existing Permit2 allowance before this isolated pilot.');
    const link = newPrivateLink(token.address);
    state = { version: 1, owner: PILOT.owner, chainId: 143, token: token.address, senderSeed: bytesToHex(crypto.getRandomValues(new Uint8Array(32))), claimUrl: link.url, initialWmon: (await balance()).toString(), gasReserved: '0', protocolFeesReserved: '0', steps: {} };
    await journal.save(state); // Recovery exists and is fsynced BEFORE funding.
  }
  if (state.version !== 1 || state.owner !== PILOT.owner || state.chainId !== 143 || state.token !== token.address) throw new Error('Pilot recovery scope mismatch.');
  const sender = createUserKeyringFromIkm(hexToBytes(state.senderSeed), 'monlipay:anoma:sender:pilot:v1:143');
  const claimant = keyringForLink(decodePrivateLink(state.claimUrl).seed);
  const save = () => journal.save(state);

  async function evmStep(name, data, value = 0n) {
    activeStep = name;
    let step = state.steps[name];
    if (step?.done) return;
    if (!step) {
      const gasPrice = await rpc.getGasPrice() * 2n;
      const gas = await rpc.estimateGas({ account: account.address, to: token.address, data, value }) * 125n / 100n;
      state.gasReserved = reserveFee(BigInt(state.gasReserved), gas * gasPrice, PILOT.gasCap).toString();
      const request = await wallet.prepareTransactionRequest({ account, to: token.address, data, value, gas, gasPrice, type: 'legacy' });
      const raw = await wallet.signTransaction(request);
      step = state.steps[name] = { hash: keccak256(raw), raw, gasCap: (gas * gasPrice).toString() };
      await save(); // Same signed bytes are safe to rebroadcast after interruption.
    }
    try { await wallet.sendRawTransaction({ serializedTransaction: step.raw }); } catch { /* Look up its already-determined hash. */ }
    let receipt;
    try { receipt = await rpc.waitForTransactionReceipt({ hash: step.hash, timeout: 25_000 }); }
    catch { throw new Pending('Wallet transaction is pending. Resume using the same private journal.'); }
    if (receipt.status !== 'success') throw new Error('Wallet transaction reverted.');
    step.done = true; delete step.raw; await save(); report(name, 'confirmed', step.hash);
  }
  async function protocolStep(name, build) {
    activeStep = name;
    let step = state.steps[name];
    if (step?.done) return;
    if (!step) {
      const { parameters, fee } = await build();
      state.protocolFeesReserved = reserveFee(BigInt(state.protocolFeesReserved), fee, PILOT.protocolFeeCap).toString();
      step = state.steps[name] = { parameters, actionRoot: actionRoot(parameters), fee: fee.toString(), attempted: true };
      await save(); // Ambiguous POST outcome blocks resubmission, even on restart.
      step.requestId = await client.submit(parameters);
      await save();
    }
    if (!step.requestId) throw new Error('Submission outcome is unknown. Review the saved action onchain; never start another pilot.');
    const deadline = Date.now() + 25_000;
    do {
      const result = await client.transactionResult(step.requestId);
      if (result.status === 'failed') throw new Error('Provider rejected the transaction. Review the private journal.');
      if (result.status === 'completed') {
        const receipt = await client.verifyCompletion(step.requestId, rpc, chain.protocolAdapterAddress, step.actionRoot);
        step.done = true; step.hash = receipt.transactionHash; delete step.parameters;
        await save(); report(name, 'confirmed', step.hash); return;
      }
      await delay(2500);
    } while (Date.now() < deadline);
    throw new Pending('Proof or broadcast is pending. Resume using the same private journal.');
  }
  async function resources(keyring) {
    const deadline = Date.now() + 25_000;
    do {
      const found = await confirmedResources({ response: await client.discover(keyring), keyring, chain, token, rpc });
      if (found.length) return found;
      await delay(2500);
    } while (Date.now() < deadline);
    throw new Pending('Waiting for confirmed account discovery. Resume using the same private journal.');
  }
  async function quotedSend(keyring, found, destination, withdrawAll = false) {
    const total = found.reduce((sum, r) => sum + r.quantity, 0n);
    let fee = 1n;
    for (let pass = 0; pass < 4; pass++) {
      const options = { keyring, resources: found, chain, token, fee, amount: withdrawAll ? total - fee : PILOT.payment };
      const draft = withdrawAll ? await prepareWithdrawal({ ...options, recipient: account.address }) : await preparePrivateSend({ ...options, payAddress: destination });
      const quote = await client.estimateFee(draft.parameters, token.symbol);
      if (quote.total === fee) return { parameters: draft.authorize(), fee };
      fee = quote.total;
    }
    throw new Error('Fee quote did not stabilize. No spend authorization submitted.');
  }

  if (!state.registered) {
    await client.registerDiscovery(sender); await client.registerDiscovery(claimant);
    state.registered = true; await save();
  }
  const wmonAbi = parseAbi(['function deposit() payable', 'function withdraw(uint256 amount)']);
  await evmStep('wrap', encodeFunctionData({ abi: wmonAbi, functionName: 'deposit' }), PILOT.deposit);
  await evmStep('approve', encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [PERMIT2, PILOT.deposit] }));
  await protocolStep('deposit', async () => {
    const draft = await prepareDeposit({ keyring: sender, chain, token, amount: PILOT.deposit, owner: account.address });
    if ((await client.estimateFee(draft.parameters, token.symbol)).total !== 0n) throw new Error('Nonzero deposit fee is unsupported by this pilot.');
    return { parameters: draft.attachPermit(await account.signTypedData(draft.typedData)), fee: 0n };
  });
  const { encodePayAddress, extractUserPublicKeys } = await import('@anomaorg/anoma-app-sdk');
  await protocolStep('private-send', async () => quotedSend(sender, await resources(sender), encodePayAddress(extractUserPublicKeys(claimant))));
  await protocolStep('claim', async () => quotedSend(claimant, await resources(claimant), undefined, true));
  await protocolStep('sender-recovery', async () => quotedSend(sender, await resources(sender), undefined, true));
  if (!state.returnAmount) {
    state.returnAmount = ((await balance()) - BigInt(state.initialWmon)).toString(); await save();
  }
  if (BigInt(state.returnAmount) <= 0n || BigInt(state.returnAmount) > PILOT.deposit) throw new Error('Returned token balance does not match the pilot.');
  await evmStep('unwrap', encodeFunctionData({ abi: wmonAbi, functionName: 'withdraw', args: [BigInt(state.returnAmount)] }));
  if (await allowance() !== 0n) await evmStep('revoke', encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [PERMIT2, 0n] }));
  if (await allowance() !== 0n || await balance() !== BigInt(state.initialWmon)) throw new Error('Pilot final token balance or allowance differs.');
  if (await confirmedResources({ response: await client.discover(sender), keyring: sender, chain, token, rpc }).then(r => r.length) || await confirmedResources({ response: await client.discover(claimant), keyring: claimant, chain, token, rpc }).then(r => r.length)) throw new Error('Pilot still has unspent private resources.');
  state.complete = true; await save();
  console.log(JSON.stringify({ pilot: 'passed', returnedMon: formatEther(BigInt(state.returnAmount)), protocolFeesWmon: formatEther(BigInt(state.protocolFeesReserved)), gasBudgetReservedMon: formatEther(BigInt(state.gasReserved)), featureEnabledInWeb: false }));
} catch (error) {
  // Raw provider/viem/SDK errors can contain signatures, URLs or account keys.
  // Keep public logs to controlled step + outcome; inspect the private journal.
  report(activeStep, error instanceof Pending ? 'pending; resume same journal' : 'stopped; inspect recovery state before retrying');
  process.exitCode = error instanceof Pending ? 2 : 1;
} finally { await journal?.close(); }
