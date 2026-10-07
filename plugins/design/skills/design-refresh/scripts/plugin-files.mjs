#!/usr/bin/env node
/**
 * plugin-files.mjs — keeps a project's copies of the design plugin's files in step with the plugin.
 *
 * A project carries copies of plugin files: the repo's palette.ts (manifest palette.script) and, in
 * Claude Design, design-nav.js, Tailwind.html and the palette card Palette.dc.html. A newer plugin
 * does not reach them by itself. design.manifest.json records the plugin version they were last
 * brought to (pluginVersion), so a cheap check tells when to look.
 *
 * Usage (the manifest is design.manifest.json in the current directory, or --manifest <path>):
 *   node plugin-files.mjs check              plugin version vs the manifest's, and the repo's palette.ts
 *   node plugin-files.mjs compare <dir>      which of the Claude Design files downloaded into <dir> differ
 *   node plugin-files.mjs card <remote> <out>  the plugin's palette card with <remote>'s data (data-props)
 *   node plugin-files.mjs stamp              write the plugin version into the manifest
 *
 * check prints { plugin, project, version: current|behind|ahead|unstamped, paletteScript, update }
 * and exits 0 when nothing needs updating, 1 when something does, 3 when the project is ahead of the
 * plugin (an older plugin installed here: update the plugin, never downgrade the project).
 * compare looks for design-nav.js, Tailwind.html and Palette.dc.html in <dir> and prints
 * same | differs | absent for each; the card is compared without its data-props (the card's data,
 * edited in Claude Design). Exit 1 when one differs.
 * card writes <out>: the plugin's template with every prop default it shares with <remote> carried
 * over (inputs, tokens, overrides, title…). It prints the props kept, dropped (only in <remote>) and
 * new (only in the template), the SHA-256 of both cards, and whether <remote> was the last
 * implemented card (manifest palette.lastImplementedHash): then record the new hash.
 * Exit codes: 2 for a usage or read error.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = fileURLToPath(new URL('../../../', import.meta.url));
const TEMPLATES = join(PLUGIN, 'skills/design-palette/templates');
const FILES = { 'design-nav.js': 'design-nav.js', 'Tailwind.html': 'tailwind-classes.html', 'Palette.dc.html': 'palette-preview.dc.html' };

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args.splice(i, 2)[1];
};
const manifestPath = flag('--manifest') ?? 'design.manifest.json';
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

if (command === 'check') {
  const manifest = loadManifest(), plugin = pluginVersion(), project = manifest.pluginVersion ?? null;
  const order = project === null ? null : compareVersions(project, plugin);
  const version = order === null ? 'unstamped' : order < 0 ? 'behind' : order > 0 ? 'ahead' : 'current';
  const scriptPath = manifest.palette?.script ?? null;
  const paletteScript = scriptPath === null ? null : {
    path: scriptPath,
    state: !existsSync(scriptPath) ? 'missing' : read(scriptPath) === read(join(PLUGIN, 'skills/design-palette/scripts/palette.ts')) ? 'same' : 'differs',
  };
  const update = version === 'behind' || version === 'unstamped' || (paletteScript !== null && paletteScript.state !== 'same');
  print({ plugin, project, version, paletteScript, update: version !== 'ahead' && update });
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
} else {
  fail('usage: plugin-files.mjs check | compare <dir> | card <remote-card> <out> | stamp  [--manifest <path>]');
}
