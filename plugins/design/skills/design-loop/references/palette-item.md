# The palette item

Loaded by `SKILL.md` step 1b when the manifest's `palette` entry is approved and stale.

**Local backend:** the studio's palette save already wrote the inputs (`palette.localPath`) and
regenerated every output, like step 2 below, and the palette has no card or thumbnail. Skip steps 1,
2 and 4: there is no card to diff or upload (Fetch target gives nothing; the item's hash is the
inputs file's). Review what the save changed with `git diff` on `palette.localPath` and
`palette.outputs`, run the audit (`node <palette.ts> <localPath>` prints it), then do step 3 and
step 5 (the hash recorded is the inputs file's, from List targets).

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
   `--json <outputs.json>` and `--sass <outputs.sass>` for each one set. The inputs file receives
   the card's inputs and its hand-authored token values (rewritten in place; a token name the file
   lacks is ignored, and an invalid value stops the run) and its token overrides (added, rewritten
   or removed in the overrides block; an invalid one stops the run). `font-inverted` and `border` stay
   derived when the file leaves them out and the card did not change them. The same run
   regenerates the project thumbnail (its title comes from the card):

   ```bash
   node <palette.ts> <localPath> --from-card /tmp/design-loop/palette.target.html [--theme <outputs.web> | --web] [--scheme <outputs.scheme>] [--mobile <outputs.mobile> --namespace <palette.namespace>] [--json <outputs.json>] [--sass <outputs.sass>] \
     --thumbnail /tmp/design-loop/thumbnail.html
   ```

   Only inputs, hand-authored tokens and token overrides change by hand; never edit generated tokens. Report the audit it prints; propose
   fixes for any `FAIL` but do not block.

3. Converge and validate across **all** targets: `stories-changed` on each target, screenshot a
   representative set of stories, `test-run`, then publish each target (steps 7–9).
4. Upload `/tmp/design-loop/thumbnail.html` to `palette.thumbnailPath` (`DesignSync finalize_plan`
   with `writes: [<thumbnailPath>]`, `deletes: []`, `localDir: /tmp/design-loop`, then
   `write_files`). It is generated: never hand-edit it.

5. Record `palette.lastImplementedHash` (step 10).

(Claude Design) The card (`palette.designPath`, `Palette.dc.html` at the project root) is read only: never
upload it back, and never write or rewrite the project's `support.js`. The thumbnail is the only
palette file `design-loop` uploads.
