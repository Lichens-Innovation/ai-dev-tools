---
name: design-refresh
description: "The one skill for updating Claude Design from the code: checks whether the synced components are behind their code, rebuilds stale screen mockups, offers screens that have no mockup yet, and adds a named page or fixes a mockup that differs from the real page. Use when the user wants Claude Design refreshed or up to date before designing, after design-loop applied changes, or asks to add, mock or fix a page or screen in Claude Design."
---

# Design Refresh

One entry point to make Claude Design match the repo: the synced components (through
`/design-sync`, run by the user) and the screen mockups (through
[`screens-workflow.md`](${CLAUDE_SKILL_DIR}/references/screens-workflow.md)). Cheap when nothing
changed. It also takes the targeted requests: add a named page, or fix a mockup that differs from
the real page.

## Shared contract

Read [`design-contract.md`](${CLAUDE_SKILL_DIR}/../../references/design-contract.md) (`screens[]`,
§2) and [`screens.md`](${CLAUDE_SKILL_DIR}/../../references/screens.md).

`/design-sync` is built into Claude Code and only the user can start it (typing `/design-sync`):
neither this skill nor a subagent can invoke it. This skill decides whether a sync is needed,
hands it to the user, and does the rest.

## Preconditions

`design.manifest.json` exists and `.design-sync/config.json` has `projectId` and `pkg`. Without
them the project has never been synced: point at `design-init`, then a first `/design-sync`.

## Workflow

1. **What is stale.**
   - **Components.** They are current when all of these hold:
     - the local `ds-bundle/_ds_sync.json` exists and its `bundleSha12` equals the project's
       (`DesignSync get_file _ds_sync.json`): the last build is the one uploaded;
     - no file the sync reads changed after that build:

       ```bash
       find <paths> -type f -newer ds-bundle/_ds_sync.json -not -path '*/node_modules/*' | head
       ```

       `<paths>`: `.design-sync/` minus its git-ignored folders (`sb-reference/`, `.cache/`,
       `learnings/`, `pkg/types/`), each Storybook target's config dir, the palette's `outputs`,
       and the folder of every component row's `localPath` (their stories live there).

     Anything else means stale. A false alarm only costs a `/design-sync` that finds nothing to
     upload.

   - **Screens.** For each `screens[]` row, recompute `sourceHash` (screens.md): a different
     value means its mockup is stale.
   - **Shared navbar.** `DesignSync get_file design-nav.js` and compare it with the plugin's
     [`design-nav.js`](${CLAUDE_SKILL_DIR}/../design-palette/templates/design-nav.js): different
     bytes mean the project runs an older navbar. When the manifest has a `palette.namespace`, do
     the same for `Tailwind.html` against
     [`tailwind-classes.html`](${CLAUDE_SKILL_DIR}/../design-palette/templates/tailwind-classes.html):
     different bytes mean an older Tailwind card, no file means the project has none yet.

   - **Navbar on the cards.** The sync's cards have no navbar hook of their own: they get the
     navbar only through the design provider, and only once `design-init` step 8 has wired it in
     (its second run). The local checks (render check, comparison sheets) render each card alone,
     so they never show a missing navbar. Check the local build:

       ```bash
       node ${CLAUDE_SKILL_DIR}/scripts/nav-tag.mjs ds-bundle
       ```

     It lists the cards that don't load `design-nav.js` (exit 1). Also look for the provider
     hook: `grep -rl design-nav .design-sync --include='*.tsx' --include='*.jsx' --include='*.ts'
     --include='*.js' --exclude-dir=node_modules --exclude-dir=types`. No match means the
     wrapper package never got it: the real fix is `design-init` step 8 (re-run `design-init`,
     then `/design-sync`), and step 3b below is only the stopgap. Any listed card, with
     `design-nav.js` in the project, means step 3b applies once the build is current.

   Tell the user what you found in one short list. Nothing stale: say Claude Design is up to
   date and go to step 5.

2. **Components stale → hand the sync to the user.** Ask them to type `/design-sync` (it
   re-syncs only what changed; they approve its upload) and to run `/design-refresh` again when
   it finishes. Tell them the sync must keep the project's own files: `screens/`, `proposals/`,
   `Palette.dc.html`, `Tailwind.html`, `design-nav.js`, `thumbnail.html` and `support.js` are not from the sync
   and must not be in its deletes. Also warn them that a plan approved earlier in the session
   expires: after a sync, upload with a new plan, not an old plan ID (it fails with "Plan token is
   missing or does not match this project"). A fresh `finalize_plan` returns an ID that works. Then stop: the mockups render the synced bundle, so they wait
   for the new one. Only when no stale screen needs the new bundle (they use only components that
   didn't change) may you go on to steps 3–4 first; say so.

3. **Navbar and Tailwind card** (when older or missing). Show the user what changed and ask
   before replacing a file: someone may have edited it in Claude Design. On yes, copy the
   templates to `/tmp/design-refresh/` and upload them to `design-nav.js` and `Tailwind.html`
   (`DesignSync finalize_plan` with `writes` naming those files, `deletes: []`,
   `localDir: /tmp/design-refresh`, then `write_files`). Upload the navbar with the Tailwind card:
   the card needs the navbar's palette engine and adds itself to its sidebar. Neither needs a sync.

   **3b. Navbar tag on the cards** (when the step 1 check listed cards). On a current build,
   run `node ${CLAUDE_SKILL_DIR}/scripts/nav-tag.mjs ds-bundle --fix`, then upload the changed
   cards (`finalize_plan` with `writes` naming them, `deletes: []`, `localDir: ds-bundle`, then
   `write_files`). Ask first: it edits every card. Each `/design-sync` rewrites the cards, so
   this is needed again after every sync; say so in the report. The fixed bar pads the card body
   down, so comparison sheets made without it may differ slightly in framing: re-grade with it
   on if a grade matters.

4. **Screens.** Follow [`screens-workflow.md`](${CLAUDE_SKILL_DIR}/references/screens-workflow.md),
   with `<screenshot.mjs>` = `${CLAUDE_SKILL_DIR}/../design-loop/scripts/screenshot.mjs`: refresh
   mode for the stale rows, one run for all of them. When the user named a page ("add the Home
   page") or said a mockup doesn't match the real page, run add mode or fix mode for those screens
   instead of the offer in step 5, after the component check in step 1 (and step 2 if stale).

5. **Offer new screens, last.** List the app's routes (its router) that have no `screens[]` row.
   If there are any, ask whether to add some now (`AskUserQuestion`, multi-select, with a "Not
   now" option; name the rest in the question when there are more than fit). Build the chosen
   ones in add mode (same file). Record nothing for the others: they are offered again
   next time, so the user adds screens as they start working on them.

6. **Report**: whether the components are current (or waiting on `/design-sync`), the navbar
   (and whether the cards load it),
   the screens rebuilt or added, anything blocked, and the project link
   (`https://claude.ai/design/p/<designProjectId>`).

This skill never edits app code and never writes the synced files.
