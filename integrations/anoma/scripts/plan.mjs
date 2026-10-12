import { createPublicClient, formatUnits, http, parseEther } from 'viem';
import { monad } from 'viem/chains';
import { createUserKeyring, TransferBuilder } from '@anomaorg/anoma-app-sdk';
import reference from '../monad-reference.json' with { type: 'json' };
import { initNodeSdk } from '../src/node.mjs';
import { AnomaClient } from '../src/client.mjs';
import { newPrivateLink } from '../src/links.mjs';
import { prepareDeposit, preparePrivateSend, prepareWithdrawal, PERMIT2 } from '../src/transactions.mjs';

// READ ONLY: ephemeral synthetic notes for fee estimation, no spend signatures,
// no real wallet keys, no approvals, no deposits and no transaction submission.
await initNodeSdk();
const client = new AnomaClient(reference), chain = await client.configuration();
const token = chain.tokens.find(t => t.symbol === 'WMON');
const owner = '0xd16385B936BDC12BEc3f363521513419C0cED249';
const keyring = createUserKeyring();
const builder = await TransferBuilder.init(chain.transferLogicVerifyingKey, chain.trivialLogicVerifyingKey);
const mint = builder.client.createMintResources({ keyring, userAddress: owner, forwarderAddress: chain.forwarderAddress, token: token.address, quantity: parseEther('100') });
const resource = { ...mint.createdResource.encode(), chainId: 143, network: 'monad', forwarder: chain.forwarderAddress, erc20TokenAddress: token.address };
const common = { keyring, chain, token, resources: [resource], amount: parseEther('1'), fee: 1n };
const [deposit, send, claim] = await Promise.all([
  prepareDeposit({ ...common, owner }),
  preparePrivateSend({ ...common, payAddress: newPrivateLink(token.address).payAddress }),
  prepareWithdrawal({ ...common, recipient: owner }),
]);
const [depositFee, sendFee, claimFee] = await Promise.all([deposit, send, claim].map(d => client.estimateFee(d.parameters, 'WMON')));
if (depositFee.total !== 0n) throw new Error('Nonzero deposit fee requires a reviewed deposit implementation.');
const rpc = createPublicClient({ chain: monad, transport: http('https://rpc.monad.xyz') });
const [gasPrice, currentBalance] = await Promise.all([rpc.getGasPrice(), rpc.getBalance({ address: owner })]);
// Deliberately includes a second withdrawal of sender change to test recovery.
const estimatedProtocolFees = sendFee.total + claimFee.total * 2n;
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(), mode: 'read-only synthetic quote; no transactions sent',
  chainId: 143, token: { symbol: 'WMON', address: token.address, decimals: 18 },
  protocolAdapter: chain.protocolAdapterAddress, forwarder: chain.forwarderAddress, permit2: PERMIT2,
  proposedTestWallet: owner, currentMonBalance: formatUnits(currentBalance, 18),
  quotedFeesWmon: { deposit: formatUnits(depositFee.total, 18), privateSend: formatUnits(sendFee.total, 18), withdrawalWithChange: formatUnits(claimFee.total, 18), totalWithSenderRecovery: formatUnits(estimatedProtocolFees, 18) },
  gasPriceWei: gasPrice.toString(), gasBudgetMon: '0.1',
  proposedDepositMon: '1', maximumTotalMonAtRisk: '1.1',
  feasibleAtCurrentQuote: estimatedProtocolFees < parseEther('0.35') && currentBalance >= parseEther('1.1'),
  steps: ['Wrap exactly 1 MON to WMON', 'Approve exactly 1 WMON to Permit2', 'Deposit into a separate sender account', 'Send 0.5 WMON to a random claim account', 'Withdraw claim account to the original test wallet, less its fee', 'Withdraw sender change to the original test wallet, less its fee', 'Unwrap returned WMON; verify final balances and no residual allowance'],
  approvalRequiredBeforeSpending: true,
  limitations: ['Monad mainnet only', 'No expiry or automatic refund', 'Deposit and withdrawal remain public', 'Proving operator receives transaction witness data', 'No independent audit of this integration'],
}, null, 2));
