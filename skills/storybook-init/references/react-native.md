# React Native / Expo targets: tweaks and edge cases

Loaded by `SKILL.md` step 0 for a target whose `package.json` depends on `react-native` or
`expo`. Steps 1–7 of `SKILL.md` still apply. This file lists what changes for a mobile target and
the traps found while setting one up. Items marked **(verified)** were reproduced on Expo 55 /
RN 0.83 / NativeWind 5 preview / Storybook 10.6. Everything else is a checklist item.

## 1. Use a browser Storybook, not on-device Storybook

The design loop needs pixels in a browser. Playwright screenshots `iframe.html`, Chromatic builds
static HTML, and `addon-mcp` runs in the dev server. On-device Storybook (`@storybook/react-native`)
offers none of these. Install the **react-native-web** framework instead:

```bash
pnpm create storybook@latest --type react_native_web --features docs test a11y ai --yes --no-dev
```

This installs `@storybook/react-native-web-vite`, which renders through `react-native-web` (the
app needs it as a dependency; Expo apps usually already have it). `react_native_and_rnw` installs
both the on-device and the browser Storybook. Choose it only if the team also wants stories on a
device. The loop never uses the on-device one.

Accept what this means: the browser view is a very close approximation, not the native render.
Native-only behavior (gestures, platform fonts, safe areas, native modules) is out of scope for
visual convergence.

## 2. Styling libraries that rely on Metro need a Babel equivalent under Vite (verified: NativeWind 5)

NativeWind 5 / `react-native-css` has **Metro's resolver** redirect every `react-native` import to
`react-native-css/components`, and that redirect is what turns `className` into styles. Vite
doesn't go through Metro. Without the redirect, RNW **silently drops `className`**: no error, and
every component renders unstyled or transparent. The package's Babel preset does the same rewrite
at transform time:

```ts
// .storybook/main.ts
import { createRequire } from "module";

framework: {
  name: getAbsolutePath("@storybook/react-native-web-vite"),
  options: {
    pluginReactOptions: {
      babel: {
        presets: [createRequire(import.meta.url).resolve("react-native-css/babel")],
      },
    },
  },
},
```

- **Resolve it to the CJS build with `createRequire`.** A bare `"react-native-css/babel"` resolves
  to the ESM build. That build calls `require` internally, and Babel's ESM loader throws
  `[BABEL] require is not defined`. **(verified)**
- The preset already includes `react-native-worklets/plugin`, so don't add the reanimated/worklets
  plugin a second time.
- Put Babel config in `pluginReactOptions.babel`. `pluginBabelOptions` is deprecated and ignored.
- NativeWind v4 (`nativewind/babel` + `jsxImportSource: "nativewind"`) and other Metro-dependent
  styling libraries have the same class of problem. Find the library's non-Metro/web setup, and
  confirm with a screenshot that a styled component actually shows its colors.

**How to spot it:** in the story, inspect the rendered element. If it only has RNW's generated
`css-…`/`r-…` classes and none of your utilities, the rewrite isn't happening.

## 3. Load the global CSS entry (verified: Tailwind v4)

Import the app's CSS entry (e.g. `global.css`, which holds the `@import "tailwindcss"` and tokens)
at the top of `.storybook/preview.tsx`. If the app has a `postcss.config.js` with
`@tailwindcss/postcss`, Vite picks it up automatically, so no Vite plugin is needed.
Pinned `lightningcss` versions (NativeWind requires one) keep working.

## 4. Path aliases (verified)

Metro/Babel aliases (`~/*`, `@/*` via `babel-plugin-module-resolver` or tsconfig `paths`) don't
carry over to Vite. Add them in `viteFinal`:

```ts
viteFinal: (config) => {
  config.resolve ??= {};
  config.resolve.alias = { ...config.resolve.alias, "~": resolve(dirname(fileURLToPath(import.meta.url)), "../src") };
  return config;
},
```

## 5. Dark mode can't be driven by `Appearance` (verified)

On native, theme providers usually call `Appearance.setColorScheme(mode)`, and the palette
switches through `@media (prefers-color-scheme: dark)`. In a browser, `Appearance.setColorScheme`
**cannot change that media query**, so a toolbar theme toggle does nothing and the stories always
follow the OS setting.

The fix is to make the web palette respond to an explicit scheme instead of the media query:
- Override the flipping tokens with `light-dark()`:
  `:root { --primary: light-dark(var(--primary-light), var(--primary-dark)); }`.
  Load this in the Storybook preview only, not in the native CSS entry.
- In the theme decorator, set `document.documentElement.style.colorScheme = mode` (plus
  `data-theme` if other CSS keys off it). Keep passing `mode` to the native provider as well.
- If a web app in the same repo already has this override, move it into the shared theme package
  and import it from both places. Don't copy it.

react-native-web's `Appearance` has **no** `setColorScheme` at all, so a provider that calls it
unconditionally crashes every story with `TypeError: …setColorScheme is not a function`. Guard it
with an optional call, `Appearance.setColorScheme?.(mode)`, which is still a no-op in the browser
and unchanged on native.

Media emulation (`page.emulateMedia({ colorScheme })` in Playwright, Chromatic modes) also works
for screenshots, but it doesn't fix the interactive toolbar toggle.

## 6. Native-only modules

Modules without a web implementation (many `expo-*` native APIs, `react-native-*` libraries with
only native code) throw or render nothing in the browser. For components that import them:
- Add untranspiled RN libraries to `framework.options.modulesToTranspile`. `react-native`,
  `@react-native`, `expo` and `@expo` are included automatically.
- Alias a native-only module to a small web stub in `viteFinal`, or have stories render the
  presentational part without the native dependency.
- Wrap the story in the providers the component really needs (the UI kit provider, safe-area
  provider, toast/overlay portals), and no more than that. If a provider pulls in auth, navigation
  or network, it's a sign to write a smaller story instead.

## 7. Keep stories out of the native bundle

- expo-router only turns files under `app/` (or `src/app/`) into routes. Keep stories next to
  components, never under the routes directory, or they become screens.
- Metro only bundles what the entry imports, so nothing imports `*.stories.tsx` or `.storybook/`
  as long as no barrel file re-exports stories. Check that the native dev build still bundles
  after setup. For a hard check, `npx expo export --platform ios --dump-sourcemap` and search the
  sourcemap's `sources` for `.stories` / `storybook`: there should be no match.
- The CLI's generated `vitest.config.ts` belongs to Storybook tests only. If the app already has a
  Jest/Vitest setup, make sure the two don't pick up each other's files.
