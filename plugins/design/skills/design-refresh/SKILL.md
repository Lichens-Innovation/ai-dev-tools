---
name: design-refresh
description: "Brings the Claude Design project up to date with the code: re-syncs the components when their code changed (the long local part runs in the design-sync-runner subagent, the upload in this session), rebuilds the screen mockups whose code changed, and offers screens that have no mockup yet. Use when the user wants Claude Design refreshed or up to date before designing, or after design-loop applied changes."
disable-model-invocation: true
---

# Design Refresh

One entry point to make Claude Design match the repo: the synced components (through
`/design sync`) and the screen mockups (through `design-screens`). Cheap when nothing changed.

## Shared contract

Read [`design-contract.md`](${CLAUDE_SKILL_DIR}/../../references/design-contract.md) (`lastSync`,
`screens[]`, §2) and [`screens.md`](${CLAUDE_SKILL_DIR}/../../references/screens.md).

## Preconditions

`design.manifest.json` exists and `.design-sync/config.json` has `projectId` and `pkg`. Without
them the project has never been synced: point at `design-init`, then a first `/design sync` in
this session (it asks questions a subagent can't).

## Workflow

1. **What is stale.**
   - **Components.** With `lastSync.commit` in the manifest, list the files the sync reads that
     changed since, committed or not:

     ```bash
     git diff --name-only <lastSync.commit> -- <paths>; git status --porcelain -- <paths>
     ```

     `<paths>`: `.design-sync/` (minus its ignored folders), each Storybook target's config dir,
     the palette's `outputs`, and the folder of every component row's `localPath` (their stories
     live there). Any output, or no `lastSync`, means stale. When unsure, treat it as stale: the
     sync's own diff decides what really changed.

   - **Screens.** For each `screens[]` row, recompute `sourceHash` (screens.md): a different
     value means its mockup is stale.
   - **New screens.** List the app's routes (its router) that have no row and are not in
     `screensIgnored`.

   Tell the user what you found in one short list. Nothing stale and no new screens: say
   Claude Design is up to date and stop.

2. **Re-sync the components** (when stale). Start the `design-sync-runner` agent in the
   background (Agent tool, `run_in_background: true`) with the repo root and the manifest's
   `designProjectId`. Tell the user it is running and that a sync can take a while; answer
   questions meanwhile, but don't write screen mockups until it finishes (it rebuilds
   `ds-bundle/`). Then act on its report:
   - `nothing-to-upload` → go to step 4.
   - `ready-to-upload` → step 3.
   - `blocked` or `first sync needed` → relay what the user must do, and stop the component part.
     Screens whose only change is their own code can still refresh if the local `ds-bundle/`
     matches the project.

3. **Upload** in this session, so the user is here for the approval. Invoke the built-in
   `design-sync` skill and tell it: verification is done by `design-sync-runner`, the verdict
   is `ds-bundle/.resync-verdict.json`; run only its upload step (atomic path), which re-fetches
   the anchor first and re-runs the driver if it moved. The deletes come from the verdict's
   `upload.deletePaths`, verbatim; never delete `screens/`, `proposals/`, `Palette.dc.html`,
   `design-nav.js`, `thumbnail.html` or `support.js`. If the approval is denied, stop and ask.

4. **Record the sync.** Once the project matches (uploaded, or nothing to upload), set
   `lastSync` in the manifest: `{ "commit": "<git rev-parse HEAD>", "bundleSha12": "<from
ds-bundle/_ds_sync.json>" }`. A dirty tree is fine: the next check still sees those files
   through `git status`.

5. **Screens.** Follow [`design-screens`](${CLAUDE_SKILL_DIR}/../design-screens/SKILL.md):
   refresh mode for the stale rows, one run for all of them. For new screens, ask once with
   `AskUserQuestion` (multi-select; the four most used first, the rest named in the question)
   which to add; build those in add mode, and add the ones the user declines to `screensIgnored`
   so they aren't offered again.

6. **Report**: components re-synced (or already up to date), screens rebuilt or added, anything
   blocked, the durable `.design-sync/` files the runner changed (offer to commit them; don't
   commit unasked), and the project link (`https://claude.ai/design/p/<designProjectId>`).

## Notes

- Order matters: mockups render the synced bundle, so the component upload comes first.
- This skill never edits app code.
