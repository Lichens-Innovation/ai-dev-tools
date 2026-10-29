#!/usr/bin/env node
// Claude Code PreToolUse guardrails. Zero dependencies (Node >= 18).
//
// Registered once in .claude/settings.local.json (personal, untracked):
//   node "$CLAUDE_PROJECT_DIR/.claude/hooks/guardrails.mjs"
//
// Runs three checks on every matched tool call:
//   scope — deny paths outside the project + permissions.additionalDirectories (+ temp dirs and
//           Claude Code's own ~/.claude); with the sandbox on, also allow reads in
//           sandbox.filesystem.allowRead, and Bash writes in allowWrite, minus denyRead/denyWrite
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

// Programs that only read their arguments, for paths in sandbox.filesystem.allowRead. The sandbox
// still blocks writes there; this only decides whether the hook lets the call reach it.
const READ_ONLY_PROGRAMS = new Set(
  ("ls du df stat file tree cat head tail wc less more nl grep egrep fgrep rg diff cmp readlink realpath basename " +
    "dirname md5sum sha1sum sha256sum shasum jq strings xxd od find sed node").split(" ")
);
// The words of a simple command (from lexCommand) that it only reads: a read-only program's arguments
// (not `find -delete|-exec`, not `sed -i`) or the sources of a `cp`, never a redirection target.
const readWords = (words) => {
  const at = words.findIndex((w) => !/^\w+=/.test(w.value) && !WRAPPERS.has(w.value));
  if (at < 0) return [];
  const program = words[at].value;
  const args = words.slice(at + 1).filter((w) => !w.redirect);
  const values = args.map((w) => w.value);
  if (program === "cp") {
    if (values.some((v) => /^(?:-[a-zA-Z]*t|--target-directory)/.test(v))) return [];
    return args.filter((w) => !w.value.startsWith("-")).slice(0, -1);
  }
  if (!READ_ONLY_PROGRAMS.has(program)) return [];
  if (program === "find" && values.some((v) => /^-(?:delete|exec|execdir|ok|okdir|fprint0?|fprintf|fls)$/.test(v))) return [];
  if (program === "sed" && values.some((v) => /^-[a-zA-Z]*i|^--in-place/.test(v))) return [];
  return args;
};

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

// Words of a command with their spans, grouped into simple commands, plus heredoc bodies. A word
// after `>` (a redirection target) has `redirect: true`. Returns null for anything it doesn't follow.
const lexCommand = (command) => {
  const len = command.length;
  const segments = [];
  const heredocs = [];
  let pending = [];
  let segment = { words: [], piped: false };
  let word = null;
  let redirect = false;
  const startWord = (i) => {
    if (!word) {
      word = { start: i, value: "", literal: true, redirect };
      redirect = false;
    }
    return word;
  };
  const endWord = (i) => {
    if (word) segment.words.push({ ...word, end: i });
    word = null;
  };
  const endSegment = (piped = false) => {
    segment.piped = piped;
    segments.push(segment);
    segment = { words: [], piped: false };
    redirect = false;
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
      redirect = c === ">" || command[i + 1] === ">";
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

// --- Failure hints -------------------------------------------------------------------------------
// PostToolUseFailure: a command that failed on a sandbox limit gets a short explanation and the fix as
// extra context, so the model corrects itself instead of retrying. The error text field isn't
// specified in Claude Code's docs, so the whole payload (minus the command) is scanned.

const FAILURE_HINTS = [
  {
    program: /^\s*(?:\w+=\S*\s+)*(?:git\s+(?:push|pull|fetch)|gh|glab)\b/,
    error: /proxy requires authentication|Could not read from remote repository|Could not resolve host/i,
    hint:
      "The call ran inside the sandbox, where git and gh can't authenticate. A backtick, $(...), heredoc, pipe, cd or any " +
      "other command in the call is the usual reason it stayed there. Rebuild it as only excluded commands joined by && " +
      "(a body with code goes in a file made with Write, real path /tmp/claude-<uid>/..., passed with --body-file) and retry " +
      "once. If it fails again, ask the user to run it with !.",
  },
  {
    program: /^\s*(?:\w+=\S*\s+)*(?:open|osascript|xdg-open)\b/,
    error: /Operation not permitted|LSOpenURLsWithRole|kLSServerCommunicationErr|-10822|-600\b|-54\b/i,
    hint: "The sandbox blocks open and osascript. Don't retry: give the user the exact command to run with !.",
  },
  {
    // Installs need the package store, a lock under XDG_RUNTIME_DIR, the registry and postinstall downloads
    // (Electron from GitHub): too much to open up, and the sandbox's mounts make pnpm copy a second store.
    program: /^\s*(?:\w+=\S*\s+)*(?:pnpm|npm|yarn|bun)\s+(?:install|i|add|ci|update|up)\b/,
    error: /Read-only file system|Operation not permitted|STORE_DIR|fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|allowed_domains/i,
    hint:
      "Package installs don't fit the sandbox (store, lock, registry and postinstall downloads). Don't retry or " +
      "widen the sandbox: ask the user to run the install with !.",
  },
  {
    error: /apply-seccomp|nested userns/i,
    hint:
      "Bubblewrap can't apply its seccomp filter on this kernel, so every sandboxed command fails. Stop and tell the " +
      "user: setting sandbox.network.allowAllUnixSockets to true skips that filter, at the cost of letting sandboxed " +
      "commands connect to any Unix socket (Docker, SSH agent). It's their call.",
  },
  {
    // Electron/Chromium's own sandbox can't start inside bubblewrap: the namespace sandbox is refused by the
    // sandbox's seccomp filter and the setuid helper isn't root-owned. On macOS its Seatbelt profile can't nest
    // inside the Bash sandbox's (signatures not yet verified on a Mac).
    error: /setuid_sandbox_host|SUID sandbox helper|No usable sandbox|chrome-sandbox|sandbox_apply|sandbox_init|Sandbox initialization failed/i,
    hint:
      "Electron's own Chromium sandbox can't start inside the Bash sandbox. Never retry with --no-sandbox. Tell the " +
      "user: run the app with !, or opt in to the GUI app testing grant of setup-claude-guardrails, which puts the exact " +
      "launch command in sandbox.excludedCommands (that command then runs with no sandbox at all).",
  },
  {
    error: /command not found: (?:node|pnpm|npm|npx|yarn|bun|corepack)\b|\b(?:node|pnpm|npm|npx|yarn|bun|corepack): command not found/i,
    hint:
      "The tool is installed under the home dir (nvm, fnm, volta, PNPM_HOME), which the sandbox can't read. Ask the user " +
      "for `command -v <tool>` (run with !) and to add its install dir to sandbox.filesystem.allowRead.",
  },
  {
    program: /^\s*(?:\w+=\S*\s+)*pnpm\b/,
    error: /unable to open database file|pnpm-store-operation-locks/i,
    hint:
      "pnpm can't write its own files. For pnpm-store-operation-locks, retry once as XDG_RUNTIME_DIR=$TMPDIR pnpm ... " +
      "(the lock goes under the runtime dir, which the sandbox can't write). For unable to open database file, " +
      "PNPM_HOME (often ~/.local/share/pnpm) must be in sandbox.filesystem.allowWrite: tell the user.",
  },
  {
    // Claude Code itself denies sandboxed writes to these paths (denyWithinAllow), whatever allowWrite says.
    error: /(?=[\s\S]*(?:Operation not permitted|Read-only file system))[\s\S]*\.claude\/(?:hooks|skills|settings[\w.]*\.json)/i,
    hint:
      "Claude Code keeps sandboxed commands from writing .claude/hooks, .claude/skills and settings files. Use the Write " +
      "tool (it asks the user) or ask the user to run the command with !. Don't suggest making these paths writable: a " +
      "sandboxed command could then rewrite the guardrails.",
  },
  {
    error: /Operation not permitted|Read-only file system/i,
    hint:
      "A sandbox restriction blocked this command. Don't retry it as is: use $TMPDIR for temp files, stay inside the " +
      "project, and tell the user which restriction it hit if the task needs it.",
  },
];

const FRICTION =
  " If this guardrail keeps costing you steps, or the rule in .claude/rules/guardrails.md didn't make this clear, finish the " +
  "task, then tell the user and suggest improving it (the setup-claude-guardrails skill ships the rule and the hook).";

const failureHint = (input) => {
  const command = typeof input.tool_input?.command === "string" ? input.tool_input.command : "";
  const output = JSON.stringify({ ...input, tool_input: undefined });
  const found = FAILURE_HINTS.find((h) => (!h.program || h.program.test(command)) && h.error.test(output));
  if (!found) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "PostToolUseFailure", additionalContext: `[guardrails] ${found.hint}${FRICTION}` },
    })
  );
};

const main = () => {
  const input = JSON.parse(fs.readFileSync(0, "utf8"));
  if (input.hook_event_name === "PostToolUseFailure") return failureHint(input);
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
  const lexedCommand = scanned === null ? null : lexCommand(scanned);
  const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

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

  const within = (p, root) => p === root || p.startsWith(root + path.sep);
  const inScope = (p) => roots.some((root) => within(p, root));

  // The sandbox's own grants: sandbox.filesystem.allowRead adds read-only roots, allowWrite ones Bash may
  // also write. Only with the sandbox on (local settings over project over user): without it nothing
  // enforces them, and a Bash write the hook mistook for a read would go through.
  const sandboxes = settingsFiles.map((f) => readJson(f).sandbox ?? {});
  const sandboxOn = [1, 0, 2].map((k) => sandboxes[k].enabled).find((v) => typeof v === "boolean") === true;
  // Like the sandbox: `/` and `//` are absolute, `~` is home, anything else is relative to the project
  // (project settings) or the config dir (user settings).
  const sandboxEntries = (key) =>
    !sandboxOn
      ? []
      : sandboxes.flatMap((s, k) =>
          (s.filesystem?.[key] ?? [])
            .filter((e) => typeof e === "string" && e)
            .map((e) => ({ entry: e, resolved: resolvePath(e.replace(/^\/\//, "/"), k < 2 ? projectDir : claudeDir) }))
        );
  const grants = (key) => sandboxEntries(key).filter(({ entry }) => !GLOB_CHARS.test(entry)).map((e) => e.resolved);
  // A denyRead (denyWrite) entry wins over the grants it sits inside, and over all of them when it is
  // a pattern: a name without a slash (`.env`, `*.pem`) matches any path segment.
  const denials = (key) =>
    sandboxEntries(key).map(({ entry, resolved }) => {
      if (!entry.includes("/")) {
        const re = globToRegex(entry);
        return { root: null, test: (p) => p.split(path.sep).some((s) => re.test(s)) };
      }
      if (!GLOB_CHARS.test(entry)) return { root: resolved, test: (p) => within(p, resolved) };
      const re = globToRegex(resolved);
      return { root: null, test: (p) => p.split(path.sep).some((_, k, parts) => re.test(parts.slice(0, k + 1).join(path.sep))) };
    });
  const writeRoots = grants("allowWrite");
  const readRoots = [...grants("allowRead"), ...writeRoots];
  const deniedReads = denials("denyRead");
  const deniedWrites = denials("denyWrite");
  // The deepest grant holding p decides, unless a deny entry inside that grant matches p.
  const granted = (p, grantRoots, denied) => {
    const root = grantRoots.filter((r) => within(p, r)).sort((a, b) => b.length - a.length)[0];
    return root !== undefined && !denied.some((d) => d.test(p) && (d.root === null || within(d.root, root)));
  };
  const readable = (p) => granted(p, readRoots, deniedReads);
  const writable = (p) => readable(p) && granted(p, writeRoots, deniedWrites);
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
  // The first candidate (resolved) that is neither in scope nor granted(resolved, candidate).
  const outside = (candidates, granted) =>
    candidates.map((c) => [c, resolvePath(c)]).find(([c, p]) => !SAFE_DEVICES.has(p) && !inScope(p) && !granted(p, c))?.[1];
  const denyScope = (what, p) =>
    respond(
      "deny",
      "scope",
      p !== undefined && WRITE_TOOLS.has(tool) && writable(p)
        ? `${what} is in sandbox.filesystem.allowWrite, which this hook grants to sandboxed Bash commands only, where ` +
            `the OS enforces it. The Write and Edit tools stay inside the project and permissions.additionalDirectories.`
        : p !== undefined && readable(p)
        ? `${what} is in sandbox.filesystem.allowRead, which this hook grants to reads only: the Read, Grep and Glob ` +
            `tools, and Bash commands that only read it (ls, du, cat, stat, head, grep, find without -delete/-exec, ` +
            `node <script>, cp from it), not as a redirection target or after a cd. Writing there with a sandboxed ` +
            `Bash command needs sandbox.filesystem.allowWrite: ask the user.`
        :`${what} is outside the allowed scope (${roots.join(", ")}` +
            `${readRoots.length ? `; sandbox allowRead/allowWrite: ${readRoots.join(", ")}` : ""}). Stay inside the ` +
            `project, or ask the user to add the directory, in ${settingsFiles[1]} (this project) or ` +
            `${settingsFiles[2]} (all projects), to either sandbox.filesystem.allowRead (the narrower grant: read-only, ` +
            `honoured by this hook only with the sandbox on; allowWrite to also write) or ` +
            `permissions.additionalDirectories (the broader one: a working directory for every tool, reads and writes). ` +
            `Directories added with /add-dir for this session only are not visible to this hook.`
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
    const homeVar = (t) => t.replace(/^\$\{?HOME\}?/, "~");
    const pathLike = tokens.filter(
      (t) =>
        !programs.has(t) &&
        (/^(\/|~|\$\{?HOME\}?)/.test(t) || t === ".." || t.startsWith("../") || t.includes("/../") || t.endsWith("/.."))
    );
    // Words the call only reads; one also used any other way doesn't count. Nothing when the lexer gives up.
    const reads = new Set();
    const others = new Set();
    for (const { words } of lexedCommand?.segments ?? []) {
      const read = new Set(readWords(words));
      for (const w of words) {
        for (const v of [w.value, w.value.slice(w.value.indexOf("=") + 1)]) (read.has(w) ? reads : others).add(homeVar(v));
      }
    }
    offender = outside(
      pathLike.map(homeVar).filter((t) => !phantom(resolvePath(t))),
      (p, t) => writable(p) || (readable(p) && reads.has(t) && !others.has(t))
    );
  } else {
    const candidates = [...filePaths];
    if (tool === "Glob" && typeof args.pattern === "string") {
      candidates.push(path.resolve(resolvePath(args.path || cwd), expandHome(globBase(args.pattern)) || "."));
    }
    // allowWrite is for sandboxed Bash, where the OS enforces it: the file tools only get the read grant.
    offender = outside(candidates, (p) => !WRITE_TOOLS.has(tool) && readable(p));
  }
  if (offender) denyScope(offender, offender);

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

  // --- read block ------------------------------------------------------------------------------

  // With permissions.blockReadsOutsideWorkingDirectories, Claude Code can't resolve a file read after
  // a `cd` in the same call ("a path that is computed at run time") and asks the user, even in auto
  // mode. Denying here costs the model one retry instead of costing the user a prompt.
  const READERS = new Set(
    "cat head tail sed awk gawk grep egrep fgrep rg less more wc nl cut sort uniq diff cmp jq yq tac strings xxd od".split(" ")
  );
  const blocksReads = settingsFiles.some((f) => readJson(f).permissions?.blockReadsOutsideWorkingDirectories === true);
  if (blocksReads && lexedCommand) {
    const simple = lexedCommand.segments.map(({ words }) => {
      const at = words.findIndex((w) => !/^\w+=/.test(w.value) && !WRAPPERS.has(w.value));
      return at < 0 ? [] : words.slice(at).map((w) => w.value);
    });
    // Claude Code can't check what an in-place edit script reads or writes, so each one prompts.
    const inPlace = simple.find(
      ([program, ...args]) =>
        (program === "sed" && args.some((a) => /^-[a-zA-Z]*i|^--in-place/.test(a))) ||
        (program === "perl" && args.some((a) => /^-[a-zA-Z]*i/.test(a)))
    );
    if (inPlace) {
      respond(
        "deny",
        "read-block",
        `\`${inPlace[0]}\` in-place edits can't be checked against blockReadsOutsideWorkingDirectories, so each one ` +
          `makes the user approve it. Edit files with the Edit or Write tool instead (one Edit per change). ` +
          `Read-only \`sed -n\` is fine.`
      );
    }
    const programs = simple.map((words) => words[0]);
    const cdAt = programs.findIndex((p) => p === "cd" || p === "pushd");
    const reader = cdAt < 0 ? undefined : programs.slice(cdAt + 1).find((p) => READERS.has(p));
    if (reader) {
      respond(
        "deny",
        "read-block",
        `\`${reader}\` runs after a \`cd\` in the same call, so Claude Code can't check its path against ` +
          `blockReadsOutsideWorkingDirectories and would make the user approve it. Drop the \`cd\`: use paths from the ` +
          `current directory or absolute paths, \`git -C <dir>\`, or the Read and Grep tools, and split unrelated ` +
          `commands into parallel calls.`
      );
    }
  }

  // --- sandbox exit ----------------------------------------------------------------------------

  // `gh`, `git push` and `open` run outside the sandbox only when every command in the call is one of
  // sandbox.excludedCommands, joined by `&&`. Anything else keeps the whole call inside, where they
  // fail on credentials or the network. Say so before the call runs instead of after it fails.
  const excluded = sandboxes
    .flatMap((s) => (s.excludedCommands ?? []).filter((e) => typeof e === "string"))
    .map((e) => e.replace(/\s*\*$/, "").split(/\s+/).filter(Boolean))
    .filter((e) => e.length);
  if (command !== null && excluded.length && sandboxes.some((s) => s.enabled === true)) {
    const lexed = lexCommand(command);
    const hasSubstitution = /`|\$\(/.test(command);
    // lexed is null for backticks, $(...) or unbalanced quotes: without a substitution, a command we can't judge.
    if (lexed || hasSubstitution) {
      const program = (words) => {
        const at = words.findIndex((w) => !/^\w+=/.test(w));
        return at < 0 ? [] : words.slice(at);
      };
      const isExcluded = (words) => excluded.some((e) => e.every((w, i) => program(words)[i] === w));
      const simple = lexed ? lexed.segments.map((s) => s.words.map((w) => w.value)).filter((w) => w.length) : [];
      const aimed = lexed ? simple.some(isExcluded) : isExcluded(command.trim().split(/\s+/));
      const reasons = [];
      if (hasSubstitution) reasons.push("a backtick or `$(...)`");
      if (lexed?.heredocs.length) reasons.push("a heredoc");
      if (lexed?.segments.some((s) => s.piped)) reasons.push("a pipe");
      const others = simple.filter((w) => !isExcluded(w)).map((w) => program(w)[0]);
      if (others.length) reasons.push(`other commands (${[...new Set(others)].join(", ")})`);
      if (aimed && reasons.length) {
        respond(
          "deny",
          "sandbox",
          `This call contains ${reasons.join(" and ")}, so it stays inside the sandbox, where git push / gh / glab / open ` +
            `fail on credentials or the network. Only a call made entirely of excluded commands joined by && runs outside. ` +
            `Run the other commands in a separate call, and put a PR or commit body that has backticks, $ or a heredoc in a ` +
            `file made with Write (real path /tmp/claude-<uid>/..., not $TMPDIR) and pass it with --body-file. ` +
            `If that is not possible, ask the user to run the command with !.`
        );
      }
    }
  }
};

try {
  main();
} catch (error) {
  // Fail closed: exit 2 blocks the call. Any other non-zero exit would let it through.
  console.error(`[guardrails] hook error, blocking the call: ${error?.message ?? error}`);
  process.exit(2);
}
