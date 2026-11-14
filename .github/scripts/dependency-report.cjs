#!/usr/bin/env node
// Weekly dependency report for a pnpm repo. Copied from
// Lichens-Innovation/renovate-runner templates/dependency-report/; see
// docs/dependency-report.md there.
//
// Collects what to fix locally before the weekly release:
//   1. open Renovate security PRs the Claude CVE gate rejected (or never judged),
//   2. pnpm overrides that no installed package needs anymore,
//   3. the findings `pnpm audit` still reports.
//
// Usage: node dependency-report.cjs [--publish] [--no-prs]
//   Without --publish, prints the report as Markdown.
//   --no-prs skips the PR section (no gh needed), e.g. for a quick local check.
//   With --publish, upserts one open issue titled "Weekly dependency report"
//   (comments on it so the assignee gets an email) or closes it when all is clear.
// Needs `pnpm install` done and `gh` authenticated (GH_TOKEN in Actions).
// Env:
//   REPORT_ROOT      repo to report on (default: the current directory)
//   REVIEWER        GitHub login assigned to a new issue (optional)
//   RENOVATE_AUTHOR  Renovate's PR author for gh (default app/lichens-renovate)
//   REPORT_DEPS_DIR  directory whose node_modules has semver and yaml; falls back
//                    to the newest semver@7 / yaml@2 in node_modules/.pnpm
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { createRequire } = require('module');

const TITLE = 'Weekly dependency report';
const root = path.resolve(process.env.REPORT_ROOT || process.cwd());
const pnpmDir = path.join(root, 'node_modules/.pnpm');
const publish = process.argv.includes('--publish');
const renovateAuthor = process.env.RENOVATE_AUTHOR || 'app/lichens-renovate';

function load(name, major) {
  if (process.env.REPORT_DEPS_DIR) {
    try {
      return createRequire(path.join(process.env.REPORT_DEPS_DIR, 'index.js'))(name);
    } catch {
      // fall through to the pnpm store
    }
  }
  const ids = fs
    .readdirSync(pnpmDir)
    .filter((id) => id.startsWith(`${name}@${major}.`))
    .map((id) => id.split('_')[0])
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!ids.length) throw new Error(`${name}@${major} not found: set REPORT_DEPS_DIR`);
  return require(path.join(pnpmDir, ids[ids.length - 1], 'node_modules', name));
}
const semver = load('semver', 7);
const YAML = load('yaml', 2);

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}
const ghJson = (args) => JSON.parse(gh(args));
const oneLine = (s) => String(s).replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();

// 1. Security PRs and the gate's verdict -------------------------------------
function securityPrs() {
  const prs = ghJson([
    'pr', 'list', '--state', 'open', '--author', renovateAuthor, '--limit', '100',
    '--json', 'number,title,url,headRefName,labels',
  ]).filter(
    (pr) => pr.headRefName.includes('-vulnerability') || pr.labels.some((l) => l.name === 'security'),
  );
  const rejected = [];
  const pending = [];
  for (const pr of prs) {
    const { comments } = ghJson(['pr', 'view', String(pr.number), '--json', 'comments']);
    const verdicts = comments.filter((c) => /^Claude CVE gate: (APPROVED|REJECTED)/.test(c.body.trim()));
    const last = verdicts[verdicts.length - 1];
    if (!last) pending.push(pr);
    else if (last.body.trim().startsWith('Claude CVE gate: REJECTED')) rejected.push({ ...pr, review: last.body.trim() });
  }
  return { rejected, pending };
}

// 2. Overrides no installed package needs ------------------------------------
function readOverrides() {
  const wsFile = path.join(root, 'pnpm-workspace.yaml');
  const ws = fs.existsSync(wsFile) ? YAML.parse(fs.readFileSync(wsFile, 'utf8')) || {} : {};
  const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  return { ws, overrides: { ...(rootPkg.pnpm && rootPkg.pnpm.overrides), ...ws.overrides } };
}

function parseKey(key) {
  // "parent>child@range": judge the child. A ">" right after "@" or a space,
  // or followed by "=", belongs to a range (nanoid@>=4 <5), not the chain.
  const last = key.split(/(?<![@\s])>(?!=)/).pop();
  const at = last.lastIndexOf('@');
  return at > 0 ? { name: last.slice(0, at), selector: last.slice(at + 1) } : { name: last, selector: '*' };
}

function manifests(ws) {
  const list = [];
  const add = (file, workspace) => {
    try {
      list.push({ pkg: JSON.parse(fs.readFileSync(file, 'utf8')), workspace });
    } catch {
      // not a package
    }
  };
  for (const id of fs.readdirSync(pnpmDir)) {
    const nm = path.join(pnpmDir, id, 'node_modules');
    if (!fs.existsSync(nm)) continue;
    for (const entry of fs.readdirSync(nm)) {
      const dirs = entry.startsWith('@')
        ? fs.readdirSync(path.join(nm, entry)).map((d) => path.join(nm, entry, d))
        : [path.join(nm, entry)];
      for (const dir of dirs) {
        if (!fs.lstatSync(dir).isSymbolicLink()) add(path.join(dir, 'package.json'), false);
      }
    }
  }
  for (const pattern of ['.', ...(ws.packages || [])]) {
    if (pattern.startsWith('!')) continue;
    const base = pattern.replace(/\/\*\*?$/, '');
    const dirs =
      base === pattern
        ? [path.join(root, base)]
        : fs.existsSync(path.join(root, base))
          ? fs.readdirSync(path.join(root, base)).map((d) => path.join(root, base, d))
          : [];
    for (const dir of dirs) add(path.join(dir, 'package.json'), true);
  }
  return list;
}

function installedVersions(name) {
  const prefix = `${name.replace('/', '+')}@`;
  return [
    ...new Set(
      fs.readdirSync(pnpmDir).filter((id) => id.startsWith(prefix)).map((id) => id.slice(prefix.length).split('_')[0]),
    ),
  ];
}

function staleOverrides() {
  const { ws, overrides } = readOverrides();
  const all = manifests(ws);
  const stale = [];
  for (const [key, target] of Object.entries(overrides)) {
    const { name, selector } = parseKey(key);
    let parents = 0;
    let needed = false;
    let unsure = false;
    for (const { pkg, workspace } of all) {
      // pnpm doesn't install the devDependencies of third-party packages.
      const fields = workspace ? ['dependencies', 'optionalDependencies', 'devDependencies'] : ['dependencies', 'optionalDependencies'];
      for (const field of fields) {
        const range = pkg[field] && pkg[field][name];
        if (!range) continue;
        parents += 1;
        try {
          if (semver.intersects(range, selector) && !semver.intersects(range, target)) needed = true;
        } catch {
          unsure = true; // workspace:, npm:, git or tag ranges
        }
      }
    }
    if (needed) continue;
    const status = parents === 0 ? 'unused: nothing depends on it' : unsure ? 'check by hand' : 'removable: no parent needs it';
    stale.push({ key, target, status, installed: installedVersions(name).join(', ') || '-' });
  }
  return stale;
}

// 3. pnpm audit ---------------------------------------------------------------
const SEVERITY = ['critical', 'high', 'moderate', 'low', 'info'];
function auditFindings() {
  const run = spawnSync('pnpm', ['audit', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let report;
  try {
    report = JSON.parse(run.stdout);
  } catch {
    throw new Error(`pnpm audit failed: ${run.stderr || run.stdout}`);
  }
  if (report.error) throw new Error(`pnpm audit failed: ${JSON.stringify(report.error)}`);
  return Object.values(report.advisories || {})
    .map((a) => {
      const paths = a.findings.flatMap((f) => f.paths);
      return {
        severity: a.severity,
        module: a.module_name,
        installed: [...new Set(a.findings.map((f) => f.version))].join(', '),
        patched: a.patched_versions,
        title: a.title,
        url: a.url,
        id: a.github_advisory_id || a.id,
        via: paths[0] ? paths[0].replace(/__/g, '/').split('>').join(' > ') : '',
        more: paths.length - 1,
      };
    })
    .sort((a, b) => SEVERITY.indexOf(a.severity) - SEVERITY.indexOf(b.severity));
}

// Report -----------------------------------------------------------------------
function render({ rejected, pending, stale, findings }) {
  const out = [
    `# ${TITLE}`,
    '',
    `Generated ${new Date().toISOString().slice(0, 10)}. Fix these locally before the weekly release; the next run updates this issue, or closes it once everything is clear.`,
  ];
  if (rejected.length) {
    out.push('', `## Security PRs rejected by the Claude CVE gate (${rejected.length})`, '');
    out.push('Make the change Claude asks for locally (or on the Renovate branch), then close the PR if your fix replaces it.');
    for (const pr of rejected) {
      out.push('', `### [#${pr.number} ${pr.title}](${pr.url})`, '', '<details><summary>Claude\'s review</summary>', '', pr.review, '', '</details>');
    }
  }
  if (pending.length) {
    out.push('', `## Security PRs without a gate verdict (${pending.length})`, '');
    out.push('The gate has not commented yet, or its run failed: check the PR\'s checks.', '');
    for (const pr of pending) out.push(`- [#${pr.number} ${oneLine(pr.title)}](${pr.url})`);
  }
  if (stale.length) {
    out.push('', `## pnpm overrides to remove (${stale.length})`, '');
    out.push('Remove them, run `pnpm install`, then check `pnpm audit` stays clean.', '');
    out.push('| Override | Target | Status | Installed |', '| --- | --- | --- | --- |');
    for (const o of stale) out.push(`| \`${o.key}\` | \`${o.target}\` | ${o.status} | ${o.installed} |`);
  }
  if (findings.length) {
    out.push('', `## pnpm audit findings (${findings.length})`, '');
    out.push('| Severity | Package | Installed | Fixed in | Advisory | Via |', '| --- | --- | --- | --- | --- | --- |');
    for (const f of findings) {
      const via = f.via ? `${oneLine(f.via)}${f.more ? ` (+${f.more} more)` : ''}` : '';
      out.push(`| ${f.severity} | \`${f.module}\` | ${f.installed} | \`${oneLine(f.patched)}\` | [${f.id}](${f.url}): ${oneLine(f.title)} | ${via} |`);
    }
  }
  return out.join('\n') + '\n';
}

function upsertIssue(body, count) {
  const open = ghJson(['issue', 'list', '--state', 'open', '--search', `"${TITLE}" in:title`, '--json', 'number,title']).filter(
    (i) => i.title === TITLE,
  );
  const existing = open[0];
  if (!count) {
    if (existing) gh(['issue', 'close', String(existing.number), '--comment', 'All clear this week: closing.']);
    console.log(existing ? `Closed #${existing.number}: all clear.` : 'All clear: no issue to open.');
    return;
  }
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dep-report-')), 'body.md');
  fs.writeFileSync(file, body);
  if (existing) {
    gh(['issue', 'edit', String(existing.number), '--body-file', file]);
    gh(['issue', 'comment', String(existing.number), '--body', `Updated: ${count} item(s) to fix before the weekly release.`]);
    console.log(`Updated #${existing.number}.`);
  } else {
    const args = ['issue', 'create', '--title', TITLE, '--body-file', file];
    if (process.env.REVIEWER) args.push('--assignee', process.env.REVIEWER);
    console.log(gh(args).trim());
  }
}

const { rejected, pending } = process.argv.includes('--no-prs') ? { rejected: [], pending: [] } : securityPrs();
const stale = staleOverrides();
const findings = auditFindings();
const count = rejected.length + pending.length + stale.length + findings.length;
const body = render({ rejected, pending, stale, findings });
if (publish) upsertIssue(body, count);
else process.stdout.write(count ? body : 'All clear.\n');
