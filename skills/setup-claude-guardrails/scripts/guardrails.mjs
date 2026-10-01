#!/usr/bin/env node
// Claude Code PreToolUse guardrails. Zero dependencies (Node >= 18).
//
// Registered once in .claude/settings.local.json (personal, untracked):
//   node "$CLAUDE_PROJECT_DIR/.claude/hooks/guardrails.mjs"
//
// Runs three checks on every matched tool call:
//   scope — deny paths outside the project + permissions.additionalDirectories (+ temp dirs, and
//           read-only access to Claude Code's own ~/.claude files)
//   env   — deny .env files, except .env*.example / .sample / .template / .dist
//   self  — ask before anything writes this hook or the project's .claude/settings*.json
//
// This is a heuristic layer on top of the native controls the skill also installs
// (permissions.deny, blockReadsOutsideWorkingDirectories, sandbox). It is not a sandbox.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const respond = (decision, check, reason) => {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason: `[guardrails:${check}] ${reason}`,
      },
    })
  );
  process.exit(0);
};

const expandHome = (p) => (p === "~" ? os.homedir() : p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p);

// realpath that tolerates paths that don't exist yet (resolves the deepest existing ancestor).
const realish = (p) => {
  let current = p;
  const rest = [];
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return p;
    rest.unshift(path.basename(current));
    current = parent;
  }
  return path.join(fs.realpathSync(current), ...rest);
};

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
};

// --- Bash tokenizing (heuristic: catches the common cases, not a sandbox) ---------------------

// Quotes and backslashes are dropped inside tokens so `.e''nv` and `.e\nv` read as `.env`.
const unquote = (t) => t.replace(/['"\\]/g, "");

const bashTokens = (command) =>
  command
    .split(/[\s;&|<>()`]+/)
    .map(unquote)
    .flatMap((t) => {
      const eq = t.indexOf("=");
      return eq > 0 ? [t, t.slice(eq + 1)] : [t];
    })
    .filter(Boolean);

// --- Glob helpers ------------------------------------------------------------------------------

const GLOB_CHARS = /[*?[{]/;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const globToRegex = (glob) => {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    const close = c === "[" ? glob.indexOf("]", i + 1) : c === "{" ? glob.indexOf("}", i + 1) : -1;
    if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else if (c === "[" && close > i) {
      re += `[${glob.slice(i + 1, close).replace(/^!/, "^").replace(/\\/g, "\\\\")}]`;
      i = close;
    } else if (c === "{" && close > i) {
      re += `(?:${glob.slice(i + 1, close).split(",").map(escapeRegex).join("|")})`;
      i = close;
    } else re += escapeRegex(c);
  }
  return new RegExp(`^${re}$`, "i");
};

// The literal directory part of a glob, e.g. "../../src/**/*.ts" -> "../../src/".
const globBase = (pattern) => {
  const firstGlob = pattern.search(GLOB_CHARS);
  const head = firstGlob < 0 ? pattern : pattern.slice(0, firstGlob);
  const slash = head.lastIndexOf("/");
  return slash < 0 ? "" : head.slice(0, slash + 1);
};

// ----------------------------------------------------------------------------------------------

const main = () => {
  const input = JSON.parse(fs.readFileSync(0, "utf8"));
  const { tool_name: tool, tool_input: args = {} } = input;
  const projectDir = realish(path.resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()));
  const cwd = realish(path.resolve(input.cwd || projectDir));

  const resolvePath = (p, base = cwd) => realish(path.resolve(base, expandHome(p)));

  // Shell-like tools take `command`; file tools take one of these path keys.
  const command = typeof args.command === "string" ? args.command : null;
  const filePaths = ["file_path", "notebook_path", "filePath", "path"]
    .map((k) => args[k])
    .filter((v) => typeof v === "string" && v);
  const tokens = command === null ? [] : bashTokens(command);

  // --- scope -----------------------------------------------------------------------------------

  const settings = [".claude/settings.json", ".claude/settings.local.json"].map((f) => readJson(path.join(projectDir, f)));
  const extraRoots = settings.flatMap((s) => s.permissions?.additionalDirectories ?? []).filter((r) => typeof r === "string");
  const claudeDir = realish(path.resolve(expandHome(process.env.CLAUDE_CONFIG_DIR || "~/.claude")));

  const READ_TOOLS = new Set(["Read", "Glob", "Grep", "LSP"]);
  const roots = [
    projectDir,
    ...extraRoots.map((r) => resolvePath(r, projectDir)),
    realish(os.tmpdir()),
    realish("/tmp"),
    // Claude Code's own skills, plugins, plans and saved tool output live here.
    ...(READ_TOOLS.has(tool) ? [claudeDir] : []),
    ...(command !== null ? [path.join(claudeDir, "plugins"), path.join(claudeDir, "skills")] : []),
  ];

  const inScope = (p) => roots.some((root) => p === root || p.startsWith(root + path.sep));
  const SAFE_DEVICES = new Set(["/dev/null", "/dev/stdout", "/dev/stderr", "/dev/stdin", "/dev/tty"]);
  const outside = (candidates) => candidates.map((p) => resolvePath(p)).find((p) => !SAFE_DEVICES.has(p) && !inScope(p));
  const denyScope = (what) =>
    respond(
      "deny",
      "scope",
      `${what} is outside the allowed scope (${roots.join(", ")}). Stay inside the project, ` +
        `or ask the user to add the directory to permissions.additionalDirectories in .claude/settings.local.json.`
    );

  let offender;
  if (command !== null) {
    if (!inScope(cwd)) {
      // Only a command that starts by returning into scope may run from an out-of-scope cwd.
      const back = command.match(/^\s*cd\s+(\S+)\s*(?:&&|;|$)/);
      if (!back || !inScope(resolvePath(unquote(back[1])))) denyScope(`The shell's working directory ${cwd}`);
    }
    // A bare `cd` (or `pushd`) goes to $HOME.
    if (/(?:^|[;&|(\n])\s*(?:cd|pushd)\s*(?=$|[;&|)\n])/.test(command)) denyScope(`\`cd\` with no argument (${os.homedir()})`);

    const pathLike = tokens.filter(
      (t) => /^(\/|~|\$\{?HOME\}?)/.test(t) || t === ".." || t.startsWith("../") || t.includes("/../") || t.endsWith("/..")
    );
    offender = outside(pathLike.map((t) => t.replace(/^\$\{?HOME\}?/, "~")));
  } else {
    const candidates = [...filePaths];
    if (tool === "Glob" && typeof args.pattern === "string") {
      candidates.push(path.resolve(resolvePath(args.path || cwd), expandHome(globBase(args.pattern)) || "."));
    }
    offender = outside(candidates);
  }
  if (offender) denyScope(offender);

  // --- env -------------------------------------------------------------------------------------

  const ENV_NAME = /^\.env(\..+)?$|\.env$/i;
  const ENV_SAFE = /^\.env.*\.(example|sample|template|dist)$/i;
  const SAMPLE_ENV_NAMES = [".env", ".env.local", ".env.production", ".env.development.local", "prod.env"];

  const isSecretEnvName = (name) => ENV_NAME.test(name) && !ENV_SAFE.test(name);
  // A wildcard like `.env*` or `.e?v` is expanded by the shell after this hook runs, so test it
  // against typical env file names. Shell globs don't match a leading dot unless the pattern has
  // one, so patterns like `*.ts` are only checked when they mention "env".
  const mayNameEnvFile = (name) => {
    if (!GLOB_CHARS.test(name)) return isSecretEnvName(name);
    if (!name.startsWith(".") && !/env/i.test(name)) return false;
    const re = globToRegex(name);
    return SAMPLE_ENV_NAMES.some((n) => re.test(n));
  };
  // Also follow symlinks, so `notes.txt -> .env` is caught.
  const realName = (p) => {
    try {
      return path.basename(fs.realpathSync(path.resolve(cwd, expandHome(p))));
    } catch {
      return null;
    }
  };
  const touchesEnv = (p) => {
    if (mayNameEnvFile(path.basename(p))) return true;
    const real = realName(p);
    return real !== null && isSecretEnvName(real);
  };

  // Glob only lists names, so its pattern is not checked; Grep's glob selects files to read.
  const envCandidates = command !== null ? tokens : [...filePaths, ...(tool === "Grep" ? [args.glob] : [])];
  const envOffender = envCandidates.filter((v) => typeof v === "string" && v).find(touchesEnv);
  if (envOffender) {
    respond(
      "deny",
      "env",
      `Access to environment file "${envOffender}" is blocked. Only .env*.example (or .sample/.template/.dist) ` +
        `files may be accessed — name them explicitly instead of using a wildcard. Ask the user for the variable names you need.`
    );
  }

  // --- self ------------------------------------------------------------------------------------

  const PROTECTED = ["settings.json", "settings.local.json", "hooks/guardrails.mjs"].map((f) => path.join(projectDir, ".claude", f));
  const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
  const protectedHit =
    command !== null
      ? tokens.filter((t) => /settings|guardrails/.test(t)).map((t) => resolvePath(t)).find((p) => PROTECTED.includes(p))
      : WRITE_TOOLS.has(tool)
        ? filePaths.map((p) => resolvePath(p)).find((p) => PROTECTED.includes(p))
        : undefined;
  if (protectedHit) {
    respond(
      "ask",
      "self",
      `${path.relative(projectDir, protectedHit)} configures the guardrails. Confirm this change is intended.`
    );
  }
};

try {
  main();
} catch (error) {
  // Fail closed: exit 2 blocks the call. Any other non-zero exit would let it through.
  console.error(`[guardrails] hook error, blocking the call: ${error?.message ?? error}`);
  process.exit(2);
}
