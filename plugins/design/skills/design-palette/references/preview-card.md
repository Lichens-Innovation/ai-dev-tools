# Palette preview card

[`templates/palette-preview.dc.html`](../templates/palette-preview.dc.html) is a Claude Design
card: the palette grid (editable per mode), contrast audit, semantic mapping, a demo page of
common components, a theme/Tailwind export, and a **Your components** section that embeds real
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
   - `storybookUrl`: the Chromatic branch permalink `https://<branch>--<appId>.chromatic.com`
     when the target publishes to a public Chromatic project, otherwise `http://localhost:6006`
     (a private permalink answers `401` and cannot be embedded)
   - `stories`: comma-separated story ids from `design.manifest.json` (`components[].storyId`)
3. Upload it to the bound project's root as `Palette.dc.html` (`DesignSync finalize_plan`, then
   `write_files`). The Pages list only shows root files, and the Design System view labels each
   card by its file name.
4. If the root has no `support.js` (`DesignSync list_files`), write it with the Claude Design
   tool's `create_support_js`. The card does not render without it; never overwrite an
   existing one.
5. Record the card in the manifest's `palette` entry (contract §2). Approving the palette card
   triggers `design-loop` to copy the approved inputs back into the canonical file and re-run
   `palette.mjs`.

The first line, `<!-- @dsCard group="Colors" -->`, files the card under **Colors** in the Design
System view. Keep it when editing the card.

## Live theming in Storybook (web targets)

The card posts `{ type: 'palette:apply', css, mode }` to every embedded story on load and on
each edit. Add [`templates/storybook-theme-bridge.ts`](../templates/storybook-theme-bridge.ts)
to the target's `.storybook/` folder and import it from `preview.ts` so stories apply it:

```ts
import "./storybook-theme-bridge";
```

The CSS is the theme plus its scheme block, so `mode` applies through `color-scheme`. Stories
that use the Tailwind utilities follow too: `@theme inline` points them at the theme tokens. It
only injects a `<style>` element and sets `color-scheme`; it never executes received code.
On localhost or a development build it accepts any sender. Published builds (e.g. Chromatic) only
accept `ALLOWED_ORIGINS`, which `design-init` sets to the bound project's origin:

```ts
const ALLOWED_ORIGINS: string[] = ["https://<designProjectId>.claudeusercontent.com"];
```

List exact origins only, never a wildcard for all of `claudeusercontent.com`.

**Verify once per project:** open the card in the Claude Design editor with `storybookUrl` set to
the published Storybook and watch the story's console. If the bridge logs
`ignored palette from <origin>` with a different origin, add that origin to the list and
republish.

## Limits

- React Native on-device Storybook cannot be embedded. Mobile targets built with
  `@storybook/react-native-web-vite` (web build) work like web targets.
- `http://localhost` only works on the machine running Storybook, and Chrome may ask for
  local network access before loading it. Use a public Chromatic permalink for shared cards.
- The permalink shows the last published build, not unpublished story edits.
- A private Chromatic project cannot be embedded: the permalink redirects to Chromatic's login
  page, which sends `X-Frame-Options: SAMEORIGIN` (Firefox: "will not allow Firefox to display
  the page"). Logging in elsewhere does not help, since the frame's cookies are third-party. Use
  localhost, make the project public, or host the Storybook publicly.
- Deleting or moving a card file can leave a stale "file not found" entry in the Design System
  view (Claude Design keeps it in its generated `_ds_manifest.json`). Upload the card at its
  final path the first time.
- Stories must use the semantic tokens for edits to show; hard-coded colors will not change.
