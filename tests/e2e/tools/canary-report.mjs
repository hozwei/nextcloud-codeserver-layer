// SPDX-FileCopyrightText: 2026 The nextcloud-codeserver-layer contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The canary's summary (.github/workflows/canary.yml) for one of its jobs: which upstream releases
// are newer than the tested ones in tests/e2e/versions.json, how the tests went (failed tests, and
// tests that passed only on a retry, which count as failed), and what to do: raise the tested
// versions, or hold an update back. Prints Markdown, adds it to the step summary and writes it to
// the job's output summary for the job that opens or closes the 'canary' issue.
//
//   node tests/e2e/tools/canary-report.mjs codeserver   VERSION FETCH TEST REPORT
//   node tests/e2e/tools/canary-report.mjs nextcloud    RESULTS REPORTS CRAFT_VERSION CRAFT TEST
//
// The arguments come from the environment: FETCH, CRAFT and TEST are step outcomes (success,
// failure, cancelled, skipped), REPORT a Playwright JSON report, RESULTS a file with one line
// '<major> <version or -> <outcome>' per Nextcloud major, and REPORTS the folder with their JSON
// reports, nextcloud-<major>.json.

import { appendFileSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };
const versions = read(path.join(here, '../versions.json'));
const env = process.env;
const outcome = (o) => ({ success: 'passed', failure: 'failed', cancelled: 'cancelled', skipped: 'skipped' })[o] ?? 'did not run';

/** The failed tests of a Playwright JSON report, and those that passed only on a retry. */
function problems(file) {
  const found = { failed: [], flaky: [] };
  const walk = (suite, titles) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const name = [...titles, spec.title].filter(Boolean).join(' › ');
        if (test.status === 'unexpected') found.failed.push(name);
        else if (test.status === 'flaky') found.flaky.push(name);
      }
    }
    for (const child of suite.suites ?? []) walk(child, [...titles, child.title]);
  };
  for (const suite of read(file)?.suites ?? []) walk(suite, [suite.title]);
  return found;
}

function list(lines, heading, tests) {
  if (!tests.length) return;
  lines.push('', `${heading}:`, ...tests.slice(0, 20).map((t) => `- \`${t.replaceAll('`', "'")}\``));
  if (tests.length > 20) lines.push(`- and ${tests.length - 20} more`);
}

const cell = (tested, latest) => !latest ? 'unknown' : latest === tested ? latest : `**${latest}** (new)`;

function codeserver() {
  const tested = versions?.codeServer?.version ?? 'unknown';
  const latest = env.VERSION || '';
  const fresh = latest !== '' && latest !== tested;
  const found = problems(env.REPORT ?? '');
  const passed = env.FETCH === 'success' && env.TEST === 'success';
  const lines = [
    `### code-server: ${passed ? 'the newest release passes' : env.FETCH !== 'success' ? 'fetching the newest release failed' : 'the tests failed'}`,
    '',
    '| | Tested (tests/e2e/versions.json) | Newest release (this run) |',
    '| --- | --- | --- |',
    `| code-server | ${tested} | ${cell(tested, latest)} |`,
    '',
    `Fetch: ${outcome(env.FETCH)}. Tests: ${outcome(env.TEST)}.`,
  ];
  list(lines, 'Tests that failed', found.failed);
  list(lines, 'Tests that passed only on a retry (counted as failed)', found.flaky);
  lines.push('');
  if (passed) {
    lines.push(fresh
      ? `Raise \`codeServer\` in tests/e2e/versions.json to ${latest}, with the SHA-256 digests of its four archives (shown on the release page); CI then tests it on every change.`
      : 'The newest release is the tested one; nothing to do.');
  } else if (env.FETCH !== 'success') {
    lines.push('Nothing was tested; the log of the fetch step says why (no release in the redirect, no digest, a failed download or checksum).');
  } else {
    const onlyFlaky = !found.failed.length && found.flaky.length > 0;
    lines.push((fresh
      ? `Hold back code-server ${latest}: update code-server only once the app or its tests handle it. The Playwright report of this run has the details.`
      : 'No new release, so the cause is here or in the test environment (browser, runner image); the Playwright report of this run has the details.')
      + (onlyFlaky ? ' Each failure passed on its retry: the release may only have changed the timing, which still counts until a rerun passes.' : ''));
  }
  return { lines, passed };
}

function nextcloud() {
  const testedNextcloud = versions?.nextcloud?.tested ?? [];
  const testedCraft = versions?.craftsuiteLayer?.version ?? 'unknown';
  const craft = env.CRAFT_VERSION || '';
  const craftFresh = craft !== '' && craft !== testedCraft;
  const results = (() => { try { return readFileSync(env.RESULTS ?? '', 'utf8'); } catch { return ''; } })()
    .split('\n').map((line) => line.trim().split(/\s+/)).filter((f) => f.length === 3)
    .map(([major, version, result]) => ({ major, version: version === '-' ? '' : version, result }));
  const passed = env.CRAFT === 'success' && env.TEST === 'success' && results.length > 0 && results.every((r) => r.result === 'success');
  const lines = [
    `### Nextcloud: ${passed ? 'the newest releases pass' : env.CRAFT !== 'success' ? 'fetching the newest Craft Suite Layer failed' : 'the tests failed'}`,
    '',
    '| | Tested (tests/e2e/versions.json) | Newest release (this run) | Tests |',
    '| --- | --- | --- | --- |',
  ];
  const fresh = [];
  for (const r of results) {
    const tested = testedNextcloud.find((v) => v.startsWith(`${r.major}.`)) ?? 'none';
    lines.push(`| Nextcloud ${r.major} | ${tested} | ${cell(tested, r.version)} | ${outcome(r.result)} |`);
    if (r.version && r.version !== tested) fresh.push({ label: `Nextcloud ${r.version}`, major: r.major, kind: 'nextcloud' });
  }
  lines.push(`| Craft Suite Layer, next to the app | ${testedCraft} | ${cell(testedCraft, craft)} | in each run above |`);
  if (craftFresh) fresh.push({ label: `Craft Suite Layer ${craft}`, kind: 'craft' });
  lines.push('', `Fetching the Craft Suite Layer: ${outcome(env.CRAFT)}. Tests: ${outcome(env.TEST)}.`);
  let onlyFlaky = true;
  let anyProblem = false;
  for (const r of results) {
    const found = problems(path.join(env.REPORTS ?? '', `nextcloud-${r.major}.json`));
    list(lines, `Nextcloud ${r.major}: tests that failed`, found.failed);
    list(lines, `Nextcloud ${r.major}: tests that passed only on a retry (counted as failed)`, found.flaky);
    if (found.failed.length) onlyFlaky = false;
    if (found.failed.length || found.flaky.length) anyProblem = true;
  }
  lines.push('');
  if (passed) {
    const raise = [
      ...fresh.filter((f) => f.kind === 'nextcloud').map((f) => `${f.label.replace('Nextcloud ', '')} in \`nextcloud.tested\``),
      ...(craftFresh ? [`\`craftsuiteLayer\` to ${craft}, with the SHA-256 from the SHA256SUMS of its release`] : []),
    ];
    lines.push(raise.length
      ? `Raise in tests/e2e/versions.json: ${raise.join('; ')}. CI then tests it on every change.`
      : 'The newest releases are the tested ones; nothing to do.');
  } else if (env.CRAFT !== 'success' || !results.length) {
    lines.push('The Nextcloud tests did not run; the log of this job says why (a failed download or checksum, or a missing release).');
  } else {
    // A failed major blames its own new release and a new Craft Suite Layer, which ran in every major.
    const failed = results.filter((r) => r.result !== 'success').map((r) => r.major);
    const hold = fresh.filter((f) => f.kind === 'craft' || failed.includes(f.major)).map((f) => f.label);
    lines.push((hold.length
      ? `Hold back ${hold.join(' and ')}: update only once the app or its tests handle it. The Playwright report and the Nextcloud logs of this run have the details.`
      : 'No new release where it failed, so the cause is here or in the test environment (images, browser, runner); the Playwright report and the Nextcloud logs of this run have the details.')
      + (anyProblem && onlyFlaky ? ' Each failure passed on its retry: the release may only have changed the timing, which still counts until a rerun passes.' : ''));
  }
  return { lines, passed };
}

const mode = process.argv[2];
if (mode !== 'codeserver' && mode !== 'nextcloud') throw new Error('usage: canary-report.mjs codeserver|nextcloud');
const { lines } = mode === 'codeserver' ? codeserver() : nextcloud();
const markdown = lines.join('\n') + '\n';
process.stdout.write(markdown);
if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, markdown);
if (env.GITHUB_OUTPUT) {
  const eof = `EOF_${randomUUID()}`;
  appendFileSync(env.GITHUB_OUTPUT, `summary<<${eof}\n${markdown}${eof}\n`);
}
