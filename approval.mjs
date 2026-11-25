import { createPublicKey, verify } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readFees, scope, validIntakeFee } from './fees.mjs';
import { gitOutput } from './git.mjs';

const commitId = /^[a-f0-9]{40}$/;
const approvalId = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const lifetime = 24 * 60 * 60 * 1000;

export function readApproval(payload, signature, publicKey, now = Date.now()) {
  if (typeof payload !== 'string' || payload.length > 2048 || typeof signature !== 'string' || signature.length !== 86) {
    throw new Error('A signed intake approval is required.');
  }
  const bytes = Buffer.from(payload, 'base64url');
  const signed = Buffer.from(signature, 'base64url');
  const key = createPublicKey(publicKey);
  if (key.asymmetricKeyType !== 'ed25519' || bytes.toString('base64url') !== payload ||
      signed.toString('base64url') !== signature || !verify(null, bytes, key, signed)) {
    throw new Error('The approval signature is invalid.');
  }
  const receipt = JSON.parse(bytes);
  if (!receipt || Object.keys(receipt).sort().join(',') !== 'approved,base,expires,id,next,previous,scope' ||
      receipt.scope !== scope || typeof receipt.id !== 'string' || !approvalId.test(receipt.id) ||
      typeof receipt.base !== 'string' || !commitId.test(receipt.base) ||
      !validIntakeFee(receipt.previous) || !validIntakeFee(receipt.next) || receipt.previous === receipt.next) {
    throw new Error('The approval must identify an exact intake-fee change on the pilot website.');
  }
  if (!Number.isSafeInteger(receipt.approved) || receipt.approved > now ||
      receipt.expires !== receipt.approved + lifetime || now >= receipt.expires) {
    throw new Error('The approval is expired or has an invalid date.');
  }
  return receipt;
}

export function approvedFile(directory, base, receipt) {
  if (!commitId.test(base) || base !== receipt.base) throw new Error('The approved base is stale.');
  const fees = readFees(gitOutput(directory, 'show', base + ':fees.json'));
  if (fees.intakeFee !== receipt.previous) throw new Error('The previous intake fee changed.');
  return JSON.stringify({ ...fees, intakeFee: receipt.next }, null, 2) + '\n';
}

export function verifyCandidate(directory, base, candidate, receipt) {
  const expected = approvedFile(directory, base, receipt);
  const git = (...args) => gitOutput(directory, ...args);
  if (!commitId.test(candidate) || git('rev-list', '--parents', '-n1', candidate).trim() !== candidate + ' ' + base) {
    throw new Error('The candidate must be one commit directly on the approved base.');
  }
  const changes = git('diff', '--raw', '--no-ext-diff', '--no-renames', '-z', base, candidate).split('\0');
  if (changes.length !== 3 || !/^:100644 100644 [a-f0-9]+ [a-f0-9]+ M$/.test(changes[0]) ||
      changes[1] !== 'fees.json' || changes[2] !== '' || git('show', candidate + ':fees.json') !== expected) {
    throw new Error('The candidate must contain only the approved change to fees.json.');
  }
  const id = git('show', '-s', '--format=%(trailers:key=Studio-Approval,valueonly,separator=%x20)', candidate).trim();
  if (id !== receipt.id) throw new Error('The commit does not match the approval receipt.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [mode, base, candidate] = process.argv.slice(2);
  const { STUDIO_PAYLOAD, STUDIO_SIGNATURE, STUDIO_PUBLIC_KEY, STUDIO_ID } = process.env;
  const receipt = readApproval(STUDIO_PAYLOAD, STUDIO_SIGNATURE, STUDIO_PUBLIC_KEY);
  if (receipt.id !== STUDIO_ID) throw new Error('The requested approval ID does not match the signature.');
  if (mode === 'prepare') writeFileSync('fees.json', approvedFile(process.cwd(), base, receipt));
  else if (mode === 'verify') verifyCandidate(process.cwd(), base, candidate, receipt);
  else throw new Error('Expected prepare or verify.');
}
