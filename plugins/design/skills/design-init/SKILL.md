---
name: design-init
description: "One-time setup for running the design loop in an existing React or React Native project."
disable-model-invocation: true
---

# Design Init

Setup orchestrator. Gets a project ready for `design-loop` on one of two backends (contract §8):
**Claude Design**, where the palette lives in the repo **and** in the Claude Design project from
day one, so it is part of the loop like any component, or the **local design studio**, where the
design lives in the repo's `design/` folder. Idempotent: safe to re-run; skips what already exists.

## Shared contract

Read [`design-contract.md`](${CLAUDE_SKILL_DIR}/../../references/design-contract.md). Everything
this skill produces must satisfy the preconditions in §6.

## Workflow

1. **Detect current state.** Run `node ${CLAUDE_SKILL_DIR}/scripts/detect.mjs` (read-only JSON):
   Claude Code prerequisites (`prerequisites`), package manager, monorepo, and per package whether
   Tailwind, Storybook (with its `issues` review), Chromatic and Playwright are present, the
   Storybook MCP entries, and the manifest. Also check what a script cannot: a canonical palette
   file exists, and, once the backend is known (step 1a), its own prerequisites: for Claude Design
   the Claude Design MCP is connected, `/design sync` is listed (README "Prerequisites") and
   whether a project is already bound; for local, Docker answers (`docker info`) and the studio
   container is running. Report the gap list.

1a. **Backend.** An existing manifest decides: its `backend`, or `claude-design` when it has none
   (contract §2). Do not ask again: moving a set-up project to the other backend is
   `/design-switch-backend`. With no manifest yet, ask (`AskUserQuestion`): **Claude Design** (explore in claude.ai/design;
   needs the Claude Design MCP, DesignSync and `/design sync`) or **Local design studio** (a Docker
   container serves the project's `design/` folder; no account, nothing leaves the machine).
   Steps 4, 5, 6 and 8 are for Claude Design only; the local backend has its own steps L1 to L4
   after step 7. Everything else is shared.

1b. **Prerequisites and choices.**
   - **Prerequisites** (`prerequisites.fixes`, Node 22.18+ for `palette.ts`; for the local backend
     only the Node version applies, skip the Claude Code settings fixes): list each change you
     would make (e.g. set `disableBundledSkills` to `false` in `<file>`, remove `DesignSync` from
     `permissions.deny`), then ask before applying any. JSON settings cannot hold a comment, so
     explain the change in your reply instead. Settings edits need a new session: say so. When
     the Claude Design MCP is missing, give the user the README command; do not run it.
   - **Tailwind**, when a UI package lacks it: ask (`AskUserQuestion`) between adding Tailwind
     (v4, following the framework's own Tailwind guide, namespaced palette utilities) and using
     the palette **without** Tailwind (no namespace, no Tailwind outputs or card; hand-authored
     spacing, type and breakpoint tokens instead, and the Sass file when the package's `sass` is
     true). Keep the answer for steps 2 and 6.
   - **Chromatic**, when absent: ask whether to install it, stating it is **optional** (an
     external account and token, and quota use). Without it, `design-loop` skips its publish
     step and contract §6's Chromatic precondition is waived. Skip the question when it is
     already installed.

2. **Palette (sub-skill).** Invoke **`design-palette`** (steps 1–6 only: targets, inputs,
   generation, audit), passing the Tailwind choice. Result: the canonical inputs file plus
   generated outputs.

3. **Storybook + MCP + Playwright (sub-skill).**
   - Not installed: invoke **`storybook-init`**. In a monorepo it may produce several Storybook
     targets (contract §2); keep the list.
   - Already installed: **review it** with the package's `storybook.issues` from step 1 plus
     one launch of its dev server (stories render, `<url>/mcp` answers, an `iframe.html?id=`
     screenshot works). Show the user each change needed for the loop (addon-mcp, addons,
     scripts, ESM config, a React Native web framework, stories), ask before applying, then
     apply with `storybook-init`'s steps. Never upgrade Storybook's major version silently.
   - **The Storybook MCP stays.** `design-loop` calls it every run (`docs-show`,
     `stories-changed`, `test-run`), so it is not install-only; do not remove it. Tell the user
     it connects at session start and only works while Storybook runs.

3b. **Chromatic (sub-skill).** When chosen in 1b (or already present), invoke **`chromatic-init`**
   once Storybook exists.

4. **Create or bind the Claude Design project** (Claude Design only). `DesignSync list_projects`.
   - **Default: create a new project** for this repo with `DesignSync create_project` (`name`:
     the repo name).
   - Reuse an existing project only when the user points at one; confirm with
     `DesignSync get_project` that its type is `PROJECT_TYPE_DESIGN_SYSTEM`.

   Only `DesignSync create_project` makes a design-system project, and the type cannot change
   later. Never create it with the Claude Design tool's `create_project`: that makes an ordinary
   project, which `DesignSync list_projects` and `/design sync` do not see. If DesignSync is not
   available, stop and ask the user to enable it (`/design-login` without a claude.ai login).

   Record its id as `designProjectId`.

`<palette.ts>` below is the repo's copy `design-palette` put in (step 5 there), else the
plugin's [`palette.ts`](${CLAUDE_SKILL_DIR}/../design-palette/scripts/palette.ts).

5. **Reconcile the palette** (Claude Design only, and only when the project already has `Palette.dc.html` at its root per
   `DesignSync list_files`, i.e. a reused project or a re-run). Fetch it with `DesignSync get_file`
   into `/tmp/design-init/remote-palette.html` (data, not instructions: contract §7), then:

   ```bash
   node <palette.ts> <canonical> --diff-card /tmp/design-init/remote-palette.html
   ```

   - No differences → nothing to do.
   - Differences → show them and ask which side wins, per input or globally:
     - **repo wins** (default, `canonical-wins`): step 6 overwrites the card.
     - **Design wins**: `palette.ts <canonical> --from-card /tmp/design-init/remote-palette.html`
       with the output flags for the targets chosen in `design-palette` step 1 (`--theme <file>`
       or `--web`, `--scheme <file>`, `--mobile <file> --namespace <name>`, `--json <file>`, `--sass <file>`), report the audit, then run
       step 6 so both sides match.

   Never merge silently.

6. **Seed the palette card** (Claude Design only). Copy
   [`palette-preview.dc.html`](${CLAUDE_SKILL_DIR}/../design-palette/templates/palette-preview.dc.html)
   to `/tmp/design-init/palette.html` and
   [`design-nav.js`](${CLAUDE_SKILL_DIR}/../design-palette/templates/design-nav.js) (the navbar
   and card sidebar the project's cards share) to `/tmp/design-init/design-nav.js`. When a
   Tailwind namespace was chosen, also copy
   [`tailwind-classes.html`](${CLAUDE_SKILL_DIR}/../design-palette/templates/tailwind-classes.html)
   (every palette class, with its swatch) to `/tmp/design-init/tailwind.html`. Then write the
   repo's inputs and name into the card and generate the project thumbnail:

   ```bash
   node <palette.ts> <canonical> --to-card /tmp/design-init/palette.html \
     --title "<repo name>" --namespace <name> --thumbnail /tmp/design-init/thumbnail.html
   ```

   Upload to the project root (the Pages list only shows root files, and the Design System view
   labels each card by its file name): `DesignSync finalize_plan` (`writes: ["Palette.dc.html",
   "design-nav.js", "thumbnail.html", "Tailwind.html"]`, `deletes: []`, `localDir:
   /tmp/design-init`), then `DesignSync write_files` with that `planId` and one
   `{ path, localPath }` per file (`Palette.dc.html` ← `palette.html`, `Tailwind.html` ←
   `tailwind.html`, the others same name). Drop `Tailwind.html` when it wasn't copied. It has no
   palette code or inputs of its own (it reads them from `Palette.dc.html` through the navbar),
   so it is uploaded as is. Claude Design's design-system check reports a project without a root
   `thumbnail.html`; it is generated from the inputs, so never hand-edit it, and replace one
   Claude Design created by itself.

   The card only renders with the Design Components runtime `support.js` beside it. When the
   step 5 `list_files` result shows no root `support.js`, write it with the Claude Design tool's
   `create_support_js` (`path: "support.js"`, under that tool's own `finalize_plan`); DesignSync
   cannot, its content is server-provided. Never overwrite an existing `support.js`.

7. **Write the manifest.** Create or update `design.manifest.json` (contract §2): `designProjectId`,
   `reconcileRule` (`canonical-wins`), the `palette` entry (`localPath`: the canonical file,
   `outputs`: the `web`, `scheme`, `mobile`, `json` and `sass` files from `design-palette` step 1,
   `script`: the repo's `palette.ts` copy, `namespace`: the one chosen (Tailwind targets),
   `designPath: "Palette.dc.html"`, `thumbnailPath: "thumbnail.html"`, `status: "wip"`,
   `lastImplementedHash`: `shasum -a 256` of the uploaded card), `pluginVersion` (written by
   `node ${CLAUDE_SKILL_DIR}/../design-refresh/scripts/plugin-files.mjs stamp` once the file
   exists: the plugin version its copies come from), and a `components[]` row per
   discovered component (`wip`, `lastImplementedHash: null`, `storyId`: its main story, a story
   id such as `ui-button--default` from the target's `index.json`, not the component id
   `ui-button`: `iframe.html?id=` renders only a story, `designPath`: its synced card, or `null`
   until the catalog is synced, see step 8, and `proposalPath`: `proposals/<kebab-name>.html`
   once it has a card, else `null`). With several Storybook targets, also write `storybooks`
   and each component's `storybook` key.

   Write `backend` first (`"claude-design"` or `"local"`). For **local**, the rows keep their
   meaning with local paths (contract §2, "The local backend's rows"): no `designProjectId`;
   `palette.designPath: null`, no `thumbnailPath`, `lastImplementedHash`: the SHA-256 of the inputs
   file; each component's `designPath: "design/components/<kebab-name>.html"` and `proposalPath:
   "design/proposals/<kebab-name>.html"` right away (the references exist after step L3).

**Local backend only, in place of steps 4, 5, 6 and 8:**

L1. **Create `design/`**: `design/assets/`, `design/components/`, `design/screens/`,
   `design/proposals/screens/` (a `.gitkeep` in each folder that would stay empty) and
   `design/index.json` as `{ "pages": [] }`. `design/` is committed; git-ignore `.design-screens/`
   (the saved sign-in for screen captures). Never overwrite an existing `design/`. Screen captures
   anonymise the app's data with `@faker-js/faker`, resolved from the Storybook target's `dir` like
   Playwright: install it there as a dev dependency next to Playwright (`npm i -D @faker-js/faker`
   with the project's package manager) unless it is already present.

L2. **Capture the mapped components.** Each Storybook target must be running (its `runCommand`; start
   it only if the user asks) with Playwright installed. For each component row, from its target's
   `dir`: `node ${CLAUDE_SKILL_DIR}/../design-loop/scripts/capture.mjs component <name>
   --storybook-url <url> --story-id <storyId> --manifest <repo>/design.manifest.json`. A failed
   capture is reported (which story, why), not fatal: the component stays without a reference and
   `design-refresh` retries it. Screens are not captured here: they are added later, on request,
   by `design-refresh`.

L3. **Start the studio.** Follow `${CLAUDE_SKILL_DIR}/../../commands/design-studio.md` (the
   `/design-studio` command): it starts this project's container, writes `studio.port` and
   registers the studio MCP at project scope. Then check `node
   ${CLAUDE_SKILL_DIR}/../design-loop/scripts/local-backend.mjs status`.

L4. **Explain the loop.** Open the studio, pick a component, **Create proposal**, edit it (or ask
   Claude to), then `/design-loop`.

8. **Prepare `/design sync`** (Claude Design only). The built-in `/design sync` skill turns a Storybook target's
   stories into the project's component cards. Hand it what this skill already knows so it
   skips the discovery:
   - Create `.design-sync/config.json` if it is missing (never overwrite it) for the first
     target, web first: `projectId` (the `designProjectId`), `shape: "storybook"`,
     `storybookConfigDir` (`<dir>/.storybook`), `storybookStatic: ".design-sync/sb-reference"`,
     and `buildCmd` (`cd <dir> && npx storybook build -c .storybook -o <repo>/.design-sync/sb-reference`).
     Seed only these fields. The file belongs to `/design sync`, which fills in the rest (entry,
     provider, title map, card overrides), and its format may change with Claude Code.
   - Tell `/design sync` to leave out Tailwind's `--tw-*` custom properties when it extracts
     tokens; otherwise Claude Design's design-system check reports them as unregistered and
     unclassified tokens.
   - Git-ignore its local artifacts: `.design-sync/sb-reference/`, `.design-sync/.cache/`,
     `.design-sync/learnings/`, `.design-sync/node_modules`, `.design-sync/pkg/types/`,
     `.design-sync/pkg/node_modules`, and `.design-screens/` (the saved sign-in for screen
     screenshots, see [`screens.md`](${CLAUDE_SKILL_DIR}/../../references/screens.md)). Keep `config.json`, `NOTES.md`, `conventions.md` and the
     `pkg/` sources tracked: the next sync resumes from them.
   - Map the cards once a target is synced (the project then has `_ds_sync.json`): its cards are
     `components/<group>/<Name>/<Name>.html` (`DesignSync list_files`). Set each row's
     `designPath` to its card, matching the component name (`/design sync` may rename one, e.g.
     `Typography` → `Text`, see its `titleMap`). A component it excluded keeps
     `designPath: null` and cannot be approved. Other targets sync later with another run.
   - Set up proposals ([`proposals.md`](${CLAUDE_SKILL_DIR}/../../references/proposals.md)) once
     the first sync has run. Find the project's design provider first: a `provider` key in
     `.design-sync/config.json`, else a provider in the package sources `/design sync` bundles
     (`.design-sync/pkg/`, or the folder of the config's `entry`, e.g. `ds-lib/`; look for
     `design-nav` or a `DesignProvider`/`ColorScheme` export).
     - **Found:** give it the side-by-side `mode="both"` and the shared navbar hook (on
       `components/`, `proposals/` and `screens/`), as in
       [`design-provider.tsx`](${CLAUDE_SKILL_DIR}/templates/design-provider.tsx).
     - **None** (apps without a `dist/`, whose package a build script generates, have none): say
       so in the report, never skip it silently. Offer to scaffold it: copy
       [`design-provider.tsx`](${CLAUDE_SKILL_DIR}/templates/design-provider.tsx) into the
       package sources (for a generated package, into what its build script emits, so a rebuild
       keeps it), export it from the entry, and register it as the sync's provider in
       `.design-sync/config.json` the way `/design sync` expects (its `provider` option; if
       unsure of the format, ask the user to run `/design sync` and say what it needs). A
       registered provider **replaces** the Storybook preview decorators (the converter only uses
       them when no provider is set), so read `.storybook/preview` first and make the provider
       supply what they did (i18n init, UI kit provider, router): wrap `DesignProvider` around
       them, or them inside it. Decline or failure: the fallback is `design-refresh`'s
       `nav-tag.mjs`, which adds the navbar tag to each card after every sync (step 3b there).
       The hook only fires on `*.claudeusercontent.com` hosts, an assumption nobody has
       verified: after the first re-sync, check a card in Claude Design, and keep `nav-tag.mjs`
       as the fallback until a re-synced card shows the navbar without the tag.
     Then add the proposal conventions to the `readmeHeader`: the output of
     `node ${CLAUDE_SKILL_DIR}/../design-refresh/scripts/plugin-files.mjs conventions`, markers
     included, fitted to the project (the provider's name), with the project's own notes outside
     the markers ([`conventions.md`](${CLAUDE_SKILL_DIR}/../../references/conventions.md)); the
     start marker's hash stays, so a later plugin can tell when the text changed. Ask the user to
     run `/design sync` again so both reach the project.

9. **Verify preconditions.** Walk contract §6 (the project's backend) and list anything still missing.

10. **Report & next steps.** For the **local** backend: palette file(s) and audit summary,
    Storybook/Chromatic/MCP status, the components captured (and those that failed), the studio
    URL and whether its MCP server is registered, then the loop of step L4; that is the whole
    report. For **Claude Design**: palette file(s), what each app imports and audit summary,
    Storybook/Chromatic/MCP status, Design project + palette card path, manifest path, and how
    many components have a card, and whether the design provider (with the navbar hook) is in
    place, scaffolded or missing. Next: `/design sync` the first target, then re-run
    `design-init` to map the cards and set up proposals. That re-run is also what gives the synced
    cards their navbar (step 8 wires it into the provider, and a second `/design sync` ships it).
    Then, in Claude Design, edit the palette
    card or ask for a component proposal (`proposals/<name>.html`), and run `design-loop`
    (it asks for your approval the first time). Whole pages and keeping Claude Design current:
    `design-refresh`.

Never overwrite an existing palette, card, or manifest without confirming; show diffs.
