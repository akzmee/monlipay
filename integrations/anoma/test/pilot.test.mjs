import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, chmod, lstat, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openPilotJournal, reserveFee, PILOT } from '../src/pilot-state.mjs';

test('pilot refuses to execute without an explicit budget and signer', () => {
  const result = spawnSync(process.execPath, ['scripts/pilot.mjs'], { cwd: new URL('..', import.meta.url), env: { PATH: process.env.PATH }, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout), { step: 'preflight', status: 'stopped; inspect recovery state before retrying' });
  assert.equal(result.stdout.includes('privateKey'), false);
});
test('journal survives reopen, uses private permissions, and excludes concurrent runs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'monlipay-anoma-journal-test-'));
  let journal;
  try {
    journal = await openPilotJournal(directory);
    await journal.save({ version: 1, fixture: 'synthetic unfunded recovery', amount: 5n, steps: { deposit: { attempted: true } } });
    assert.equal((await lstat(join(directory, 'journal.json'))).mode & 0o077, 0);
    await assert.rejects(openPilotJournal(directory), /Another pilot/);
    await journal.close(); journal = await openPilotJournal(directory);
    const restored = await journal.read();
    assert.equal(restored.amount, '5');
    assert.equal(restored.steps.deposit.attempted, true);
    await journal.save({ ...restored, requestId: 'recorded-after-submit' });
    assert.equal(JSON.parse(await readFile(join(directory, 'journal.json'), 'utf8')).requestId, 'recorded-after-submit');
    await journal.close(); journal = undefined;
    await chmod(directory, 0o755);
    await assert.rejects(openPilotJournal(directory), /private/);
  } finally { await journal?.close(); await rm(directory, { recursive: true, force: true }); }
});
test('fee reservation rejects negative values and both kinds of budget overruns', () => {
  assert.equal(reserveFee(0n, 1n, PILOT.gasCap), 1n);
  assert.throws(() => reserveFee(PILOT.gasCap, 1n, PILOT.gasCap));
  assert.throws(() => reserveFee(0n, -1n, PILOT.protocolFeeCap));
  assert.throws(() => reserveFee(PILOT.protocolFeeCap - 1n, 2n, PILOT.protocolFeeCap));
  assert.equal(PILOT.deposit + PILOT.gasCap, 1_100_000_000_000_000_000n);
});
