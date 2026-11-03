#!/usr/bin/env node
// The local design backend's operations (references/backends/local.md), for design-loop and
// design-refresh. Reads design.manifest.json and the project's design/ folder; writes only the
// copies under /tmp/design-loop.
//
//   node local-backend.mjs status                  is the studio answering? prints its URL
//   node local-backend.mjs list                    every item: proposal/reference path, exists, hash
//   node local-backend.mjs fetch <name>            copy the proposal (and reference) to /tmp/design-loop
//   node local-backend.mjs render-url <name>       the studio URL of the proposal, to screenshot
//   node local-backend.mjs source-hash <name>      hash of the sources of a component or screen
//   node local-backend.mjs check                   which references are behind their code (exit 1)
//
// A <name> is a components[] or screens[] name, or "palette"; write `kind:name` when ambiguous.
// Options: --manifest <path> (default design.manifest.json; the repo root is its folder),
// --studio-url <url> (default http://localhost:<manifest studio.port, else 3009>),
// --out <dir> (default /tmp/design-loop).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export const fileHash = (file) => (existsSync(file) ? sha256(readFileSync(file)) : null);

/** `Primary Button` -> `primary-button`: the file name of a page (the studio's pages are kebab-case). */
export const kebab = (name) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function loadManifest(manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return { manifest, root: dirname(resolve(manifestPath)) };
}

/** A path from the manifest, kept inside the project's design/ folder. */
export function insideDesign(root, rel) {
  const abs = resolve(root, rel);
  const designDir = join(root, 'design');
  if (!abs.startsWith(`${designDir}/`)) throw new Error(`"${rel}" is not inside design/`);
  return abs;
}

/** Every row of the manifest the loop knows, with the files it reads. */
export function rowsOf(manifest) {
  return [
    ...(manifest.palette ? [{ kind: 'palette', name: 'palette', row: manifest.palette }] : []),
    ...(manifest.components ?? []).map((row) => ({ kind: 'component', name: row.name, row })),
    ...(manifest.screens ?? []).map((row) => ({ kind: 'screen', name: row.name, row })),
  ];
}

export function findRow(manifest, query) {
  const [kind, name] = query.includes(':') ? query.split(/:(.*)/s) : [undefined, query];
  const matches = rowsOf(manifest).filter((r) => r.name === name && (!kind || r.kind === kind));
  if (matches.length === 0) throw new Error(`No row named "${query}" in the manifest`);
  if (matches.length > 1) throw new Error(`"${query}" is ambiguous: ${matches.map((m) => `${m.kind}:${m.name}`).join(', ')}`);
  return matches[0];
}

/**
 * The files whose change makes a reference stale. A screen: its `sources`. A component: its `sources`
 * when the row lists them, else its `localPath` plus the stories next to it (same name, or the folder's
 * name for an index file).
 */
export function sourceFiles(root, { kind, row }) {
  if (kind === 'screen') return row.sources ?? [];
  if (kind !== 'component') return [];
  if (row.sources?.length) return row.sources;
  if (!row.localPath) return [];
  const dir = dirname(row.localPath);
  const base = basename(row.localPath, extname(row.localPath));
  const owner = base === 'index' ? basename(dir) : base;
  const stories = existsSync(join(root, dir))
    ? readdirSync(join(root, dir))
        .filter((f) => /\.(stories|story)\.[a-z]+$/i.test(f))
        .filter((f) => kebab(f.split('.')[0]) === kebab(owner))
        .sort()
    : [];
  return [row.localPath, ...stories.map((f) => join(dir, f))];
}

/** sha256 of the sources' bytes, in order (the same definition as a screen's `sourceHash`). `null` when none exist. */
export function sourceHashOf(root, found) {
  const files = sourceFiles(root, found);
  const missing = files.filter((f) => !existsSync(join(root, f)));
  if (files.length === 0 || missing.length > 0) return null;
  return sha256(Buffer.concat(files.map((f) => readFileSync(join(root, f)))));
}

export function readIndex(root) {
  const file = join(root, 'design', 'index.json');
  if (!existsSync(file)) return { pages: [] };
  const index = JSON.parse(readFileSync(file, 'utf8'));
  return { ...index, pages: index.pages ?? [] };
}

export const indexRow = (index, kind, name) => index.pages.find((p) => p.kind === kind && kebab(p.name) === name);

// ---------------------------------------------------------------------------------------------

const kindOf = (kind) => (kind === 'component' || kind === 'screen' ? kind : null);

function describe(root, index, found) {
  const { kind, name, row } = found;
  if (kind === 'palette') {
    const file = row.localPath ? join(root, row.localPath) : null;
    return {
      kind,
      name,
      status: row.status,
      path: row.localPath ?? null,
      exists: file !== null && existsSync(file),
      hash: file ? fileHash(file) : null,
      lastImplementedHash: row.lastImplementedHash ?? null,
    };
  }
  const reference = kind === 'screen' ? row.mockupPath : row.designPath;
  const proposal = row.proposalPath ?? null;
  const proposalFile = proposal ? insideDesign(root, proposal) : null;
  const referenceFile = reference ? insideDesign(root, reference) : null;
  return {
    kind,
    name,
    status: row.status,
    path: proposal,
    exists: proposalFile !== null && existsSync(proposalFile),
    hash: proposalFile ? fileHash(proposalFile) : null,
    reference,
    referenceExists: referenceFile !== null && existsSync(referenceFile),
    referenceHash: referenceFile ? fileHash(referenceFile) : null,
    lastImplementedHash: row.lastImplementedHash ?? null,
    captured: indexRow(index, kind, kebab(name)) !== undefined,
  };
}

function studioUrl(manifest, options) {
  const url = options['studio-url'] ?? `http://localhost:${manifest.studio?.port ?? 3009}`;
  return url.replace(/\/+$/, '');
}

function main(argv) {
  const args = [...argv];
  const options = {};
  for (const flag of ['--manifest', '--studio-url', '--out']) {
    const i = args.indexOf(flag);
    if (i !== -1) options[flag.slice(2)] = args.splice(i, 2)[1];
  }
  const [command, query] = args;
  const { manifest, root } = loadManifest(options.manifest ?? 'design.manifest.json');
  const out = options.out ?? '/tmp/design-loop';
  const print = (value) => console.log(JSON.stringify(value, null, 2));

  if (command === 'status') {
    const url = studioUrl(manifest, options);
    return fetch(`${url}/render/index.json`, { signal: AbortSignal.timeout(5000) })
      .then((res) => {
        print({ url, up: res.ok });
        return res.ok ? 0 : 1;
      })
      .catch(() => {
        print({ url, up: false });
        return 1;
      });
  }

  const index = readIndex(root);

  if (command === 'list') {
    print({ backend: manifest.backend ?? 'claude-design', reconcileRule: manifest.reconcileRule, items: rowsOf(manifest).map((f) => describe(root, index, f)) });
    return 0;
  }

  if (command === 'check') {
    const items = rowsOf(manifest)
      .filter((f) => kindOf(f.kind))
      .map((found) => {
        const info = describe(root, index, found);
        const page = indexRow(index, found.kind, kebab(found.name));
        const now = sourceHashOf(root, found);
        let state = 'current';
        if (!info.referenceExists || !page) state = 'not-captured';
        else if (page.referenceHash && page.referenceHash !== info.referenceHash) state = 'edited';
        else if (now === null) state = 'no-sources';
        else if (page.sourceHash !== now) state = 'stale';
        return { kind: found.kind, name: found.name, state };
      });
    print({ items });
    return items.some((i) => i.state !== 'current') ? 1 : 0;
  }

  if (!query) throw new Error(`Usage: local-backend.mjs ${command ?? '<command>'} <name>`);
  const found = findRow(manifest, query);

  if (command === 'source-hash') {
    const hash = sourceHashOf(root, found);
    if (!hash) throw new Error(`${found.kind}:${found.name} has no sources that exist (localPath/sources in the manifest)`);
    console.log(hash);
    return 0;
  }

  if (found.kind === 'palette') throw new Error('The palette has no page to fetch: the studio saved its inputs. Use `list` for its hash.');
  const info = describe(root, index, found);
  if (!info.path) throw new Error(`${found.kind}:${found.name} has no proposalPath in the manifest`);

  if (command === 'render-url') {
    console.log(`${studioUrl(manifest, options)}/render/${info.path.replace(/^design\//, '')}`);
    return info.exists ? 0 : 1;
  }

  if (command === 'fetch') {
    if (!info.exists) throw new Error(`No proposal at ${info.path}: nothing to implement for ${found.name}`);
    mkdirSync(out, { recursive: true });
    const target = join(out, `${found.name}.target.html`);
    writeFileSync(target, readFileSync(insideDesign(root, info.path)));
    const result = { name: found.name, kind: found.kind, target, hash: fileHash(target) };
    if (info.referenceExists) {
      // A screen's reference is its mockup, which is what design-loop diffs the proposal against.
      const reference = join(out, `${found.name}.${found.kind === 'screen' ? 'mockup' : 'reference'}.html`);
      writeFileSync(reference, readFileSync(insideDesign(root, info.reference)));
      result.reference = reference;
      result.referenceHash = fileHash(reference);
      if (found.kind === 'screen') result.mockupMatches = !found.row.mockupHash || found.row.mockupHash === result.referenceHash;
    }
    print(result);
    return 0;
  }

  throw new Error('Usage: local-backend.mjs status | list | check | fetch <name> | render-url <name> | source-hash <name>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(await main(process.argv.slice(2)));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
