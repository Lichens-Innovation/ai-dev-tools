---
name: claude-light
description: "Applies a lightweight local Claude Code configuration to the current project's .claude/settings.local.json — shrinking the auto-compact window and disabling connectors, workflows, bundled skills, artifacts, and a set of noisy/expensive tools. Use when the user asks to make Claude lighter/leaner for this project, run in a stripped-down or minimal mode, or invokes /claude-light."
---

# Claude Light

Apply a fixed "light mode" configuration to the current project's local Claude Code settings, merging it non-destructively into whatever is already there.

## Target configuration

This is the full config this skill applies:

```json
{
  "autoCompactWindow": 150000,
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

1. **Read the existing file.** Use the Read tool on `.claude/settings.local.json`. If it doesn't exist, treat the existing settings as `{}` — there is nothing to conflict with, so skip straight to step 3.

2. **Detect conflicts.** Compare each top-level key in the target configuration against what's already present:
   - `autoCompactWindow` — conflict if it's already set to a different number.
   - `disableClaudeAiConnectors`, `disableWorkflows`, `disableBundledSkills`, `disableArtifact` — conflict if any is already set to `false` (already `true` is not a conflict).
   - `autoMemoryEnabled` — conflict if it's already set to `true` (already `false` is not a conflict).
   - `permissions.deny` — conflict only if the existing array already contains entries **not** in the target list (i.e. the user has their own deny rules that would need reconciling). If the existing array is a subset of the target list, no conflict — just union them.
   - Any other existing top-level keys (e.g. `permissions.allow`, `permissions.ask`, `model`, `statusLine`, ...) are untouched and never a conflict — always preserved as-is.

3. **Ask before overriding.** If step 2 found any conflicts, use `AskUserQuestion` to show each conflicting key with its current value vs. the light-mode value, and ask whether to override, keep the existing value, or (for `permissions.deny`) merge the two lists. Do not silently overwrite a value that differs from the target. If there are no conflicts, proceed without asking.

4. **Merge and write.** Build the final JSON:
   - Start from the existing file content (or `{}`).
   - Apply the target config's keys, respecting the user's conflict resolutions from step 3.
   - For `permissions`, merge at the `permissions` object level — keep any existing `allow`/`ask` arrays untouched, and set `deny` to the union (deduped) of the existing `deny` array and the target list, unless the user chose otherwise.
   - Write the result back with the Write tool (or Edit tool if the file already exists), pretty-printed with 2-space indentation, preserving unrelated existing keys.

5. **Report.** Tell the user the path written (`.claude/settings.local.json`) and a short summary of what changed (new keys added, values overridden, values kept as-is per their choice). Mention that some settings (like `permissions.deny` additions) take effect on the next Claude Code session/restart in this project.
