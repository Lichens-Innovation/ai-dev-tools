---
name: setup-claude-guardrails
description: "Installs guardrails in this project's .claude/ (and its git worktrees) that keep Claude Code from reading, writing or running commands on paths outside a scoped directory (the project, or a chosen parent like ~/Documents/gits), and block env files (.env, .env.local, ...) except .env*.example. Combines permission deny rules, blockReadsOutsideWorkingDirectories, an optional Bash sandbox and a PreToolUse hook, and offers permissions.allow rules for the project's lint, typecheck and test commands so parallel sessions prompt less. Use when the user wants to sandbox Claude to the repo, protect secrets from Claude, add safety hooks, or invokes /setup-claude-guardrails."
disable-model-invocation: true
---

# Setup Claude Guardrails

Install layered guardrails into `.claude/settings.local.json`. They are personal: nothing is committed (`settings.local.json` is ignored by Claude Code, the hook and rule via `.git/info/exclude`). Use `.claude/settings.json` only if the user asks to share them with the team.

| Layer | Enforced by | Covers |
| ----- | ----------- | ------ |
| `blockReadsOutsideWorkingDirectories` | Claude Code | `Read`, `Grep`, `Glob`, `LSP` outside the project + `additionalDirectories` |
| `deny` `Read(...)` / `Edit(...)` rules | Claude Code | env files and Claude Code's credentials, for every file tool (also fed into the sandbox) |
| `sandbox` (optional) | the OS (Seatbelt / bubblewrap) | what Bash commands and their children can read and write |
| `PreToolUse` hook `scripts/guardrails.mjs` | heuristic on tool input | out-of-scope writes and Bash paths, env files (wildcards, case, symlinks), and asks before edits to the guardrails; with the sandbox, denies calls that can't leave it |
| `PostToolUseFailure` hook (same script) | matches error text | after a sandbox failure, tells Claude the cause and the fix, and to suggest improving the guardrail if it keeps costing steps |

The native layers are the real enforcement; the hook catches mistakes where nothing else would (e.g. `bypassPermissions`).

## Checkouts and worktrees

Everything is installed per checkout; each has its own untracked `.claude/`. `.git/info/exclude` is in the git common dir, shared by all.

- **Main checkout:** the parent of `git rev-parse --path-format=absolute --git-common-dir`. Install here first.
- **Claude Code worktrees** (`<main>/.claude/worktrees/<name>`, from `claude --worktree`, subagent `isolation: worktree`, desktop parallel sessions): a session that creates one keeps the main checkout's settings. For sessions opened inside one later, `.worktreeinclude` (step 6) copies the guardrail files into each new one.
- **Other linked worktrees** (`git worktree list --porcelain`): install into each; re-run after adding one.

## Files per checkout

- `.claude/hooks/guardrails.mjs`, from this skill's `scripts/guardrails.mjs`
- `.claude/rules/guardrails.md`, from `assets/guardrails.md`: tells Claude how to work with the hook (loads every session)
- `.claude/settings.local.json`: permissions, optional sandbox, hook registration
- shared `.git/info/exclude`: the hook and rule paths, and on Linux with the sandbox its mount stubs (step 7)
- `<main>/.worktreeinclude`: the hook, the rule and `settings.local.json`

## Workflow

1. **Check for an existing install** (read-only, before asking anything). If the session is already sandboxed, run `echo ok` first: on `apply-seccomp` every other check would fail too, so ask step 7's seccomp question now, then continue. Resolve the main checkout and linked worktrees, and say which one the session is in. In each, check:
   - the hook and rule exist and are identical to this skill's copies;
   - settings have the hook entry (`PreToolUse` and `PostToolUseFailure`) with the same `command`, all 18 `deny` entries from step 5, `blockReadsOutsideWorkingDirectories`, and Claude's temp dir in `additionalDirectories`;
   - with the sandbox on: the sandbox entries step 5 would add for this machine (step 3's tool lookup), and `echo ok` runs (step 7);
   - with the sandbox on and a JS lockfile: `<pm> --version` (the lockfile's package manager) runs. If it fails, or `package.json` pins `packageManager` (also `devEngines.packageManager`) to a version other than the installed one while `registry.npmjs.org` isn't in `sandbox.network.allowedDomains`, that is a gap: the package manager downloads the pinned version and the sandbox blocks the registry (`GET https://registry.npmjs.org/<pm>: fetch failed`). Recommend allowing the registry (step 2's registry question, with this reason), or the user installing the pinned version, or running installs with `!`;
   - on Linux with the sandbox: every mount stub step 7 lists is in the shared exclude;
   - `git check-ignore -q` passes for the hook, the rule and `settings.local.json`;
   - once, in the main checkout: `.worktreeinclude` lists all three.

   **All in place** (every check above passes, the package manager one included): report the setup (roots from `additionalDirectories`, sandbox on/off, git hosting and `open` exclusions, hook up to date, which checkouts). Ask one question: keep it as is (recommended; stop, no tests), suggest allow rules only (step 2's allow-rules part, then merge the picks as in step 5; no other step), or reconfigure (step 2, current values as defaults). **Partial:** list the gaps and fill only those, current values as defaults. **None:** continue.

2. **Ask** in one `AskUserQuestion` call:
   - "Which directories may Claude access?": project only (recommended), or project + others (e.g. `~/Documents/gits`). If none are named, ask for the paths before writing.
   - "Enable the Bash sandbox?": Yes, strict (recommended: OS-enforced; network needs per-domain approval, no unsandboxed fallback), or No (hook heuristics only).
   - Sandbox only: "Run git hosting commands outside the sandbox?": Yes (`gh`, `glab`, `git push`/`pull`/`fetch` use your Keychain, SSH agent and network; risky subcommands prompt), or No (they fail in the sandbox; run them with `!`). No recommendation: it trades isolation for convenience.
   - Sandbox only: "Run `open` outside the sandbox?": Yes (recommended on macOS: the sandbox blocks `open`, so skills like `/claude-light` can't open a page; apps and URLs still prompt), or No (run `! open <path>` yourself).
   - Sandbox and a JS lockfile (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `bun.lock*`) only: "Let sandboxed commands reach the package registry?": Yes (only `registry.npmjs.org`; postinstall downloads such as Electron's from GitHub stay blocked), or No. Recommend Yes if `package.json` pins `packageManager` (or `devEngines.packageManager`) to a version other than the installed one (`<pm> --version`): the package manager then downloads the pinned version on every run, even `--version`, and fails without the registry. Otherwise no recommendation: lint and test runs rarely need it, installs are better run with `!` (step 8).
   - Sandbox and `electron` in a `package.json` (any workspace) only: "Let Claude launch a desktop GUI app (Electron) for testing?" Default No, never preselected, no recommendation. Why it's asked: inside the sandbox Electron aborts at startup. On Linux: `FATAL:setuid_sandbox_host.cc ... The SUID sandbox helper binary was found, but is not configured correctly`, because Chromium's own sandbox can't start in bubblewrap (the namespace sandbox is refused by the sandbox's seccomp filter and the setuid helper isn't root-owned). On macOS: `FATAL:base/apple/mach_port_rendezvous_mac.cc: bootstrap_check_in com.github.Electron.MachPortRendezvousServer...: Permission denied (1100)`, then SIGTRAP: the Seatbelt profile refuses the Mach port check-in. `--no-sandbox` is not an acceptable fix. The display itself is no separate blocker to grant: on Linux `allowUnixSockets` is ignored (seccomp can't filter by path), so there is no per-socket grant, and the only switch, `allowAllUnixSockets`, is never added for this. If Yes, ask for the exact launch command, one per entry (e.g. `apps/desktop/node_modules/.bin/electron --remote-debugging-port=9333 *`). Find the binary with `find . -path '*/node_modules/.bin/electron' -not -path '*/node_modules/*/node_modules/*'`: in a pnpm workspace it sits under the workspace that depends on Electron, not the root. State the risk before writing: the command runs **with no sandbox at all**, so the app and anything it spawns can read and write everything the user can, and reach the network. The hook and permission rules still see the call, but the OS no longer enforces them for it. Only that exact command prefix is excluded: never `electron *`, `node *`, `npx *`, `pnpm *` or a wildcard on the whole binary directory. Then ask a second, separate question (Default No, no recommendation): "Also let sandboxed commands reach local ports (`sandbox.network.allowLocalBinding`)?" Without it the app opens but nothing can drive it: the sandboxed probe (`node`, `curl` to `127.0.0.1:<port>`) is refused instantly. The cost: any sandboxed command can then reach every local port (databases, dev servers), not just the app's.
   - Linked worktrees only: "Install in which checkouts?": all (recommended), or the current one.

   `AskUserQuestion` takes at most 4 questions: put any extra in a second call.

   **Allow rules** (separate `AskUserQuestion` call, after the questions above). Each parallel or spawned session asks for permission on its own, so N sessions mean N prompts for the same `pnpm lint`. Run `node scripts/suggest-allow-rules.mjs <main checkout>` from this skill's directory. It only reads: package.json scripts (in the lockfile's package manager's forms), justfile recipes, Makefile targets, turbo.json tasks and commands named in `CLAUDE.md`, and prints JSON `candidates` (`command`, `kind`, `source`, `rules`) and `skipped` (`command`, `source`, `reason`). It proposes only lint, typecheck, test, format-check and verify commands whose name and body (followed through the scripts, recipes or targets they call) don't install, push, publish, deploy, fix/write files, delete, or run in watch mode, and leaves out rules already in `permissions.allow`.
   - No candidates: say so and skip.
   - Otherwise list every candidate (command, source, rules) and the skipped ones with their reason, then ask "Which commands may run without a prompt?" with `multiSelect: true`: one option per command (label the command, description the source and rules), up to 4 options per question and 4 questions. More than 16: one option per `kind`, its commands in the description. No recommendation and nothing preselected.
   - Write only what the user picked. None picked, or the question dismissed: write no allow rules. Never add a rule the script didn't propose (an install, `git push`, publish, deploy or destructive command), even if the user names one under "Other": say why and leave it out.

3. **Prerequisites.**
   - `node --version` >= 18, else stop: the hook would fail closed on every call.
   - `claude --version` >= 2.1.257 for `blockReadsOutsideWorkingDirectories`; if older, skip that key and say to upgrade. If it fails with `operation not permitted` (the session's sandbox, before step 5's exclusion applies), ask the user to run `! claude --version`.
   - Linux/WSL2 with the sandbox: tell the user to run `/sandbox` afterwards to check bubblewrap. Native Windows: no sandbox.
   - Sandbox only: find where `node` and the project's package manager (from its lockfile: `pnpm`, `npm`, `yarn`, `bun`) are installed. The sandbox can't read `/home`, so a tool installed under it is "command not found" inside, and every `node` call fails (the hook still runs: hooks aren't sandboxed). Run `command -v node <pm>`; in an already sandboxed session it finds nothing, so read `echo $PATH` instead (it still lists the dirs). Record the install root of each one under `/home` that isn't already a root: `~/.nvm`, `~/.local/share/fnm`, `~/.volta`, `~/.bun`, `$PNPM_HOME` (default `~/.local/share/pnpm`) for pnpm, and `/home/linuxbrew/.linuxbrew` for Linuxbrew. If `PATH` leaves it unclear which dir holds the tool, ask the user to run `! command -v node <pm>`.

4. **Copy** the hook to `.claude/hooks/guardrails.mjs` and the rule to `.claude/rules/guardrails.md` in each chosen checkout. If a copy exists and differs, show the diff and ask first. In an already sandboxed session, `cp` can't write `.claude/hooks` (Claude Code protects it): copy with Read + Write (the hook asks once) or ask the user to run `! cp`. Don't suggest making the path writable.

   In a git repo, append both paths to `$(git rev-parse --git-common-dir)/info/exclude` unless listed. Then in each checkout run `git check-ignore -q` on them and on `.claude/settings.local.json`, and add any that isn't ignored. If a path is tracked (`git ls-files --error-unmatch`), ignoring it does nothing: ask whether to `git rm --cached` it.

5. **Merge `.claude/settings.local.json`** in each chosen checkout (`{}` if absent). Never replace: keep other keys, append to arrays without duplicates, 2-space indentation.

   ```json
   {
     "permissions": {
       "blockReadsOutsideWorkingDirectories": true,
       "additionalDirectories": ["/tmp/claude-<uid>", "<extra roots, as given, ~ allowed>"],
       "deny": [
         "Read(.env)", "Read(.env.*)", "Read(*.env)",
         "Read(!.env*.example)", "Read(!.env*.sample)", "Read(!.env*.template)", "Read(!.env*.dist)",
         "Edit(.env)", "Edit(.env.*)", "Edit(*.env)",
         "Edit(!.env*.example)", "Edit(!.env*.sample)", "Edit(!.env*.template)", "Edit(!.env*.dist)",
         "Read(~/.claude/.credentials.json)", "Edit(~/.claude/.credentials.json)",
         "Read(~/.claude.json)", "Edit(~/.claude.json)"
       ]
     },
     "sandbox": { "enabled": true, "allowUnsandboxedCommands": false },
     "hooks": {
       "PreToolUse": [
         {
           "matcher": "Read|Write|Edit|MultiEdit|NotebookEdit|Glob|Grep|LSP|Bash|Monitor",
           "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/guardrails.mjs\"" }]
         }
       ],
       "PostToolUseFailure": [
         {
           "matcher": "Bash",
           "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/guardrails.mjs\"" }]
         }
       ]
     }
   }
   ```

   Also merge, depending on the answers:

   | When | `permissions.ask` | `sandbox.excludedCommands` |
   | ---- | ----------------- | -------------------------- |
   | Git hosting outside the sandbox | `Bash(gh api *)`, `Bash(gh auth *)`, `Bash(gh secret *)`, `Bash(gh repo delete *)`, `Bash(glab api *)`, `Bash(glab auth *)`, `Bash(glab variable *)`, `Bash(glab repo delete *)` | `gh *`, `glab *`, `git push`, `git push *`, `git pull`, `git pull *`, `git fetch`, `git fetch *` |
   | Sandbox on (always, read-only: the sandbox blocks the `claude` binary, breaking step 3) | | `claude --version`, `claude -v` (exact forms only, so no unsandboxed agent session) |
   | `open` outside the sandbox | `Bash(open -a *)`, `Bash(open -b *)`, `Bash(open *://*)` | `open`, `open *`, `xdg-open`, `xdg-open *` |
   | GUI app testing: yes | | only the launch commands the user gave in step 2, verbatim. No `allowAllUnixSockets`, no `XDG_RUNTIME_DIR` or display socket in `allowRead`/`allowWrite` |
   | GUI app testing: yes, and local ports: yes | | `"allowLocalBinding": true` in `sandbox.network` (not an excluded command) |

   | When | `permissions.allow` |
   | ---- | ------------------- |
   | Allow rules picked (step 2) | every rule of each picked candidate (`Bash(pnpm lint)`, `Bash(pnpm lint *)`, ...), unchanged |

   And with the sandbox on:

   | When | Merge |
   | ---- | ----- |
   | A tool from step 3 lives under `$HOME` | its install root in `sandbox.filesystem.allowRead` (`~` allowed). The hook lets Claude read these paths too: never add a dir holding secrets (`~/.aws`, `~/.ssh`, `~/.config/gh`); a tool that needs one runs with `!` |
   | pnpm under `$HOME` | also `$PNPM_HOME` in `sandbox.filesystem.allowWrite`: pnpm opens a database there even for `pnpm --version` |
   | pnpm | `"env": { "pnpm_config_verify_deps_before_run": "false" }`: before every script recent pnpm (seen with 12) installs if `node_modules` looks stale, and inside the sandbox that install can only fail (store lock), with a warning on every `pnpm lint` |
   | Registry: yes | `"allowedDomains": ["registry.npmjs.org"]` in `sandbox.network` |

   Excluded commands still go through permission rules and the hook; `allowUnsandboxedCommands: false` doesn't stop them. A call leaves the sandbox only when every command in it matches (`git push && gh pr create ...` does), never with `cd`, `$(...)`, redirections or heredocs, `xargs` or `eval`. A plain file path for `open` doesn't prompt.

   - Always add Claude's temp dir, `/tmp/claude-<uid>` with `<uid>` from `id -u` (on macOS also `/private/tmp/claude-<uid>`). It is the sandbox's `$TMPDIR`, where the rule sends temp files; without it, the read block makes the user approve every command that is passed one (`node script.cjs /tmp/claude-1000/task.json`). Project-only means no other roots.
   - Omit `sandbox` if declined. For several checkouts, prefer absolute or `~` roots (relative ones resolve per checkout).
   - Keep the `deny` order: a `!` negation only carves exceptions out of earlier rules in the same file. Append the block contiguously to an existing list.
   - Skip a hook entry if that event already has one with the same `command`.
   - Once installed, the hook asks before edits to settings files and itself, so expect prompts on a re-run.

6. **`.worktreeinclude`** in the main checkout root (gitignore syntax; Claude Code copies files that match it and are gitignored into new worktrees): append the three paths unless listed.
   - If it doesn't exist, create it and add `.worktreeinclude` (unanchored: the hook reads a leading `/` as absolute) to the shared exclude.
   - If it is tracked, it is shared: show the lines and ask first. If declined, skip and say new worktrees won't get a copy.

7. **Verify.** With the sandbox on, first run `echo ok` and `node --version`, plus `<pm> --version` when a JS lockfile exists (sandbox settings apply to the next command, no restart needed):
   - `apply-seccomp: ... nested userns is capability-restricted`: bubblewrap can't apply its seccomp filter on this kernel (often Ubuntu's AppArmor userns restriction), so every Bash command fails. Stop and ask: set `sandbox.network.allowAllUnixSockets: true` (skips the filter; sandboxed commands can then connect to any Unix socket, Docker and the SSH agent included), or turn the sandbox off.
   - `node` not found: the install root from step 3 is missing from `allowRead`. Ask for `! command -v node` and add it.
   - `<pm> --version` fails with `GET https://registry.npmjs.org/<pm>: fetch failed`: the pinned `packageManager` differs from the installed version. Offer the registry (`sandbox.network.allowedDomains`), or the user installing the pinned version.
   - Linux only, once `echo ok` runs: exclude the sandbox's mount stubs. To block a protected path that doesn't exist yet (`.bashrc`, `.gitconfig`, `.mcp.json`, `.vscode`, `.claude/agents`, a denied `.env`, ...), bubblewrap creates an empty file there and mounts `/dev/null` over it. The file stays behind, so `git status` lists it in every checkout. Inside the sandbox each one is a character device, which a checkout never holds otherwise. List them with `find . -maxdepth 2 -xtype c -not -path './.git/*'`. Use `-xtype`, not `-type`: `-type` trusts the directory listing, which still says regular file. The `.git` filter skips `.git/config.lock`, which `git status` never shows. Append each to the shared exclude (step 4), anchored, as `/<path>`, and add `!/<path>/` right after it for a name that can be a directory (`.vscode`, `.idea`, anything under `.claude/`), so a real directory of that name still shows. Skip lines already listed. Write with Edit, not Bash: the hook denies a command that names `.env`. Don't delete the stubs: the next sandboxed command recreates them.

   Then run `bash scripts/test-guardrails.sh <main>/.claude/hooks/guardrails.mjs` from this skill's directory (always `bash`, never `sh`: on macOS `sh` is bash in POSIX mode and the `claude config` checks fail). It checks ~100 allow/deny/ask cases in a throwaway project under `$TMPDIR`. Report failures verbatim.
   - Exit 2 with `node does not run here`: as above, fix `allowRead` first. Every case would otherwise read as a hook bug.
   - Exit 2 with `could not create a scratch ...` or `temp dir ... is not usable`: stop and report. Never point `TMPDIR` at a real directory: the script writes fake secrets there and deletes it.
   - `rm:` errors on paths outside `$TMPDIR`: stop immediately, tell the user, run nothing else.

8. **Report** the files changed per checkout (none tracked), the roots, sandbox on/off, the allow rules added, and the limitations below. A fresh clone or a later `git worktree add` needs a re-run. Hooks and the sandbox load at session start: restart Claude Code. With the sandbox, suggest `/sandbox` → Config to review the effective lists, and recommend running package installs with `!` (`! pnpm install`): inside, they need the registry and postinstall hosts, and the sandbox's mounts block hard links from the home store, so pnpm builds a second store next to the project.

## GUI app testing: what blocks it

Measured on Linux (kernel 7.0, Electron 33.4.11, Wayland and X11, sandbox on with `allowAllUnixSockets: true`) with a minimal app that opens a window and queries its own CDP endpoint on `127.0.0.1`:

| Launch | Result |
| ------ | ------ |
| default flags | aborts at startup: `FATAL:setuid_sandbox_host.cc(163) The SUID sandbox helper binary was found, but is not configured correctly` |
| `--no-sandbox --remote-debugging-port=9333` (diagnostic only) | window loads, CDP answers 200 on localhost; only noise (`dconf-CRITICAL ... Read-only file system`, GPU/DRM errors) |
| same with `--ozone-platform=wayland` | same: window loads, CDP answers |

So the only hard blocker found is Electron's own Chromium sandbox. With Unix sockets allowed, the display sockets were reachable without any path grant (`$XDG_RUNTIME_DIR` is mounted read-only; connecting still works). With `allowAllUnixSockets` off, sandbox-runtime's seccomp filter blocks Unix sockets entirely and has no per-path form on Linux (per its docs; not tested here), so a narrow display grant can't be expressed. The offered opt-in is therefore an excluded launch command (step 2), not a socket grant. Its risk is that the command runs without any sandbox. `allowNestedUserNamespaces` (sandbox-runtime) would let Chromium's sandbox start, but it weakens write denials for every sandboxed command; this skill doesn't offer it.

Measured on macOS (a pnpm workspace, Electron launched as `<workspace>/node_modules/.bin/electron --remote-debugging-port=<port>`):

| Launch | Result |
| ------ | ------ |
| sandboxed | aborts: `FATAL:base/apple/mach_port_rendezvous_mac.cc: bootstrap_check_in com.github.Electron.MachPortRendezvousServer...: Permission denied (1100)`, then SIGTRAP |
| exact command in `excludedCommands`, run alone | window opens, prints `DevTools listening on ws://127.0.0.1:<port>/...` |
| sandboxed `fetch`/`curl` to that port | refused instantly until `sandbox.network.allowLocalBinding` is true |

So macOS needs the same two pieces as Linux plus one: the excluded launch command, and `allowLocalBinding` if Claude is to drive the window (step 2 asks both). How to use it:
- Launch the command **alone** in the background (`run_in_background`), so it matches the excluded pattern. A trailing `&`, a pipe or a `cd` keeps it sandboxed.
- Probe in a second, sandboxed call that connects to the running app over CDP (`waitForTarget`, `Cdp.connect` or the like).
- A test harness that spawns Electron from inside a Node process (a `withApp`-style helper) stays sandboxed, so Electron aborts. Connect to the already running app instead.
- The Electron binary lives under the workspace that depends on it (`apps/<name>/node_modules/.bin/electron`), not the root `node_modules`. The `dist/Electron.app/Contents/MacOS/Electron` path was not tested.

## Hook behavior

- **scope:** allows the project (with `.claude/worktrees/`), `additionalDirectories` from project and user settings, temp dirs, devices, and `~/.claude` (or `$CLAUDE_CONFIG_DIR`). With the sandbox on, it also allows reads in `sandbox.filesystem.allowRead` (the Read, Grep and Glob tools, and Bash commands that only read: `ls`, `du`, `cat`, `stat`, `grep`, `find` without `-delete`/`-exec`, `node <script>`, `cp` from it; never a redirection target), and any Bash command in `allowWrite` (Write/Edit there stay denied: the OS enforces `allowWrite` only on Bash). A `denyRead`/`denyWrite` entry inside a grant still wins. Entries take `/`, `~` or a path relative to the project (user settings: the config dir). With the sandbox off these grants are ignored: nothing would enforce them. The deny message names both fixes: `allowRead` (narrower) and `additionalDirectories` (broader). Follows symlinks and checks absolute or `..` Glob patterns. In Bash it checks absolute, `~`, `$HOME` and `..` paths, bare `cd`/`pushd`, and commands run from an out-of-scope directory unless they start with `cd <in-scope dir>`. Programs from the system bin dirs and `/opt/homebrew/bin` are allowed in command position; their arguments are still checked. Absolute paths whose top-level directory doesn't exist (`/api/users`) are skipped unless `/` is writable.
- **messages:** text a command only stores is skipped when it has no `$` or backticks: `git commit|tag|merge|stash|notes -m`, a heredoc read by them (quoted delimiter, or no expansion in it, and not piped), and `gh`/`glab` `--title`, `--body`, `--notes`, `--description`. Commands with `$(...)`, backticks or unbalanced quotes are scanned whole. File flags (`-F`, `--body-file`, `git commit -t`) are always checked.
- **env:** blocks `.env`, `.env.*`, `*.env` (case-insensitive) except `.example|.sample|.template|.dist`, including Bash wildcards, quote-split names, symlinks and Grep `glob` filters (not Glob patterns: they only list names). `process.env` and `import.meta.env` count only if such a file exists. Also blocks `.credentials.json` and `.claude.json` anywhere.
- **self:** asks (not denies) before writes, Bash included, to any checkout's settings files or hook and to `~/.claude/settings.json` (which can set `disableAllHooks`).
- **sandbox exit:** with the sandbox on and `excludedCommands` set, denies a call that starts with an excluded command (`gh`, `git push`, `open`, ...) but also holds a backtick, `$(...)`, heredoc, pipe or another command: it would stay in the sandbox and fail on credentials or the network. The message gives the fix (split the call, `--body-file`). Redirections aren't detected.
- **read block:** with `blockReadsOutsideWorkingDirectories` on, denies a call where a file reader (`cat`, `sed`, `grep`, `head`, ...) runs after a `cd`. Claude Code can't resolve that path before running it and asks the user, even in auto mode; the deny sends Claude back to drop the `cd` instead. Same for `sed -i` and `perl -i`, whose scripts can't be checked: the deny sends Claude to the Edit tool.
- **failure hints:** the `PostToolUseFailure` entry runs the same script on a failed Bash call. Only if the error matches a known sandbox signature (`proxy requires authentication`, `Could not read from remote repository`, `Operation not permitted`, `Read-only file system`, the `open` Launch Services errors, `apply-seccomp`, `command not found` for node and the package managers, pnpm's database and store-lock errors, a failed package install, a package manager fetching its pinned version from the registry, Electron's SUID/Chromium sandbox abort (never retried with `--no-sandbox`), a blocked write to `.claude/hooks`, `.claude/skills` or settings) it adds context with the cause and the fix, plus a line telling Claude to suggest improving the guardrail if it keeps costing steps or is unclear. Other failures get nothing.
- Malformed input or an internal error exits 2 and blocks the call (fail closed).

## Limitations: tell the user

- Without the sandbox, Bash checks are a heuristic on command text: runtime paths (`$(...)`, variables, `eval`, scripts) and recursive reads (`grep -r KEY .`) get past them. With it, the OS enforces the deny rules and read block on every command.
- Directories added with `/add-dir` for the session only are invisible to the hook until they're in a settings file's `additionalDirectories`.
- Outside message text, a quoted string naming a real path outside scope (`grep "/etc/hosts" README.md`) and programs outside the system bin dirs (`~/.local/bin/...`) are denied. Use the program name from `PATH`, rephrase, or run it yourself.
- Env vars already in the shell are visible to `env`; the guardrails protect files. The sandbox's `credentials.envVars` can scrub them.
- Hooks don't apply to MCP tools.
- The `PostToolUseFailure` payload isn't fully specified in Claude Code's docs: the hook scans all of it for the error text. If a sandbox failure ever shows no hint, check that the event fires for failed Bash calls and where the error text sits.
- With git hosting excluded, `gh`/`glab` act with your full account and `git push` reaches any remote. Only the listed `ask` rules prompt; `gh pr merge`, `git push --force` and the like run under your normal permission mode.
- With a GUI launch command excluded, that command and everything it starts run outside the sandbox: full read/write as the user, full network. Keep the entry to the exact command; a broader pattern (`electron *`) lets any Electron app, or via `--require`/a script argument any code, run unsandboxed. The call still must be that command alone (no pipe, `cd`, `$(...)`, trailing `&`), or it stays in the sandbox and fails. With `allowLocalBinding`, any sandboxed command can reach every local port, not just the app's.
- With `open` excluded, any file path opens without a prompt in its default app, outside the sandbox.
- With the sandbox, Bash can only read the `~/.claude` subfolders Claude Code opens (plugins, skills, agents, rules, commands) and write none of it. Use Read/Edit for files like `~/.claude/settings.json`.
- Everything in `sandbox.filesystem.allowRead`/`allowWrite`, including what the user added by hand, is readable by Claude, as `cat` and as the Read tool. Keep credential dirs out of both lists.
- In Bash, the hook only lets read-only programs it knows name a `sandbox.filesystem.allowRead` path (`ls ~/.nvm` passes; `cd ~/.nvm`, `xargs` or a script named there doesn't). Calls with `$(...)` or backticks get no read grant. Ask the user to run such a command with `!`, or to move the path to `allowWrite` if writes are intended.
- With the sandbox, Bash can't write `.claude/hooks`, `.claude/skills` or settings files (Claude Code's own protection, not this skill's). Edits go through Write/Edit, which ask. Keep it that way: if a sandboxed command could write them, it could replace the hook without a prompt.
- With `allowAllUnixSockets`, sandboxed commands can connect to any Unix socket (Docker, SSH agent).
- On Linux, the excluded mount stubs hide a real file you create later at the same path (say a genuine untracked `.mcp.json`) from `git status`. Delete its line from `.git/info/exclude`. Directories aren't affected.
- On Linux, pnpm puts its store lock under `XDG_RUNTIME_DIR` (`/run/user/<uid>`), which the sandbox can't write. Don't add it to `allowWrite`: it holds the SSH agent, D-Bus and keyring sockets. Setting it in the `env` block doesn't work either: it is reset before each command. The failure hint makes Claude retry with `XDG_RUNTIME_DIR=$TMPDIR pnpm ...`.
- With `pnpm_config_verify_deps_before_run` off, pnpm no longer warns that `node_modules` is stale: a script fails on a missing module instead, and Claude asks for `! pnpm install`. The `env` block applies to the whole session, so pnpm run by hooks skips the check too (not your own terminal).
- A `packageManager` pin that differs from the installed version needs registry access: the package manager downloads the pinned version, even for `--version`. pnpm 12's `--config.manage-package-manager-versions=false` doesn't avoid it. Allow the registry, or install the pinned version yourself.
- With the registry allowed, any sandboxed command can reach `registry.npmjs.org`, not just the package manager.
- A linked worktree outside the main checkout (`../feature`) is its own project: the main checkout isn't in its scope. `git` itself still works there.
- An allow rule trusts a name, not what runs: `Bash(pnpm lint)` keeps running without a prompt after someone changes the `lint` script, and `Bash(pnpm lint *)` takes any arguments. The hook and the sandbox still check every call. Re-run the skill after such a change, or remove the rule from `permissions.allow`.
