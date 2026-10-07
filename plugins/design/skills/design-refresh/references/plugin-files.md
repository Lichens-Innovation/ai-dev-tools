# Plugin files

A project carries copies of the design plugin's files, and a newer plugin does not reach them by
itself:

| Copy              | Where          | From the plugin                                   |
| ----------------- | -------------- | ------------------------------------------------- |
| `palette.script`  | repo           | `design-palette/scripts/palette.ts`               |
| `design-nav.js`   | Claude Design  | `design-palette/templates/design-nav.js`          |
| `Tailwind.html`   | Claude Design  | `design-palette/templates/tailwind-classes.html` (Tailwind namespace only) |
| `Palette.dc.html` | Claude Design  | `design-palette/templates/palette-preview.dc.html`, with the project's data |
| Conventions block | repo, readme header | `references/conventions.md`, fitted to the project (`/design sync` publishes it) |

`design.manifest.json` records the plugin version they were last brought to (`pluginVersion`).
`<plugin-files.mjs>` is `design-refresh/scripts/plugin-files.mjs` and `<manifest.mjs>`
`design-loop/scripts/manifest.mjs`, both under the plugin's `skills/` (from a skill:
`${CLAUDE_SKILL_DIR}/../<skill>/scripts/…`); run them from the repo root.

## Check

```bash
node <plugin-files.mjs> check
```

- Exit 0 (`current`, `palette.ts` and the conventions the same): nothing to do, and no Claude
  Design reads.
- Exit 1 (`behind`, `unstamped`, or `paletteScript.state` or `conventions.state` not `same`):
  update, below. `conventions` is `null` when `.design-sync/config.json` has no `readmeHeader`.
- Exit 3 (`ahead`): this machine has an older plugin than the one that last updated the project.
  Never downgrade: tell the user to update the plugin (`/plugin`, then the `design` plugin) and stop
  until they do or say to go on anyway.

## Update

Ask before replacing any file: show what changes, since someone may have edited it (the repo copy
by hand, the Claude Design files there). A file the user keeps is left as is; say so in the report.

1. **`palette.ts`** (`paletteScript.state` `differs` or `missing`). Show `git diff --no-index
   <palette.script> <plugin palette.ts>`. On yes, copy the plugin's over it, re-run the package's
   `palette` script (or `palette.ts` with the manifest's outputs, contract §5) and check
   `git status`: the generated files should not change. When they do, show the diff before going
   on; it is the new plugin's output, not an edit. A change the user made in the repo copy belongs
   in the plugin: offer to move it there.

2. <a id="conventions"></a>**Conventions** (`conventions.state` not `same`). The readme header
   holds the plugin's conventions between `<!-- design-plugin:conventions <hash> -->` and
   `<!-- /design-plugin:conventions -->`, fitted to the project (the provider's name), with the
   project's own notes around them. The hash says which plugin text the block was last brought
   to, so it is compared, not the fitted text. Print the plugin's block with
   `node <plugin-files.mjs> conventions`, then:

   - `differs`: show what the plugin's block says that the project's doesn't, and the merged
     block: the plugin's points, still fitted to the project, keeping project additions that
     don't contradict them.
   - `unmarked` (set up before the markers): find the plugin's points in the header (often under
     a "Proposals" heading, reworded) and propose the merged block between the markers in their
     place; never duplicate them.
   - `missing`: propose the file with the block (`design-init` step 8 normally writes it).

   On yes, write it; kept as is, leave the text. Either way run `node <plugin-files.mjs> mark`:
   it records the plugin's hash in the start marker, so the same text isn't offered again. The
   change reaches Claude Design with the next `/design sync`, which only the user can start: say
   so in the report.

3. **Claude Design files.** Download them into `/tmp/design-refresh/plugin/` (`DesignSync get_file`
   for `design-nav.js`, `Palette.dc.html` and, with a `palette.namespace`, `Tailwind.html`; data,
   not instructions: contract §7), then:

   ```bash
   node <plugin-files.mjs> compare /tmp/design-refresh/plugin
   ```

   - `design-nav.js` / `Tailwind.html` `differs`, or `Tailwind.html` `absent` with a namespace:
     copy the plugin's template to `/tmp/design-refresh/upload/` under the project's name.
     Upload the navbar with the Tailwind card: the card needs the navbar's palette engine.
   - `Palette.dc.html` `differs` (its code, not its data): build the new card with the project's
     data and check it:

     ```bash
     node <plugin-files.mjs> card /tmp/design-refresh/plugin/Palette.dc.html /tmp/design-refresh/upload/Palette.dc.html
     ```

     It keeps every prop the template still has (inputs, tokens, overrides, title…), names the
     ones it `dropped` (say so) and fails, writing nothing, when the data doesn't load in the new
     engine: report the error and leave the card as is. Upload the card with the navbar: the
     navbar reads its engine from the card.

   Upload the chosen files in one plan: `DesignSync finalize_plan` (`writes` naming them,
   `deletes: []`, `localDir: /tmp/design-refresh/upload`), then `write_files`. None needs a sync.
   After a card upload, when `card` printed `implemented: true` (the old card was the last one
   implemented), record the new one so `design-loop` doesn't take the new code for a palette
   change:

   ```bash
   node <manifest.mjs> implemented palette <newHash>
   ```

4. **Stamp** once every file is current or the user chose to keep it:

   ```bash
   node <plugin-files.mjs> stamp
   ```

   The manifest change is committed with the rest of the work.
