---
name: afk-post-mortem
description: "Runs a retrospective on the current AFK session — reads the ephemeral session log (afk_session.log.jsonl) and couples it with this session's own context to flag what could have gone better (false typecheck/test errors, redundant file reads/edits, wrong decisions or assumptions, bad handoffs), then offers to propose and apply fixes. Use when the user wants a post-mortem, retro, or session review, asks what went wrong / what could have gone better, or wants to tighten their AFK setup after a run."
---

# AFK Post-Mortem

Look back over the current AFK session and find what could have gone better. The AFK hooks record an objective timeline of every tool call, subagent dispatch, and handoff to `.claude/afk_session.log.jsonl`; you also carry the **conversation context** of this session. Coupling the two lets you spot wasted work and bad calls — and turn them into concrete fixes.

This is read-and-reason first; it never changes anything until the user opts in.

## Workflow

1. **Generate the digest.** The log embeds full subagent input/output, so don't read it raw — run the helper, which condenses it:

   ```bash
   node "${CLAUDE_SKILL_DIR}/../../scripts/afk-post-mortem.js" "${CLAUDE_PROJECT_DIR:-.}"
   ```

   If it reports **no session log found**, tell the user the post-mortem must run **during an active AFK session** — the log is ephemeral and is wiped at `SessionEnd` — then stop. (The digest also accepts `--json` if you'd rather parse it.)

2. **Couple the digest with this session's context.** The digest is the objective record (what ran, how often, which handoffs returned what). Your conversation context supplies the things the log can't: _why_ you did something, which errors were real vs. spurious, where you went down a dead end, and which assumptions turned out wrong. Read the digest's flags as **leads, not verdicts** — confirm or dismiss each against what actually happened.

3. **Produce the post-mortem.** Write a tight, impact-ranked list of snags. Useful categories:
   - **Redundant work** — files read or edited more than they needed to be (use the digest's repeated-read / edit-churn flags, but only keep the ones that were genuinely avoidable).
   - **False or flaky checks** — typecheck/test/lint runs (listed in the digest) that errored on non-issues, or errored then passed unchanged. Cross-check against what you saw.
   - **Questionable decisions / assumptions** — choices that cost time or headed the wrong way; assumptions that later proved false.
   - **Handoff issues** — `no-return` or `unknown` handoffs, condition reroutes, or dispatch inputs that were under- or mis-scoped so a subagent worked off the wrong brief.

   For each snag give: **what happened**, **evidence** (a digest line or a moment from context), and **why it was suboptimal**. Skip categories with nothing real in them.

4. **Offer to explore fixes.** Ask the user which snags they want to address — don't fix unprompted. For each one they pick, propose a concrete remediation mapped to the right AFK lever, then **apply it once they confirm**:
   - tighten a subagent's prompt, or its handoff payload template at `templates/handoffs/<sender>/<receiver>.md`
   - add or adjust a skill/rule mapping — re-run `/afk` for the visual editor, or hand-edit `.claude/afk.json` and run `/afk-sync`
   - adjust the orchestrator's prose in `.claude/skills/agent-orchestrator/SKILL.md`
   - fix a workflow edge or a condition label that misrouted a handoff
   - or a plain process fix (e.g. "read the file once and reuse it", "run the typecheck only after the edit batch")

   Leave snags the user doesn't pick at the proposal stage.

## Notes

- The session log is **ephemeral and gitignored** — deleted at `SessionEnd`. Run this mid-session, while the evidence still exists.
- The helper is **read-only**: it touches only the current project's `.claude/` and never deletes or rewrites anything.
- Heuristic flags use loose thresholds to surface candidates; expect some that you'll dismiss after checking context. Missing a flag doesn't mean nothing went wrong — your own recollection is the other half of the analysis.
