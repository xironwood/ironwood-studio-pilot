import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { estimate, followUpVisits, readFees } from './fees.mjs';
import { gitOutput } from './git.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${title} | Ironwood Studio pilot</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <header><a href="/">Ironwood Studio</a><span>Test website</span></header>
  <main><h1>${title}</h1>${content}</main>
  <footer>Fictional fees for testing the Studio publishing workflow.</footer>
</body>
</html>
`;
}

export async function build(output, fees, commit) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('A full source commit is required.');
  const intake = money.format(fees.intakeFee);
  const individual = money.format(fees.individualFee);
  const total = money.format(estimate(fees));
  await mkdir(join(output, 'good-faith-estimate'), { recursive: true });
  const rates = page('Practice fees', `
    <table>
      <caption>Self-pay rates</caption>
      <tbody>
        <tr><th scope="row">Intake visit</th><td data-intake-fee="${fees.intakeFee}">${intake}</td></tr>
        <tr><th scope="row">Individual visit</th><td>${individual}</td></tr>
      </tbody>
    </table>
    <p><a href="/good-faith-estimate/">See the 12-week estimate <span aria-hidden="true">→</span></a></p>`);
  const example = page('12-week estimate', `
    <p>This example includes one intake visit and ${followUpVisits} weekly follow-up visits.</p>
    <table>
      <caption>Example cost for 12 visits</caption>
      <tbody>
        <tr><th scope="row">1 intake at ${intake}</th><td>${intake}</td></tr>
        <tr><th scope="row">${followUpVisits} visits at ${individual}</th><td>${money.format(fees.individualFee * followUpVisits)}</td></tr>
      </tbody>
      <tfoot><tr><th scope="row">Estimated total</th><td data-estimate="${estimate(fees)}">${total}</td></tr></tfoot>
    </table>
    <p><a href="/">View practice fees</a></p>`);
  await Promise.all([
    writeFile(join(output, 'index.html'), rates),
    writeFile(join(output, 'good-faith-estimate', 'index.html'), example),
    writeFile(join(output, 'style.css'), await readFile(join(root, 'style.css'))),
    writeFile(join(output, 'studio-version.json'), JSON.stringify({ commit, ...fees, estimate: estimate(fees) }) + '\n'),
    writeFile(join(output, 'robots.txt'), 'User-agent: *\nDisallow: /\n'),
    writeFile(join(output, '_headers'), '/studio-version.json\n  Cache-Control: no-store\n/*\n  X-Robots-Tag: noindex, nofollow\n  X-Content-Type-Options: nosniff\n'),
  ]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const commit = process.env.CF_PAGES_COMMIT_SHA || gitOutput(root, 'rev-parse', 'HEAD').trim();
  await build(join(root, 'dist'), readFees(await readFile(join(root, 'fees.json'), 'utf8')), commit);
}
