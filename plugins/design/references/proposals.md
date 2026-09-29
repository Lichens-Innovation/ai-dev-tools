# Component proposals

`/design sync` mirrors the repo's components into the Claude Design project. Those synced files
(`components/`, `_ds_bundle.*`, `_preview/`, `styles.css`) are **read only** in Claude Design:
it refuses to edit them, and every sync overwrites them. A component change is therefore made on
a separate page, a **proposal**, and `design-loop` implements it in the repo.

| Project files                 | Written by                 | Role                                             |
| ----------------------------- | -------------------------- | ------------------------------------------------ |
| `components/<group>/<Name>/…` | `/design sync`, from code  | Reference: how the component looks in code today |
| `proposals/<name>.html`       | Claude Design              | Target: the synced component plus the change     |
| `Palette.dc.html`             | `design-init`, then edited | Target for the palette (inputs prop)             |

## A proposal page

- Lives at `proposals/<kebab-name>.html` (the manifest's `proposalPath`), e.g.
  `proposals/button.html`.
- Renders the **synced** component (`window.<globalName>.<Name>` from `_ds_bundle.js`), never a
  copy of it.
- Expresses the change as page-local CSS overrides and/or props on that page, scoped as narrowly
  as the change (one variant, one state). Say what changed in the page `<title>` or a short note.
- Shows both modes: the project's design provider in its side-by-side mode (see below), or two
  panels that each set `data-theme` and `color-scheme` themselves. A page that sets neither
  follows the viewer's OS mode, so a "light" panel can silently render dark tokens.

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
```

## Side-by-side modes in the design provider

The provider in `/design sync`'s wrapper package (its `provider` config) can render the content
in a light and a dark panel. A mode scoped to a container works with the palette's scheme file:
`light-dark()` follows the nearest `color-scheme`, and a Tailwind `dark:` variant written as
`&:where([data-theme="dark"], [data-theme="dark"] *)` matches any dark ancestor.

```tsx
const ModePanel = ({ mode, children }) => (
  <div data-theme={mode} style={{ colorScheme: mode, background: "var(--bg)", color: "var(--text)", padding: 16 }}>
    {children}
  </div>
);

// light / dark: set the mode on <html>, as the synced cards and Storybook do.
// both: keep the page light and render the children in a light and a dark panel.
export const DesignProvider = ({ mode = "light", children }) => (
  <ColorScheme mode={mode === "both" ? "light" : mode}>
    {mode === "both" ? (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        <ModePanel mode="light">{children}</ModePanel>
        <ModePanel mode="dark">{children}</ModePanel>
      </div>
    ) : (
      children
    )}
  </ColorScheme>
);
```

Keep `light` (the default) rendering exactly like Storybook: `/design sync` grades each synced
card against its story, and two panels would not match. Overlays portal to `<body>`, outside the
panels, so they follow the page mode.

## Rendering a proposal locally

The proposal loads the synced bundle by relative path (`../_ds_bundle.js`), which is too large
for `DesignSync get_file`. `/design sync` keeps the same files locally in its output folder
(`ds-bundle/` at the repo root). To render a proposal, copy that folder to a temp directory, put
the fetched proposal at its `proposalPath` inside it, and screenshot the local file. First check
that the local copy is the uploaded one: `bundleSha12` in `ds-bundle/_ds_sync.json` must equal
the one in the project's `_ds_sync.json`. If not, run `/design sync` first.
