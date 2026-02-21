# skills

Lichens Innovation **Agent Skills** repository — reusable instructions to extend coding agents (Cursor, GitHub Copilot, Claude Code, etc.).

- [skills](#skills)
  - [Installation](#installation)
  - [Removing a skill](#removing-a-skill)
  - [Frequent CLI commands](#frequent-cli-commands)
  - [How a skill becomes active (Cursor, Copilot, Claude Code)](#how-a-skill-becomes-active-cursor-copilot-claude-code)
  - [Skills for creating skills (comparison)](#skills-for-creating-skills-comparison)
  - [Popular skill repositories](#popular-skill-repositories)

## Installation

From a project or any directory:

```bash
npx skills add https://github.com/Lichens-Innovation/skills
```

Or using the short form:

```bash
npx skills add Lichens-Innovation/skills
```

**Useful options:**

- **Project** (default): skills are installed in the project (e.g. `.agents/skills/`, `.cursor/skills/`, `.claude/skills/`) and can be versioned with the repo.
- **Global**: `npx skills add Lichens-Innovation/skills -g` — available across all your projects.
- **Target agents**: `npx skills add Lichens-Innovation/skills -a cursor -a github-copilot -a claude-code`.
- **List skills** without installing: `npx skills add Lichens-Innovation/skills --list`.

## Removing a skill

To uninstall a skill that was previously added:

```bash
# Remove a specific skill by name (e.g. hello-world)
npx skills remove hello-world

# Interactive: choose which skill(s) to remove
npx skills remove

# Remove from global scope (if you installed with -g)
npx skills remove hello-world --global

# Remove from specific agents only
npx skills remove hello-world --agent cursor --agent claude-code
```

You can use the `rm` alias: `npx skills rm hello-world`. To see what is installed: `npx skills list`.

## Frequent CLI commands

| Task                                 | Command                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| Check for updates                    | `npx skills check`                                                 |
| Update all skills                    | `npx skills update`                                                |
| Generate lock file                   | `npx skills generate-lock`                                         |
| Generate lock file (dry run)         | `npx skills generate-lock --dry-run`                               |
| Discover skills                      | `npx skills find react`                                            |
| Install a specific skill from a repo | `npx skills add vercel-labs/agent-skills --skill frontend-design`  |
| Create a new skill                   | `npx skills init my-custom-skill`                                  |
| Remove a specific skill              | `npx skills remove hello-world`                                    |
| Remove skills (interactive)          | `npx skills remove`                                                |
| Remove from global scope             | `npx skills remove hello-world --global`                           |
| Remove from specific agents only     | `npx skills remove hello-world --agent cursor --agent claude-code` |
| List installed skills                | `npx skills list`                                                  |

## How a skill becomes active (Cursor, Copilot, Claude Code)

1. **Installation**  
   The `npx skills add` command uses the [open agent skills CLI](https://github.com/vercel-labs/skills). It fetches this repo and copies each skill (folder containing a `SKILL.md` and its files) into the directories expected by each tool:
   - **Cursor**: `.agents/skills/` (project) or `~/.cursor/skills/` (global)
   - **GitHub Copilot**: `.agents/skills/` (project) or `~/.copilot/skills/` (global)
   - **Claude Code**: `.claude/skills/` (project) or `~/.claude/skills/` (global)

2. **Discovery by the agent**  
   Cursor, Copilot, and Claude Code scan these directories and load the `SKILL.md` files (name, description, instructions). They follow the [Agent Skills specification](https://agentskills.io).

3. **Skill activation**  
   When your question or request matches the **usage context** described in the skill (e.g. “When to use”, description), the agent injects that skill into context and follows its **Instructions**. The skill is therefore active whenever it is relevant, with no extra action on your part.

In short: **install** → **files in the right place** → **the agent reads and applies the skill when relevant**.

## Skills for creating skills (comparison)

Two built-in skills help you create skills from scratch. Summary:

| Criterion | **skill-creator** | **create-skill** |
|--------|--------------------|-------------------|
| Target | Skills for agent (Claude) in general | Cursor-only skills |
| Tooling | `init_skill.py`, `package_skill.py`, `.skill` file | No scripts, manual creation |
| Process | 6 steps (including init + package) | 4 phases (Discovery → Verify) |
| Resources | scripts / references / assets clearly defined | scripts/ and optional files (reference.md, examples.md) |
| Packaging | Yes → distributable `.skill` file | No, skills created in place |
| Best practices | Structure, progressive disclosure, "what not to include" | Descriptions, anti-patterns, writing patterns, checklist |

## Popular skill repositories

Other well-known places to discover and install agent skills:

| Source                                                                                        | Description                                                                                                                        |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [skills.sh](https://skills.sh)                                                                | **Agent Skills directory** — browse and install skills from many repos (Vercel Labs ecosystem).                                    |
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills)                       | Official Vercel collection (React, Next.js, web design, PR descriptions, etc.). Install: `npx skills add vercel-labs/agent-skills` |
| [anthropics/skills](https://github.com/anthropics/skills)                                     | Anthropic’s public Agent Skills repo — creative, technical, and document skills for Claude.                                        |
| [github/awesome-copilot — skills](https://github.com/github/awesome-copilot/tree/main/skills) | Curated skills in the Awesome Copilot repo (GitHub Copilot).                                                                       |

To list skills in any repo without installing: `npx skills add owner/repo --list`.

Examples:

- `npx skills add github/awesome-copilot/skills --list`
- `npx skills add Lichens-Innovation/skills --list`
