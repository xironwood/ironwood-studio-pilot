import assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { estimate, readFees } from './fees.mjs';
import { gitOutput } from './git.mjs';

const origin = 'https://ironwood-studio-pilot.pages.dev';
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function verifyPages(fees, commit, version, rates, cost) {
  assert.deepEqual(version, { commit, ...fees, estimate: estimate(fees) }, 'The deployed fee record or commit differs.');
  assert.ok(rates.includes('<th scope="row">Intake visit</th><td data-intake-fee="' + fees.intakeFee + '">' +
    money.format(fees.intakeFee) + '</td>'), 'The visible intake fee differs.');
  const total = estimate(fees);
  assert.ok(cost.includes('<th scope="row">Estimated total</th><td data-estimate="' + total + '">' +
    money.format(total) + '</td>'), 'The visible 12-week estimate differs.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [commit] = process.argv.slice(2);
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('Supply the full commit recorded by the successful Pages deployment.');
  const root = dirname(fileURLToPath(import.meta.url));
  const fees = readFees(gitOutput(root, 'show', commit + ':fees.json'));
  async function get(path) {
    const url = new URL(path, origin);
    url.searchParams.set('verify', commit);
    const response = await fetch(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error('HTTP ' + response.status + ' on ' + path);
    return response.text();
  }
  const [version, rates, cost] = await Promise.all([get('/studio-version.json'), get('/'), get('/good-faith-estimate/')]);
  verifyPages(fees, commit, JSON.parse(version), rates, cost);
  console.log('Verified ' + commit + ' on ' + origin + ', including the fee and estimate.');
}
