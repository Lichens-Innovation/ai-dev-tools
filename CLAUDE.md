# ai-dev-tools

Claude Code plugin marketplace (`.claude-plugin/marketplace.json`). Each plugin lives in `plugins/<name>/` with its own `.claude-plugin/plugin.json`, `README.md`, `skills/`, and sometimes `agents/`, `commands/`.

## Rules

- **Bump the plugin version** in `plugins/<name>/.claude-plugin/plugin.json` for any change under `plugins/<name>/`, in the same PR (new skill: minor, fix or tweak: patch). Claude Code treats an unchanged version string as identical and skips the update, so installed copies never get the change. The version lives only in `plugin.json`, not in `marketplace.json`.
- **Don't edit the root `skills/`, `agents/` or `rules/` copies.** The `sync-skills.yml` workflow rebuilds them from `plugins/*/skills|agents|rules` (`chore: sync skills, agents, and rules from plugins`). Edit the plugin source.
- **Keep READMEs in step:** a new or renamed skill goes in `plugins/<name>/README.md` ("What's inside" and "Use it") and gets its own `skills/<skill>/README.md`.
- **Commits** use conventional prefixes (`feat:`, `fix:`, `docs:`, `chore:`).
- **Two open PRs on one plugin** both change the version line: after the first merges, rebase the other and pick the next version.
- **Run the tests of what you change.** Hook scripts come with a test script next to them, e.g. `bash plugins/claude-tools/skills/setup-claude-guardrails/scripts/test-guardrails.sh` (always `bash`, never `sh`).
