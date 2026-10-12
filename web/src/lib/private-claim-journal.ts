import { sealPrivateRecord, openPrivateRecord } from "./private-record-crypto";
import { parsePrivateRecord } from "./private-record-format";
import {
  parsePrivateOperation,
  type PrivateOperation,
} from "./private-payment";
import { bytesToHex } from "viem";
export async function claimJournal(
  seed: Uint8Array,
  token: string,
  origin: string,
) {
  const bytes = Uint8Array.from(seed),
    encoder = new TextEncoder();
  const material = await crypto.subtle.importKey("raw", bytes, "HKDF", false, [
    "deriveKey",
  ]);
  const key = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: encoder.encode("monlipay-private-claim-journal-v1"),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const id = bytesToHex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  ).slice(2, 34);
  bytes.fill(0);
  const scope = { owner: origin, chainId: 143, contract: token.toLowerCase() };
  const storageKey = `monlipay-private-claim:${id}`;
  return {
    async read() {
      const value = localStorage.getItem(storageKey);
      if (!value) return null;
      const record = parsePrivateRecord(JSON.parse(value));
      if (record.id !== id)
        throw new Error("Private claim recovery does not match.");
      const op = await openPrivateRecord(key, scope, id, record);
      return parsePrivateOperation(op, (op as PrivateOperation).id);
    },
    async save(op: PrivateOperation) {
      const previous = localStorage.getItem(storageKey);
      const revision = previous
        ? parsePrivateRecord(JSON.parse(previous)).revision + 1
        : 1;
      const record = await sealPrivateRecord(key, scope, id, id, revision, op);
      localStorage.setItem(storageKey, JSON.stringify(record));
    },
  };
}
