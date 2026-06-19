# create-marketplace

Scaffolds a new plugin marketplace: creates the directory structure, `marketplace.json` manifest, `README.md`, and `CLAUDE.md`. Guides the user through local testing, private-repo setup, and auto-update configuration.

## How it works

1. User invokes `/create-marketplace`.
2. `hooks.json` matches and runs `scripts/launch-ai-tools-manager-app.sh create-marketplace`, which opens the web form at `http://localhost:3009/create-marketplace`.
3. User fills the form (name, description, owner name/email, optional homepage, target directory, private-repo flag) and submits.
4. The form writes a JSON payload to `/tmp/result.json`.
5. The hook unblocks and returns the payload to Claude as `additionalContext`. This file (`SKILL.md`) reads it and scaffolds the new marketplace at `<targetDir>`.

The `targetDir` field defaults to the user's `cwd` (captured by `launch-ai-tools-manager-app.sh` before launching the container).

See the project-local skill `apps/ai-tools-manager/.claude/skills/create-skills-architecture/` for the full architecture.

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
