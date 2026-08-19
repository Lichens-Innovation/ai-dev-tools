# Plan: stop false "skill doesn't exist" claims in Maestro audits

## Problem

A memory from a past session (`feedback_skill_existence_check.md`, project
`sfppn-maintenance-assistee`) records a real incident: during a human-review
audit, an agent searched only `~/.claude/skills` and one plugin repo, then
reported six of seven `referenced_skills` on a Maestro instance as "do not
exist on disk" and recommended deleting them from `maestro.json`. All six
existed — as installed marketplace plugin skills (`expo:eas-app-stores`,
etc.). Two subagents had already surfaced the correct `plugin:skill` form in
their own output earlier in the same session.

This is a tooling gap, not just an agent-discipline gap: **nothing in this
repo actually checks whether a `referenced_skills`/`loaded_skills` entry in
`maestro.json` resolves to a real skill.** Confirmed by research:

- Skill ids in `maestro.json` are opaque strings, passed through verbatim
  end-to-end — written/read in
  `apps/ai-tools-manager/src/utils/maestro.ts:107-110,401-409`, collected in
  `plugins/ai-tools-manager/scripts/lib/maestro-session.cjs:92-114`
  (`collectAgentSkills`), and injected into subagent context in
  `plugins/ai-tools-manager/scripts/maestro-inject-agent-context.js:131-172`.
  No qualification (`bare` → `plugin:bare`) or existence check happens
  anywhere in that path — if the id is stale or was only ever valid as a
  plugin-qualified name, the only place that fails is the subagent's own
  `Skill` tool call at runtime.
- `plugins/ai-tools-manager/scripts/maestro-validate-tasks.js:98` validates
  that a referenced *workflow* exists, but never validates skill references.
- The four real discovery locations (project skills, user skills, installed
  marketplace plugin cache, plugin `installPath`) are already implemented
  and merged into one list — but only for the canvas UI:
  `packages/claude-fs/src/definitions.ts:30-90` (`readSkillsFromDir`,
  `getUserSkills`, plugin sweep), `packages/claude-fs/src/plugin.ts:7-101`
  (installed/marketplace plugin listing), consumed by
  `apps/ai-tools-manager/src/utils/maestro.ts:84-96`. This merged list is
  the ground truth nothing outside the UI ever consults.

So the failure isn't just "the agent grepped two locations instead of four"
— it's that the four-location merge already exists in `claude-fs`, is
already proven correct (the UI uses it to populate the canvas), and is
simply never exposed as something an audit step, a validation script, or a
subagent can call to get a yes/no answer.

## Fix 1 — extract a reusable `resolveSkillId` / `skillExists` check

Add a small exported function in `packages/claude-fs` (near
`definitions.ts`) that takes a skill id (bare or `plugin:name`) plus a
project root, and returns whether it resolves — reusing the same merge
`apps/ai-tools-manager/src/utils/maestro.ts:84-96` already builds, rather
than duplicating the four-location walk. Have `maestro.ts` import it instead
of inlining the merge, so there is exactly one implementation of "does this
skill id exist."

## Fix 2 — wire it into `maestro-validate-tasks.js`

Extend `plugins/ai-tools-manager/scripts/maestro-validate-tasks.js`
(alongside its existing workflow-existence check at line 98) to also walk
every instance's `referenced_skills`/`loaded_skills` through the Fix 1
checker and report any that don't resolve. This turns "does this skill
exist" from a manual, error-prone grep into a command anyone (human,
orchestrator, or a subagent doing an audit) can run and trust.

## Fix 3 — document the resolution rule where it'll be read

Add a short section to the existing `maestro-architecture` SKILL.md
(`apps/ai-tools-manager/.claude/skills/`) — the skill already read by anyone
asking "how do skills get injected into a subagent" — stating explicitly:

- a bare id in `maestro.json` may resolve through the plugin cache, not just
  project/user skills;
- the four locations that must all be checked before concluding a skill is
  missing (project, user, marketplace plugin cache, plugin `installPath`);
- the decision rule from the memory: a `plugin:skill` form appearing
  anywhere (subagent output, a listing) is proof of resolution — treat it as
  evidence, don't re-derive absence from a bare-name search.

This replaces "an agent has to already know this from a personal memory
file" with "the architecture doc anyone loads for Maestro questions already
says it."

## Fix 4 — behavioral note for audit-style tasks

Once Fix 1/2 exist, any future human-review or post-mortem style audit
(e.g. `ai-tools-manager:maestro-post-mortem`) that wants to claim a
`referenced_skills` entry is dead should be told to run the Fix 2 validator
first, rather than grep two of the four locations and assert absence. This
is the actual fix for the incident in the memory — the memory's checklist
becomes a script's exit code instead of something to remember to do by hand.

## Not doing yet

This plan does not implement any of the above — it's a scoping document.
Confirm the approach (especially whether `resolveSkillId` belongs in
`claude-fs` vs. directly in `apps/ai-tools-manager/src/utils/maestro.ts`)
before starting Fix 1.
