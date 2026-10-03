#!/usr/bin/env node
// Claude Code PreToolUse guardrails. Zero dependencies (Node >= 18).
//
// Registered once in .claude/settings.local.json (personal, untracked):
//   node "$CLAUDE_PROJECT_DIR/.claude/hooks/guardrails.mjs"
//
// Runs three checks on every matched tool call:
//   scope — deny paths outside the project + permissions.additionalDirectories (+ temp dirs and
//           Claude Code's own ~/.claude)
//   env   — deny .env files, except .env*.example / .sample / .template / .dist, and Claude Code's
//           ~/.claude/.credentials.json and ~/.claude.json
//   self  — ask before anything writes this hook, a checkout's .claude/settings*.json (project or
//           worktree) or the user's ~/.claude/settings.json
//
// Commit and PR message text (git commit -m, gh pr create --body, ...) is left out of the checks.
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

// Programs run by absolute path from a system bin dir (`/usr/bin/python3 x.py`, `| /usr/bin/grep`).
// Only the word in command position is exempt from the scope check; its arguments are still checked.
const SYSTEM_BIN = /^\/(?:usr\/(?:local\/)?(?:s?bin|libexec)|s?bin|opt\/homebrew\/s?bin)\/[^/]+$/;
const WRAPPERS = new Set(["env", "exec", "command", "time", "nohup", "xargs"]);
const systemPrograms = (command) =>
  new Set(
    command.split(/[;&|\n(`]+/).flatMap((segment) => {
      const program = segment.trim().split(/\s+/).map(unquote).find((w) => !/^\w+=/.test(w) && !WRAPPERS.has(w));
      return program && SYSTEM_BIN.test(path.posix.normalize(program)) ? [program] : [];
    })
  );

// --- Message text ------------------------------------------------------------------------------
// A commit message or PR body is only stored, so a `/plugin` or `.env` in it is not a path. It is
// blanked out before the checks when it can't expand (no `$` or backtick) and is either the value
// of a flag that takes text, never a file name, or a quoted heredoc read by `git commit -F -`.
// A command the lexer doesn't follow ($(...), backticks, unbalanced quotes) has nothing blanked.

const MESSAGE_FLAGS = {
  git: /^(?:-[a-z]*m|--message)$/,
  gh: /^(?:-[tbn]|--title|--body|--notes)$/,
  glab: /^(?:-[tdm]|--title|--description|--message)$/,
};
const GIT_MESSAGE_COMMANDS = new Set(["commit", "tag", "merge", "stash", "notes"]);

// Words of a command with their spans, grouped into simple commands, plus heredoc bodies.
// Returns null for anything it doesn't follow.
const lexCommand = (command) => {
  const len = command.length;
  const segments = [];
  const heredocs = [];
  let pending = [];
  let segment = { words: [], piped: false };
  let word = null;
  const startWord = (i) => (word ??= { start: i, value: "", literal: true });
  const endWord = (i) => {
    if (word) segment.words.push({ ...word, end: i });
    word = null;
  };
  const endSegment = (piped = false) => {
    segment.piped = piped;
    segments.push(segment);
    segment = { words: [], piped: false };
  };

  let i = 0;
  while (i < len) {
    const c = command[i];
    if (c === "`" || command.startsWith("$(", i)) return null;
    if (c === "'" || command.startsWith("$'", i)) {
      // '...' is fully literal; $'...' also honors \' inside.
      const open = c === "$" ? i + 2 : i + 1;
      let j = open;
      if (c === "$") while (j < len && command[j] !== "'") j += command[j] === "\\" ? 2 : 1;
      else j = command.indexOf("'", open);
      if (j < 0 || j >= len) return null;
      startWord(i).value += command.slice(open, j);
      i = j + 1;
    } else if (c === '"') {
      startWord(i);
      let j = i + 1;
      while (j < len && command[j] !== '"') {
        if (command[j] === "`" || command.startsWith("$(", j)) return null;
        if (command[j] === "\\") {
          word.value += command[j + 1] ?? "";
          j += 2;
          continue;
        }
        if (command[j] === "$") word.literal = false;
        word.value += command[j++];
      }
      if (j >= len) return null;
      i = j + 1;
    } else if (c === "\\") {
      startWord(i).value += command[i + 1] ?? "";
      i += 2;
    } else if (c === "#" && word === null) {
      while (i < len && command[i] !== "\n") i++;
    } else if (c === "\n") {
      endWord(i);
      endSegment();
      i++;
      // Heredoc bodies start on the next line and end at a line holding only the delimiter.
      for (const doc of pending) {
        const start = i;
        let end = len;
        while (i < len) {
          const nl = command.indexOf("\n", i);
          const lineEnd = nl < 0 ? len : nl;
          const line = command.slice(i, lineEnd);
          if ((doc.strip ? line.replace(/^\t+/, "") : line) === doc.delim) {
            end = i;
            i = nl < 0 ? len : nl + 1;
            break;
          }
          i = nl < 0 ? len : nl + 1;
        }
        heredocs.push({ ...doc, start, end });
      }
      pending = [];
    } else if (/\s/.test(c)) {
      endWord(i);
      i++;
    } else if (command.startsWith("<<", i) && command[i + 2] !== "<") {
      endWord(i);
      const m = /^<<(-?)[ \t]*(?:'([^'\n]*)'|"([^"\n]*)"|([^\s;&|<>()'"\\$`]+))(?=[\s;&|<>()]|$)/.exec(command.slice(i));
      if (!m) return null;
      pending.push({ segment, strip: m[1] === "-", quoted: m[4] === undefined, delim: m[2] ?? m[3] ?? m[4] });
      i += m[0].length;
    } else if (c === ">" || c === "<") {
      endWord(i);
      i++;
      while (i < len && /[>&|]/.test(command[i])) i++;
    } else if (c === "|") {
      endWord(i);
      const or = command[i + 1] === "|";
      endSegment(!or);
      i += or ? 2 : command[i + 1] === "&" ? 2 : 1;
    } else if (c === ";" || c === "&" || c === "(" || c === ")") {
      endWord(i);
      endSegment();
      i += c === "&" && command[i + 1] === "&" ? 2 : c === ";" && command[i + 1] === ";" ? 2 : 1;
    } else {
      if (c === "$") startWord(i).literal = false;
      startWord(i).value += c;
      i++;
    }
  }
  if (pending.length) return null;
  endWord(len);
  endSegment();
  return { segments, heredocs };
};

const gitSubcommand = (args) => {
  for (let k = 0; k < args.length; k++) {
    const v = args[k].value;
    if (["-C", "-c", "--git-dir", "--work-tree", "--namespace"].includes(v)) k++;
    else if (!v.startsWith("-")) return v;
  }
  return null;
};

// The command with its message text replaced by spaces (newlines kept).
const blankMessages = (command) => {
  const lexed = lexCommand(command);
  if (!lexed) return command;
  const spans = [];
  const messageProgram = (words) => {
    const at = words.findIndex((w) => !/^\w+=/.test(w.value) && !WRAPPERS.has(w.value));
    const program = at < 0 ? null : words[at].value;
    if (!MESSAGE_FLAGS[program]) return null;
    if (program === "git" && !GIT_MESSAGE_COMMANDS.has(gitSubcommand(words.slice(at + 1)))) return null;
    return { program, args: words.slice(at + 1) };
  };
  for (const { words } of lexed.segments) {
    const found = messageProgram(words);
    if (!found) continue;
    const flags = MESSAGE_FLAGS[found.program];
    found.args.forEach((w, k) => {
      const eq = w.value.indexOf("=");
      if (flags.test(w.value) && found.args[k + 1]?.literal) spans.push(found.args[k + 1]);
      else if (eq > 0 && w.literal && flags.test(w.value.slice(0, eq))) spans.push(w);
    });
  }
  for (const doc of lexed.heredocs) {
    const body = command.slice(doc.start, doc.end);
    if (messageProgram(doc.segment.words)?.program === "git" && !doc.segment.piped && (doc.quoted || !/[$`]/.test(body))) {
      spans.push(doc);
    }
  }
  let text = command;
  for (const { start, end } of spans) {
    text = text.slice(0, start) + text.slice(start, end).replace(/[^\n]/g, " ") + text.slice(end);
  }
  return text;
};

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
  // What the checks read: the command without its commit or PR message text.
  const scanned = command === null ? null : blankMessages(command);
  const tokens = scanned === null ? [] : bashTokens(scanned);

  // --- scope -----------------------------------------------------------------------------------

  const claudeDir = realish(path.resolve(expandHome(process.env.CLAUDE_CONFIG_DIR || "~/.claude")));
  const settingsFiles = [
    path.join(projectDir, ".claude/settings.json"),
    path.join(projectDir, ".claude/settings.local.json"),
    path.join(claudeDir, "settings.json"),
  ];
  const extraRoots = settingsFiles
    .flatMap((f) => readJson(f).permissions?.additionalDirectories ?? [])
    .filter((r) => typeof r === "string");

  const roots = [
    projectDir,
    ...extraRoots.map((r) => resolvePath(r, projectDir)),
    realish(os.tmpdir()),
    realish("/tmp"),
    // Claude Code's own config: settings, skills, plugins, plans, memory, saved tool output.
    // Its settings.json and .credentials.json are guarded by the self and env checks below.
    claudeDir,
  ];

  const inScope = (p) => roots.some((root) => p === root || p.startsWith(root + path.sep));
  const SAFE_DEVICES = new Set(["/dev/null", "/dev/stdout", "/dev/stderr", "/dev/stdin", "/dev/tty"]);
  // `/api/users` in a grep pattern names nothing on disk: a path whose top-level directory doesn't
  // exist can't be read, and can't be created unless the filesystem root is writable.
  const rootWritable = (() => {
    try {
      fs.accessSync(path.parse(projectDir).root, fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  })();
  const phantom = (p) => {
    const { root } = path.parse(p);
    const top = p.slice(root.length).split(path.sep)[0];
    return !rootWritable && top !== "" && !fs.existsSync(root + top);
  };
  const outside = (candidates) => candidates.map((p) => resolvePath(p)).find((p) => !SAFE_DEVICES.has(p) && !inScope(p));
  const denyScope = (what) =>
    respond(
      "deny",
      "scope",
      `${what} is outside the allowed scope (${roots.join(", ")}). Stay inside the project, or ask the user ` +
        `to add the directory to permissions.additionalDirectories in ${settingsFiles[1]} (this project) or ` +
        `${settingsFiles[2]} (all projects). Directories added with /add-dir for this session only are not visible to this hook.`
    );

  let offender;
  if (command !== null) {
    if (!inScope(cwd)) {
      // Only a command that starts by returning into scope may run from an out-of-scope cwd.
      const back = command.match(/^\s*cd\s+(\S+)\s*(?:&&|;|$)/);
      if (!back || !inScope(resolvePath(unquote(back[1])))) denyScope(`The shell's working directory ${cwd}`);
    }
    // A bare `cd` (or `pushd`) goes to $HOME.
    if (/(?:^|[;&|(\n])\s*(?:cd|pushd)\s*(?=$|[;&|)\n])/.test(scanned)) denyScope(`\`cd\` with no argument (${os.homedir()})`);

    const programs = systemPrograms(scanned);
    const pathLike = tokens.filter(
      (t) =>
        !programs.has(t) &&
        (/^(\/|~|\$\{?HOME\}?)/.test(t) || t === ".." || t.startsWith("../") || t.includes("/../") || t.endsWith("/.."))
    );
    offender = outside(pathLike.map((t) => t.replace(/^\$\{?HOME\}?/, "~")).filter((t) => !phantom(resolvePath(t))));
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
  // `process.env` or `import.meta.env` in a pattern is code, unless a file by that name exists.
  const CODE_ENV = /^(?:process|import\.meta|deno|bun)\.env$/i;
  const touchesEnv = (p) => {
    if (CODE_ENV.test(path.basename(p)) && !fs.existsSync(path.resolve(cwd, expandHome(p)))) return false;
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

  // Claude Code's OAuth tokens (.credentials.json on Linux/Windows; macOS keeps them in the
  // Keychain) and ~/.claude.json, which holds MCP server configs that can carry API keys.
  const CLAUDE_SECRETS = new Set([".credentials.json", ".claude.json"]);
  const touchesClaudeSecret = (p) => CLAUDE_SECRETS.has(path.basename(p).toLowerCase()) || CLAUDE_SECRETS.has(realName(p));
  const secretOffender = envCandidates.filter((v) => typeof v === "string" && v).find(touchesClaudeSecret);
  if (secretOffender) {
    respond("deny", "env", `Access to Claude Code's credentials / account file "${secretOffender}" is blocked.`);
  }

  // --- self ------------------------------------------------------------------------------------

  // Any checkout's .claude/settings*.json and hook (the project and its worktrees), plus the
  // user's settings.json, which can turn hooks off (disableAllHooks) or register new ones.
  const isProtected = (p) =>
    p === path.join(claudeDir, "settings.json") ||
    /[\\/]\.claude[\\/](?:settings(?:\.local)?\.json|hooks[\\/]guardrails\.mjs)$/.test(p);
  const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
  const protectedHit =
    command !== null
      ? tokens.filter((t) => /settings|guardrails/.test(t)).map((t) => resolvePath(t)).find(isProtected)
      : WRITE_TOOLS.has(tool)
        ? filePaths.map((p) => resolvePath(p)).find(isProtected)
        : undefined;
  if (protectedHit) {
    respond(
      "ask",
      "self",
      `${protectedHit.startsWith(projectDir + path.sep) ? path.relative(projectDir, protectedHit) : protectedHit} ` +
        `configures the guardrails. Confirm this change is intended.`
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
