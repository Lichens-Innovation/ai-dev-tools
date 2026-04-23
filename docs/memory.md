# Memory

Claude Code has an automatic process to write into a file notes about what it learns when you correct it.
You can also add manually to the memory in a global or project scope. To manage the memory, use the `/memory` command.

## Rules vs Memory

Prefer using [rules](rules.md) before adding new memory to Claude Code. You can view your rules and manage them. Memory is more a last resort to use when you see that even if Claude Code has clear instructions from your skill or rules, it still fails to act as expected.

Another difference is that Claude Code only loads the first 200 lines or 25KB from the memory, in comparison, all rules are loaded.
