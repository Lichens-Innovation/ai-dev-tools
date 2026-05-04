# Rules

Rules are there as general guidelines for your overall project or for a part of it. The rules files need to be kept concise. Rules normally apply to your whole project and are loaded to your main context (and subagents) automatically. Here is an example of a rule file for a python project.

```
---
paths:
  - "src/**/*.py"
---

# Python style guide

## Python Best Practices

- Follow PEP 8 with 120 character line limit
- Use double quotes for Python strings
- Sort imports with `isort`
- Use f-strings for string formatting

## Naming Conventions

- When aliasing SQLAlchemy ORM models to avoid name conflicts with Pydantic models, prefix with `Db` (e.g., `from database.models import WorkOrder as DbWorkorder`).

## Code Comments

- Keep the function comments brief.
- Only add comments for more complex code.
- Do not add examples of how to use the function in your comments.
```

## Installation

1. Clone the repository.
2. Install vibe-rules globally:
   ```bash
   npm i -g vibe-rules
   # or
   bun i -g vibe-rules
   ```
3. Browse available rules in the `./rules` folder. Each file is a standalone rule.
4. Install rules into your AI agent. Replace `<rule-name>` with the filename (without extension) and `<editor>` with your target agent:
   ```bash
   vibe-rules load <rule-name> <editor>
   ```
   Supported editors: `claude-code`, `cursor`, `windsurf`, `vscode`, `zed`, `cline`, `codex`, `gemini`, `amp`

   Example — install a rule globally into Claude Code:
   ```bash
   vibe-rules load python-style-guide claude-code --global
   ```

## Updating Rules

Re-run the same `load` command to overwrite an existing rule:

```bash
vibe-rules load <rule-name> <editor>
```

To update all rules at once, re-run the load command for each rule you have installed.

## Using Specific Rules

If rules do not apply to your whole project, specify their relevant directories:

```
---
paths:
  - "src/database/**/*"
---

# Database Development Rules

- All schema changes go through Atlas migrations, never manual SQL.
- Validate foreign key existence before creating related entries.
- Avoid N+1 query problems.
- Make sure all columns and tables names do not contain misspelling.
```

It can be hard to decide what goes in rules files that are scope to a certain folder. Try to keep rules as general as possible. Add specific rules when you see Claude has a hard time to follow your skill or subagents guidelines.
