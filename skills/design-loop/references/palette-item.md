# The palette item

Loaded by `SKILL.md` step 1b when the manifest's `palette` entry is approved and stale.

`<palette.ts>` is the repo's copy (`palette.script`) when set, checked against the plugin's
[`palette.ts`](${CLAUDE_SKILL_DIR}/../design-palette/scripts/palette.ts) first, else the
plugin's (contract §5).

1. Step 1 saved the card as `/tmp/design-loop/palette.target.html`. Show what changed:

   ```bash
   node <palette.ts> <localPath> --diff-card /tmp/design-loop/palette.target.html
   ```

2. Apply the card's inputs to the canonical file (`palette.localPath`) and regenerate every
   output in `palette.outputs`: `--theme <outputs.web>` (or `--web` when `outputs.web` equals
   `localPath`), then `--scheme <outputs.scheme>`, `--mobile <outputs.mobile>` and
   `--json <outputs.json>` for each one set. The inputs file receives the card's inputs. The same
   run regenerates the project thumbnail (its title comes from the card):

   ```bash
   node <palette.ts> <localPath> --from-card /tmp/design-loop/palette.target.html [--theme <outputs.web> | --web] [--scheme <outputs.scheme>] [--mobile <outputs.mobile> --namespace <palette.namespace>] [--json <outputs.json>] \
     --thumbnail /tmp/design-loop/thumbnail.html
   ```

   Only inputs change by hand; never edit generated tokens. Report the audit it prints; propose
   fixes for any `FAIL` but do not block.

3. Converge and validate across **all** targets: `stories-changed` on each target, screenshot a
   representative set of stories, `test-run`, then publish each target (steps 7–9).
4. Upload `/tmp/design-loop/thumbnail.html` to `palette.thumbnailPath` (`DesignSync finalize_plan`
   with `writes: [<thumbnailPath>]`, `deletes: []`, `localDir: /tmp/design-loop`, then
   `write_files`). It is generated: never hand-edit it.

5. Record `palette.lastImplementedHash` (step 10).

The card (`palette.designPath`, `Palette.dc.html` at the project root) is read only: never
upload it back, and never write or rewrite the project's `support.js`. The thumbnail is the only
palette file `design-loop` uploads.
