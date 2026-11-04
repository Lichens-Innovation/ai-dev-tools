# Monorepo deltas

Loaded by `SKILL.md` step 0 when the repo is a monorepo. This file only lists what **differs**
from the single-repo path — the install/run/MCP/Playwright steps themselves stay in `SKILL.md`,
run once per target.

## 1. Choose the targets

- **One Storybook per app that renders UI**, not one per package and not one for the whole repo.
  Apps on different stacks (web React + React Native, AntD vs. gluestack, Tailwind vite plugin vs.
  NativeWind) need different Storybook frameworks and providers, so a single Storybook can't host
  both.
- **Headless packages get no Storybook** (hooks, stores, API clients, "ui" packages with no
  components). A package that *ships components* gets its stories picked up by the app that
  consumes it (§5), not its own Storybook — unless several apps consume it and it's large enough
  to be a design system of its own.
- List the chosen targets to the user with their key, directory, and port before installing.
- Want one UI across targets later? Storybook Composition (`refs` in `main.ts`) links running
  Storybooks without merging them. Optional; not required by the loop.

## 2. Check workspace overrides

The CLI writes deps into the app's `package.json`; check them against root-level overrides
(`pnpm-workspace.yaml#overrides`, `resolutions`), notably `vite`, `react` and `react-dom`.

## 3. One port and one MCP entry per target

Give each target its own port — 6006, 6007, … — set with `-p` in the app's script
(`storybook dev -p 6007`), so it never depends on which starts first. Add one `.mcp.json` entry
per target at the **repo root** (where Claude Code runs), named `storybook-<key>`, and one
`storybooks` entry in the manifest (`SKILL.md` step 7) — with several targets the contract's
implicit default no longer applies.

## 4. Addon resolution (pnpm)

With pnpm's strict `node_modules`, Storybook may resolve bare addon names from the wrong place.
Pass absolute paths in each app's `main.ts`:

```ts
import { dirname } from "path";
import { fileURLToPath } from "url";

function getAbsolutePath(value: string) {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}
// addons: [getAbsolutePath("@storybook/addon-docs"), ...], framework: { name: getAbsolutePath("@storybook/react-vite") }
```

## 5. Workspace packages in stories

- If a workspace package ships components, extend the app's `stories` glob to it
  (`"../../../packages/<pkg>/src/**/*.stories.tsx"`).
- Workspace packages consumed as TypeScript source must be transformed by the app's Vite config.
  Reuse the app's own `vite.config` plugins (`viteFinal` merges them, or the framework loads the
  app's config automatically for `react-vite`), including path aliases.

## 6. Shared config package (only when worth it)

Create a `<scope>/storybook-config` package **only** when two or more targets share runtime
pieces, for example:
- `globalTypes` toolbars (locale, theme)
- i18n and query-client decorators
- a11y/controls `parameters`
- `manager` branding

Keep it to runtime (preview) code:
- **`main.ts` stays in each app.** It is framework-specific, and under pnpm the addons have to be
  resolved from the app anyway.
- **Theme and provider decorators stay per app** when the apps use different UI libraries. They can
  still read the shared `globals.theme`.
- Follow the repo's conventions for new packages, such as workspace protocol, the shared tsconfig,
  and Dockerfiles that copy every package manifest.

## 7. Root wiring

- Root task-runner scripts: one per target, plus one that runs all targets at once (like the repo's
  `dev` script) and one `build-storybook` for all.
- Add `storybook-static/` to the ignore files, and check that the lint and format ignores cover it.
