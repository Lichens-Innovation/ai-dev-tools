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

Moving works like Figma (drag the selected element, copy, paste, duplicate, Alt+arrows, line-up buttons, a Layers
tab), but a drag never writes coordinates: a drop is an order in the body, a move into another box, `margin-left:
auto` (or `margin-top: auto` in a column, both sides to centre) on the element, or the container's alignment
(`display: flex` with `justify-content` or `align-items`) as a `data-studio` rule. Implement them as layout.

**`data-component="<name>"`.** The Add tab lists the captured component references and inserts their real markup
(the project's classes) with this attribute on the root, `<name>` being the component's name in the manifest
(`design/index.json`). An element carrying it is an **instance of that manifest component**: `design-loop` implements
it by using the component (its props or variant for what the element shows), never new markup copied from the
proposal. Copies of the element keep the attribute. Several roots are wrapped in a `display: contents` box that
carries it. Rules on that element (`#id`) are overrides of the instance, read like any other `data-studio` rule.

`design-loop` implements exactly that difference: the data-studio rules, then the body diff against
the reference. Everything else in the proposal is the reference.

## Reading a proposal (design-loop step 3)

- List each `data-studio` rule: its `#id` selector, which element of the reference it is (find the
  id in the body; its classes and place name the variant or state), and its values. A value written
  as `var(--x)` is already a token; a literal is reconciled like any value (contract §5).
- An element with `data-component` in the body is a use of that component, whether the reference had it or the
  user added it: find the component in the code and render it there (where it sits, with the props that match its
  text and classes), instead of reproducing its markup.
- Diff the body against the reference (`<name>.reference.html` / `<name>.mockup.html` from Fetch
  target): list what moved, what was added or removed, text changes, and for a screen the layout
  (flex or grid, gaps, widths). A DOM change is a structure change in the component's or screen's
  JSX, expressed in its own terms, not a copy of the captured markup.
- Check both modes: the proposal shows the project's tokens in light and dark. A change that only
  looks right in one mode is a finding to raise.
- Captured text and data are a snapshot. Implement layout and styling, never data.

## Sample data

A component reference shows the story's own sample data. A **screen** reference shows whatever the
running dev app showed, and `design/` is committed, so it could hold real names, emails, messages
or documents. The same rule as for Claude Design mockups ([`screens.md`](./screens.md): sample
data, never real data) applies, and `capture.mjs screen` enforces it in three layers (components
captured from Storybook are not touched). It needs `@faker-js/faker`, resolved from the working
directory like Playwright (`npm i -D @faker-js/faker`; `design-init` installs it); without it the
capture stops.

1. **JSON is rewritten before it renders.** The app's JSON responses (`fetch`/XHR) are intercepted
   and every string under a personal key becomes a fake: `name`, `firstName`, `lastName`,
   `fullName`, `displayName`, `username`, `email`, `phone`, `mobile`, `address`, `street`, `city`,
   `zip`/`postalCode`, `company`, avatar and photo URLs, and the same words at the end of a
   compound key (`customerName`, `billing_address`), matched case-insensitively. Fakes are
   deterministic (seeded from a hash of the real value): the same value gives the same fake
   everywhere in the snapshot, and an unchanged screen re-captures byte for byte. A fake keeps the
   value's type and roughly its length.
2. **Server-rendered data is redacted by selector.** Data written into the HTML by the server (an
   SSR first load) never goes through JSON. List its elements in `anonymize.redact`: their text
   (and `value`, `placeholder`, `alt`, `title`, `aria-label`) is replaced by a fake of the same
   kind and length (an email by an email, a phone by a phone, and so on). A value already seen in
   the JSON gets the same fake. Text outside the selectors is untouched.
3. **A final check scans the snapshot** (text and attributes) for emails, phone numbers and
   token-like strings (JWTs, `Bearer …`, long hex or base64). A match the anonymiser did not
   produce and `anonymize.allow` does not list fails the capture with **exit code 4**: nothing is
   written, and each match is listed with the element it was found in. Fix it with a selector in
   `redact`, a key in `keys`, or a literal in `allow`.

The screen's manifest row takes an optional `anonymize` object:

```json
"anonymize": {
  "keys": ["owner", "contactLine"],
  "redact": [".account-owner", "[data-testid=billing-email]"],
  "allow": ["support@example.com"]
}
```

`keys`: extra JSON keys to fake. `redact`: CSS selectors for server-rendered data. `allow`:
literal values that are fine to commit (a support address in the footer).

What it cannot know: personal data that does not pass through JSON or a selector you listed, such
as GraphQL-over-non-JSON, server-sent pages with names in free text outside the selectors, names
inside images (a photo of a person, a chart label drawn in a canvas), or a name under a key that
does not look personal and is not in `keys`. The final check only catches emails, phones and
tokens, not names. So still:

- Capture a screen from an app running on **seeded sample data** where you can; avoid a copy of
  production.
- Use the saved sign-in (`screensAuth`) of a demo user, git-ignored.
- Read the captured file before the commit. If it holds real data, add the key or selector and
  re-capture, then remove the old file from history if it was already pushed.

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
