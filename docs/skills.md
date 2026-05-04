# Skills

Per the [Agent Skills specification](https://agentskills.io/specification), a **skill** is a directory containing a `SKILL.md` (name, description, instructions). Agents inject it into context when the task matches its usage. Skills add domain knowledge, step-by-step instructions, and optional scripts or references so the agent can follow best practices and handle specific tasks (e.g. code review, PDFs, APIs) consistently.

For the skills timeline and ecosystem evolution, see [skills history](./SKILLS-HISTORY.md).

## Popular skill repositories

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

## Skills for creating skills (comparison)

Cursor has a [build in skill](https://cursor.com/help/customization/skills#how-do-i-create-a-skill) to help you create new skill. Type /create-skill in chat and describe the skill you want.

On Claude side, `/skill-creator` is the equivalent skill. However, it can be installed globally with `npx skills add https://github.com/anthropics/skills/tree/main/skills/skill-creator -g -a claude-code`.

| Criterion      | **skill-creator**                                        | **create-skill**                                         |
| -------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| Target         | Skills for agent (Claude) in general                     | Cursor-only skills                                       |
| Tooling        | `init_skill.py`, `package_skill.py`, `.skill` file       | No scripts, manual creation                              |
| Process        | 6 steps (including init + package)                       | 4 phases (Discovery → Verify)                            |
| Resources      | scripts / references / assets clearly defined            | scripts/ and optional files (reference.md, examples.md)  |
| Packaging      | Yes → distributable `.skill` file                        | No, skills created in place                              |
| Best practices | Structure, progressive disclosure, "what not to include" | Descriptions, anti-patterns, writing patterns, checklist |
