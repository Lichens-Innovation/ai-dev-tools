# Use just commands

<!-- Template: fill one per level from that level's justfile (and its imports/modules). Keep it short: it loads every session. -->

Always run the `just` recipes below, never the tools they wrap: a hook denies the direct call. Run `just` from `<level dir, or "the repository root">`; run `just --list` to see them all.

| Recipe | Use it to | Instead of |
| ------ | --------- | ---------- |
| `just <name> [params]` | <recipe doc comment, or a few words> | `<the tool the recipe body runs>` |

- Extra arguments go after the recipe: `just <name> <args>` (only recipes with parameters take them).
- <Only if the level's recipes use `_quiet`:> `build`, `lint`, `check`, `typecheck`, `test` and `format` print a one-line summary on success and only the last 80 lines plus a log path on failure. Read the log (with `Read`, `offset`/`limit`) for more; don't rerun the raw tool. `FULL_OUTPUT=1 just <recipe>` streams everything, use it only if the log isn't enough.
- <Recipes that need a service or env var to be up first, only if the justfile says so.>
- <A tool with no recipe and a replacement that is not `just` (LSP, a skill): one line, only when the hook message says so.>
- No recipe fits? Say so and ask before running the raw tool; don't work around the hook.
