# Writing the report content

The report is a customer announcement, not a changelog. The reader uses the product and does not know the codebase. PR titles and bodies are source material to be rewritten, never pasted.

## Which PRs say what

| PR title type | Goes to |
|---|---|
| `feat` | A **feature** (what's new) |
| `fix`, `perf` | An **improvement/fix** bullet |
| `chore`, `ci`, `test`, `docs`, `build`, `style`, `refactor`, dependency bumps | Omitted, unless the PR body shows a change the user can see or feel. Then treat as `fix` |
| `revert` | Drop both the revert and the PR it reverts, if both are in the release |

PR titles may not follow conventional commits. Then decide from the body, and when it is unclear, say less rather than guess.

## Sections

One section per product or area when the user-facing PRs split cleanly across two or more of them (by title scope such as `feat(mobile):`, `feat(web):`, or by the folders they touch). Otherwise a single section, and then its `<header>` (product name and tagline) is omitted: the cover and the intro already say both. With two or more sections, each gets a title and a one-sentence tagline naming its headline change. Never create a section with nothing in it.

## Features

- One feature per user-visible capability. Several PRs on the same capability are **one** feature.
- Title: 2–5 words, a noun phrase ("Teams", "Work timer"), not a PR title.
- Text: 1–3 sentences, present tense, from the user's side: what they can now do and where to find it ("A bell in the header opens your notifications…").
- Order: biggest user impact first.

## Improvements and fixes

- One sentence per bullet, starting with the area when it helps ("Map: …"). Say what now works, not what was broken in code.
- Merge near-duplicates. Cap at about 8 per section; keep the most visible ones.

## Never

- Invent behavior. Every sentence must be supported by a PR title, body or its screenshots. If a body is too thin, drop the detail or the bullet.
- Include PR numbers, ticket keys, branch names, file or function names, author names, or internal jargon (store, hook, endpoint, migration…) unless the product's own UI uses that word.
- Promise dates or future work.

## Intro

2–3 sentences naming the two or three headline changes and where they ship (for example web and mobile). No greeting formulas longer than a few words. The report has no closing line or sign-off.

## Language

French by default; English when the user asks for it. Translate everything, including captions taken from PR screenshots. Use these labels:

| Token | fr | en |
|---|---|---|
| `LABEL_RELEASE` | Nouvelle version | New release |
| `LABEL_NEW` | Nouveautés | What's new |
| `LABEL_FIXES` | Améliorations & corrections | Improvements & fixes |
Date format: `3 novembre 2026` (fr), `November 3, 2026` (en).

## Screenshots

- Source: the "Screen capture(s)" section of each PR body in the release. Keep only entries that point at a screenshot of the product.
- **A screenshot belongs to the feature built from its own PR**, and is shown inside that feature, under its text. There is no "Preview" heading and never a gallery or a block of screenshots apart from the features.
- At most one per feature (the most representative; a feature merged from several PRs still gets one) and 6 in the report. A screenshot whose PR produced no feature (a fix, an internal PR) is dropped, not parked elsewhere. A feature without a screenshot simply has none.
- Layout: full width of the feature box, so it stays readable. A PDF has no click-to-enlarge; readers zoom in the viewer, which is why the full-resolution PNG is embedded as is.
- Caption: the PR's caption, translated, shortened to a few words and written for the user ("Work timer", not "TaskTimer component, running state").
