---
name: design-refresh
description: "The one skill for updating the design backend from the code: checks whether the references (Claude Design's synced components, or the local studio's captured pages) are behind their code, rebuilds stale screen mockups or re-captures them, offers screens that have no mockup yet, adds a named page or fixes a mockup that differs from the real page, and brings the project's copies of the plugin's files (palette.ts, and for Claude Design the proposal conventions, the navbar, the palette and Tailwind cards) up to a newer plugin version. Use when the user wants Claude Design or the local design studio refreshed or up to date before designing, after design-loop applied changes, after updating the design plugin, or asks to add, mock, capture or fix a page or screen."
---

# Design Refresh

One entry point to make the design backend match the repo. The manifest's `backend` (missing means
`claude-design`) decides how: this skill calls the **Check references** and **Refresh references**
operations of contract §8, done as the backend's doc says
([`claude-design.md`](${CLAUDE_SKILL_DIR}/../../references/backends/claude-design.md),
[`local.md`](${CLAUDE_SKILL_DIR}/../../references/backends/local.md)); read the one that applies.
For the local studio that is `local-backend.mjs check` and re-capturing with `capture.mjs`: no
`/design-sync`, no uploads, and the steps below that only concern Claude Design (the navbar tag,
the plugin files other than `palette.ts`, `ds-bundle/`) do not apply.

For Claude Design: the synced components (through
`/design-sync`, run by the user), the screen mockups (through
[`screens-workflow.md`](${CLAUDE_SKILL_DIR}/references/screens-workflow.md)) and the project's
copies of the plugin's own files (through [`plugin-files.md`](${CLAUDE_SKILL_DIR}/references/plugin-files.md)). Cheap when nothing
changed. It also takes the targeted requests: add a named page, or fix a mockup that differs from
the real page.

## Shared contract

Read [`design-contract.md`](${CLAUDE_SKILL_DIR}/../../references/design-contract.md) (`screens[]`,
§2) and [`screens.md`](${CLAUDE_SKILL_DIR}/../../references/screens.md).

`/design-sync` is built into Claude Code and only the user can start it (typing `/design-sync`):
neither this skill nor a subagent can invoke it. This skill decides whether a sync is needed,
hands it to the user, and does the rest.

## Preconditions

`design.manifest.json` exists. Claude Design: `.design-sync/config.json` has `projectId` and `pkg`;
without them the project has never been synced: point at `design-init`, then a first
`/design-sync`. Local: the studio's `design/` folder exists and the Storybook (or app) to capture
from is running; start it only if the user asks.

## Workflow

1. **What is stale** (**Check references**; for the local backend run `local-backend.mjs check`
   and read its states, then go to step 4 for what to re-capture).
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
   - **Plugin files** (`palette.ts`, the conventions in the readme header, the navbar, the
     palette and Tailwind cards): run
     `node ${CLAUDE_SKILL_DIR}/scripts/plugin-files.mjs check`
     ([`plugin-files.md`](${CLAUDE_SKILL_DIR}/references/plugin-files.md#check)). Exit 1 means
     step 3 applies; exit 3, an older plugin here than the project's: say so and skip step 3.

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

3. **Plugin files** (when the check asked for an update). Follow
   [`plugin-files.md`](${CLAUDE_SKILL_DIR}/references/plugin-files.md#update): `palette.ts`, the
   conventions, then the navbar, palette card and Tailwind card in Claude Design (asking before
   replacing each), then stamp the manifest. Only the conventions need a sync, to publish them:
   update them before handing the sync to the user (step 2), so one sync carries both.

   **3b. Navbar tag on the cards** (when the step 1 check listed cards). On a current build,
   run `node ${CLAUDE_SKILL_DIR}/scripts/nav-tag.mjs ds-bundle --fix`, then upload the changed
   cards (`finalize_plan` with `writes` naming them, `deletes: []`, `localDir: ds-bundle`, then
   `write_files`). Ask first: it edits every card. Each `/design-sync` rewrites the cards, so
   this is needed again after every sync; say so in the report. The fixed bar pads the card body
   down, so comparison sheets made without it may differ slightly in framing: re-grade with it
   on if a grade matters.

4. **Screens.** Local backend: **Refresh references** for the stale components and screens, by
   re-capturing as `local.md` says. To **add** a screen (named by the user, or chosen in step 5):
   1. Resolve it as [`screens-workflow.md`](${CLAUDE_SKILL_DIR}/references/screens-workflow.md)
      step 1 does (route, `sources`, states, viewport, `url`, asking when ambiguous), with its
      preconditions on the dev server and `screensAuth`.
   2. Record its `screens[]` row first (`capture.mjs` captures only a row that exists): `name`,
      `storybook`, `route`, `url`, `sources`, `viewport`, `states`, `mockupPath:
      "design/screens/<kebab-name>.html"`, `proposalPath:
      "design/proposals/screens/<kebab-name>.html"`, `status: "wip"`, `lastImplementedHash:
      null`. Keep every other field and row as is.
   3. Run `capture.mjs screen` (it writes the reference, `mockupHash` and `sourceHash`). It
      anonymises the app's data (`local-studio.md#sample-data`): JSON personal fields are faked, the
      row's `anonymize.redact` selectors cover server-rendered data (ask the user which elements
      show names or emails in an SSR page), and a leftover email, phone or token fails the capture
      with exit 4 and a list of matches: add a selector, a `keys` entry or an `allow` value to the
      row's `anonymize` and re-run. Tell the user what it cannot know: data shown from non-JSON
      sources it cannot see, such as images of people.

   Then go on with step 5, and skip the Claude Design mockup work. Claude Design: follow [`screens-workflow.md`](${CLAUDE_SKILL_DIR}/references/screens-workflow.md),
   with `<screenshot.mjs>` = `${CLAUDE_SKILL_DIR}/../design-loop/scripts/screenshot.mjs`: refresh
   mode for the stale rows, one run for all of them. When the user named a page ("add the Home
   page") or said a mockup doesn't match the real page, run add mode or fix mode for those screens
   instead of the offer in step 5, after the component check in step 1 (and step 2 if stale).

5. **Offer new screens, last.** List the app's routes (its router) that have no `screens[]` row.
   If there are any, ask whether to add some now (`AskUserQuestion`, multi-select, with a "Not
   now" option; name the rest in the question when there are more than fit). Build the chosen
   ones in add mode (same file). Record nothing for the others: they are offered again
   next time, so the user adds screens as they start working on them.

6. **Report**: whether the components are current (or waiting on `/design-sync`), the plugin
   files updated or kept (whether the cards load the navbar, and that changed conventions reach
   Claude Design with the next `/design-sync`),
   the screens rebuilt or added, anything blocked, and the project link
   (`https://claude.ai/design/p/<designProjectId>`).

This skill never edits app code and never writes the synced files.
