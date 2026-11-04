# design-studio-help

Shows the design-studio plugin's [README](../../README.md): both backends (Claude Design and the local design studio), their prerequisites, usage, skills and the `/open-design-studio` command. Only the user can start it.

- `/design-studio-help`: renders the README as an HTML page (`scripts/build-readme.mjs`, rendered in the
  browser with `marked`) and opens it with `open`.
- `/design-studio-help console`: prints the README in the terminal. Also the fallback when the sandbox
  blocks `open`.
