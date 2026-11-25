import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readApproval, verifyCandidate } from './approval.mjs';
import { build } from './build.mjs';
import { readFees, scope, validIntakeFee } from './fees.mjs';
import { gitOutput } from './git.mjs';
import { verifyPages } from './verify-live.mjs';

const candidate = 'b'.repeat(40);

test('fee and estimate are verified against the visible pages and the deployed commit', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'ironwood-studio-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const fees = readFees('{"intakeFee":105,"individualFee":175}');
  await build(dir, fees, candidate);
  const rates = await readFile(join(dir, 'index.html'), 'utf8');
  const cost = await readFile(join(dir, 'good-faith-estimate', 'index.html'), 'utf8');
  const version = JSON.parse(await readFile(join(dir, 'studio-version.json'), 'utf8'));
  assert.equal(version.estimate, 2030);
  verifyPages(fees, candidate, version, rates, cost);
  assert.throws(() => verifyPages(fees, 'a'.repeat(40), version, rates, cost));
  assert.throws(() => verifyPages(fees, candidate, version, rates.replace('$105', '$100'), cost));
  assert.throws(() => verifyPages(fees, candidate, version, rates, cost.replace('$2,030', '$2,025')));
});

test('only whole $5 intake steps in the pilot range are permitted', () => {
  for (const value of [0, 105, 500]) assert.equal(validIntakeFee(value), true);
  for (const value of [-5, 104, 105.5, 505, '105', null]) assert.equal(validIntakeFee(value), false);
});

test('a signed fee can be prepared and verified on its exact Git commit', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'ironwood-studio-history-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const git = (...args) => gitOutput(dir, ...args).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Pilot test');
  git('config', 'user.email', 'studio-test@example.invalid');
  git('config', 'core.hooksPath', '/dev/null');
  git('config', 'commit.gpgSign', 'false');
  const feesPath = join(dir, 'fees.json');
  const previous = 100;
  const next = 105;
  const formatFees = (intakeFee, individualFee) => JSON.stringify({ intakeFee, individualFee }, null, 2) + '\n';
  await writeFile(feesPath, formatFees(previous, 175));
  git('add', 'fees.json');
  git('commit', '-q', '-m', 'Fictional fee baseline');
  const base = git('rev-parse', 'HEAD');
  const approved = Date.now();
  const receipt = { scope, id: randomUUID(), base, previous, next, approved, expires: approved + 86_400_000 };
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  const data = Buffer.from(JSON.stringify(receipt));
  const signature = sign(null, data, privateKey).toString('base64url');
  assert.deepEqual(readApproval(data.toString('base64url'), signature, pem, approved), receipt);
  assert.throws(() => readApproval(data.toString('base64url'), signature, pem, receipt.expires));
  assert.throws(() => readApproval(Buffer.from(JSON.stringify({ ...receipt, next: 110 })).toString('base64url'), signature, pem, approved));

  const cli = fileURLToPath(new URL('./approval.mjs', import.meta.url));
  const env = { ...process.env, STUDIO_ID: receipt.id, STUDIO_PAYLOAD: data.toString('base64url'),
    STUDIO_SIGNATURE: signature, STUDIO_PUBLIC_KEY: pem };
  const runApproval = (...args) => execFileSync(process.execPath, [cli, ...args], { cwd: dir, env, stdio: 'inherit' });
  runApproval('prepare', base);
  assert.equal(await readFile(feesPath, 'utf8'), formatFees(next, 175));
  git('add', 'fees.json');
  git('commit', '-q', '-m', 'Apply the approved fee', '-m', 'Studio-Approval: ' + receipt.id);
  const valid = git('rev-parse', 'HEAD');
  runApproval('verify', base, valid);
  assert.throws(() => verifyCandidate(dir, valid, valid, receipt), /stale/);

  await writeFile(feesPath, formatFees(next, 180));
  git('commit', '-q', '-a', '--amend', '--no-edit');
  assert.throws(() => verifyCandidate(dir, base, git('rev-parse', 'HEAD'), receipt), /only the approved change/);
  await writeFile(feesPath, formatFees(next, 175));
  await writeFile(join(dir, 'other.txt'), 'Unrelated edit\n');
  git('add', 'fees.json', 'other.txt');
  git('commit', '-q', '--amend', '--no-edit');
  assert.throws(() => verifyCandidate(dir, base, git('rev-parse', 'HEAD'), receipt), /only the approved change/);
});
