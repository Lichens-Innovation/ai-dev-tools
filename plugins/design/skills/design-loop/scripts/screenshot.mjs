#!/usr/bin/env node
/**
 * screenshot.mjs — the design loop's "eyes".
 *
 * Renders a source to a PNG so the agent can read it and compare a Storybook
 * story against a Claude Design target. Used for BOTH sides of the compare:
 *   - the live story:   http://localhost:6006/iframe.html?id=<storyId>&viewMode=story
 *   - the design target: a local .html file written from DesignSync get_file
 * and for screens: the running app (a dev-server URL) against its mockup.
 *
 * Usage:
 *   node screenshot.mjs <url-or-html-file> <out.png> [--selector "#storybook-root"] [--viewport 1440x900]
 *     [--color-scheme light|dark] [--storage-state <auth.json>]
 *   node screenshot.mjs --save-auth <url> <auth.json>
 *
 * --viewport sets the page size (default 1280x720): screens render at their manifest viewport.
 * --color-scheme emulates the OS mode, for apps that follow prefers-color-scheme.
 * --storage-state loads a saved login (cookies + localStorage), for apps behind a sign-in.
 * --save-auth opens a visible browser on <url>: sign in, then click the "Save login" button it adds
 *   (bottom right). The login is saved to <auth.json> then, once; nothing touches the page before. The file holds session tokens: keep it git-ignored, never upload it.
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
const flag = name => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1] ?? '';
};

if (args[0] === '--save-auth') {
  const [, url, statePath] = args;
  if (!url || !statePath) {
    console.error('Usage: node screenshot.mjs --save-auth <url> <auth.json>');
    process.exit(1);
  }
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: null });
  // Nothing touches the page while the user signs in: the login is saved once, when they click
  // the "Save login" button added to every page of the window.
  let done;
  const saved = new Promise(resolve => (done = resolve));
  await context.exposeBinding('__designScreensSaveAuth', async () => {
    await context.storageState({ path: statePath });
    done(true);
  });
  await context.addInitScript(() => {
    const add = () => {
      if (!document.body || document.getElementById('__design-screens-save')) return;
      const button = document.createElement('button');
      button.id = '__design-screens-save';
      button.textContent = 'Save login';
      button.title = 'Click once you are signed in and see the app';
      button.style.cssText =
        'position:fixed;right:16px;bottom:16px;z-index:2147483647;padding:10px 16px;border:0;border-radius:8px;' +
        'background:#2563eb;color:#fff;font:600 14px system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3);cursor:pointer';
      button.onclick = () => {
        button.textContent = 'Saving…';
        window.__designScreensSaveAuth();
      };
      document.body.append(button);
    };
    document.addEventListener('DOMContentLoaded', add);
    new MutationObserver(add).observe(document, { childList: true, subtree: true });
  });
  browser.on('disconnected', () => done(false));
  const page = await context.newPage();
  await page.goto(url);
  console.log('Sign in in the browser window. Once you see the app, click "Save login" (bottom right).');
  const ok = await saved;
  await browser.close().catch(() => {});
  if (!ok) {
    console.error('The window was closed before "Save login": nothing saved.');
    process.exit(1);
  }
  console.log(statePath);
  process.exit(0);
}

const source = args[0];
const outPath = args[1];
const selector = flag('--selector');
const vpArg = flag('--viewport');
const vp = vpArg !== null ? /^(\d+)x(\d+)$/.exec(vpArg) : null;
if (vpArg !== null && !vp) {
  console.error('--viewport takes <width>x<height>, e.g. 1440x900');
  process.exit(1);
}
const colorScheme = flag('--color-scheme');
if (colorScheme !== null && colorScheme !== 'light' && colorScheme !== 'dark') {
  console.error('--color-scheme takes light or dark');
  process.exit(1);
}
const storageState = flag('--storage-state');
if (storageState !== null && !existsSync(storageState)) {
  console.error(`Storage state not found: ${storageState}. Record it with --save-auth.`);
  process.exit(1);
}

if (!source || !outPath) {
  console.error(
    'Usage: node screenshot.mjs <url-or-html-file> <out.png> [--selector "#sel"] [--viewport WxH] [--color-scheme light|dark] [--storage-state <file>]'
  );
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
  const context = await browser.newContext({
    deviceScaleFactor: 2,
    ...(vp && { viewport: { width: Number(vp[1]), height: Number(vp[2]) } }),
    ...(colorScheme && { colorScheme }),
    ...(storageState && { storageState })
  });
  const page = await context.newPage();
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
