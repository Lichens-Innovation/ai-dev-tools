---
name: create-subagent
description: "Scaffolds a new subagent in the ai-dev-tools marketplace repository: creates the agent directory, AGENTS.md file, and symlinks it into the chosen plugin. Use when the user asks to add a subagent, create an agent, or scaffold a subagent in the marketplace."
---

# Create Subagent

Scaffold a new subagent in `agents/` and link it into the right plugin.

For Claude Code, subagents are distributed via plugins. The AGENTS.md format is also compatible with other coding tools (Cursor, Copilot, Codex, Gemini, VS Code, Zed).

## Workflow

1. **Find repo root**
   Run: `git rev-parse --show-toplevel`
   Store result as `<repo-root>`.

2. **Gather info via script**
   Run: `node <skill-dir>/scripts/gather-subagent-info.cjs`
   The script prompts the user in the terminal and returns one JSON line:
   `{ name, description, triggers, tools, plugin }`

3. **Create agent directory and AGENTS.md**
   Create `<repo-root>/agents/<name>/AGENTS.md` with a minimal skeleton — do not impose a structure:

   ```markdown
   # <Title Case of name>

   Instructions for AI coding agents acting as <name>. See [agents.md](https://agents.md/) for the format.

   <description>

   ---

   ## Role — workflow

   ### When to apply

   <triggers>

   **Tools:** <tools>

   ### Workflow

   1. Step one
   2. Step two

   ### Output

   Describe the expected output format here.
   ```

4. **Symlink into plugin**
   This repo keeps canonical agent source in `agents/` and symlinks into plugins — a repo-specific convention.
   ```bash
   mkdir -p <repo-root>/plugins/<plugin>/agents
   ln -s ../../../agents/<name> <repo-root>/plugins/<plugin>/agents/<name>
   ```

5. **Report to user**
   - `agents/<name>/AGENTS.md` created
   - Linked at `plugins/<plugin>/agents/<name>`
   - Next steps:
     - Fill in `agents/<name>/AGENTS.md` with the full workflow
     - To make the main thread coordinate this subagent, give it a skill that delegates using the `Agent` tool
     - Enable persistent memory for the subagent: set `memory: project` in its settings — see [Claude Code docs](https://code.claude.com/docs/en/sub-agents#enable-persistent-memory)
     - To run the main thread itself as a named subagent, use the `agent` key in `settings.json`
     - Use `TaskCreate` in the coordinator session so it does not lose track of delegated work
