// Node-only bootstrap. The upstream browser SDK fetches its WASM through a file:
// URL in Node; Node's fetch does not implement that scheme. Serve only that exact
// installed WASM file during initialization, then restore the normal transport.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { initSdk } from '@anomaorg/anoma-app-sdk';

let initialization;
export function initNodeSdk() {
  return initialization ??= (async () => {
    const entry = createRequire(import.meta.url).resolve('@anomaorg/arm-bindings');
    const wasm = new URL('generated/web/wasm-bindgen/index_bg.wasm', pathToFileURL(entry));
    const original = globalThis.fetch;
    globalThis.fetch = async (input, options) => {
      if (String(input) === wasm.href)
        return new Response(await readFile(wasm), { headers: { 'Content-Type': 'application/wasm' } });
      return original(input, options);
    };
    try { await initSdk(); } finally { globalThis.fetch = original; }
  })().catch(error => { initialization = undefined; throw error; });
}
