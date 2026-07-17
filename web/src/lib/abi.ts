/**
 * LinkVault Contract ABI
 * Auto-extracted from Foundry compilation output.
 * Only includes functions the frontend actually calls.
 */

export const linkVaultAbi = [
  {
    type: "function",
    name: "createLink",
    inputs: [
      { name: "token", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
      { name: "claimKey", type: "address", internalType: "address" },
      { name: "expiry", type: "uint40", internalType: "uint40" },
    ],
    outputs: [{ name: "depositId", type: "uint256", internalType: "uint256" }],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "claim",
    inputs: [
      { name: "depositId", type: "uint256", internalType: "uint256" },
      { name: "recipient", type: "address", internalType: "address" },
      { name: "v", type: "uint8", internalType: "uint8" },
      { name: "r", type: "bytes32", internalType: "bytes32" },
      { name: "s", type: "bytes32", internalType: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "refund",
    inputs: [{ name: "depositId", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "autoRefund",
    inputs: [{ name: "depositId", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getDeposit",
    inputs: [{ name: "depositId", type: "uint256", internalType: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct LinkVault.Deposit",
        components: [
          { name: "sender", type: "address", internalType: "address" },
          { name: "token", type: "address", internalType: "address" },
          { name: "amount", type: "uint256", internalType: "uint256" },
          { name: "claimKey", type: "address", internalType: "address" },
          { name: "expiry", type: "uint40", internalType: "uint40" },
          { name: "claimed", type: "bool", internalType: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "exists",
    inputs: [{ name: "depositId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "computeClaimDigest",
    inputs: [
      { name: "depositId", type: "uint256", internalType: "uint256" },
      { name: "recipient", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nextDepositId",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
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
] as const;

/**
 * Minimal ERC-20 ABI for reading token metadata (name, symbol, decimals).
 * Used when a user enters a custom token contract address.
 */
export const erc20Abi = [
  {
    type: "function",
    name: "name",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
] as const;
