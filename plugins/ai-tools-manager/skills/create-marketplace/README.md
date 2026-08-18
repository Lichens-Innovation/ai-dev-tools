# create-marketplace

Scaffolds a new plugin marketplace: creates the directory structure, `marketplace.json` manifest, `README.md`, and `CLAUDE.md`. Guides the user through local testing, private-repo setup, and auto-update configuration.

## How it works

1. In the **Maestro desktop app** (`apps/maestro`), the user picks **Create → Marketplace** from the top bar and fills the form (name, description, owner name/email, optional homepage, target directory, private-repo flag).
2. On submit the route calls `scaffoldMarketplace` in `@repo/maestro-core`, writing the `marketplace.json` manifest and a starter `README.md` under `targetDir`.
3. A new marketplace still needs docs, so the route builds a prose prompt carrying the payload and the scaffold result, shows it in full for confirmation, and runs it through `claude -p`. This file (`SKILL.md`) is what that prompt asks Claude to follow.
4. Invoked directly in a session instead (`/create-marketplace`), there is no form and nothing pre-scaffolded: gather the fields conversationally and do every step.

`targetDir` is commonly **outside** the open project. The run's working directory is `targetDir` itself, so a headless run's edits land where `--permission-mode acceptEdits` can accept them.

See `apps/maestro/.claude/skills/create-skills-architecture/` for the full architecture.

## Payload contract

```
{ name, description, ownerName, ownerEmail, homepage?, targetDir, privateRepo }
```

`homepage` is omitted when blank; `privateRepo` is a boolean.

## Output

- `<targetDir>/.claude-plugin/marketplace.json`
- `<targetDir>/plugins/` (empty, ready for `create-plugin`)
- `<targetDir>/README.md` and `<targetDir>/CLAUDE.md`
- When `privateRepo` is true, the skill also documents env-var setup (`GITHUB_TOKEN`, `GITLAB_TOKEN`, etc.) for auto-update at startup.

## Related

- `create-plugin` — fills the new marketplace with plugins
- `manage-marketplace` — install, update, or publish the marketplace once it's created
