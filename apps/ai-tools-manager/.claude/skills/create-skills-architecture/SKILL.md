---
name: create-skills-architecture
description: "Explains how the four create-* skills (create-skill, create-subagent, create-plugin, create-marketplace) work end-to-end: the hook script, the web form, the result file, and the consuming SKILL.md prompts. Use when the user is working inside apps/ai-tools-manager or plugins/ai-tools-manager and asks how a create flow works, where to add a new field, why a form change isn't reaching the prompt, or how target=project differs from target=marketplace."
---

# Create-Skills Architecture

The `ai-tools-manager` app is a UI layer for four creation skills: `create-skill`, `create-subagent`, `create-plugin`, `create-marketplace`. Each follows the same pipeline.

## End-to-end pipeline

```
User runs /create-skill
        │
        ▼
plugins/ai-tools-manager/hooks/hooks.json matches "create-skill"
        │  invokes scripts/gather-info.sh create-skill
        ▼
gather-info.sh:
  • Reads ~/.claude/plugins/known_marketplaces.json on the host
  • Writes /tmp/ai-tools-marketplace.json   (marketplaces, byMarketplace, cwd)
  • Starts/refreshes the docker container (apps/ai-tools-manager)
  • Opens http://localhost:3009/create-skill in the browser
  • Blocks until /tmp/ai-tools-result.json is non-empty
        │
        ▼
React form (apps/ai-tools-manager/src/routes/create-skill.tsx)
  • Loader reads /tmp/marketplace-data.json (mounted from host)
  • react-hook-form + zod govern state and validation
  • Live FilePreview on the right shows the file that will be generated
  • On submit, calls server fn in src/utils/create-skill.ts
        │
        ▼
Server fn writes /tmp/result.json:
  { "hookSpecificOutput": { "hookEventName": "UserPromptExpansion",
                            "additionalContext": "Skill form data: {JSON}" } }
        │
        ▼
gather-info.sh unblocks, returns the result file contents to Claude Code,
which then runs the matching SKILL.md prompt with the JSON injected as context.
```

The two `/tmp` files are Docker volume mounts — they are how the host and container exchange data without the container needing host filesystem access.

## File-by-file map

| Concern | File |
|---|---|
| Hook registration | `plugins/ai-tools-manager/hooks/hooks.json` |
| Hook orchestration (all 4 skills) | `plugins/ai-tools-manager/scripts/gather-info.sh` |
| Form (route) | `apps/ai-tools-manager/src/routes/create-<name>.tsx` |
| Form server fns (submit/cancel + payload shape) | `apps/ai-tools-manager/src/utils/create-<name>.ts` |
| Marketplace/cwd loader | `apps/ai-tools-manager/src/utils/marketplace.ts` |
| File preview component | `apps/ai-tools-manager/src/components/<name>-preview.tsx` |
| Shared text helpers | `apps/ai-tools-manager/src/utils/text.ts` |
| Shared UI primitives | `packages/ui/src/` |
| Consuming prompt | `plugins/ai-tools-manager/skills/create-<name>/SKILL.md` |

## The four skills compared

| | create-skill | create-subagent | create-plugin | create-marketplace |
|---|---|---|---|---|
| Mode toggle (auto / manual) | yes | yes | no | no |
| Target toggle (marketplace / project) | yes | yes | no | no |
| Chip-array fields | `useWhen` | `triggers`, `tools` | `keywords` | — |
| File generated | `SKILL.md` | `AGENTS.md` or `<name>.md` | `plugin.json` | `marketplace.json` |
| Preview type | YAML frontmatter + markdown | YAML frontmatter + markdown | JSON | JSON |

`create-skill` and `create-subagent` are deeply parallel — they share the description-building algorithm (`buildDesc` in `utils/text.ts`: first sentence of idea + Oxford-joined chips, clipped to 140 chars).

## Mode dispatch (skill & subagent)

- **Auto mode**: form sends `idea` and chip arrays. The SKILL.md prompt builds the frontmatter `description` from them and generates full content.
- **Manual mode**: form sends `description` (plus chips) verbatim. The prompt assembles `<description>. Use when <triggers joined>` as the frontmatter description and scaffolds a minimal skeleton the user will fill in.

## Target dispatch (skill & subagent)

The `target` ModePill changes where the file lands:

- `target: "marketplace"` — server fn includes `{ marketplacePath, plugin }`. The prompt writes `<marketplacePath>/plugins/<plugin>/{skills,agents}/<name>/...`.
- `target: "project"` — server fn includes `{ projectPath: cwd }`. The prompt writes `<projectPath>/.claude/skills/<name>/SKILL.md` (skill) or `<projectPath>/.claude/agents/<name>.md` (subagent — single file, no enclosing directory).

The form already has `cwd` from the loader (originally set by `gather-info.sh`'s node-side block). Submit forwards it to the server fn.

## Result file contract

Every server fn writes exactly one of:

```json
// Success
{ "hookSpecificOutput": {
    "hookEventName": "UserPromptExpansion",
    "additionalContext": "<Name> form data: {…JSON payload…}"
  } }

// Cancellation
{ "decision": "block", "reason": "<Name> creation cancelled." }
```

The matching prompt in `plugins/ai-tools-manager/skills/create-<name>/SKILL.md` reads `additionalContext`, parses the embedded JSON, and acts on the fields.

## Common edits — where to make them

| Want to… | Edit |
|---|---|
| Add a field to a form | route (`src/routes/`) **and** server fn (`src/utils/create-*.ts`) **and** the matching `SKILL.md` prompt — all three must agree on the payload shape |
| Change validation rules | the zod schema at the top of the route |
| Change the live preview | the `<name>-preview.tsx` component in `src/components/` |
| Change the description algorithm | `utils/text.ts` — affects skill & subagent both |
| Change keyboard shortcuts | `SHORTCUT_SECTIONS` constant in the route, plus the `useEffect` keydown handler |
| Add a new shared UI primitive | new file in `packages/ui/src/`, then add an export to `packages/ui/package.json` |
| Add a new create-* skill | follow "Adding a new route / form" in `apps/ai-tools-manager/CLAUDE.md` |

## Things that bite

- **Don't change the payload in just one place.** A field rename must hit the form schema, the server fn payload, *and* the consuming SKILL.md prompt — otherwise data silently drops.
- **Server fn dependency hoisting.** `submitSkillForm` and `submitSubagentForm` only call `getKnownMarketplaces()` when `target === "marketplace"`; if you refactor, keep the call inside the marketplace branch.
- **Docker volume gotcha.** If you change the result-file path on either side, update both `compose.yml` and the server fn's `process.env.RESULT_FILE` default.
- **`/tmp/result.json` must exist as a *file*, not a directory** before the container starts — `gather-info.sh` enforces this with `[[ -d "$RESULT_FILE" ]] && rm -rf "$RESULT_FILE"`.
- **`cwd` semantics.** Locally (no Docker), `getMarketplaceDefaults`/`getMarketplaceData` returns `process.cwd()` of the dev server. When the hook fires, `gather-info.sh` writes the user's actual cwd into the marketplace file before launching the container — so `cwd` in the form reflects the user's project, not the container.
