import { createUserKeyringFromIkm, extractUserPublicKeys, encodePayAddress } from '@anomaorg/anoma-app-sdk';
import { isAddress } from 'viem';

const ORIGINS = new Set(['https://monlipay.xyz', 'http://localhost:3001', 'http://localhost:3010']);
const DOMAIN = 'monlipay:anoma:private-link:v1:143';
const TOKEN = /^0x[0-9a-f]{40}$/;
export function keyringForLink(seed) {
  if (!(seed instanceof Uint8Array) || seed.length !== 32) throw new Error('A private link needs a 32-byte random seed.');
  return createUserKeyringFromIkm(seed, DOMAIN);
}
export function newPrivateLink(token, origin = 'https://monlipay.xyz') {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  return { seed, url: encodePrivateLink(seed, token, origin), payAddress: encodePayAddress(extractUserPublicKeys(keyringForLink(seed))) };
}
export function encodePrivateLink(seed, token, origin = 'https://monlipay.xyz') {
  keyringForLink(seed);
  if (!ORIGINS.has(origin) || !isAddress(token)) throw new Error('Unsupported private-link destination.');
  const hex = Array.from(seed, x => x.toString(16).padStart(2, '0')).join('');
  // No depositor address, deposit transaction, or discovery key in the public URL.
  return `${origin}/claim/private#p=1.143.${token.toLowerCase()}.${hex}`;
}
export function decodePrivateLink(value) {
  if (typeof value !== 'string' || value.length > 300) throw new Error('Invalid private link.');
  const url = new URL(value);
  if (!ORIGINS.has(url.origin) || url.pathname !== '/claim/private' || url.search || url.username || url.password)
    throw new Error('Invalid private link.');
  const parts = /^#p=1\.143\.(0x[0-9a-f]{40})\.([0-9a-f]{64})$/.exec(url.hash);
  if (!parts || !TOKEN.test(parts[1])) throw new Error('Invalid private link.');
  return { chainId: 143, token: parts[1], seed: Uint8Array.from(parts[2].match(/../g), x => parseInt(x, 16)) };
}
