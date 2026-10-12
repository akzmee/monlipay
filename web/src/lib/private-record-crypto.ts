import { bytesToHex, hexToBytes } from "viem";
import {
  parsePrivateRecord,
  privateRecordId,
  type PrivateRecord,
  type PrivateRecordKind,
} from "./private-record-format";
import type { BackupScope } from "./link-backup-format";
const encoder = new TextEncoder();
const aad = (
  scope: BackupScope,
  vault: string,
  id: string,
  kind: PrivateRecordKind,
  revision: number,
) =>
  encoder.encode(
    JSON.stringify([
      "monlipay-private-payment",
      1,
      scope.owner.toLowerCase(),
      scope.chainId,
      scope.contract.toLowerCase(),
      vault,
      id,
      kind,
      revision,
    ]),
  );
export async function sealPrivateRecord(
  key: CryptoKey,
  scope: BackupScope,
  vault: string,
  id: string,
  revision: number,
  value: unknown,
): Promise<PrivateRecord> {
  privateRecordId(id);
  const kind = id === "sender-v1" ? "account" : "operation";
  const data = encoder.encode(JSON.stringify(value));
  if (data.length > 49152)
    throw new Error("Private payment record is too large.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  try {
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: aad(scope, vault, id, kind, revision),
      },
      key,
      data,
    );
    return parsePrivateRecord({
      id,
      kind,
      revision,
      iv: bytesToHex(iv).slice(2),
      ciphertext: bytesToHex(new Uint8Array(ciphertext)).slice(2),
    });
  } finally {
    data.fill(0);
  }
}
export async function openPrivateRecord(
  key: CryptoKey,
  scope: BackupScope,
  vault: string,
  input: PrivateRecord,
): Promise<unknown> {
  const r = parsePrivateRecord(input);
  const data = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: Uint8Array.from(hexToBytes(`0x${r.iv}`)),
        additionalData: aad(scope, vault, r.id, r.kind, r.revision),
      },
      key,
      Uint8Array.from(hexToBytes(`0x${r.ciphertext}`)),
    ),
  );
  try {
    return JSON.parse(new TextDecoder().decode(data));
  } finally {
    data.fill(0);
  }
}
