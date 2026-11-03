#!/usr/bin/env node
// Proposes permissions.allow rules for a project's read-only and verification commands (lint,
// typecheck, test, format checks), so parallel or spawned sessions stop prompting for them one by
// one. Zero dependencies (Node >= 18). Reads only; never writes settings: the skill asks the user
// which rules to keep and merges those itself.
//
// Usage: node suggest-allow-rules.mjs [project-dir]   (defaults to the current directory)
//
// Sources: package.json scripts, justfile recipes, Makefile targets, turbo.json tasks, and the
// commands named in CLAUDE.md. A command is proposed only if its name says it verifies something
// and neither its name nor its body (followed through the scripts, recipes or targets it calls)
// installs, pushes, publishes, deploys, fixes/writes files or deletes anything.
//
// Prints JSON: { packageManager, candidates: [{ command, kind, source, rules }], skipped: [{ command,
// source, reason }] }. `skipped` lists only verification-looking commands rejected for safety.

import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || ".");

const read = (file) => {
  try {
    return fs.readFileSync(path.join(root, file), "utf8");
  } catch {
    return null;
  }
};

const readJson = (file) => {
  const text = read(file);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

// "typeCheck", "format:check", "lint-fix" -> ["type", "check"], ["format", "check"], ["lint", "fix"]
const tokens = (name) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const KINDS = [
  ["lint", ["lint", "lints", "linter", "eslint", "stylelint", "clippy", "vet", "ruff"]],
  ["typecheck", ["typecheck", "typechecks", "tsc", "types", "mypy", "pyright"]],
  ["test", ["test", "tests", "spec", "specs", "e2e", "pytest", "vitest", "jest"]],
  ["check", ["check", "checks", "verify", "validate"]],
];
const kindOf = (words) => {
  if (words.includes("type") && words.includes("check")) return "typecheck";
  if ((words.includes("format") || words.includes("fmt") || words.includes("prettier")) && words.includes("check"))
    return "format";
  return KINDS.find(([, names]) => names.some((n) => words.includes(n)))?.[0] ?? null;
};

// Name words that make a command unsafe or unfit to auto-run (writes, network, long-running).
const UNSAFE_WORDS = new Set([
  "install", "uninstall", "add", "remove", "publish", "release", "deploy", "push", "upload", "fix",
  "write", "clean", "clear", "reset", "rm", "delete", "drop", "destroy", "migrate", "migration",
  "seed", "prune", "purge", "nuke", "bump", "version", "tag", "commit", "sync", "upgrade", "update",
  "watch", "dev", "start", "serve", "open", "ui", "interactive",
]);
const UNSAFE_NAME = /publish|install|deploy|release|destroy|migrat/i;

const nameProblem = (name) => {
  const words = tokens(name);
  const bad = words.find((w) => UNSAFE_WORDS.has(w));
  if (bad) return `its name says "${bad}"`;
  // `cargo fmt`, `ruff format` rewrite files; `format:check`, `cargo fmt --check` only read.
  const format = words.find((w) => w === "format" || w === "fmt");
  if (format && !words.includes("check")) return `its name says "${format}" without "check"`;
  if (UNSAFE_NAME.test(name)) return `its name says "${name.match(UNSAFE_NAME)[0]}"`;
  return null;
};

const UNSAFE_BODY = [
  [/\b(?:npm|pnpm|yarn|bun)\s+(?:install|i|add|ci|remove|rm|uninstall|update|upgrade|up|link|dlx|x)\b/, "installs packages"],
  [/\bnpx\b|\bbunx\b/, "npx/bunx can download packages"],
  [/\bgit\s+(?:push|commit|reset|clean|checkout|switch|rebase|merge|tag|stash|restore)\b/, "changes git state"],
  [/\bpublish\b|\bdeploy\b|\brelease\b/, "publishes or deploys"],
  [/\brm\s+-\w*[rRf]|\brimraf\b|\bfind\b.*\s-delete\b/, "deletes files"],
  [/--fix\b|--write\b|\s-u\b|--update\b|--updateSnapshot\b/, "rewrites files"],
  [/--watch(?!=false)\b|(?:^|\s)watch(?:\s|$)/, "runs in watch mode"],
  [/\bsudo\b|\|\s*(?:ba|z)?sh\b/, "runs privileged or piped shell code"],
  [/\b(?:docker|podman)\s+(?:push|rm|rmi|system\s+prune)\b/, "changes containers or images"],
  [/\b(?:kubectl|helm|terraform|pulumi|cdk|serverless|sls|vercel|netlify|firebase|wrangler|flyctl|heroku|aws|gcloud|az)\b/, "drives a cloud or deployment tool"],
  [/\bprisma\s+(?:migrate|db\s+push)|\bdrizzle-kit\s+(?:push|migrate)/, "changes a database"],
];
const bodyProblem = (body) => UNSAFE_BODY.find(([re]) => re.test(body))?.[1] ?? null;

// --- package manager ---------------------------------------------------------------------------

const LOCKFILES = [
  ["pnpm-lock.yaml", "pnpm"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"],
];
const pkg = readJson("package.json");
const packageManager =
  LOCKFILES.find(([file]) => fs.existsSync(path.join(root, file)))?.[1] ??
  (typeof pkg?.packageManager === "string" ? pkg.packageManager.split("@")[0] : null) ??
  (pkg ? "npm" : null);

const scriptForms = (name) => {
  switch (packageManager) {
    case "pnpm":
    case "yarn":
      return [`${packageManager} ${name}`, `${packageManager} run ${name}`];
    case "bun":
      return [`bun run ${name}`];
    default:
      return name === "test" ? ["npm test", "npm run test"] : [`npm run ${name}`];
  }
};

// --- sources -----------------------------------------------------------------------------------

// Each source yields { name, body, deps, source, forms }; deps are names in the same source whose
// bodies run as part of this one.
const entries = [];

if (pkg && pkg.scripts && typeof pkg.scripts === "object") {
  const scripts = pkg.scripts;
  for (const [name, body] of Object.entries(scripts)) {
    if (typeof body !== "string") continue;
    // `pnpm lint && pnpm typecheck`, `run-s lint test`: any word naming another script counts.
    const deps = (body.match(/[\w:.-]+/g) || []).filter((w) => w !== name && Object.hasOwn(scripts, w));
    entries.push({ group: "package.json", name, body, deps, source: `package.json scripts.${name}`, forms: scriptForms(name) });
  }
}

const justfile = ["justfile", "Justfile", ".justfile"].map(read).find((t) => t !== null);
if (justfile) {
  let pendingPrivate = false;
  let current = null;
  for (const line of justfile.split("\n")) {
    if (current && /^\s+\S/.test(line)) {
      current.body += `${line.trim()}\n`;
      continue;
    }
    if (/^\S/.test(line)) current = null;
    if (/^\[.*\bprivate\b.*\]\s*$/.test(line)) {
      pendingPrivate = true;
      continue;
    }
    const m = line.match(/^@?([A-Za-z_][\w-]*)((?:\s+[^:]*?)?)\s*:(?!=)(.*)$/);
    if (!m || /^(?:set|alias|export|import|mod)$/.test(m[1])) {
      if (/^\S/.test(line)) pendingPrivate = false;
      continue;
    }
    const deps = m[3]
      .replace(/#.*$/, "")
      .replace(/\([^)]*\)/g, " ")
      .split(/[\s&]+/)
      .filter((w) => /^[A-Za-z_][\w-]*$/.test(w));
    // Private recipes are never proposed, but still checked when a public one depends on them.
    const hidden = pendingPrivate || m[1].startsWith("_");
    current = { group: "justfile", name: m[1], body: "", deps, source: `justfile recipe ${m[1]}`, forms: [`just ${m[1]}`], hidden };
    entries.push(current);
    pendingPrivate = false;
  }
}

const makefile = ["GNUmakefile", "makefile", "Makefile"].map(read).find((t) => t !== null);
if (makefile) {
  let current = [];
  for (const line of makefile.split("\n")) {
    if (line.startsWith("\t")) {
      for (const entry of current) entry.body += `${line.trim()}\n`;
      continue;
    }
    if (/^\S/.test(line)) current = [];
    const m = line.match(/^([A-Za-z0-9][\w./-]*(?:\s+[A-Za-z0-9][\w./-]*)*)\s*:(?![:=])(.*)$/);
    if (!m) continue;
    const deps = m[2].split(";")[0].split(/\s+/).filter(Boolean);
    current = m[1].split(/\s+/).map((name) => ({
      group: "Makefile",
      name,
      body: m[2].includes(";") ? `${m[2].split(";").slice(1).join(";").trim()}\n` : "",
      deps,
      source: `Makefile target ${name}`,
      forms: [`make ${name}`],
    }));
    entries.push(...current);
  }
}

const turbo = readJson("turbo.json");
const turboTasks = turbo && (turbo.tasks || turbo.pipeline);
if (turboTasks && typeof turboTasks === "object") {
  const seen = new Set();
  for (const key of Object.keys(turboTasks)) {
    const name = key.split("#").pop();
    if (seen.has(name)) continue;
    seen.add(name);
    const forms = [`turbo run ${name}`, `node_modules/.bin/turbo run ${name}`];
    if (packageManager && packageManager !== "npm") forms.push(`${packageManager} turbo run ${name}`);
    entries.push({ group: "turbo.json", name, body: "", deps: [], source: `turbo.json task ${name}`, forms });
  }
}

// CLAUDE.md: inline code spans and lines of shell fences that start with a known runner.
const RUNNERS = new Set([
  "pnpm", "npm", "yarn", "bun", "just", "make", "turbo", "bash", "sh", "node", "deno", "cargo", "go",
  "pytest", "python", "python3", "uv", "poetry", "ruff", "mypy", "tsc", "eslint", "vitest", "jest",
  "dotnet", "mvn", "gradle", "./gradlew", "bundle", "rake", "mix", "swift", "composer", "phpunit",
]);
for (const file of ["CLAUDE.md", ".claude/CLAUDE.md", "CLAUDE.local.md"]) {
  const text = read(file);
  if (text === null) continue;
  const commands = [];
  const fenceRe = /^```(?:bash|sh|shell|zsh|console)?[ \t]*\n([\s\S]*?)^```/gm;
  for (const [, block] of text.matchAll(fenceRe)) {
    for (const line of block.split("\n")) commands.push(line.trim().replace(/^\$\s+/, ""));
  }
  for (const [, span] of text.replace(fenceRe, "").matchAll(/`([^`\n]+)`/g)) commands.push(span.trim());
  for (const command of commands) {
    const first = command.split(/\s+/)[0];
    if (!RUNNERS.has(first) && !first.startsWith("./") && !first.startsWith("node_modules/.bin/")) continue;
    // Placeholders, globs and shell operators make a rule that never matches or matches too much.
    if (command === first || /[;&|<>$`(){}*…]|\.\.\./.test(command)) continue;
    entries.push({ group: file, name: command, body: command, deps: [], source: file, forms: [command], fromDocs: true });
  }
}

// --- classify ----------------------------------------------------------------------------------

const byGroup = new Map();
for (const entry of entries) {
  if (!byGroup.has(entry.group)) byGroup.set(entry.group, new Map());
  byGroup.get(entry.group).set(entry.name, entry);
}

// First problem found in the entry or anything it runs, or null.
const problem = (entry, seen = new Set()) => {
  if (seen.has(entry)) return null;
  seen.add(entry);
  const own = nameProblem(entry.fromDocs ? entry.name.split(/\s+/).slice(1).join(" ") : entry.name) ?? bodyProblem(entry.body);
  if (own) return seen.size === 1 ? own : `it runs ${entry.forms[0]}, and ${own}`;
  for (const dep of entry.deps) {
    const target = byGroup.get(entry.group).get(dep);
    const found = target && problem(target, seen);
    if (found) return found;
  }
  return null;
};

const existing = new Set(
  [".claude/settings.json", ".claude/settings.local.json"].flatMap((f) => readJson(f)?.permissions?.allow ?? [])
);

const candidates = [];
const skipped = [];
const taken = new Set();
for (const entry of entries) {
  if (entry.hidden) continue;
  const kind = kindOf(tokens(entry.name));
  if (!kind) continue;
  if (entry.forms.some((f) => taken.has(f))) continue;
  entry.forms.forEach((f) => taken.add(f));
  const reason = problem(entry);
  if (reason) {
    skipped.push({ command: entry.forms[0], source: entry.source, reason });
    continue;
  }
  const rules = entry.forms.flatMap((f) => [`Bash(${f})`, `Bash(${f} *)`]).filter((r) => !existing.has(r));
  if (rules.length) candidates.push({ command: entry.forms[0], kind, source: entry.source, rules });
}

process.stdout.write(`${JSON.stringify({ packageManager, candidates, skipped }, null, 2)}\n`);
