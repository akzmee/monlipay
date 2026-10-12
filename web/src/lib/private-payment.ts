import {
  createPublicClient,
  http,
  bytesToHex,
  hexToBytes,
  parseAbi,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { monad } from "viem/chains";
import type {
  Configuration,
  PrivateToken,
  PrivateResource,
  UserKeyring,
  Draft,
} from "@monlipay/anoma-integration";
export type { PrivateToken, UserKeyring };
export type PrivateOperation = {
  version: 1;
  id: string;
  kind: "deposit" | "link" | "withdraw";
  token: Address;
  amount: string;
  createdAt: number;
  status: "draft" | "wallet" | "submitting" | "pending" | "complete" | "failed";
  seed?: Hex;
  fee?: string;
  recipient?: Address;
  native?: boolean;
  wrapHash?: Hex;
  approvalHash?: Hex;
  requestId?: string;
  walletStep?: "wrap" | "approve";
  root?: Hex;
  startBlock?: string;
  hash?: Hex;
};
export type PrivateAccount = { version: 1; seed: Hex };
export function parsePrivateAmount(value: string, decimals: number): bigint {
  const amount = value.trim();
  if (amount.length > 80 || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(amount))
    throw new Error("Enter a valid amount.");
  if ((amount.split(".")[1]?.length ?? 0) > decimals)
    throw new Error(`Enter an amount with at most ${decimals} decimal places.`);
  const units = parseUnits(amount, decimals);
  if (units <= 0n || units >= 2n ** 128n)
    throw new Error("Enter a valid amount.");
  return units;
}
export const rpc = createPublicClient({
  chain: monad,
  transport: http("https://rpc.monad.xyz", { timeout: 15_000, retryCount: 1 }),
});
let initialized:
  Promise<typeof import("@monlipay/anoma-integration")> | undefined;
export function privateSdk() {
  return (initialized ??= import("@monlipay/anoma-integration")
    .then(async (sdk) => {
      await sdk.initSdk();
      return sdk;
    })
    .catch(() => {
      initialized = undefined;
      throw new Error(
        "Private payments could not load. Check your connection and retry.",
      );
    }));
}
export async function privateEngine() {
  const sdk = await privateSdk(),
    client = new sdk.AnomaClient(sdk.reference);
  const chain = await client.configuration();
  if ((await rpc.getChainId()) !== 143)
    throw new Error("Private payments require Monad mainnet.");
  const stopped = await rpc.readContract({
    address: chain.protocolAdapterAddress,
    abi: parseAbi(["function isEmergencyStopped() view returns (bool)"]),
    functionName: "isEmergencyStopped",
  });
  if (stopped)
    throw new Error(
      "The private payment protocol is paused. Funding is unavailable.",
    );
  return { sdk, client, chain };
}
export type PrivateEngine = Awaited<ReturnType<typeof privateEngine>>;
export function freshPrivateAccount(): PrivateAccount {
  return {
    version: 1,
    seed: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
  };
}
export function parsePrivateAccount(value: unknown): PrivateAccount {
  const v = value as PrivateAccount;
  if (!v || v.version !== 1 || !/^0x[a-f0-9]{64}$/.test(v.seed))
    throw new Error("Private account could not be opened.");
  return v;
}
export function parsePrivateOperation(
  value: unknown,
  id: string,
): PrivateOperation {
  const v = value as PrivateOperation;
  if (
    !v ||
    v.version !== 1 ||
    v.id !== id ||
    !/^[a-f0-9]{32}$/.test(id) ||
    !["deposit", "link", "withdraw"].includes(v.kind) ||
    ![
      "draft",
      "wallet",
      "submitting",
      "pending",
      "complete",
      "failed",
    ].includes(v.status) ||
    !/^0x[a-f0-9]{40}$/i.test(v.token) ||
    !/^[1-9][0-9]{0,38}$/.test(v.amount) ||
    BigInt(v.amount) >= 2n ** 128n ||
    !Number.isSafeInteger(v.createdAt) ||
    v.createdAt <= 0
  )
    throw new Error("Invalid saved private payment.");
  if (v.kind === "link" && !/^0x[a-f0-9]{64}$/.test(v.seed ?? ""))
    throw new Error("Private claim key is missing.");
  if (
    [v.root, v.hash, v.wrapHash, v.approvalHash].some(
      (x) => x !== undefined && !/^0x[a-f0-9]{64}$/i.test(x),
    )
  )
    throw new Error("Invalid saved payment proof.");
  if (
    (v.fee !== undefined && !/^(0|[1-9][0-9]{0,38})$/.test(v.fee)) ||
    (v.startBlock !== undefined && !/^[0-9]{1,20}$/.test(v.startBlock)) ||
    (v.requestId !== undefined &&
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        v.requestId,
      )) ||
    (v.recipient !== undefined && !/^0x[a-f0-9]{40}$/i.test(v.recipient)) ||
    (v.native !== undefined && typeof v.native !== "boolean") ||
    (v.walletStep !== undefined && !["wrap", "approve"].includes(v.walletStep))
  )
    throw new Error("Invalid saved private payment.");
  return v;
}
export function operation(
  kind: PrivateOperation["kind"],
  token: Address,
  amount: bigint,
): PrivateOperation {
  if (amount <= 0n || amount >= 2n ** 128n)
    throw new Error("Enter a valid amount.");
  return {
    version: 1,
    id: bytesToHex(crypto.getRandomValues(new Uint8Array(16))).slice(2),
    kind,
    token,
    amount: amount.toString(),
    status: "draft",
    createdAt: Date.now(),
  };
}
export function senderKeyring(engine: PrivateEngine, account: PrivateAccount) {
  return engine.sdk.createUserKeyringFromIkm(
    Uint8Array.from(hexToBytes(account.seed)),
    "monlipay:anoma:sender:v1:143",
  );
}
export async function privateResources(
  engine: PrivateEngine,
  keyring: UserKeyring,
  token: PrivateToken,
): Promise<PrivateResource[]> {
  return engine.sdk.confirmedResources({
    response: await engine.client.discover(keyring),
    keyring,
    chain: engine.chain,
    token,
    rpc,
  });
}
export async function quotePrivate(
  engine: PrivateEngine,
  keyring: UserKeyring,
  resources: PrivateResource[],
  token: PrivateToken,
  target: { payAddress: string; amount: bigint } | { recipient: Address },
): Promise<{ draft: Draft; fee: bigint; amount: bigint }> {
  const balance = resources.reduce((sum, r) => sum + r.quantity, 0n);
  let fee = 1n;
  for (let pass = 0; pass < 4; pass++) {
    const amount = "amount" in target ? target.amount : balance - fee;
    if (amount <= 0n || amount + fee > balance)
      throw new Error(
        "The private balance does not cover this amount and its fee. Add funds or choose a smaller amount.",
      );
    const args = {
      keyring,
      resources,
      chain: engine.chain,
      token,
      amount,
      fee,
    };
    const draft =
      "payAddress" in target
        ? await engine.sdk.preparePrivateSend({
            ...args,
            payAddress: target.payAddress,
          })
        : await engine.sdk.prepareWithdrawal({
            ...args,
            recipient: target.recipient,
          });
    const quote = await engine.client.estimateFee(
      draft.parameters,
      token.symbol,
    );
    if (quote.total === fee) return { draft, fee, amount };
    fee = quote.total;
  }
  throw new Error("The fee changed while quoting. Review a fresh quote.");
}
export async function checkPrivateOperation(
  engine: PrivateEngine,
  op: PrivateOperation,
): Promise<PrivateOperation> {
  if (op.status === "complete" || op.status === "failed") return op;
  if (!op.root || !op.startBlock) return op;
  if (op.requestId) {
    const result = await engine.client.transactionResult(op.requestId);
    if (result.status === "failed") return { ...op, status: "failed" };
    if (result.status === "completed") {
      const receipt = await engine.client.verifyCompletion(
        op.requestId,
        rpc,
        engine.chain.protocolAdapterAddress,
        op.root,
      );
      return { ...op, status: "complete", hash: receipt.transactionHash };
    }
    return { ...op, status: "pending" };
  }
  // A response can disappear after submission. Search the recorded action;
  // never send that spend again just because its request ID was not received.
  const latest = await rpc.getBlockNumber(),
    from = BigInt(op.startBlock);
  if (latest - from > 50_000n)
    throw new Error(
      "This payment needs a longer onchain check. Keep its saved record; do not submit it again.",
    );
  const event = parseAbi([
    "event ActionExecuted(bytes32 actionTreeRoot, uint256 actionTagCount)",
  ])[0];
  for (let start = from; start <= latest; start += 2000n) {
    const logs = await rpc.getLogs({
      address: engine.chain.protocolAdapterAddress,
      event,
      fromBlock: start,
      toBlock: start + 1999n < latest ? start + 1999n : latest,
    });
    const match = logs.find((l) => l.args.actionTreeRoot === op.root);
    if (match) {
      const receipt = await rpc.getTransactionReceipt({
        hash: match.transactionHash,
      });
      engine.sdk.confirmAction(
        receipt,
        engine.chain.protocolAdapterAddress,
        op.root,
      );
      return { ...op, status: "complete", hash: receipt.transactionHash };
    }
  }
  return op;
}
export function tokenFor(chain: Configuration, address: string) {
  const token = chain.tokens.find(
    (t) => t.address.toLowerCase() === address.toLowerCase(),
  );
  if (!token)
    throw new Error("This token is not supported for private payments.");
  return token;
}
export function privateError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("Anoma service could not be reached"))
    return "The private payment service could not be reached. Check your connection and saved activity before retrying.";
  if (
    /^(Private payments|Private account|The private balance|Encrypted payment|This payment|Open your|Saved private|This token|The fee|Enter a|The private payment protocol|This private payment|The transaction|The wallet|Funding |The link|Anoma service returned HTTP)/.test(
      message,
    )
  )
    return message;
  return "The payment did not finish. Check your wallet and saved activity before trying again.";
}
