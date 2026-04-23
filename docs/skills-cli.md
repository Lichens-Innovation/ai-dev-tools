# Skills CLI

The [skills CLI](https://www.npmjs.com/package/skills) (Vercel) is used to simplify skill management in an AI-agent-agnostic way: one tool installs and updates skills for Cursor, GitHub Copilot, Claude Code, and others.

## Installation

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

**Tip** Always specify your target agent when installing a skill (e.g. -a claude-code). For claude code, if not specified, the skill will be installed in the `/agents/skill` directory which claude code does not access since it uses the special `.claude` directory to store it’s skills.

## Frequent CLI commands

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

## Validating skills

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

## Troubleshooting

### Claude Code does not detects the skill I added

Make sure that your skill exists either globally in the `~/.claude/skills` directory or in your project’s `.claude/skills`.
If the skill was installed in `~/agents/skills` or `agents/skills`, it will not be detected by Claude.
