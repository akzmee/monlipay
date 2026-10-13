export type GroupActivityKind = "funded" | "requested" | "ready" | "claimed" | "refunded";

export interface GroupActivityEvent {
  id: string;
  kind: GroupActivityKind;
  transactionHash: `0x${string}`;
  blockNumber: number;
  timestamp: number | null;
  address: `0x${string}`;
  amount: string | null;
}

export interface GroupActivityResponse {
  source: "envio";
  events: GroupActivityEvent[];
  indexedBlock: number;
  complete: boolean;
}
