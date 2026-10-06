---
name: design-help
description: "Shows the design plugin's README (what it does, how to use it, its skills) in the browser, or in the console."
argument-hint: "[console]"
disable-model-invocation: true
model: haiku
---

# Design Help

- **Console** (`$ARGUMENTS` is `console`, or the browser page can't open): `Read`
  [`README.md`](${CLAUDE_SKILL_DIR}/../../README.md) and print its full content as your reply,
  unchanged: no summary, no commentary.
- **Browser** (default):
  1. Run `node ${CLAUDE_SKILL_DIR}/scripts/build-readme.mjs`. It prints the path of the HTML page.
  2. Run `open <that path>` (`xdg-open` on Linux) as a call of its own. If the sandbox blocks it,
     tell the user to run `! open <that path>`, or `/design-help console`.
  3. Reply with one line: the page is open.
