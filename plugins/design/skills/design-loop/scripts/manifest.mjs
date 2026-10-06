#!/usr/bin/env node
// Reads and updates design.manifest.json for design-loop, so the model doesn't rewrite the JSON.
//
//   node manifest.mjs items [--status wip|approved]   compact view: project, reconcileRule, rows
//   node manifest.mjs hash <file>                     SHA-256 (hex) of a file's bytes
//   node manifest.mjs approve <name...>               set status "approved"
//   node manifest.mjs implemented <name> <hash>       set lastImplementedHash
//
// A <name> is a components[] or screens[] name, or "palette"; write `kind:name` (kind is
// component, screen or palette) when a name is ambiguous. The manifest is design.manifest.json in
// the current directory, or the file given with --manifest <path>. Fields and rows the commands
// don't change are kept as they are.
import { createHash } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args.splice(i, 2)[1];
};
const manifestPath = flag('--manifest') ?? 'design.manifest.json';
const statusFilter = flag('--status');
const [command, ...rest] = args;

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

// Every row design-loop can implement, with the field that holds the file it reads.
const rowsOf = (manifest) => [
  ...(manifest.palette ? [{ kind: 'palette', name: 'palette', row: manifest.palette, pathKey: 'designPath' }] : []),
  ...(manifest.components ?? []).map((row) => ({ kind: 'component', name: row.name, row, pathKey: 'proposalPath' })),
  ...(manifest.screens ?? []).map((row) => ({ kind: 'screen', name: row.name, row, pathKey: 'proposalPath' })),
];

const find = (manifest, query) => {
  const [kind, name] = query.includes(':') ? query.split(/:(.*)/s) : [undefined, query];
  const matches = rowsOf(manifest).filter((r) => r.name === name && (!kind || r.kind === kind));
  if (matches.length === 0) fail(`No row named "${query}" in ${manifestPath}`);
  if (matches.length > 1) fail(`"${query}" is ambiguous: ${matches.map((m) => `${m.kind}:${m.name}`).join(', ')}`);
  return matches[0];
};

const load = () => {
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return fail(`Cannot read ${manifestPath}: ${error.message}`);
  }
};

const save = (manifest) => {
  const tmp = `${manifestPath}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(manifest, null, 2)}\n`);
  renameSync(tmp, manifestPath);
};

if (command === 'hash') {
  if (!rest[0]) fail('Usage: manifest.mjs hash <file>');
  console.log(createHash('sha256').update(readFileSync(rest[0])).digest('hex'));
} else if (command === 'items') {
  const manifest = load();
  const items = rowsOf(manifest)
    .filter(({ row }) => !statusFilter || row.status === statusFilter)
    .map(({ kind, name, row, pathKey }) => ({
      kind,
      name,
      status: row.status,
      path: row[pathKey] ?? null,
      lastImplementedHash: row.lastImplementedHash ?? null,
    }));
  console.log(JSON.stringify({ designProjectId: manifest.designProjectId, reconcileRule: manifest.reconcileRule, items }, null, 2));
} else if (command === 'approve') {
  if (rest.length === 0) fail('Usage: manifest.mjs approve <name...>');
  const manifest = load();
  const targets = rest.map((query) => find(manifest, query));
  for (const { row } of targets) row.status = 'approved';
  save(manifest);
  console.log(`approved: ${targets.map((t) => `${t.kind}:${t.name}`).join(', ')}`);
} else if (command === 'implemented') {
  const [query, hash] = rest;
  if (!query || !/^[0-9a-f]{64}$/.test(hash ?? '')) fail('Usage: manifest.mjs implemented <name> <sha256-hex>');
  const manifest = load();
  const target = find(manifest, query);
  target.row.lastImplementedHash = hash;
  save(manifest);
  console.log(`implemented: ${target.kind}:${target.name} ${hash}`);
} else {
  fail('Usage: manifest.mjs items [--status s] | hash <file> | approve <name...> | implemented <name> <hash>');
}
