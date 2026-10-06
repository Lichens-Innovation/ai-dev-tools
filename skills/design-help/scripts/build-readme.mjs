#!/usr/bin/env node
// Renders the design plugin's README.md as a standalone HTML page and prints its path.
// Usage: node build-readme.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const readmePath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../README.md');
const readmeDir = dirname(readmePath);
// The page lives in the temp dir, so relative images are inlined as data URIs.
const markdown = readFileSync(readmePath, 'utf8').replace(/!\[([^\]]*)\]\((\.[^)\s]+)\)/g, (match, alt, src) => {
  const file = resolve(readmeDir, src);
  if (!existsSync(file)) return match;
  const type = extname(file) === '.svg' ? 'image/svg+xml' : 'image/png';
  return `![${alt}](data:${type};base64,${readFileSync(file).toString('base64')})`;
});
// `<` is escaped so the README can never close the script tag.
const data = JSON.stringify(markdown).replace(/</g, '\\u003c');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>design plugin</title>
<style>
  body { font: 16px/1.6 system-ui, sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1rem; color: #1f2328; }
  pre, code { background: #f6f8fa; border-radius: 6px; font-size: 0.9em; }
  code { padding: 0.15em 0.35em; }
  pre { padding: 1rem; overflow-x: auto; }
  pre code { padding: 0; }
  table { border-collapse: collapse; display: block; overflow-x: auto; }
  th, td { border: 1px solid #d0d7de; padding: 0.4rem 0.7rem; vertical-align: top; }
  th { background: #f6f8fa; }
  @media (prefers-color-scheme: dark) {
    body { background: #0d1117; color: #e6edf3; }
    pre, code, th { background: #161b22; }
    th, td { border-color: #30363d; }
    a { color: #58a6ff; }
  }
</style>
</head>
<body>
<main id="content"><pre id="raw"></pre></main>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script>
  const markdown = ${data};
  if (window.marked) document.getElementById('content').innerHTML = marked.parse(markdown);
  else document.getElementById('raw').textContent = markdown;
</script>
</body>
</html>
`;

const outDir = join(tmpdir(), 'design-help');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'readme.html');
writeFileSync(outPath, html);
console.log(outPath);
