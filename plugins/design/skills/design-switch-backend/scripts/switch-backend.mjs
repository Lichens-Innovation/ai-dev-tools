#!/usr/bin/env node
// Moves design.manifest.json from one design backend to the other (contract §2 and §8), so the
// model doesn't rewrite the JSON.
//
//   node switch-backend.mjs plan <claude-design|local>    what would change, as JSON; writes nothing
//   node switch-backend.mjs apply <claude-design|local>   rewrite the manifest
//
// Options: --manifest <path> (default design.manifest.json).
//
// Every row keeps its name, code side (localPath, storyId, storybook, sources, route, url, viewport,
// states) and the palette its files. What belonged to the old backend goes: the design paths become
// the new backend's (or null until /design-init makes them), every component and screen is back to
// `wip` with `lastImplementedHash: null` (the hashes were of the old backend's files), and a
// screen's mockupHash is dropped. The palette's inputs are already implemented, so on local its
// hash is the inputs file's, as design-init records it; on Claude Design it waits for the card.
// Exit 0 done, 1 nothing to do (already on that backend), 2 bad usage or manifest.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const BACKENDS = ['claude-design', 'local'];

/** `Primary Button` -> `primary-button`, as local-backend.mjs names the studio's pages. */
const kebab = (name) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const sha256File = (file) => (existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : null);

const RESET = { status: 'wip', lastImplementedHash: null };

/** The manifest moved to the `to` backend. Pure: `root` (the repo root) is read only for the palette's inputs hash. */
export function switchManifest(manifest, to, root) {
  const from = manifest.backend ?? 'claude-design';
  const next = { backend: to, ...manifest };
  next.backend = to;
  const local = to === 'local';
  if (local) delete next.designProjectId;
  else delete next.studio;

  if (manifest.palette) {
    const { thumbnailPath: _thumbnail, ...palette } = manifest.palette;
    next.palette = local
      ? { ...palette, designPath: null, status: 'wip', lastImplementedHash: palette.localPath ? sha256File(join(root, palette.localPath)) : null }
      : { ...palette, designPath: 'Palette.dc.html', thumbnailPath: 'thumbnail.html', status: 'wip', lastImplementedHash: null };
  }
  next.components = (manifest.components ?? []).map((row) => ({
    ...row,
    designPath: local ? `design/components/${kebab(row.name)}.html` : null,
    proposalPath: local ? `design/proposals/${kebab(row.name)}.html` : null,
    ...RESET,
  }));
  if (manifest.screens) {
    next.screens = manifest.screens.map(({ mockupHash: _mockupHash, ...row }) => ({
      ...row,
      mockupPath: local ? `design/screens/${kebab(row.name)}.html` : null,
      proposalPath: local ? `design/proposals/screens/${kebab(row.name)}.html` : null,
      ...RESET,
    }));
  }
  return { from, to, manifest: next };
}

function main(argv) {
  const args = [...argv];
  const i = args.indexOf('--manifest');
  const manifestPath = i === -1 ? 'design.manifest.json' : args.splice(i, 2)[1];
  const [command, to] = args;
  if (!['plan', 'apply'].includes(command) || !BACKENDS.includes(to)) {
    console.error('Usage: switch-backend.mjs plan|apply <claude-design|local> [--manifest <path>]');
    return 2;
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    console.error(`Cannot read ${manifestPath}: ${error.message}`);
    return 2;
  }
  const result = switchManifest(manifest, to, dirname(resolve(manifestPath)));
  if (result.from === to) {
    console.error(`${manifestPath} is already on the ${to} backend.`);
    return 1;
  }
  if (command === 'apply') {
    const tmp = `${manifestPath}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(result.manifest, null, 2)}\n`);
    renameSync(tmp, manifestPath);
  }
  console.log(JSON.stringify(command === 'plan' ? result : { from: result.from, to, written: manifestPath }, null, 2));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exit(main(process.argv.slice(2)));
}
