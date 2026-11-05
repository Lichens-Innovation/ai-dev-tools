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

One section per product or area when the user-facing PRs split cleanly across two or more of them (by title scope such as `feat(mobile):`, `feat(web):`, or by the folders they touch). Otherwise a single section titled with the product name. Never create a section with nothing in it. Each section gets a one-sentence tagline naming its headline change.

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

## Intro and closing

- Intro: 2–3 sentences naming the two or three headline changes and where they ship (for example web and mobile). No greeting formulas longer than a few words.
- Closing: one line inviting questions.

## Language

French by default; English when the user asks for it. Translate everything, including captions taken from PR screenshots. Use these labels:

| Token | fr | en |
|---|---|---|
| `LABEL_RELEASE` | Nouvelle version | New release |
| `LABEL_NEW` | Nouveautés | What's new |
| `LABEL_PREVIEW` | Aperçu | Preview |
| `LABEL_FIXES` | Améliorations & corrections | Improvements & fixes |
| `CLOSING` | N'hésitez pas à nous contacter pour toute question. | Feel free to contact us with any questions. |

Date format: `3 novembre 2026` (fr), `November 3, 2026` (en).

## Screenshots

- Source: the "Screen capture(s)" section of each PR body in the release. Keep only entries that point at a screenshot of the product.
- At most 3 per section and 6 in the report. Prefer one per headline feature, from `feat` PRs. Skip near-duplicates.
- Caption: the PR's caption, translated, shortened to a few words and written for the user ("Work timer", not "TaskTimer component, running state").
