import { open, rename, mkdir, lstat, realpath, unlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Operator-only smoke-test recovery, not product storage. Never place this
 * directory under the repo, a web root, or a shared directory. Contains keys. */
export async function openPilotJournal(directory) {
  const dir = resolve(directory);
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  if (dir === repo || dir.startsWith(repo + '/')) throw new Error('Pilot recovery must be stored outside the repository.');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const stat = await lstat(dir);
  if (stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid())
    throw new Error('Pilot recovery directory must be private (0700), owned by this process, and not a symlink.');
  if (await realpath(dir) !== dir) throw new Error('Pilot recovery path must not contain symlinks.');
  const lockPath = `${dir}/running.lock`, path = `${dir}/journal.json`;
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch { throw new Error('Another pilot may be running. Review the private lock before resuming.'); }
  await lock.writeFile(String(process.pid)); await lock.sync();
  const close = async () => { await lock.close(); await unlink(lockPath); };
  return {
    async read() {
      let file;
      try {
        const stat = await lstat(path);
        if (stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid()) throw new Error('Unsafe pilot recovery file.');
        file = await open(path, 'r');
        return JSON.parse(await file.readFile('utf8'));
      } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      finally { await file?.close(); }
    },
    async save(value) {
      const tmp = `${path}.${process.pid}.tmp`, file = await open(tmp, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v)); await file.sync(); }
      finally { await file.close(); }
      await rename(tmp, path);
      const folder = await open(dir, 'r');
      try { await folder.sync(); } finally { await folder.close(); }
    },
    close,
  };
}

export const PILOT = Object.freeze({
  owner: '0xd16385B936BDC12BEc3f363521513419C0cED249', chainId: 143,
  deposit: 1_000_000_000_000_000_000n,
  payment: 500_000_000_000_000_000n,
  gasCap: 100_000_000_000_000_000n,
  protocolFeeCap: 350_000_000_000_000_000n,
});
export function reserveFee(current, amount, cap) {
  if (typeof amount !== 'bigint' || amount < 0n || current < 0n || current + amount > cap)
    throw new Error('Pilot budget exceeded. No further transaction authorized.');
  return current + amount;
}
