---
name: pin-exact-nodejs-dependencies
description: >-
  Pins exact dependency versions (no ^ or ~) via save-exact and
  npm-package-json-lint. Use when enforcing absolute versions in package.json,
  adding save-exact, preferring exact pins, or blocking caret/tilde ranges.
---

# Pin exact dependencies

Recipe: prevent `^` / `~` in `dependencies` and `devDependencies`.

## Detect package manager

Prefer in order:

1. `packageManager` field in `package.json` (e.g. `bun@…`, `pnpm@…`, `npm@…`)
2. Lockfile: `bun.lock` / `bun.lockb` → bun; `pnpm-lock.yaml` → pnpm; `yarn.lock` → yarn; `package-lock.json` → npm
3. Default: **bun**

Use that PM for all install / script commands below. Map:

| Action | bun | pnpm | npm | yarn |
|--------|-----|------|-----|------|
| Add dev dep | `bun add -d <pkg>` | `pnpm add -D <pkg>` | `npm i -D <pkg>` | `yarn add -D <pkg>` |
| Run script | `bun run <script>` | `pnpm run <script>` | `npm run <script>` | `yarn <script>` |

`save-exact=true` in `.npmrc` is respected by bun, npm, pnpm, yarn.

## Steps

### 1. `.npmrc` — write exact on install

```ini
# Pin exact versions in package.json (no ^ / ~ ranges) when adding deps
save-exact=true
```

Prevents new ranges from package-manager add/install. Does not rewrite existing entries.

### 2. Fix existing ranges

Strip `^` / `~` from every dep in `package.json`, then refresh lockfile with the project PM. Lint fails until clean.

### 3. `npm-package-json-lint` — enforce

```bash
# bun (default):
bun add -d npm-package-json-lint
# pnpm: pnpm add -D npm-package-json-lint
# npm:  npm i -D npm-package-json-lint
# yarn: yarn add -D npm-package-json-lint
```

`.npmpackagejsonlintrc.json`:

```json
{
  "rules": {
    "prefer-absolute-version-dependencies": "error",
    "prefer-absolute-version-devDependencies": "error"
  }
}
```

`package.json` scripts:

```json
"lint:package": "npmPkgJsonLint ."
```

### 4. Wire git hooks (if present)

Detect before wiring:

- **Husky**: `.husky/` and/or `husky` in `devDependencies` / `prepare` script
- **Lefthook**: `lefthook.yml` / `lefthook.yaml` and/or `lefthook` in `devDependencies`

#### Husky + lint-staged (common)

If `lint-staged` exists, add (run before generic `*.json` prettier if both match):

```json
"package.json": ["npmPkgJsonLint", "prettier --write"]
```

Ensure pre-commit already runs lint-staged (e.g. `.husky/pre-commit` → `bun run lint-staged` / `pnpm exec lint-staged` / `npx lint-staged`).

If husky **without** lint-staged: add `npmPkgJsonLint .` (or `$PM run lint:package`) to `.husky/pre-commit`.

#### Lefthook

In `lefthook.yml` (or `.yaml`), under `pre-commit`:

```yaml
pre-commit:
  commands:
    lint-package:
      glob: "package.json"
      run: npmPkgJsonLint {staged_files}
      # or: <pm> run lint:package
```

Match existing lefthook style (parallel vs serial, `root`, etc.). Prefer glob-scoped run when other package.json-only checks exist.

#### Neither husky nor lefthook

Skip hooks. Rely on CI + manual `lint:package`. Do not add a hook tool unless the user asks.

### 5. Wire CI

After install, with other lints (substitute project PM):

```yaml
- name: Lint package.json
  run: bun run lint:package
  # pnpm run lint:package | npm run lint:package | yarn lint:package
```

### 6. Verify

```bash
bun run lint:package   # or pnpm/npm/yarn equivalent
```

Must exit 0. Introduce a `^` temporarily only to confirm it fails, then revert.

## Notes

- Exact pins in `package.json` ≠ locked tree — lockfile still owns transitive versions.
- `save-exact` = prevent; lint = catch hand-edits / leftovers.
- Skip syncpack unless monorepo with many `package.json`s.
