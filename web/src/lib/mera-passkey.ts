import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  isMeraError,
  type WebAuthnClient,
} from "@category-labs/mera";

const base64url = (value: Uint8Array) =>
  btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

type PrfResults = {
  prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
};

function validate(
  value: Credential | null,
  challenge: Uint8Array,
  type: "webauthn.create" | "webauthn.get",
) {
  if (!value || value.type !== "public-key")
    throw new Error("No passkey was selected. Try again.");
  const credential = value as PublicKeyCredential;
  const clientData = JSON.parse(
    new TextDecoder().decode(credential.response.clientDataJSON),
  );
  if (
    clientData.type !== type ||
    clientData.challenge !== base64url(challenge) ||
    clientData.origin !== location.origin ||
    clientData.crossOrigin === true
  )
    throw new Error("Passkey verification did not match this site. Please retry.");
  return credential;
}

/** Keep site/credential checks and cancellation around Mera's PRF ceremonies. */
function browserClient(signal?: AbortSignal): WebAuthnClient {
  return {
    async createCredential(request) {
      const credential = validate(
        await navigator.credentials.create({
          publicKey: {
            challenge: request.challenge,
            rp: request.rp,
            user: request.user,
            pubKeyCredParams: request.algorithms.map((alg) => ({ type: "public-key", alg })),
            authenticatorSelection: {
              residentKey: "required",
              requireResidentKey: true,
              userVerification: "required",
            },
            attestation: "none",
            timeout: request.timeout,
            // Request PRF support. Mera then reads it back before any data is saved.
            extensions: { prf: {} } as AuthenticationExtensionsClientInputs,
          },
          signal,
        }),
        request.challenge,
        "webauthn.create",
      );
      const response = credential.response as AuthenticatorAttestationResponse;
      return {
        credentialId: new Uint8Array(credential.rawId),
        transports: response.getTransports?.(),
        prfEnabled: (credential.getClientExtensionResults() as PrfResults).prf?.enabled === true,
      };
    },
    async getCredential(request) {
      const allowed = request.allowCredential;
      const credential = validate(
        await navigator.credentials.get({
          publicKey: {
            challenge: request.challenge,
            rpId: request.rpId,
            timeout: request.timeout,
            userVerification: "required",
            allowCredentials: allowed
              ? [{ type: "public-key", id: allowed.credentialId }]
              : undefined,
            extensions: {
              prf: { eval: { first: request.prfSalt } },
            } as AuthenticationExtensionsClientInputs,
          },
          signal,
        }),
        request.challenge,
        "webauthn.get",
      );
      if (allowed && base64url(new Uint8Array(credential.rawId)) !== base64url(allowed.credentialId))
        throw new Error("Choose the passkey used to save these links.");
      const data = new Uint8Array(
        (credential.response as AuthenticatorAssertionResponse).authenticatorData,
      );
      if (data.length < 37 || !(data[32] & 0x04))
        throw new Error("Verify with your device screen lock to open saved links.");
      const result = (credential.getClientExtensionResults() as PrfResults).prf?.results?.first;
      return {
        credentialId: new Uint8Array(credential.rawId),
        prfOutput: result ? new Uint8Array(result) : undefined,
      };
    },
  };
}

function failure(error: unknown): never {
  if (isMeraError(error)) {
    if (error.code === "PRF_UNAVAILABLE")
      throw new Error(
        "This passkey provider cannot encrypt saved links (PRF). Try a supported password manager or security key. Nothing has been saved or replaced.",
      );
    if (error.cause) return failure(error.cause);
  }
  if (error instanceof DOMException && ["NotAllowedError", "AbortError"].includes(error.name))
    throw new Error("Passkey request cancelled or timed out. Your saved links are unchanged. Try again when ready.");
  throw error;
}

export async function createRecordPasskey(
  user: { name: string; displayName: string },
  salt: Uint8Array,
  signal?: AbortSignal,
) {
  try {
    return await createPasskeyWithPrfOutput({
      rp: { id: location.hostname, name: "MonliPay" },
      user,
      prfSalt: salt,
      timeout: 60_000,
      webAuthnClient: browserClient(signal),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function readRecordPasskey(
  credentialId: string,
  salt: Uint8Array,
  signal?: AbortSignal,
) {
  try {
    return await getPasskeyPrfOutput({
      rpId: location.hostname,
      credential: { credentialId },
      // Existing records keep their original namespace, rather than Mera's default salt.
      prfSalt: salt,
      timeout: 60_000,
      webAuthnClient: browserClient(signal),
    });
  } catch (error) {
    return failure(error);
  }
}
