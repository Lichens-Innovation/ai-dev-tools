# design-help

Shows the design plugin's [README](../../README.md). Only the user can start it.

- `/design-help`: renders the README as an HTML page (`scripts/build-readme.mjs`, rendered in the
  browser with `marked`) and opens it with `open`.
- `/design-help console`: prints the README in the terminal. Also the fallback when the sandbox
  blocks `open`.
