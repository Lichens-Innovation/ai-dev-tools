# Backend: local design studio

The operations of [contract §8](../design-contract.md#8-backend-operations-the-seam) for
`backend: "local"`. The design lives in the project's `design/` folder, served and edited by the
local design studio ([`local-studio.md`](../local-studio.md)). Nothing here needs `DesignSync`, the
Claude Design MCP or `/design sync`. The operations are `local-backend.mjs`, plus `capture.mjs`
for references.

`<local-backend.mjs>` is `${CLAUDE_SKILL_DIR}/../design-loop/scripts/local-backend.mjs`, and
`<capture.mjs>` the `capture.mjs` next to it. Run them from the repo root (the manifest's folder)
except `capture.mjs`, which loads Playwright from the working directory (the Storybook target's
`dir`, or the app's) and takes `--manifest <repo root>/design.manifest.json`.
The studio's URL is `http://localhost:<manifest studio.port, default 3009>`;
`--studio-url` overrides it.

## List targets

`node <local-backend.mjs> list`: one item per component, screen and the palette, each with `status`,
`path` (the proposal file), `exists`, `hash` (of that file) and `lastImplementedHash`; the palette's
`path` is its inputs file. The candidates are every `approved` item plus every `wip` item with
`exists: true`. Stale means `hash` differs from `lastImplementedHash` (also when it is `null`).
There is nothing to ask a server: the proposals are files, written by the studio.

## Fetch target

`node <local-backend.mjs> fetch <name>`: copies the proposal to `/tmp/design-loop/<name>.target.html`
and prints its `hash` (the same as `list`'s). A component's reference comes along as
`<name>.reference.html`, a screen's as `<name>.mockup.html` (with `mockupMatches`: false means the
reference was edited since capture, say so before diffing). It fails (exit 2) when there is no
proposal. The palette has nothing to fetch: the studio's save already wrote the inputs and
outputs, so its `list` hash is the target hash.

## Stage render

`node <local-backend.mjs> render-url <name>` prints the studio URL of the proposal, e.g.
`http://localhost:3009/render/proposals/button.html`. That URL is what step 7 screenshots with
`screenshot.mjs`: no staging, no bundle. The studio must answer
(`node <local-backend.mjs> status`; exit 1 means start it with `/design-studio`). A local page has
one panel: screenshot it once per mode with `screenshot.mjs --theme light` and `--theme dark`
(it sets `data-theme` and `color-scheme` on `<html>`, as the studio does), and compare each with
the story or app in the same mode. `/render` serves the page with scripts disabled, so it shows
exactly the file.

## Check references

`node <local-backend.mjs> check` (exit 1 when anything is not current) classifies every component
and screen:

| State          | Meaning                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------- |
| `current`      | the sources and story are as at capture                                                       |
| `stale`        | the component's sources or story changed since capture (hash of `localPath` and the stories next to it, or the row's `sources`); a screen's `sources` |
| `edited`       | the reference file is not the one captured: someone edited it. Capture refuses to overwrite it |
| `not-captured` | no reference file or index row yet                                                            |
| `no-sources`   | nothing to hash: the row has no existing `localPath` or `sources`                             |

## Refresh references

Re-capture, no `/design-sync`. For each `stale` or `not-captured` row, with its Storybook (or the
app) running:

```bash
cd <dir> && node <capture.mjs> component <name> --storybook-url <url> --story-id <storyId> --manifest <repo>/design.manifest.json
cd <dir> && node <capture.mjs> screen <name> --url <url> --viewport <viewport> [--storage-state <screensAuth>] --manifest <repo>/design.manifest.json
```

A new screen needs its `screens[]` row first (local paths, contract §2): `capture.mjs` refuses a
name the manifest does not have. Capture rewrites the reference, its assets and its `design/index.json` row (and a screen's
`mockupHash`, `sourceHash`). It exits 3 on an `edited` reference: tell the user, and re-run with
`--force` only if they say the edit can go (a change belongs in the proposal). A screen capture
warns that the snapshot holds whatever data the dev app shows: see
[sample data](../local-studio.md#sample-data). The proposals are never touched: a proposal
whose reference was re-captured keeps its own copy of the old body, so tell the user to
re-create it from the new reference if the code change matters to it.
