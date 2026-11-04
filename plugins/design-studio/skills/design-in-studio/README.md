# design-in-studio

Designs in the local design studio from a brief. Local backend only: on Claude Design it says so and stops.

```
/design-in-studio settings-screen a denser layout, grouped by account and billing
/design-in-studio button three takes on the secondary variant
/design-in-studio settings-screen refine c: calmer, fewer borders
```

The skill checks the backend and the studio, finds the page (`list_pages`), settles what the brief leaves unclear with one question at most, then hands the work to the plugin's [`designer`](../../agents/designer.md) agent. The agent:

- reads the page, the palette (`get_palette`, with its contrast audit), the components it can reuse, [`local-studio.md`](../../references/local-studio.md) and [`color-usage.md`](../../references/color-usage.md);
- writes each version with `create_alternate` (two by default, each a distinct direction), with the project's tokens and components only, as layout, never coordinates;
- screenshots each version in light, dark and at 320px, and fixes what fails its interface checks: accessible names, visible focus, clipping, contrast in both modes, color as the only signal, destructive actions, truncation, scroll cues, reduced motion;
- reports the versions, what it fixed, what it could not, and what it decided for you.

When the five companion skills from [jakubkrehel/skills](https://github.com/jakubkrehel/skills) are installed (`better-layout`, `better-typography`, `better-ui`, `better-accessibility`, `better-writing`; `/init-design-studio` offers them), the agent preloads them. `better-colors` is left out on purpose: its palette rules conflict with the project's palette, and `color-usage.md` keeps its usage and contrast rules.

A precise edit ("rename the title to Billing") skips the agent: the skill writes it directly as an alternate.

The proposal (`a`) is never overwritten: compare the versions in the studio, press **Use this version** on the one to keep, then run `/implement-design`.
