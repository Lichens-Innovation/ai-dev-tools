---
name: design-in-studio
description: "Designs in the local design studio from a brief: the plugin's designer agent writes one or more alternate versions of a component or screen proposal with the project's tokens and components, checks each in both modes and at narrow width, and the user picks one with Use this version before implement-design. Also refines an existing version. Local backend only. Use when the user asks to design, redesign, explore, propose or improve a component or screen in the studio, wants alternatives or variations of a page, or runs /design-in-studio."
argument-hint: "<component or screen> <what to design>"
---

# Design in Studio

Turns a brief ("a denser settings screen", "three takes on the empty state of the orders table",
"make version c calmer") into **versions** of a page's proposal in the local design studio, written
and checked by the plugin's [`designer`](${CLAUDE_SKILL_DIR}/../../agents/designer.md) agent. The
user compares them in the studio, presses **Use this version** on the one to keep, and runs
`/implement-design`. Nothing here touches the app's code.

Read [`local-studio.md`](${CLAUDE_SKILL_DIR}/../../references/local-studio.md) (proposals,
versions, the `data-studio` rules) first.

## Steps

1. **Backend.** `design.manifest.json` at the repo root must say `"backend": "local"`. Claude
   Design (or a missing `backend`): say that this skill designs in the local studio, and that on
   Claude Design proposals are made in claude.ai/design (`proposals/<name>.html`); stop. No
   manifest: `/init-design-studio` first.

2. **The studio.** `node ${CLAUDE_SKILL_DIR}/../implement-design/scripts/local-backend.mjs status`.
   Exit 1: the studio is not running, so the agent can neither write nor see; say to run
   `/open-design-studio` and stop. No studio MCP tools in this session (`list_pages` missing): the
   same command registers it, then a new session.

3. **The page.** From the argument or the conversation: a component or a screen of the manifest
   (`list_pages` for the exact `{kind, name}`). A page not in the studio yet: a component needs a
   captured reference (`/refresh-design` adds it); a screen likewise. Never invent one here.

4. **The mode and base.**
   - **New**: a brief for the page. Base: the proposal (`a`) when it exists, else the reference
     (`create_alternate` then writes `a`). How many versions: what the user said, else **2** (one
     when the brief is precise, 3 at most: each costs an agent run of screenshots).
   - **Refine**: the user names a version (`refine c`, "the second one"). Base: that version.
     The agent overwrites it when it is an alternate (`b`..`z`), and writes a new alternate when it
     is `a`.
   - A **precise, fully specified edit** ("swap the save button to `--danger`", "rename the title
     to Billing") needs no designer: do it yourself with `get_page` and `write_page` on an
     alternate (or `create_alternate` from `a`), within the same rules, and skip to step 7.

5. **The brief.** It is what the agent works from without the user, so settle what it cannot:
   - Unclear goal (which part of the page, what problem to solve): ask once with
     `AskUserQuestion`, two to four concrete options, the most likely first.
   - What the brief leaves open on purpose is the agent's to explore: do not ask about it.
   - A brief that needs what the project lacks (a new token, a component that is not captured, a
     font): say so now, before any version is written.

6. **Run the designer.** The Agent tool with `subagent_type: "design-studio:designer"` and a
   prompt holding:
   - the page (`{kind, name}`), the mode (`new` with the count, or `refine` with the version),
     the base;
   - the brief, in the user's words, plus what step 5 settled;
   - the plugin root (`${CLAUDE_PLUGIN_ROOT}`, i.e. `${CLAUDE_SKILL_DIR}/../..`), the repo root,
     the Storybook target's `dir` (the manifest's `storybooks`, or the package with Playwright) and
     the studio URL (`http://localhost:<studio.port>`, default 3009).

   One agent writes all the versions of a run, so it can keep them distinct. When the agent type is
   not available (a Claude Code without plugin agents), say so, then do its work yourself following
   [`designer.md`](${CLAUDE_SKILL_DIR}/../../agents/designer.md).

7. **Relay.** `open_page` the first version written. Then tell the user, short:
   - each version: its letter and one-line direction;
   - the blockers the agent could not fix and what each needs from the user (a token, a palette
     pair: those are the palette page's or `design-palette`'s, never a literal in the page);
   - the decisions it took for them, and what was not verified;
   - next: compare the versions in the studio, refine one (`/design-in-studio refine <v> …`), and
     press **Use this version** on the one to keep, then `/implement-design`. `implement-design`
     only implements the proposal (`a`).

Never implement in the app from here, never edit the palette, the references or the manifest, and
never overwrite `a`: the user's **Use this version** is the only way a version becomes the proposal.
