#!/usr/bin/env node
/**
 * plugin-files.mjs — keeps a project's copies of the design plugin's files in step with the plugin.
 *
 * A project carries copies of plugin files: the repo's palette.ts (manifest palette.script) and, in
 * Claude Design, design-nav.js, Tailwind.html and the palette card Palette.dc.html, and the proposal
 * conventions in the design-sync readme header. A newer plugin
 * does not reach them by itself. design.manifest.json records the plugin version they were last
 * brought to (pluginVersion), so a cheap check tells when to look.
 *
 * Usage (the manifest is design.manifest.json in the current directory, or --manifest <path>):
 *   node plugin-files.mjs check              plugin version vs the manifest's, and the repo's palette.ts
 *   node plugin-files.mjs compare <dir>      which of the Claude Design files downloaded into <dir> differ
 *   node plugin-files.mjs card <remote> <out>  the plugin's palette card with <remote>'s data (data-props)
 *   node plugin-files.mjs stamp              write the plugin version into the manifest
 *   node plugin-files.mjs conventions        print the plugin's conventions block, markers included
 *   node plugin-files.mjs mark               record the plugin's conventions as applied in the readme header
 *
 * check prints { plugin, project, version: current|behind|ahead|unstamped, paletteScript, conventions,
 * update }
 * and exits 0 when nothing needs updating, 1 when something does, 3 when the project is ahead of the
 * plugin (an older plugin installed here: update the plugin, never downgrade the project).
 * compare looks for design-nav.js, Tailwind.html and Palette.dc.html in <dir> and prints
 * same | differs | absent for each; the card is compared without its data-props (the card's data,
 * edited in Claude Design). Exit 1 when one differs.
 * card writes <out>: the plugin's template with every prop default it shares with <remote> carried
 * over (inputs, tokens, overrides, title…). It prints the props kept, dropped (only in <remote>) and
 * new (only in the template), the SHA-256 of both cards, and whether <remote> was the last
 * implemented card (manifest palette.lastImplementedHash): then record the new hash.
 * The conventions are the block between <!-- design-plugin:conventions <hash> --> and
 * <!-- /design-plugin:conventions --> in the readme header (readmeHeader in .design-sync/config.json,
 * or --sync-config <path>). The project fits the block to itself (the provider's name), so check
 * compares the hash in its start marker with the plugin block's, not the text: same | differs |
 * unmarked (no markers) | missing (no file); conventions is null without a readme header. mark writes
 * the plugin block's hash into the start marker, once the block is merged or kept as is.
 * Exit codes: 2 for a usage or read error.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = fileURLToPath(new URL('../../../', import.meta.url));
const TEMPLATES = join(PLUGIN, 'skills/design-palette/templates');
const CONVENTIONS = join(PLUGIN, 'references/conventions.md');
const FILES = { 'design-nav.js': 'design-nav.js', 'Tailwind.html': 'tailwind-classes.html', 'Palette.dc.html': 'palette-preview.dc.html' };

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args.splice(i, 2)[1];
};
const manifestPath = flag('--manifest') ?? 'design.manifest.json';
const syncConfigPath = flag('--sync-config') ?? '.design-sync/config.json';
const [command, ...rest] = args;

const fail = (message) => {
  console.error('plugin-files: ' + message);
  process.exit(2);
};
const read = (file) => {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    return fail(`cannot read ${file}: ${error.message}`);
  }
};
const loadManifest = () => {
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return fail(`cannot read ${manifestPath}: ${error.message}`);
  }
};
const pluginVersion = () => JSON.parse(read(join(PLUGIN, '.claude-plugin/plugin.json'))).version;
const sha = (text) => createHash('sha256').update(text).digest('hex');
const print = (o) => console.log(JSON.stringify(o, null, 2));

// 1.10.0 > 1.9.2; a pre-release suffix is ignored.
const compareVersions = (a, b) => {
  const pa = String(a).split('-')[0].split('.').map(Number), pb = String(b).split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0) ? -1 : 1;
  return 0;
};

// The palette card's data-props attribute: the same lookup as palette.ts.
const PROPS_RE = /(data-dc-script[^>]*data-props=")([^"]*)(")/;
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const propsOf = (html, file) => {
  const m = html.match(PROPS_RE);
  if (!m) return fail(`${file} has no data-props: not a palette card`);
  try {
    return JSON.parse(unesc(m[2]));
  } catch (error) {
    return fail(`${file}: unreadable data-props (${error.message})`);
  }
};
const withoutProps = (html) => html.replace(PROPS_RE, '$1$3');

// The conventions block: its start marker carries the hash of the plugin text it was last brought to.
const BLOCK_RE = /<!-- design-plugin:conventions(?: ([0-9a-f]+))? -->\n?([^]*?)<!-- \/design-plugin:conventions -->/;
const pluginBlock = () => {
  const m = read(CONVENTIONS).match(BLOCK_RE);
  if (!m) return fail(`${CONVENTIONS} has no conventions block`);
  return { text: m[2], hash: sha(m[2]).slice(0, 12) };
};
// The readme header /design sync publishes, from its config; null when the project has none.
const readmeHeader = () => {
  if (!existsSync(syncConfigPath)) return null;
  try {
    return JSON.parse(readFileSync(syncConfigPath, 'utf8')).readmeHeader ?? null;
  } catch (error) {
    return fail(`cannot read ${syncConfigPath}: ${error.message}`);
  }
};

if (command === 'check') {
  const manifest = loadManifest(), plugin = pluginVersion(), project = manifest.pluginVersion ?? null;
  const order = project === null ? null : compareVersions(project, plugin);
  const version = order === null ? 'unstamped' : order < 0 ? 'behind' : order > 0 ? 'ahead' : 'current';
  const scriptPath = manifest.palette?.script ?? null;
  const paletteScript = scriptPath === null ? null : {
    path: scriptPath,
    state: !existsSync(scriptPath) ? 'missing' : read(scriptPath) === read(join(PLUGIN, 'skills/design-palette/scripts/palette.ts')) ? 'same' : 'differs',
  };
  const header = readmeHeader();
  const conventions = header === null ? null : { path: header, state: (() => {
    if (!existsSync(header)) return 'missing';
    const m = read(header).match(BLOCK_RE);
    return !m ? 'unmarked' : m[1] === pluginBlock().hash ? 'same' : 'differs';
  })() };
  const update = version === 'behind' || version === 'unstamped' || [paletteScript, conventions].some((c) => c !== null && c.state !== 'same');
  print({ plugin, project, version, paletteScript, conventions, update: version !== 'ahead' && update });
  process.exit(version === 'ahead' ? 3 : update ? 1 : 0);
} else if (command === 'compare') {
  const dir = rest[0];
  if (!dir) fail('usage: plugin-files.mjs compare <dir>');
  const out = Object.fromEntries(Object.entries(FILES).map(([name, template]) => {
    const file = join(dir, name);
    if (!existsSync(file)) return [name, 'absent'];
    const mine = read(join(TEMPLATES, template)), theirs = read(file);
    const same = name === 'Palette.dc.html' ? withoutProps(mine) === withoutProps(theirs) : mine === theirs;
    return [name, same ? 'same' : 'differs'];
  }));
  print(out);
  process.exit(Object.values(out).includes('differs') ? 1 : 0);
} else if (command === 'card') {
  const [remote, out] = rest;
  if (!remote || !out) fail('usage: plugin-files.mjs card <remote-card> <out>');
  const theirs = read(remote), template = read(join(TEMPLATES, FILES['Palette.dc.html']));
  const old = propsOf(theirs, remote), props = propsOf(template, 'the plugin template');
  if (!old.inputs?.default) fail(`${remote} has no inputs: seed it with palette.ts --to-card instead`);
  const kept = [], added = [];
  Object.keys(props).forEach((k) => {
    if (old[k] && 'default' in old[k]) { props[k].default = old[k].default; kept.push(k); } else added.push(k);
  });
  const dropped = Object.keys(old).filter((k) => !(k in props));
  // The data must load in the plugin's engine: an override it rejects would break the new card.
  const { fromInputs, overrideErrors } = await import(join(PLUGIN, 'skills/design-palette/scripts/palette.ts'));
  try {
    const o = props.overrides?.default || {}, errors = overrideErrors(fromInputs(props.inputs.default, o), o);
    if (errors.length) fail(`${remote}: invalid token overrides: ${errors.join('; ')}`);
  } catch (error) {
    fail(`${remote}: its inputs don't load in the plugin's palette engine (${error.message})`);
  }
  const html = template.replace(PROPS_RE, (_, a, __, c) => a + esc(JSON.stringify(props)) + c);
  writeFileSync(out, html);
  const manifest = existsSync(manifestPath) ? loadManifest() : null;
  const oldHash = sha(theirs), newHash = sha(html);
  print({ kept, dropped, added, oldHash, newHash, implemented: !!manifest && manifest.palette?.lastImplementedHash === oldHash, unchanged: oldHash === newHash });
} else if (command === 'stamp') {
  const manifest = loadManifest(), plugin = pluginVersion();
  if (manifest.pluginVersion && compareVersions(manifest.pluginVersion, plugin) > 0) fail(`the manifest is at ${manifest.pluginVersion}, newer than this plugin (${plugin}): update the plugin`);
  // Right after designProjectId and reconcileRule, so it reads with the project's identity.
  const next = {};
  Object.entries(manifest).forEach(([k, v]) => {
    if (k === 'pluginVersion') return;
    next[k] = v;
    if (k === 'reconcileRule' || (k === 'designProjectId' && !('reconcileRule' in manifest))) next.pluginVersion = plugin;
  });
  if (!('pluginVersion' in next)) next.pluginVersion = plugin;
  const tmp = `${manifestPath}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(tmp, manifestPath);
  console.log(`pluginVersion: ${plugin}`);
} else if (command === 'conventions') {
  const { text, hash } = pluginBlock();
  process.stdout.write(`<!-- design-plugin:conventions ${hash} -->\n${text}<!-- /design-plugin:conventions -->\n`);
} else if (command === 'mark') {
  const header = readmeHeader();
  if (header === null) fail(`no readmeHeader in ${syncConfigPath}`);
  const text = read(header), { hash } = pluginBlock();
  if (!BLOCK_RE.test(text)) fail(`${header} has no design-plugin:conventions markers: put the block between them first`);
  writeFileSync(header, text.replace(BLOCK_RE, (_, __, block) => `<!-- design-plugin:conventions ${hash} -->\n${block}<!-- /design-plugin:conventions -->`));
  console.log(`conventions: ${hash}`);
} else {
  fail('usage: plugin-files.mjs check | compare <dir> | card <remote-card> <out> | stamp | conventions | mark  [--manifest <path>] [--sync-config <path>]');
}
