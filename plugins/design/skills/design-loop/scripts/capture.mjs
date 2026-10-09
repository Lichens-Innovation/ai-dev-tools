#!/usr/bin/env node
/**
 * capture.mjs — captures a rendered component or screen as a reference page of the local design
 * studio (references/local-studio.md). The local backend's counterpart of /design sync + the
 * screen mockup build.
 *
 *   node capture.mjs component <name> --storybook-url <url> --story-id <id> [--viewport WxH]
 *   node capture.mjs screen <name> --url <app-url> [--storage-state <auth.json>] [--viewport WxH]
 *
 * Options: --manifest <path> (default design.manifest.json; design/ sits next to it), --force
 * (overwrite a reference that was edited since it was captured).
 *
 * It writes, under design/:
 *   components/<kebab>.html | screens/<kebab>.html   the rendered DOM (the body's children, so portalled
 *                                                     dialogs and menus come too), scripts stripped
 *   assets/project.css                                the page's stylesheets, urls pointing at assets/
 *   assets/<hash>.<ext>                               its images and fonts
 *   index.json                                        the page's row (sourceHash, referenceHash)
 * and, for a screen, `mockupHash` and `sourceHash` on its manifest row.
 *
 * A reference whose hash is no longer the one recorded at capture was edited by hand: the script
 * refuses to overwrite it (exit 3) unless --force is given.
 *
 * Requires Playwright (installed by storybook-init). Run it from the Storybook target's dir (or the
 * app's): Playwright resolves from the working directory, like screenshot.mjs.
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileHash, findRow, insideDesign, kebab, loadManifest, readIndex, sha256, sourceHashOf } from './local-backend.mjs';

const ASSET_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'font/woff': 'woff',
  'font/woff2': 'woff2',
  'font/ttf': 'ttf',
  'font/otf': 'otf',
  'application/font-woff': 'woff',
  'application/font-woff2': 'woff2',
  'application/x-font-ttf': 'ttf',
};
// What the studio's /render serves (apps/design-studio/src/server/render.ts): anything else would 404 there.
const SERVED = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico', 'woff', 'woff2', 'ttf', 'otf']);
const TOKEN = /@@asset:(\d+)@@/g;
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s'"]*))\s*\)/gi;
const SHEET_START = /^\/\* design-capture sheet ([0-9a-f]{16}) owners=(\S*) \*\/$/;
const SHEET_END = '/* design-capture end */';

const fail = (message, code = 1) => {
  console.error(message);
  process.exit(code);
};

// --- project.css: one block per distinct stylesheet, with the pages that use it ---------------

function parseBlocks(css) {
  const blocks = [];
  let current = null;
  for (const line of css.split('\n')) {
    const start = SHEET_START.exec(line);
    if (start) current = { hash: start[1], owners: new Set(start[2].split(',').filter(Boolean)), lines: [] };
    else if (line === SHEET_END && current) {
      blocks.push({ hash: current.hash, owners: current.owners, css: current.lines.join('\n') });
      current = null;
    } else if (current) current.lines.push(line);
  }
  return blocks;
}

/** Re-captured pages give up the blocks they used; a block nobody uses any more is dropped. */
export function mergeSheets(existing, owner, sheets) {
  const blocks = parseBlocks(existing).filter((b) => {
    b.owners.delete(owner);
    return b.owners.size > 0;
  });
  for (const css of sheets) {
    const hash = sha256(css).slice(0, 16);
    const known = blocks.find((b) => b.hash === hash);
    if (known) known.owners.add(owner);
    else blocks.push({ hash, owners: new Set([owner]), css });
  }
  return `${blocks
    .map((b) => `/* design-capture sheet ${b.hash} owners=${[...b.owners].sort().join(',')} */\n${b.css}\n${SHEET_END}`)
    .join('\n')}\n`;
}

// --- reading the page ---------------------------------------------------------------------------

/** Runs in the page: the body's children as html with every url turned into an @@asset:n@@ token. */
function snapshotPage() {
  const urls = [];
  const token = (raw) => {
    if (!raw || raw.startsWith('#') || /^data:/i.test(raw)) return raw;
    let abs;
    try {
      abs = new URL(raw, document.baseURI).href;
    } catch {
      return 'data:,';
    }
    let i = urls.indexOf(abs);
    if (i === -1) i = urls.push(abs) - 1;
    return `@@asset:${i}@@`;
  };
  const cssUrls = (css) =>
    css.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s'"]*))\s*\)/gi, (_m, a, b, c) => `url("${token(a ?? b ?? c ?? '')}")`);

  const root = document.createElement('div');
  for (const child of document.body.children) {
    if (/^(script|style|link|noscript|template|base)$/i.test(child.tagName)) continue;
    if (child.id === 'storybook-docs' || [...child.classList].some((c) => c.startsWith('sb-'))) continue;
    if (getComputedStyle(child).display === 'none') continue;
    root.append(child.cloneNode(true));
  }
  // Frames and plugins load whole documents, which a snapshot cannot hold: they go with the scripts.
  for (const el of root.querySelectorAll('script, noscript, template, link, base, iframe, frame, embed, object')) el.remove();
  for (const el of root.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) el.removeAttribute(attr.name);
      else if (name === 'srcset') {
        el.setAttribute(
          attr.name,
          attr.value
            .split(',')
            .map((part) => {
              const [url, ...descriptor] = part.trim().split(/\s+/);
              return [token(url), ...descriptor].join(' ');
            })
            .join(', '),
        );
      } else if (name === 'src' || name === 'poster' || name === 'data' || name === 'xlink:href' || (name === 'href' && el.namespaceURI?.endsWith('svg'))) {
        el.setAttribute(attr.name, token(attr.value));
      } else if (name === 'style') el.setAttribute(attr.name, cssUrls(attr.value));
    }
  }
  // An anchor's href is a link, not something the page loads; only javascript: urls go.
  for (const a of root.querySelectorAll('a[href]')) if (/^\s*javascript:/i.test(a.getAttribute('href'))) a.removeAttribute('href');

  const sheets = [];
  const visit = (sheet, depth = 0) => {
    const base = sheet.href || document.baseURI;
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      sheets.push({ href: sheet.href, base, css: null });
      return;
    }
    let css = '';
    for (const rule of rules) {
      if (rule.type === CSSRule.IMPORT_RULE && rule.styleSheet && depth < 5) visit(rule.styleSheet, depth + 1);
      else css += `${rule.cssText}\n`;
    }
    sheets.push({ href: sheet.href, base, css });
  };
  for (const sheet of [...document.styleSheets, ...document.adoptedStyleSheets]) visit(sheet);

  const attrs = (el) =>
    [...el.attributes]
      .filter((a) => !a.name.toLowerCase().startsWith('on') && a.name.toLowerCase() !== 'style')
      .map((a) => [a.name, a.value]);
  return {
    html: root.innerHTML,
    urls,
    sheets,
    title: document.title,
    htmlAttrs: attrs(document.documentElement),
    bodyAttrs: attrs(document.body),
  };
}

// --- assets -----------------------------------------------------------------------------------

function createAssets(designDir, context, tab) {
  const assetsDir = join(designDir, 'assets');
  const cache = new Map();
  const failed = [];
  return {
    failed,
    /** Saves the asset at `url` as assets/<hash>.<ext>; resolves to that file name, or null when it cannot be had. */
    save(url) {
      if (cache.has(url)) return cache.get(url);
      const done = (async () => {
        try {
          let body;
          let type = '';
          if (/^blob:/i.test(url)) {
            const got = await tab.evaluate(async (u) => {
              const blob = await (await fetch(u)).blob();
              const bytes = new Uint8Array(await blob.arrayBuffer());
              let binary = '';
              for (const b of bytes) binary += String.fromCharCode(b);
              return { type: blob.type, data: btoa(binary) };
            }, url);
            body = Buffer.from(got.data, 'base64');
            type = got.type;
          } else if (/^https?:/i.test(url)) {
            const res = await context.request.get(url, { timeout: 15_000 });
            if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
            body = await res.body();
            type = (res.headers()['content-type'] ?? '').split(';')[0].trim().toLowerCase();
          } else throw new Error('unsupported scheme');
          const fromPath = /^blob:/i.test(url) ? '' : extname(new URL(url).pathname).slice(1).toLowerCase();
          const ext = ASSET_TYPES[type] ?? (SERVED.has(fromPath) ? fromPath : null);
          if (!ext) throw new Error(`type "${type || fromPath || '?'}" is not served by the studio`);
          const file = `${sha256(body).slice(0, 16)}.${ext}`;
          mkdirSync(assetsDir, { recursive: true });
          writeFileSync(join(assetsDir, file), body);
          return file;
        } catch (error) {
          failed.push(`${url} (${error.message})`);
          return null;
        }
      })();
      cache.set(url, done);
      return done;
    },
  };
}

/** Rewrites the url() of a stylesheet to assets saved next to project.css; an unfetchable one becomes an empty data uri. */
async function rewriteCss(css, base, assets) {
  const found = [...css.matchAll(CSS_URL)];
  const isInline = (raw) => !raw || raw.startsWith('#') || /^data:/i.test(raw);
  const rawOf = (m) => m[1] ?? m[2] ?? m[3] ?? '';
  const files = await Promise.all(
    found.map(async (m) => {
      if (isInline(rawOf(m))) return null;
      try {
        return await assets.save(new URL(rawOf(m), base).href);
      } catch {
        return null;
      }
    }),
  );
  let i = 0;
  return css.replace(CSS_URL, (whole) => {
    const m = found[i];
    const file = files[i++];
    return isInline(rawOf(m)) ? whole : `url("${file ?? 'data:,'}")`;
  });
}

// --- the page file ------------------------------------------------------------------------------

const escapeAttr = (value) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const attrString = (attrs) => attrs.map(([name, value]) => ` ${name}="${escapeAttr(value)}"`).join('');
const escapeText = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function pageHtml({ title, htmlAttrs, bodyAttrs, body }) {
  const attrs = htmlAttrs.filter(([name]) => name.toLowerCase() !== 'xmlns');
  if (!attrs.some(([name]) => name === 'lang')) attrs.unshift(['lang', 'en']);
  if (!attrs.some(([name]) => name === 'data-theme')) attrs.push(['data-theme', 'light']);
  return `<!doctype html>
<html${attrString(attrs)}>
  <head>
    <meta charset="utf-8" />
    <title>${escapeText(title)}</title>
    <link rel="stylesheet" href="../assets/project.css" />
  </head>
  <body${attrString(bodyAttrs)}>
${body}
  </body>
</html>
`;
}

function writeAtomic(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, file);
}

// --- main ---------------------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => {
    const i = args.indexOf(name);
    return i === -1 ? null : (args.splice(i, 2)[1] ?? '');
  };
  const force = args.includes('--force');
  if (force) args.splice(args.indexOf('--force'), 1);
  const manifestPath = flag('--manifest') ?? 'design.manifest.json';
  const storybookUrl = flag('--storybook-url');
  const storyId = flag('--story-id');
  const appUrl = flag('--url');
  const storageState = flag('--storage-state');
  const viewportArg = flag('--viewport');
  const [kind, name] = args;

  const usage =
    'Usage: capture.mjs component <name> --storybook-url <url> --story-id <id> | capture.mjs screen <name> --url <app-url> [--storage-state <file>] [--viewport WxH]';
  if ((kind !== 'component' && kind !== 'screen') || !name) fail(usage, 2);
  if (kind === 'component' && (!storybookUrl || !storyId)) fail(usage, 2);
  if (kind === 'screen' && !appUrl) fail(usage, 2);
  if (storageState && !existsSync(storageState)) fail(`Storage state not found: ${storageState}. Record it with screenshot.mjs --save-auth.`, 2);
  const vp = viewportArg ? /^(\d+)x(\d+)$/.exec(viewportArg) : null;
  if (viewportArg && !vp) fail('--viewport takes <width>x<height>, e.g. 1440x900', 2);

  let loaded;
  let found;
  try {
    loaded = loadManifest(manifestPath);
    found = findRow(loaded.manifest, `${kind}:${name}`);
  } catch (error) {
    fail(error.message, 2);
  }
  const { manifest, root } = loaded;
  const designDir = join(root, 'design');
  const page = kebab(name);
  const referenceRel = (kind === 'screen' ? found.row.mockupPath : found.row.designPath) ?? `design/${kind === 'screen' ? 'screens' : 'components'}/${page}.html`;
  let referenceFile;
  try {
    referenceFile = insideDesign(root, referenceRel);
  } catch (error) {
    fail(error.message, 2);
  }
  const index = readIndex(root);
  const row = index.pages.find((p) => p.kind === kind && kebab(p.name) === page);

  // An edited reference is somebody's work: refuse before opening a browser.
  const expected = kind === 'screen' && found.row.mockupHash ? found.row.mockupHash : row?.referenceHash;
  const current = fileHash(referenceFile);
  if (!force && current && expected && current !== expected) {
    fail(
      `${relative(root, referenceFile)} was edited since it was captured (hash ${current.slice(0, 8)}…, captured ${expected.slice(0, 8)}…). ` +
        'References are read only: a change belongs in the proposal. Re-run with --force to overwrite it anyway.',
      3,
    );
  }

  let chromium;
  try {
    ({ chromium } = createRequire(join(process.cwd(), 'noop.js'))('playwright'));
  } catch {
    fail(`Playwright not found from ${process.cwd()}. Run from the Storybook target's dir, or install it there.`, 2);
  }

  if (kind === 'screen') {
    console.warn(
      `WARNING: ${relative(root, referenceFile)} is captured from the running app and contains whatever real dev data the screen shows. ` +
        'design/ is committed: capture on seeded sample data, never on real customers, emails or documents. ' +
        'See references/local-studio.md#sample-data.',
    );
  }

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      deviceScaleFactor: 1,
      ...(vp && { viewport: { width: Number(vp[1]), height: Number(vp[2]) } }),
      ...(storageState && { storageState }),
    });
    const tab = await context.newPage();
    const url = kind === 'component' ? `${storybookUrl.replace(/\/+$/, '')}/iframe.html?id=${encodeURIComponent(storyId)}&viewMode=story` : appUrl;
    const response = await tab.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    if (!response?.ok()) fail(`${url} answered ${response?.status() ?? 'nothing'}.`, 2);
    if (kind === 'component') {
      const rendered = await tab
        .waitForFunction(() => (document.querySelector('#storybook-root')?.childElementCount ?? 0) > 0, null, { timeout: 15_000 })
        .then(() => true, () => false);
      if (!rendered) fail(`Story "${storyId}" rendered nothing at ${url}. Check the story id against the Storybook's index.json.`, 2);
    }
    await tab.evaluate(() => document.fonts?.ready);

    const snap = await tab.evaluate(snapshotPage);
    if (!snap.html.trim()) fail(`${url} has no visible content to capture.`, 2);

    const assets = createAssets(designDir, context, tab);
    const sheets = [];
    for (const sheet of snap.sheets) {
      let css = sheet.css;
      if (css === null) {
        // A cross-origin sheet is not readable through the CSSOM: fetch its text.
        try {
          const res = await context.request.get(sheet.href, { timeout: 15_000 });
          css = res.ok() ? await res.text() : '';
        } catch {
          css = '';
        }
      }
      if (!css.trim()) continue;
      sheets.push((await rewriteCss(css.replace(/@import\s[^;]*;/g, ''), sheet.base, assets)).trim());
    }

    const files = await Promise.all(snap.urls.map((u) => assets.save(u)));
    const body = snap.html.replace(TOKEN, (_m, n) => (files[Number(n)] ? `../assets/${files[Number(n)]}` : 'data:,'));
    const html = pageHtml({ title: snap.title || name, htmlAttrs: snap.htmlAttrs, bodyAttrs: snap.bodyAttrs, body: body.replace(/^/gm, '    ') });

    const cssFile = join(designDir, 'assets', 'project.css');
    writeAtomic(cssFile, mergeSheets(existsSync(cssFile) ? readFileSync(cssFile, 'utf8') : '', `${kind}:${page}`, sheets));
    writeAtomic(referenceFile, html);

    // The row of design/index.json. The proposal path follows the studio's layout.
    const referenceHash = sha256(html);
    const sourceHash = sourceHashOf(root, found);
    const next = {
      kind,
      name: page,
      title: name,
      reference: relative(designDir, referenceFile).split('\\').join('/'),
      proposal: kind === 'screen' ? `proposals/screens/${page}.html` : `proposals/${page}.html`,
      ...(kind === 'component' && { storyId }),
      ...(kind === 'screen' && found.row.route && { route: found.row.route }),
      states: row?.states ?? found.row.states ?? ['Default'],
      sourceHash,
      referenceHash,
    };
    const pages = index.pages.filter((p) => !(p.kind === kind && kebab(p.name) === page));
    pages.push(next);
    pages.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind.localeCompare(b.kind)));
    writeAtomic(join(designDir, 'index.json'), `${JSON.stringify({ ...index, pages }, null, 2)}\n`);

    if (kind === 'screen') {
      found.row.mockupHash = referenceHash;
      if (sourceHash) found.row.sourceHash = sourceHash;
      writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }

    if (assets.failed.length > 0) console.warn(`Could not save ${assets.failed.length} asset(s), left empty:\n  ${assets.failed.join('\n  ')}`);
    if (!sourceHash) console.warn(`No sources found for ${name} (localPath/sources in the manifest): it cannot be reported stale later.`);
    console.log(JSON.stringify({ page: `${kind}:${page}`, reference: relative(root, referenceFile), referenceHash, sourceHash, assets: files.filter(Boolean).length }, null, 2));
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
