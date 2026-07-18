/**
 * LinkVault ABI for indexing.
 *
 * Source of truth: contracts/src/LinkVault.sol (matches mainnet deployment
 * 0xd7846DC6Fd8c159cF59957c532173d828f7B5BBC and testnet deployment
 * 0x90978783cb701AEe7896975B43ecd37e0B4819DC).
 *
 * This file is intentionally a superset of web/src/lib/abi.ts — it includes
 * the RefundFailed event that the frontend doesn't need to listen for, but
 * the indexer must index so that "refund failed" deposits are surfaced.
 */
export const linkVaultAbi = [
  {
    type: "event",
    name: "LinkCreated",
    inputs: [
      { name: "depositId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "sender", type: "address", indexed: true, internalType: "address" },
      { name: "token", type: "address", indexed: true, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "claimKey", type: "address", indexed: false, internalType: "address" },
      { name: "expiry", type: "uint40", indexed: false, internalType: "uint40" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "LinkClaimed",
    inputs: [
      { name: "depositId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "recipient", type: "address", indexed: true, internalType: "address" },
      { name: "token", type: "address", indexed: true, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "LinkRefunded",
    inputs: [
      { name: "depositId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "sender", type: "address", indexed: true, internalType: "address" },
      { name: "token", type: "address", indexed: true, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RefundFailed",
    inputs: [
      { name: "depositId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "sender", type: "address", indexed: true, internalType: "address" },
      { name: "token", type: "address", indexed: true, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
] as const;
