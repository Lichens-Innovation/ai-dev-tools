# Palette preview card

[`templates/palette-preview.dc.html`](../templates/palette-preview.dc.html) is a Claude Design
card: the palette grid (editable per mode), contrast audit, semantic mapping, a demo page of
common components, a web/Tailwind export, and a **Your components** section that embeds real
Storybook stories and themes them live.

## Where the colors live

The card reads the project palette from its `inputs` prop (`{ "primary": { "lm": "#…", "dm": "#…" }, … }`),
written by `palette.mjs --to-card`. Editing swatches in the card is a sandbox; to keep a change,
ask Claude Design to update `inputs` (or paste the card's **Export → Inputs JSON**). The card's
`inputs` are what `design-loop` applies when the palette is approved.

## Push the card

`design-init` does this automatically (seed + reconcile). Manually:

1. Write the inputs: `node palette.mjs <canonical> --to-card <card>`.
2. Set the `default` of the other props (the HTML-escaped `data-props` JSON on its
   `<script data-dc-script>` tag):
   - `storybookUrl`: a Storybook reachable from the browser, e.g. the Chromatic permalink
     `https://<branch>--<appid>.chromatic.com` or `http://localhost:6006`
   - `stories`: comma-separated story ids from `design.manifest.json` (`components[].storyId`)
3. Upload it to the bound project at `palette/index.html` (`DesignSync finalize_plan`, then
   `write_files`) and record it in the manifest's `palette` entry (contract §2). Approving the palette card triggers `design-loop` to copy the
   approved inputs back into the canonical file and re-run `palette.mjs`.

## Live theming in Storybook (web targets)

The card posts `{ type: 'palette:apply', css, mode }` to every embedded story on load and on
each edit. Add [`templates/storybook-theme-bridge.ts`](../templates/storybook-theme-bridge.ts)
to the target's `.storybook/` folder and import it from `preview.ts` so stories apply it:

```ts
import "./storybook-theme-bridge";
```

It only injects a `<style>` element and sets `color-scheme`; it never executes received code.
To restrict senders, set `ALLOWED_ORIGINS` in the file.

## Limits

- React Native on-device Storybook cannot be embedded. Mobile targets built with
  `@storybook/react-native-web-vite` (web build) work like web targets.
- Browsers may block embedding `http://localhost` from an https page (private network access).
  Prefer the Chromatic permalink for shared cards.
- Stories must use the semantic tokens for edits to show; hard-coded colors will not change.
