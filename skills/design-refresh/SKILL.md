---
name: design-refresh
description: "Brings the Claude Design project up to date with the code: checks whether the synced components are behind their code (and asks the user to run /design-sync when they are), rebuilds the screen mockups whose code changed, and offers screens that have no mockup yet. Use when the user wants Claude Design refreshed or up to date before designing, or after design-loop applied changes."
disable-model-invocation: true
---

# Design Refresh

One entry point to make Claude Design match the repo: the synced components (through
`/design-sync`, run by the user) and the screen mockups (through `design-screens`). Cheap when
nothing changed.

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
     bytes mean the project runs an older navbar.

   Tell the user what you found in one short list. Nothing stale: say Claude Design is up to
   date and go to step 5.

2. **Components stale → hand the sync to the user.** Ask them to type `/design-sync` (it
   re-syncs only what changed; they approve its upload) and to run `/design-refresh` again when
   it finishes. Tell them the sync must keep the project's own files: `screens/`, `proposals/`,
   `Palette.dc.html`, `design-nav.js`, `thumbnail.html` and `support.js` are not from the sync
   and must not be in its deletes. Then stop: the mockups render the synced bundle, so they wait
   for the new one. Only when no stale screen needs the new bundle (they use only components that
   didn't change) may you go on to steps 3–4 first; say so.

3. **Navbar** (when older). Show the user it changed and ask before replacing it: someone may
   have edited it in Claude Design. On yes, copy the template to `/tmp/design-refresh/` and upload
   it to `design-nav.js` (`DesignSync finalize_plan` with `writes: ["design-nav.js"]`,
   `deletes: []`, `localDir: /tmp/design-refresh`, then `write_files`). It doesn't need a sync.

4. **Screens.** Follow [`design-screens`](${CLAUDE_SKILL_DIR}/../design-screens/SKILL.md):
   refresh mode for the stale rows, one run for all of them.

5. **Offer new screens, last.** List the app's routes (its router) that have no `screens[]` row.
   If there are any, ask whether to add some now (`AskUserQuestion`, multi-select, with a "Not
   now" option; name the rest in the question when there are more than fit). Build the chosen
   ones with `design-screens` in add mode. Record nothing for the others: they are offered again
   next time, so the user adds screens as they start working on them.

6. **Report**: whether the components are current (or waiting on `/design-sync`), the navbar,
   the screens rebuilt or added, anything blocked, and the project link
   (`https://claude.ai/design/p/<designProjectId>`).

## Notes

- Order matters: mockups render the synced bundle, so the component sync comes first.
- This skill never edits app code and never writes the synced files.
