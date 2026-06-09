# Helpers and CLI complementary tools

## RTK

[RTK](https://www.rtk-ai.app) (Rust Token Killer) is a CLI proxy that filters and compresses shell command output before it reaches the LLM context. It supports 100+ dev commands (`git`, `grep`, test runners, linters, etc.) and typically cuts token usage by 60–90% with under 10ms overhead.


## Sandcastle

[Sandcastle](https://github.com/mattpocock/sandcastle) is a TypeScript library for orchestrating AI coding agents in isolated sandboxes (Docker, Podman, Vercel). You invoke agents with `sandcastle.run()`; it handles sandboxing, branch strategy, and merging commits back.
