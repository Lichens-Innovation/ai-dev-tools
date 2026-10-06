# Component proposals

`/design sync` mirrors the repo's components into the Claude Design project. Those synced files
(`components/`, `_ds_bundle.*`, `_preview/`, `styles.css`) are **read only** in Claude Design:
it refuses to edit them, and every sync overwrites them. A component change is therefore made on
a separate page, a **proposal**, and `design-loop` implements it in the repo. Screens work the
same way, from a mockup: see [`screens.md`](./screens.md).

| Project files                   | Written by                  | Role                                             |
| ------------------------------- | --------------------------- | ------------------------------------------------ |
| `components/<group>/<Name>/…`   | `/design sync`, from code   | Reference: how the component looks in code today |
| `proposals/<name>.html`         | Claude Design               | Target: the synced component plus the change     |
| `screens/<name>.html`           | `design-refresh`, from code | Reference: a screen rebuilt from the components  |
| `proposals/screens/<name>.html` | Claude Design               | Target: the screen mockup plus the change        |
| `Palette.dc.html`               | `design-init`, then edited  | Target for the palette (inputs prop)             |
| `Tailwind.html`                 | `design-init`, read only    | Reference: every palette Tailwind class          |

## A proposal page

- Lives at `proposals/<kebab-name>.html` (the manifest's `proposalPath`), e.g.
  `proposals/button.html`.
- Renders the **synced** component (`window.<globalName>.<Name>` from `_ds_bundle.js`), never a
  copy of it.
- Expresses the change as page-local CSS overrides and/or props on that page, scoped as narrowly
  as the change (one variant, one state). Say what changed in the page `<title>` or a short note.
- Shows both modes: the project's design provider in its side-by-side mode (see below), or two
  panels that each set `data-theme` and `color-scheme` themselves. A page that sets neither
  follows the viewer's OS mode, so a "light" panel can silently render dark tokens. In Claude
  Design, the shared navbar's light/dark switch then shows one panel at a time.

## Conventions for Claude Design (design-sync readme header)

`/design sync` publishes a README to the project from its `readmeHeader` file (e.g.
`.design-sync/conventions.md`). Add these points so Claude Design follows the model:

```markdown
- **Always wrap in the design provider** and let it pick the mode; don't set a page background
  in hex (use `var(--bg)`). Without it, a page follows the viewer's OS mode.
- **Proposals for a component change** go in `proposals/<component>.html`. Render the synced
  component inside the provider's side-by-side mode (`mode="both"`) and put the change in
  page-local CSS or props, scoped to what changes. Never edit `components/`, `_ds_bundle.*` or
  `styles.css`: they are synced from the repo and overwritten on every sync.
- **Screens** (`screens/<name>.html`) are mockups of the app's pages, rebuilt from the code:
  don't edit them. A screen change goes in `proposals/screens/<name>.html`, a copy of the mockup
  with the change, in the same mode. Its layout may be restructured with the semantic tokens and
  the synced components; its data is illustrative. A change to a component itself goes in that
  component's proposal.
```

## Side-by-side modes and the navbar in the design provider

The provider in `/design sync`'s wrapper package (its `provider` config) can render the content
in a light and a dark panel. It is also the one hook that runs in every synced card and proposal:
`/design sync` has no option to add markup to its cards, so the provider can load the project's
shared navbar (`design-nav.js`, uploaded by `design-init` next to the palette card) and follow
its light/dark switch. The hook only exists once `design-init` has run a second time (its
step 8 adds it to the project's provider, or scaffolds one when the sync has none): until then the
synced cards show no navbar. The ready-made provider, with the side-by-side modes and the navbar
hook, is [`design-provider.tsx`](../skills/design-init/templates/design-provider.tsx). `design-refresh` checks for it and, as a stopgap for cards that still
don't load it, adds `<script src="../../../design-nav.js"></script>` (`scripts/nav-tag.mjs`; the
script guards against double loading). A mode scoped to a container works with the palette's scheme file:
`light-dark()` follows the nearest `color-scheme`, and a Tailwind `dark:` variant written as
`&:where([data-theme="dark"], [data-theme="dark"] *)` matches any dark ancestor.

Keep `light` (the default) rendering exactly like Storybook: `/design sync` grades each synced
card against its story, and two panels or a navbar would not match. Grading renders run
locally, so the hostname check keeps the navbar out of them. Overlays portal to `<body>`, outside the
panels, so they follow the page mode.

## Rendering a proposal locally

The proposal loads the synced bundle by relative path (`../_ds_bundle.js`), which is too large
for `DesignSync get_file`. `/design sync` keeps the same files locally in its output folder
(`ds-bundle/` at the repo root). To render a proposal, copy that folder to a temp directory, put
the fetched proposal at its `proposalPath` inside it, and screenshot the local file. First check
that the local copy is the uploaded one: `bundleSha12` in `ds-bundle/_ds_sync.json` must equal
the one in the project's `_ds_sync.json`. If not, run `/design sync` first.
