# AGENTS.md

Instructions for AI coding agents working on this project. See [agents.md](https://agents.md/) for the format.

This project uses **React and TypeScript**. When editing or refactoring code, follow the norms defined in these skills — read each skill's `SKILL.md` and apply its workflow.

---

## Normalize Code — workflow

### When to apply this workflow

If the user asks to **normalize** the code (e.g. "normalize", "normalize this code", "normalize [files / branch / staged / selection]"), treat this as the **primary task**: execute the workflow below in full. Do not summarize it; run every step in order.

**Trigger phrases:**

- "normalize this code"
- "normalize"
- "normalize [files / branch / staged / selection]"

**Tools:** Use only the tools needed to read and edit code: Read, Write, Edit, Grep, Glob, and shell commands when necessary. Focus on concrete edits.

**Context:** This applies to a **React and TypeScript** project. The workflow orchestrates three skills; each skill is the source of truth for its own workflow — do not duplicate their content here.

---

### Workflow

Execute all steps in order; do not summarize the workflow.

1. **Resolve scope** — Determine the initial set of files in scope (selected files, git staged files, branch, selected lines, directory, or glob). Maintain a **current scope** for the whole run: start with this initial set, and **add to it every file you create or modify** during the workflow (steps 2–4), e.g. renamed paths, new sub-components, or any file touched by the skills. Steps 2, 3, and 4 always run on the **current scope**. Whenever you create or modify a file, add it to the current scope so that subsequent steps and re-validation (5–6) always consider the full set of files touched by this normalization run.

2. **Run react-files-structure-standards** — Read [skills/react-files-structure-standards/SKILL.md](skills/react-files-structure-standards/SKILL.md) and the reference file it specifies. Execute the skill's full two-phase workflow (Phase 1: collect file/folder violations, Phase 2: rename and update imports) on all paths in the **current scope**. After creating or renaming files, add those paths to the current scope. Do not summarize the skill's workflow in this rule; follow the skill as written.

3. **Run react-coding-standards** — Read [skills/react-coding-standards/SKILL.md](skills/react-coding-standards/SKILL.md) and the reference files it specifies. Execute the skill's full two-phase workflow (Phase 1: collect violations, Phase 2: apply corrections) on all files in the **current scope**. Do not summarize the skill's workflow in this rule; follow the skill as written.

4. **Run react-single-responsibility** — Read [skills/react-single-responsibility/SKILL.md](skills/react-single-responsibility/SKILL.md). Execute the skill's simplification strategies on all files in the **current scope**. After creating new files (e.g. sub-components), add those files to the current scope. Let the skill define decomposition order, structure, and rules; do not repeat them here.

5. **Re-validate coding standards** — Re-run **Phase 1 only** of react-coding-standards (violation collection) on all files in the **current scope** (i.e. initial set plus every file created or modified during steps 2–4). Include every file touched by the workflow so that new or modified code is also checked; otherwise violations in those files will not trigger a new iteration. This checks in-code violations only; file and folder structure is not re-audited here.
   - If any violations are found → log them, then go back to step 3 (new iteration).
   - If no violations → proceed to step 6.
   - **Max 2 iterations.** If violations still exist after 2 full cycles, report the remaining issues and stop.

6. **Re-validate single-responsibility** — Re-run the react-single-responsibility criteria (checklists and simplification rules from the skill) on all files in the **current scope** (i.e. initial set plus every file created or modified during steps 2–4). Include every file touched by the workflow so that new or modified code is also checked.
   - If any violations are found → log them, then go back to step 3 (new iteration).
   - If no violations → proceed to the summary.
   - **Max 2 iterations.** If violations still exist after 2 full cycles, report the remaining issues and stop.

7. **Produce the summary** (see Output below).

---

### Output — Summary report

After the final iteration:

```
## Normalize — Summary

**Scope:** <resolved scope>
**Iterations:** <n>

### Changes applied
| File | Change type | Description |
|------|-------------|-------------|
| ...  | Rename / Refactor / Extract / Split | ... |

### Files created
- `path/to/new-file.ts` — reason

### Remaining issues (if max iterations reached)
- ...
```

---

### Rules of thumb (normalize-specific)

- **Never change business logic** — only structure, naming, and patterns.
- **Selected lines scope** — when the user specified lines, restrict all edits to that range.
- **Stop at 2 iterations** — report remaining violations rather than looping beyond 2 cycles.
