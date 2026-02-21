# Agent Skills: History, Timeline & Industry Adoption

A concise summary of how Agent Skills emerged, the key dates, and how major players (Cursor, GitHub Copilot, Anthropic) adopted the concept.

---

## 1. Origin of the Concept and Standard

- **Who created it**: The **SKILL.md** format and the **Agent Skills** concept were introduced by **Anthropic**.
- **Open standard**: The specification is maintained as an open standard (e.g. [skill.md](https://skill.md/), [agentskills.io](https://agentskills.io)).
- **What it is**: A skill is a folder containing a **SKILL.md** file (YAML frontmatter + Markdown body) and optional scripts or examples. The frontmatter describes when and how the agent should load and use the skill.

---

## 2. Key Dates (Chronological Order)

| Date | Event |
|------|--------|
| **October 16, 2025** | **Anthropic** officially launches **Agent Skills** for Claude (Claude Code, Claude apps, API). "Introducing Agent Skills" announcement and SKILL.md documentation. |
| **December 18, 2025** | **GitHub** announces [GitHub Copilot now supports Agent Skills](https://github.blog/changelog/2025-12-18-github-copilot-now-supports-agent-skills/). Same standard (`.claude/skills` and `.github/skills`), compatibility with existing Claude Code skills. |
| **January 22, 2026** | **Cursor** releases **Cursor 2.4** with **Agent Skills** in the editor and CLI. Skills in `SKILL.md` files, automatic discovery, slash commands. [Cursor 2.4 changelog](https://www.cursor.com/changelog/2-4). |
| **January 29, 2026** | **Anthropic** publishes the 32-page playbook "The Complete Guide to Building Skills for Claude". |
| **February 17, 2026** | **Cursor 2.5** introduces **Plugins** and the **Cursor Marketplace** — skills are bundled into installable plugins (skills, subagents, MCP, etc.). |

**Summary**: Anthropic created and launched the standard (Oct 2025); GitHub Copilot adopted it (Dec 2025); Cursor integrated it (Jan 2026) and later extended it with a plugin marketplace (Feb 2026).

---

## 3. Adoption by Major Players

### GitHub Copilot

- Agent Skills support since **December 18, 2025**.
- Uses the same format as Claude (SKILL.md, skill folders).
- Available in: Copilot coding agent, Copilot CLI, and agent mode in VS Code Insiders (then stable).
- Personal skills: `~/.copilot/skills` or `~/.claude/skills`.
- Project skills: `.github/skills` or `.claude/skills`.
- Skills already in `.claude/skills` for Claude Code are picked up automatically by Copilot.

### Cursor

- Skills added in **Cursor 2.4** (January 22, 2026).
- Same idea: `SKILL.md`, automatic discovery, slash commands.
- Positioned as complementary to rules: skills for **dynamic context** and procedural "how-to" instructions; rules for always-on, declarative behavior.
- In **2.5**: skills are packaged into **Plugins** and distributed via the **Cursor Marketplace** (e.g. Amplitude, AWS, Figma, Linear, Stripe).

### Anthropic (Claude Code)

- Origin of the standard and reference implementation.
- Personal skills: `~/.claude/skills`; project skills: `.claude/skills`.
- Progressive loading (metadata → instructions → resources) to keep context usage low.

All three align on the **same open standard**, so skills can be shared across Claude Code, Copilot, and Cursor.

---

## 4. Community Adoption and Ecosystem

- **Registries and repos**:
  - [anthropics/skills](https://github.com/anthropics/skills) — official skill repository for Claude, also referenced by Copilot.
  - [github/awesome-copilot](https://github.com/github/awesome-copilot) — community collection for Copilot.
  - [claude-plugins.dev](https://claude-plugins.dev/) — plugin/skill registry with CLI installation.
  - [SkillsMP](https://www.skillsmp.com/) — skills marketplace (Claude, Codex, ChatGPT, etc.).

- **Scale**: Large numbers of skills are reported across platforms (e.g. 239k+ skills); thousands of plugins for Claude (e.g. 9,000+), including slash commands, subagents, and MCP. Popular categories include frontend, debugging, architecture, and skill-writing.

- **Why it took off**: No build step or central approval — a folder and a `SKILL.md` are enough. The open, shared standard and reuse across Claude, Copilot, and Cursor made adoption and sharing (e.g. via GitHub and marketplaces) straightforward.

---

## 5. Summary

- **Origin**: Agent Skills and the SKILL.md standard were introduced by **Anthropic** (October 2025).
- **Timeline**: Anthropic (Oct 2025) → GitHub Copilot (Dec 2025) → Cursor (Jan 2026) → Cursor plugins/marketplace (Feb 2026).
- **Major players**: Copilot and Cursor both adopted the same standard after Anthropic; Cursor later added a plugin marketplace around skills.
- **Community**: Official repos (anthropics/skills, awesome-copilot), third-party registries, and marketplaces show strong adoption and a shared ecosystem across Claude, Copilot, and Cursor.
