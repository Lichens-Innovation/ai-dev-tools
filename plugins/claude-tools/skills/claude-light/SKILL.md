---
name: claude-light
description: "Applies a lightweight local Claude Code configuration to the current project's .claude/settings.local.json — optionally shrinking the auto-compact window, and disabling connectors, workflows, bundled skills, artifacts, and a set of noisy/expensive tools. Safe to re-run: detects what is out of date and offers to disable more global plugins, skills, agents and MCP servers. Use when the user asks to make Claude lighter/leaner for this project, run in a stripped-down or minimal mode, or invokes /claude-light."
disable-model-invocation: true
---

# Claude Light

Apply a "light mode" configuration to the current project's local Claude Code settings, merging it non-destructively into whatever is already there. Safe to re-run: on a project that was already configured, it detects what is missing or out of date and offers to disable more global resources.

## Target configuration

This is the config this skill applies. `autoCompactWindow` is optional: it is only written if the user opts in (step 2), at the level they choose.

```jsonc
{
  "autoCompactWindow": 200000,
  "permissions": {
    "deny": [
      "NotebookEdit",
      "DesignSync",
      "CronCreate",
      "CronDelete",
      "CronList",
      "EnterPlanMode",
      "ExitPlanMode",
      "PushNotification",
      "RemoteTrigger",
      "ReportFindings",
      "ScheduleWakeup"
    ]
  },
  "disableClaudeAiConnectors": true,
  "disableWorkflows": true,
  "disableBundledSkills": true,
  "disableArtifact": true,
  "autoMemoryEnabled": false
}
```

## Target file

Write to `.claude/settings.local.json` in the current project's working directory (this file is gitignored by default and meant for personal/local overrides — do not use `.claude/settings.json` unless the user explicitly asks to apply this repo-wide/committed).

## Workflow

1. **Read the existing file and detect the mode.** Use the Read tool on `.claude/settings.local.json`. If it doesn't exist, treat the existing settings as `{}` (first run). If it exists and already contains light-mode keys, this is a **re-run**: compute what is missing or out of date (target keys absent, `false` where the target is `true`, deny entries missing) and tell the user up front — either "already up to date" or the list of pending updates.

2. **Ask about auto-compact.** Use `AskUserQuestion`: "Enable auto-compact mode?" (Yes / No). If yes, ask a follow-up for the window size in tokens, with `200000` (200k) as the recommended default option; "Other" covers custom values (accept forms like `150k` or `150000` and convert to a number). If the file already has `autoCompactWindow`, show its current value in the question and offer to keep it. If the user says no, leave `autoCompactWindow` out of the written config and do not touch any existing value.

3. **Detect conflicts.** Compare each top-level key in the target configuration (using the `autoCompactWindow` chosen in step 2) against what's already present:
   - `autoCompactWindow` — conflict if already set to a different number than the one chosen in step 2 (skip if the user kept the existing value or declined).
   - `disableClaudeAiConnectors`, `disableWorkflows`, `disableBundledSkills`, `disableArtifact` — conflict if any is already set to `false` (already `true` is not a conflict).
   - `autoMemoryEnabled` — conflict if it's already set to `true` (already `false` is not a conflict).
   - `permissions.deny` — conflict only if the existing array already contains entries **not** in the target list (i.e. the user has their own deny rules that would need reconciling). If the existing array is a subset of the target list, no conflict — just union them. On a re-run, deny entries added by step 6 are the user's own choices: keep them, never ask to remove them.
   - Any other existing top-level keys (e.g. `permissions.allow`, `permissions.ask`, `model`, `statusLine`, `enabledPlugins`, ...) are untouched and never a conflict — always preserved as-is.

4. **Ask before overriding.** If step 3 found any conflicts, use `AskUserQuestion` to show each conflicting key with its current value vs. the light-mode value, and ask whether to override, keep the existing value, or (for `permissions.deny`) merge the two lists. Do not silently overwrite a value that differs from the target. If there are no conflicts, proceed without asking.

5. **Merge and write.** Build the final JSON:
   - Start from the existing file content (or `{}`).
   - Apply the target config's keys, respecting the user's choices from steps 2 and 4.
   - For `permissions`, merge at the `permissions` object level — keep any existing `allow`/`ask` arrays untouched, and set `deny` to the union (deduped) of the existing `deny` array and the target list, unless the user chose otherwise.
   - Write the result with the Write tool (or Edit tool if the file already exists), pretty-printed with 2-space indentation, preserving unrelated existing keys. If nothing changed on a re-run, skip the write.

6. **Offer to disable more global resources.** Always offer this step, on first run and on re-runs. It is optional — if the user declines, skip to step 7.

   **Inventory everything first.** Read the host files directly (the same ones the help-server, `apps/help-server` via `@repo/claude-fs`, reads — don't depend on it being up, it runs in Docker). If a file can't be read (missing or sandboxed), say so and continue with the rest.
   - **Marketplaces** — `~/.claude/plugins/known_marketplaces.json` (keys are marketplace names).
   - **Plugins** — `~/.claude/plugins/installed_plugins.json` (keys are `<plugin>@<marketplace>`), cross-referenced with `enabledPlugins` in `~/.claude/settings.json`, the project's `.claude/settings.json` and `.claude/settings.local.json`. Mark each as enabled or already disabled for this project.
   - **Skills** — user skills in `~/.claude/skills/<name>/SKILL.md`, plus `skills/<name>/SKILL.md` under the `installPath` of each enabled plugin. Read `name` and `description` frontmatter. Mark any already matched by a `Skill(...)` deny rule.
   - **Agents** — `~/.claude/agents/` and each enabled plugin's `agents/` (flat `<name>.md` or `<name>/AGENTS.md`). Mark any already matched by an `Agent(...)` deny rule.
   - **MCP servers** — user-scope `mcpServers` in `~/.claude.json`, the project's `.mcp.json`, and `mcpServers` in the settings files above, plus servers provided by enabled plugins. Mark any already disabled.

   **Show the complete inventory as text** before asking anything: one section per category (marketplaces, plugins, skills, agents, MCP servers), listing every item with a one-line description and its current status. Do not truncate or summarize the list — the user must be able to see everything that is globally available. Group skills and agents by their plugin to keep it readable.

   **Then ask** with `AskUserQuestion` (`multiSelect: true`). Each question allows at most 4 options, so cover the whole inventory by asking several questions in sequence (up to 4 per call, repeated calls as needed), grouped by category, rather than dropping items. Offer only items that are currently enabled; skip categories with nothing to disable. Marketplaces cannot be disabled per project: use them only as grouping context, and offer to disable the plugins they provide instead.

   **Apply** the selections to `.claude/settings.local.json`, merging as in step 5:
   - Plugin → `"enabledPlugins": { "<plugin>@<marketplace>": false }` (disabling a plugin covers all its skills, agents and MCP servers, so drop any choices that belong to a plugin the user just disabled).
   - Skill → add `"Skill(<name>)"` to `permissions.deny` (use the `<plugin>:<name>` form for plugin skills).
   - Agent → add `"Agent(<name>)"` to `permissions.deny` (use the `<plugin>:<name>` form for plugin agents).
   - MCP server → add `"mcp__<server>"` to `permissions.deny`; for servers defined in the project's `.mcp.json`, also add the name to `disabledMcpjsonServers`.

   Never touch `~/.claude/settings.json` or `~/.claude.json` — these overrides are project-local only.

7. **Report.** Tell the user the path written (`.claude/settings.local.json`) and a short summary of what changed: auto-compact choice, new keys added, values overridden, values kept as-is, and anything disabled in step 6. On a re-run with no changes, say it was already up to date. Mention that some settings (like `permissions.deny`, `enabledPlugins` and `autoCompactWindow` changes) take effect on the next Claude Code session/restart in this project.
