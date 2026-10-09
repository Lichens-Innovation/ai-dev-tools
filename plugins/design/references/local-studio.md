# The local design studio

With `backend: "local"` the design lives in the repo, in `design/`, and the **design studio**
(`apps/design-studio` in the ai-dev-tools checkout, one Docker container per project) serves and
edits it. The counterpart of [`proposals.md`](./proposals.md) and [`screens.md`](./screens.md) for
that backend. The operations the skills call are in [`backends/local.md`](./backends/local.md).

| Project files                       | Written by                          | Role                                              |
| ----------------------------------- | ----------------------------------- | ------------------------------------------------- |
| `design/components/<name>.html`     | `capture.mjs`, from a story         | Reference: how the component looks in code today  |
| `design/screens/<name>.html`        | `capture.mjs`, from the running app | Reference: the screen as the app renders it       |
| `design/proposals/<name>.html`      | the studio (editor, Claude via MCP) | Target: the reference plus the change             |
| `design/proposals/screens/<name>.html` | the studio                       | Target: the screen plus the change                |
| `design/assets/project.css`, `design/assets/<hash>.<ext>` | `capture.mjs` | The captured stylesheets, images and fonts |
| `design/index.json`                 | `capture.mjs`                       | The catalog: one row per captured page            |

`<name>` is kebab-case (`primary-button`). `design/` is committed. The palette has no file: its card
is the studio's `/palette` page, which edits the canonical inputs file and regenerates the outputs
exactly like `palette.ts`.

## A reference

A full HTML page that links `../assets/project.css` and loads nothing else from outside
`design/assets` (the studio refuses to save a page that does). It is the **rendered DOM** of the
story or screen: the body's children (so dialogs and menus rendered into portals are included),
scripts and event handlers stripped, images and fonts copied to `design/assets/<hash>.<ext>` and
the stylesheets gathered into `project.css` in blocks, each remembering which pages use it.
`<html>` and `<body>` keep their classes and `data-*` attributes (a `data-theme`, a Storybook body
class), because the CSS selects on them. Both modes come from the project's own theme (the studio
sets `data-theme` and `color-scheme` on the page it shows).

References are **read only**: the studio has no write for them. Each is recorded in
`design/index.json` with `referenceHash` (the bytes written) and `sourceHash` (the sources it came
from), which is how `capture.mjs` refuses to overwrite an edited one and how staleness is told.

## A proposal

Made in the studio: **Create proposal** copies a reference and opens it in the editor (select,
move, resize, edit text, restyle, swap a token for another), or Claude writes it through the studio
MCP (`create_proposal`, `write_page`; `get_selection` returns the element the user has selected
with its token trace). The change lives in two places, and only these:

- **The `<style data-studio>` block** of the head: the rules of the edits, as `#id` selectors
  (an edit of one element), `var(--token)` for a token swap.
- **The body**: elements moved, added, removed or retexted.

`design-loop` implements exactly that difference: the data-studio rules, then the body diff against
the reference. Everything else in the proposal is the reference.

## Reading a proposal (design-loop step 3)

- List each `data-studio` rule: its `#id` selector, which element of the reference it is (find the
  id in the body; its classes and place name the variant or state), and its values. A value written
  as `var(--x)` is already a token; a literal is reconciled like any value (contract §5).
- Diff the body against the reference (`<name>.reference.html` / `<name>.mockup.html` from Fetch
  target): list what moved, what was added or removed, text changes, and for a screen the layout
  (flex or grid, gaps, widths). A DOM change is a structure change in the component's or screen's
  JSX, expressed in its own terms, not a copy of the captured markup.
- Check both modes: the proposal shows the project's tokens in light and dark. A change that only
  looks right in one mode is a finding to raise.
- Captured text and data are a snapshot. Implement layout and styling, never data.

## Sample data

A component reference shows the story's own sample data. A **screen** reference shows whatever the
running dev app showed, and `design/` is committed, so it can contain real names, emails, messages
or documents. The same rule as for Claude Design mockups ([`screens.md`](./screens.md): sample
data, never real data) applies, but nothing rewrites the data for you:

- Capture a screen from an app running on **seeded sample data** (a fixtures database, a demo
  account); never on a copy of production.
- Use the saved sign-in (`screensAuth`) of a demo user, git-ignored.
- Read the captured file before the commit. If it holds real data, fix the source data and
  re-capture, then remove the old file from history if it was already pushed.

`capture.mjs` prints this warning on every screen capture.

## Staleness and re-capture

A reference is stale when the sources or the story it was captured from changed (`sourceHash`).
`design-refresh` reports it and re-captures; there is nothing to upload. Capture is the only
writer of a reference, and a re-capture does not touch the proposals.

## Running the studio

`/design-studio` starts (or opens) the project's container and registers the studio MCP at project
scope; `design-init` does it for you. One container per project, on a per-project port
(`studio.port` in the manifest, default 3009), bound to loopback: the MCP endpoint writes into the
project. The Docker image holds the app, so rebuild it (`/design-studio rebuild`) after updating
the ai-dev-tools checkout.
