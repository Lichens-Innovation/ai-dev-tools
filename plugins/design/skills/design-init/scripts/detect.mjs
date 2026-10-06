#!/usr/bin/env node
// design-init detector: read-only. Prints JSON describing the Claude Code prerequisites of the design plugin and what
// each package of the project already has (Tailwind, Storybook, Chromatic, Playwright), plus a Storybook review.
// Usage: node detect.mjs [projectDir]. Zero dependencies.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '.');
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const readText = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
const major = (v) => { const m = /(\d+)\./.exec(v ?? ''); return m ? Number(m[1]) : null; };
const minor = (v) => { const m = /\d+\.(\d+)/.exec(v ?? ''); return m ? Number(m[1]) : null; };

// 1. Claude Code prerequisites (README "Prerequisites"). /design-login and the `/design sync` listing are not detectable here.
const settingsFiles = [join(root, '.claude/settings.json'), join(root, '.claude/settings.local.json'), join(homedir(), '.claude/settings.json')];
const settings = settingsFiles.filter(existsSync).map((file) => {
  const j = readJson(file) ?? {};
  return { file, disableBundledSkills: j.disableBundledSkills === true, designSyncDenied: (j.permissions?.deny ?? []).some((d) => String(d).startsWith('DesignSync')) };
});
const mcpSources = [readJson(join(root, '.mcp.json'))?.mcpServers, readJson(join(homedir(), '.claude.json'))?.mcpServers, readJson(join(homedir(), '.claude.json'))?.projects?.[root]?.mcpServers];
const claudeDesignMcp = mcpSources.some((s) => s && Object.keys(s).some((k) => k.includes('claude-design')));
const nodeVersion = process.versions.node;
const prerequisites = {
  node: { version: nodeVersion, ok: major(nodeVersion + '.') >= 22 && (major(nodeVersion + '.') > 22 || minor(nodeVersion) >= 18) },
  claudeDesignMcp,
  settings,
  fixes: [
    ...settings.filter((s) => s.disableBundledSkills).map((s) => `${s.file}: set "disableBundledSkills" to false (turn unwanted bundled skills off with skillOverrides)`),
    ...settings.filter((s) => s.designSyncDenied).map((s) => `${s.file}: remove "DesignSync" from permissions.deny`),
    ...(claudeDesignMcp ? [] : ['claude mcp add --scope user --transport http claude-design https://api.anthropic.com/v1/design/mcp, then /design-login']),
  ],
};

// 2. Project packages: the root plus workspace packages.
const pm = existsSync(join(root, 'pnpm-lock.yaml')) ? 'pnpm' : existsSync(join(root, 'yarn.lock')) ? 'yarn' : existsSync(join(root, 'bun.lock')) || existsSync(join(root, 'bun.lockb')) ? 'bun' : 'npm';
const rootPkg = readJson(join(root, 'package.json')) ?? {};
const globs = [
  ...(Array.isArray(rootPkg.workspaces) ? rootPkg.workspaces : rootPkg.workspaces?.packages ?? []),
  ...[...readText(join(root, 'pnpm-workspace.yaml')).matchAll(/^\s*-\s*['"]?([^'"#\n]+?)['"]?\s*$/gm)].map((m) => m[1]).filter((g) => !g.startsWith('!')),
];
const monorepo = globs.length > 0 || ['turbo.json', 'nx.json', 'lerna.json'].some((f) => existsSync(join(root, f)));
const dirs = new Set([root]);
for (const g of globs) {
  const base = g.replace(/\/\*\*?$/, '');
  if (base.includes('*')) continue;
  const abs = join(root, base);
  if (g.endsWith('*')) { if (existsSync(abs)) for (const e of readdirSync(abs)) if (existsSync(join(abs, e, 'package.json'))) dirs.add(join(abs, e)); }
  else if (existsSync(join(abs, 'package.json'))) dirs.add(abs);
}

function countStories(dir) {
  let n = 0;
  const walk = (d, depth) => {
    if (depth > 6 || n >= 50) return;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.') && e.name !== '.storybook' || e.name === 'storybook-static' || e.name === 'dist') continue;
      if (e.isDirectory()) walk(join(d, e.name), depth + 1);
      else if (/\.stories\.(t|j)sx?$|\.stories\.mdx$/.test(e.name)) n++;
    }
  };
  try { walk(dir, 0); } catch { /* unreadable dir */ }
  return n;
}

const mcpEntries = Object.entries(readJson(join(root, '.mcp.json'))?.mcpServers ?? {}).filter(([k, v]) => k.startsWith('storybook') || String(v?.url ?? '').endsWith('/mcp'));

const packages = [...dirs].map((dir) => {
  const pkg = readJson(join(dir, 'package.json'));
  if (!pkg) return null;
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const has = (re) => Object.keys(deps).filter((d) => re.test(d));
  const sbDir = join(dir, '.storybook');
  const mainFile = ['main.ts', 'main.js', 'main.mts', 'main.mjs', 'main.cjs'].map((f) => join(sbDir, f)).find(existsSync);
  const main = mainFile ? readText(mainFile) : '';
  const sbVersion = deps.storybook ?? null;
  const sbInstalled = Boolean(sbVersion || existsSync(sbDir));
  const mobile = Boolean(deps['react-native'] || deps.expo);
  const addons = has(/^@storybook\/addon-/).map((a) => a.replace('@storybook/', ''));
  const frameworks = has(/^@storybook\/(react|nextjs|react-native|react-native-web)[a-z-]*$/);
  const stories = sbInstalled ? countStories(dir) : null;
  const scripts = pkg.scripts ?? {};
  const issues = [];
  if (sbInstalled) {
    const v = major(String(sbVersion ?? '').replace(/^[^\d]*/, '') + '.');
    if (v !== null && v < 10) issues.push({ level: 'warn', msg: `Storybook ${sbVersion}: addon-mcp and the tool names the loop uses (docs-show, stories-changed, test-run) are from 10.x; upgrade or verify with tools/list` });
    if (!addons.includes('addon-mcp')) issues.push({ level: 'warn', msg: 'no @storybook/addon-mcp: the Storybook MCP (<url>/mcp) is not served' });
    if (!addons.includes('addon-vitest') || !addons.includes('addon-a11y')) issues.push({ level: 'info', msg: 'addon-vitest and/or addon-a11y missing: the MCP test-run is limited' });
    if (!mainFile) issues.push({ level: 'warn', msg: 'no .storybook/main.* found' });
    if (mainFile && (v ?? 10) >= 10 && /\b__dirname\b|\brequire\(/.test(main) && !/createRequire/.test(main)) issues.push({ level: 'warn', msg: `${relative(root, mainFile)} uses __dirname/require; Storybook 10 is ESM-only (import.meta, createRequire)` });
    if (!scripts.storybook) issues.push({ level: 'warn', msg: 'no "storybook" script' });
    if (!scripts['build-storybook']) issues.push({ level: 'warn', msg: 'no "build-storybook" script (Chromatic and CI build statically)' });
    if (mobile && !frameworks.some((f) => f.includes('react-native-web'))) issues.push({ level: 'warn', msg: 'React Native target without @storybook/react-native-web-vite: no browser render for Playwright/Chromatic (see storybook-init references/react-native.md)' });
    if (stories === 0) issues.push({ level: 'warn', msg: 'no *.stories.* files: components need stories before design-loop can render them' });
    if (!mcpEntries.length) issues.push({ level: 'warn', msg: 'no Storybook MCP entry in .mcp.json' });
    if (!has(/^playwright(-core)?$|^@playwright\/test$/).length && !has(/^playwright/).length) issues.push({ level: 'info', msg: 'Playwright not in this package (it may be installed at the root)' });
  }
  return {
    dir: relative(root, dir) || '.',
    name: pkg.name ?? null,
    react: Boolean(deps.react),
    mobile,
    tailwind: { installed: Boolean(deps.tailwindcss), version: deps.tailwindcss ?? null, integrations: has(/^@tailwindcss\/|^nativewind$|^react-native-css$/) },
    storybook: { installed: sbInstalled, version: sbVersion, config: mainFile ? relative(root, mainFile) : null, frameworks, addons, stories, scripts: { storybook: scripts.storybook ?? null, build: scripts['build-storybook'] ?? null }, issues },
    chromatic: { installed: Boolean(deps.chromatic), script: scripts.chromatic ?? null },
    playwright: Boolean(has(/^playwright/).length || deps['@playwright/test']),
  };
}).filter(Boolean);

const manifestPath = join(root, 'design.manifest.json');
const out = {
  root,
  packageManager: pm,
  monorepo,
  prerequisites,
  storybookMcpEntries: mcpEntries.map(([k, v]) => ({ name: k, url: v?.url ?? null })),
  manifest: existsSync(manifestPath) && statSync(manifestPath).isFile() ? { designProjectId: readJson(manifestPath)?.designProjectId ?? null } : null,
  packages,
};
console.log(JSON.stringify(out, null, 2));
