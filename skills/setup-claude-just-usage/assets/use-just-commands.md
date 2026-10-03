# Use just commands

<!-- Template: fill one per level from that level's justfile (and its imports/modules). Keep it short: it loads every session. -->

Always run the `just` recipes below, never the tools they wrap: a hook denies the direct call. Run `just` from `<level dir, or "the repository root">`; run `just --list` to see them all.

| Recipe | Use it to | Instead of |
| ------ | --------- | ---------- |
| `just <name> [params]` | <recipe doc comment, or a few words> | `<the tool the recipe body runs>` |

- Extra arguments go after the recipe: `just <name> <args>` (only recipes with parameters take them).
- <Recipes that need a service or env var to be up first, only if the justfile says so.>
- <A tool with no recipe and a replacement that is not `just` (LSP, a skill): one line, only when the hook message says so.>
- No recipe fits? Say so and ask before running the raw tool; don't work around the hook.
