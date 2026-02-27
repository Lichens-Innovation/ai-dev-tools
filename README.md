# Artificial Intelligence Lichens Tools

Lichens Innovation repository for **AI-assisted development tools** — a single place for rules, agents, skills, MCP (Model Context Protocol) servers, and any other artifacts that enhance coding with AI (Cursor, GitHub Copilot, Claude Code, etc.). This repo started with Agent Skills and has grown to cover the full spectrum of configurable AI dev tooling.

- [Artificial Intelligence Lichens Tools](#artificial-intelligence-lichens-tools)
  - [Skills](#skills)
    - [Installation](#installation)
    - [Frequent CLI commands](#frequent-cli-commands)
    - [Validating skills](#validating-skills)
    - [How a skill becomes active (Cursor, Copilot, Claude Code)](#how-a-skill-becomes-active-cursor-copilot-claude-code)
    - [Popular skill repositories](#popular-skill-repositories)
    - [Skills for creating skills (comparison)](#skills-for-creating-skills-comparison)
  - [Agents](#agents)
  - [MCP](#mcp)

## Skills

Per the [Agent Skills specification](https://agentskills.io/specification), a **skill** is a directory containing a `SKILL.md` (name, description, instructions). Agents inject it into context when the task matches its usage. Skills add domain knowledge, step-by-step instructions, and optional scripts or references so the agent can follow best practices and handle specific tasks (e.g. code review, PDFs, APIs) consistently.

For the skills timeline and ecosystem evolution, see [skills history](./SKILLS-HISTORY.md).

### Installation

The [skills CLI](https://www.npmjs.com/package/skills) (Vercel) is used to simplify skill management in an AI-agent-agnostic way: one tool installs and updates skills for Cursor, GitHub Copilot, Claude Code, and others.

From a project or any directory:

```bash
npx skills add https://github.com/Lichens-Innovation/ai-dev-tools
```

Or using the short form:

```bash
npx skills add Lichens-Innovation/ai-dev-tools
```

**Useful options:**

- **Project** (default): skills are installed in the project (e.g. `.agents/skills/`, `.cursor/skills/`, `.claude/skills/`) and can be versioned with the repo.
- **Global**: `npx skills add Lichens-Innovation/ai-dev-tools -g` — available across all your projects.
- **Target agents**: `npx skills add Lichens-Innovation/ai-dev-tools -a cursor -a github-copilot -a claude-code`.
- **List skills** without installing: `npx skills add Lichens-Innovation/ai-dev-tools --list`.

### Frequent CLI commands

| Task                                 | Command                                                              |
| ------------------------------------ | -------------------------------------------------------------------- |
| Check for updates                    | `npx skills check`                                                   |
| Update all skills                    | `npx skills update`                                                  |
| Generate lock file                   | `npx skills generate-lock`                                           |
| Generate lock file (dry run)         | `npx skills generate-lock --dry-run`                                 |
| Discover skills                      | `npx skills find react`                                              |
| Install a specific skill from a repo | `npx skills add vercel-labs/agent-skills --skill frontend-design`    |
| Create a new skill                   | `npx skills init my-custom-skill`                                    |
| Remove a specific skill              | `npx skills remove hello-world` (alias: `npx skills rm hello-world`) |
| Remove skills (interactive)          | `npx skills remove`                                                  |
| Remove from global scope             | `npx skills remove hello-world --global`                             |
| Remove from specific agents only     | `npx skills remove hello-world --agent cursor --agent claude-code`   |
| List installed skills                | `npx skills list`                                                    |

### Validating skills

You can validate that a skill’s `SKILL.md` frontmatter and structure follow the [Agent Skills specification](https://agentskills.io/specification) in two ways:

1. **Use a skill dedicated to validation**  
   Install the `validate-skills` skill from a repo that provides it, then trigger it in your agent (e.g. via `/validate-skills` or by asking to validate skills):

   ```bash
   npx skills add https://github.com/callstackincubator/agent-skills --skill validate-skills
   ```

2. **Use the `skills-ref` CLI**  
   From the root of this repository, run [skills-ref](https://github.com/agentskills/agentskills/tree/main/skills-ref):

   ```bash
   # Validate a specific skill (e.g. react-ts-guidelines)
   skills-ref validate ./skills/react-ts-guidelines

   # Validate all skills in the repo (if you have multiple skills)
   skills-ref validate ./skills
   ```

   Install `skills-ref` according to the [agentskills repo](https://github.com/agentskills/agentskills). This checks that `name`, `description`, and optional fields comply with the spec and that the skill directory structure is valid.

### How a skill becomes active (Cursor, Copilot, Claude Code)

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

### Popular skill repositories

Other well-known places to discover and install agent skills:

| Source                                                                                        | Description                                                                                                                        |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [skills.sh](https://skills.sh)                                                                | **Agent Skills directory** — browse and install skills from many repos (Vercel Labs ecosystem).                                    |
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills)                       | Official Vercel collection (React, Next.js, web design, PR descriptions, etc.). Install: `npx skills add vercel-labs/agent-skills` |
| [anthropics/skills](https://github.com/anthropics/skills)                                     | Anthropic’s public Agent Skills repo — creative, technical, and document skills for Claude.                                        |
| [github/awesome-copilot — skills](https://github.com/github/awesome-copilot/tree/main/skills) | Curated skills in the Awesome Copilot repo (GitHub Copilot).                                                                       |
| [claude-plugins.dev](https://claude-plugins.dev/)                                             | Plugin/skill registry with CLI installation.                                                                                       |
| [SkillsMP](https://www.skillsmp.com/)                                                         | Skills marketplace (Claude, Codex, ChatGPT, etc.).                                                                                 |

To list skills in any repo without installing: `npx skills add owner/repo --list`.

Examples:

- `npx skills add github/awesome-copilot/skills --list`
- `npx skills add Lichens-Innovation/ai-dev-tools --list`

### Skills for creating skills (comparison)

Two built-in skills help you create skills from scratch. Summary:

| Criterion      | **skill-creator**                                        | **create-skill**                                         |
| -------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| Target         | Skills for agent (Claude) in general                     | Cursor-only skills                                       |
| Tooling        | `init_skill.py`, `package_skill.py`, `.skill` file       | No scripts, manual creation                              |
| Process        | 6 steps (including init + package)                       | 4 phases (Discovery → Verify)                            |
| Resources      | scripts / references / assets clearly defined            | scripts/ and optional files (reference.md, examples.md)  |
| Packaging      | Yes → distributable `.skill` file                        | No, skills created in place                              |
| Best practices | Structure, progressive disclosure, "what not to include" | Descriptions, anti-patterns, writing patterns, checklist |

## Agents

See [AGENTS.md](https://agents.md) for the format.

TBD

## MCP

See [Model Context Protocol](https://modelcontextprotocol.io)

TBD
