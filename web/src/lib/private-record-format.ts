export type PrivateRecordKind = "account" | "operation";
export type PrivateRecord = {
  id: string;
  kind: PrivateRecordKind;
  revision: number;
  iv: string;
  ciphertext: string;
};
export type PrivateRecordSummary = Pick<
  PrivateRecord,
  "id" | "kind" | "revision"
> & { createdAt: number };
export function privateRecordId(id: unknown): asserts id is string {
  if (
    id !== "sender-v1" &&
    (typeof id !== "string" || !/^[a-f0-9]{32}$/.test(id))
  )
    throw new Error("Invalid private record ID.");
}
export function parsePrivateRecord(value: unknown): PrivateRecord {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid private record.");
  const r = value as Record<string, unknown>;
  if (Object.keys(r).sort().join(",") !== "ciphertext,id,iv,kind,revision")
    throw new Error("Invalid private record fields.");
  privateRecordId(r.id);
  if (
    r.kind !== (r.id === "sender-v1" ? "account" : "operation") ||
    !Number.isSafeInteger(r.revision) ||
    Number(r.revision) < 1 ||
    Number(r.revision) > 200 ||
    typeof r.iv !== "string" ||
    !/^[a-f0-9]{24}$/.test(r.iv) ||
    typeof r.ciphertext !== "string" ||
    !/^(?:[a-f0-9]{2}){17,49168}$/.test(r.ciphertext)
  )
    throw new Error("Invalid encrypted private record.");
  return r as PrivateRecord;
}
