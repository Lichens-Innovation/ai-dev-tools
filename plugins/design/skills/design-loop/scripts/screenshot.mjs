#!/usr/bin/env node
/**
 * screenshot.mjs — the design loop's "eyes".
 *
 * Renders a source to a PNG so the agent can read it and compare a Storybook
 * story against a Claude Design target. Used for BOTH sides of the compare:
 *   - the live story:   http://localhost:6006/iframe.html?id=<storyId>&viewMode=story
 *   - the design target: a local .html file written from DesignSync get_file
 *
 * Usage:
 *   node screenshot.mjs <url-or-html-file> <out.png> [--selector "#storybook-root"]
 *
 * Requires Playwright (installed by storybook-init):  npm i -D playwright && npx playwright install chromium
 * Run it from the Storybook target's dir: Playwright resolves from the working directory.
 */
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

// Resolve Playwright from the project (the working directory), not from this plugin folder:
// run the script from a directory whose node_modules has it, e.g. the Storybook target's dir.
let chromium;
try {
  ({ chromium } = createRequire(join(process.cwd(), 'noop.js'))('playwright'));
} catch {
  console.error(`Playwright not found from ${process.cwd()}. Run from the Storybook target's dir, or install it there.`);
  process.exit(1);
}

const args = process.argv.slice(2);
const source = args[0];
const outPath = args[1];
const selIdx = args.indexOf('--selector');
const selector = selIdx !== -1 ? args[selIdx + 1] : null;

if (!source || !outPath) {
  console.error('Usage: node screenshot.mjs <url-or-html-file> <out.png> [--selector "#sel"]');
  process.exit(1);
}

const isUrl = /^https?:\/\//.test(source);
if (!isUrl && !existsSync(source)) {
  console.error(`Source file not found: ${source}`);
  process.exit(1);
}
const url = isUrl ? source : pathToFileURL(source).href;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  // Prefer an explicit selector, else the Storybook story root, else the body.
  const target =
    (selector && (await page.$(selector))) ||
    (await page.$('#storybook-root')) ||
    (await page.$('#root'));
  if (target) {
    await target.screenshot({ path: outPath });
  } else {
    await page.screenshot({ path: outPath, fullPage: true });
  }
  console.log(outPath);
} finally {
  await browser.close();
}
