#!/usr/bin/env node
/**
 * nav-tag.mjs — checks that the synced cards load the shared navbar, and adds the tag when they don't.
 *
 * `/design-sync` writes each card (components/<group>/<Name>/<Name>.html) without a reference to
 * design-nav.js, and the design provider does not always load it. Without the tag a card has no
 * navbar, card list or light/dark switch.
 *
 * Usage:
 *   node nav-tag.mjs <ds-bundle-dir> [--fix]
 *
 * Lists the cards under <ds-bundle-dir>/components that don't load design-nav.js. With --fix, adds
 * <script src="<relative path>/design-nav.js"></script> before </body> (end of file when there is
 * none). Run it again after every /design-sync, before uploading: a sync rewrites the cards.
 * Exit code: 0 when every card loads the navbar (or after --fix), 1 when some don't.
 * design-nav.js guards against double loading, so a card the provider also injects into is safe.
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, sep, posix } from 'node:path';

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const dir = args.find((a) => !a.startsWith('--'));
if (!dir) {
  console.error('usage: node nav-tag.mjs <ds-bundle-dir> [--fix]');
  process.exit(2);
}

const cards = (folder) =>
  readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : cards(path);
    return name.endsWith('.html') ? [path] : [];
  });

const components = join(dir, 'components');
let files;
try {
  files = cards(components);
} catch {
  console.error(`no components/ folder in ${dir}`);
  process.exit(2);
}

const missing = files.filter((file) => !readFileSync(file, 'utf8').includes('design-nav.js'));

if (fix) {
  for (const file of missing) {
    const depth = relative(dir, file).split(sep).length - 1;
    const tag = `<script src="${posix.join(...Array(depth).fill('..'), 'design-nav.js')}"></script>`;
    const html = readFileSync(file, 'utf8');
    const at = html.lastIndexOf('</body>');
    writeFileSync(file, at === -1 ? `${html}\n${tag}\n` : `${html.slice(0, at)}${tag}\n${html.slice(at)}`);
  }
  console.log(`added the navbar tag to ${missing.length} of ${files.length} cards`);
  process.exit(0);
}

for (const file of missing) console.log(relative(dir, file));
console.log(`${files.length - missing.length} of ${files.length} cards load design-nav.js`);
process.exit(missing.length ? 1 : 0);
