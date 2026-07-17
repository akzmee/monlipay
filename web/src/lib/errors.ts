/**
 * Translate raw wallet/transaction errors into short, human-friendly messages.
 *
 * Wallets and viem produce verbose error objects that include calldata,
 * contract addresses, encoded function args, and RPC details. Surfacing
 * these directly is confusing for non-technical users. This module inspects
 * common error shapes and returns a concise, actionable message.
 */

/**
 * Convert any caught value into a user-friendly string.
 * Returns a short message (<= ~80 chars) suitable for inline UI display.
 *
 * @param chainName — the network name to display in "wrong network" messages
 *                   (defaults to "Monad Testnet" for backwards compat).
 *                   Callers should pass `monadChain.name` from `@/config/chain`.
 */
export function formatUserError(
  err: unknown,
  fallback: string,
  chainName: string = "Monad Testnet",
): string {
  if (!err) return fallback;

  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";

  if (!message) return fallback;

  const lower = message.toLowerCase();

  // User rejected the transaction (most common case)
  if (
    lower.includes("user rejected") ||
    lower.includes("user denied") ||
    lower.includes("denied transaction") ||
    lower.includes("rejected the request") ||
    lower.includes("action_rejected") ||
    lower.includes("usercancel") ||
    lower.includes("user disapproved")
  ) {
    return "Transaction cancelled. You can try again anytime.";
  }

  // Insufficient funds
  if (
    lower.includes("insufficient funds") ||
    lower.includes("insufficient balance") ||
    lower.includes("gas required exceeds allowance")
  ) {
    return "Not enough balance to cover this transaction and gas fees.";
  }

  // Chain mismatch / wrong network
  if (
    lower.includes("wrong chain") ||
    lower.includes("chain mismatch") ||
    lower.includes("unrecognized chain") ||
    lower.includes("switch chain")
  ) {
    return `Wrong network. Please switch to ${chainName} in your wallet.`;
  }

  // Contract reverted with a reason string (viem includes "Reason: ...")
  const reasonMatch = message.match(/reason:\s*["']?([^"'\n]+)["']?/i);
  if (reasonMatch) {
    return `Transaction failed: ${reasonMatch[1].trim()}`;
  }

  // Execution reverted (generic) without decoded reason
  if (lower.includes("execution reverted") || lower.includes("transaction reverted")) {
    return "Transaction failed on-chain. Please try again.";
  }

  // Gas / fee estimation failures
  if (
    lower.includes("gas estimate failed") ||
    lower.includes("fee cap too low") ||
    lower.includes("max fee per gas less than")
  ) {
    return "Couldn't estimate gas. Try increasing your gas fee in the wallet.";
  }

  // Network / RPC issues
  if (
    lower.includes("network request failed") ||
    lower.includes("rpc error") ||
    lower.includes("could not detect network") ||
    lower.includes("socket hang up") ||
    lower.includes("timeout")
  ) {
    return "Network issue. Check your connection and try again.";
  }

  // Nonce too low
  if (lower.includes("nonce too low")) {
    return "Transaction already submitted. Try again in a moment.";
  }

  // Wallet not connected
  if (lower.includes("wallet not connected") || lower.includes("connector not found")) {
    return "Please connect your wallet first.";
  }

  // Fallback: if the raw message is short and doesn't look like hex soup,
  // show it as-is. Otherwise use the provided fallback.
  const isHexHeavy = /(0x[0-9a-f]{8,})/i.test(message);
  const isTooLong = message.length > 120;
  if (isHexHeavy || isTooLong) {
    return fallback;
  }

  return message;
}
