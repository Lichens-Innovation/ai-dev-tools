---
name: updating-maestro
description: "How a change to the ai-tools-manager plugin actually reaches a project that installed it — and the trap that silently blocks it. The marketplace caches the plugin per VERSION and autoUpdate only re-pulls when plugin.json `version` changes, so any edit to hooks/, scripts/, agents/, or templates/ that ships without a version bump is invisible to every installed project (skills still resolve from the stale cache, but hooks/scripts don't exist there). Use when the user is working in apps/ai-tools-manager or plugins/ai-tools-manager and a hook/script change isn't taking effect in another project, a SubagentStart/PreToolUse hook 'isn't firing', the installed plugin is missing hooks/ or scripts/, or before shipping any plugin change so the cache actually refreshes."
---

# Updating the ai-tools-manager plugin (so changes actually land)

The `lichens-ai-dev-tools` marketplace installs the plugin into a **per-version cache** under
`~/.claude/plugins/cache/lichens-ai-dev-tools/<plugin>/<version>/`. `autoUpdate` compares the
cached version against `plugin.json` `version` — **if the version string is unchanged, nothing is
re-pulled, even for a `directory`-source marketplace pointed straight at this repo.**

So every edit to `hooks/`, `scripts/`, `agents/`, or `templates/` that ships **without a version
bump is invisible to every project that installed the plugin.** The cache stays frozen at whatever
snapshot it was first populated from.

```
source (this repo)                 marketplace cache (what actually runs)
  plugins/ai-tools-manager/   ──▶   ~/.claude/plugins/cache/lichens-ai-dev-tools/ai-tools-manager/<version>/
  version: 0.2.0                     version: 0.2.0   ← only refreshed when the version STRING changes
  hooks/ scripts/ skills/           hooks/ scripts/ skills/
```

## Why this is so easy to miss

Skills and commands are copied into the same cache, so a stale cache **still resolves skills
normally** — `/maestro-install`, `/create-skill`, etc. all work. But a stale snapshot taken before
`hooks/` and `scripts/` existed has **no `hooks/hooks.json` and no hook scripts at all**, so:

- `SubagentStart` (skill injection + handoff routing), `PreToolUse`/`SubagentStop` logging, and the
  `TaskCreate` validator **silently never fire** — no error, the files just aren't there.
- `bash-validation.sh` keeps working anyway, because the installer copies *that* one **into the
  project** (`.claude/scripts/`), not from the plugin. That asymmetry is what makes the failure look
  random: one maestro hook works, the rest don't.

This exact gap is what froze `lichens-ordonnancement-ui` at a May-2026 snapshot — the plugin had been
edited dozens of times since, but `version` stayed `0.1.0`, so autoUpdate never re-pulled.

## Releasing a plugin change (the rule)

**Any change under `plugins/<plugin>/` must bump that plugin's `plugin.json` `version`.** That is the
only signal autoUpdate watches.

1. Bump `plugins/<plugin>/.claude-plugin/plugin.json` `version` (e.g. `0.2.0 → 0.3.0`). The repo
   `marketplace.json` reads the version from each `plugin.json` — no per-plugin pin to update there.
2. Commit **and push** — the autoUpdate gate only helps teammates once the new version is in the repo
   they pull. Without the push, everyone else stays frozen too.
3. Refresh locally (autoUpdate picks up the bump on the next marketplace sync / restart):
   - `/plugin` → update the plugin, or
   - clear the stale cache dir and restart Claude Code so it re-pulls:
     ```bash
     rm -rf ~/.claude/plugins/cache/lichens-ai-dev-tools/<plugin>/<old-version>
     ```

## Verify the refresh landed

```bash
P=~/.claude/plugins/cache/lichens-ai-dev-tools/ai-tools-manager/<new-version>
ls "$P/hooks/hooks.json"                          # exists
ls "$P/scripts/maestro-inject-agent-context.js"   # exists
```

Then `/hooks` should list **SubagentStart → maestro-inject-agent-context.js**, and the next maestro
subagent will receive its injected skills + handoff routing.

## Diagnosing "my hook/script change isn't taking effect"

| Check | Command |
|---|---|
| What version is actually installed? | `cat ~/.claude/plugins/installed_plugins.json` (look for `installPath` + `version` + `installedAt`) |
| Does the cached copy even have the files? | `ls ~/.claude/plugins/cache/lichens-ai-dev-tools/<plugin>/<version>/{hooks,scripts}` |
| Is the cache older than the change? | compare `installedAt` / dir mtime against the commit that added the file |
| Is the plugin enabled here at all? | callable plugin skills ⇒ enabled; `/plugin list` confirms |

If skills work but `hooks/`/`scripts/` are absent from the cache → **stale cache, version was never
bumped.** Bump + refresh per above.

## Related

- `[[maestro-architecture]]` — what those hooks/scripts do at runtime once they're actually present.
- Reminder for `/maestro-update`: it refreshes the **project-copied** runtime scripts
  (`.claude/scripts/*.cjs`) from the **currently installed plugin** — so if the plugin cache itself is
  stale, `/maestro-update` propagates the stale copy. Fix the plugin cache (version bump) first.
