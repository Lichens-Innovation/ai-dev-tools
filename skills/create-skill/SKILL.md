---
name: create-skill
description: "Scaffolds a new skill in the ai-dev-tools marketplace repository: creates the skill directory, SKILL.md boilerplate, and symlinks it into the chosen plugin. Use when the user asks to add a new skill, create a skill, or scaffold a skill in the marketplace."
---

# Create Skill

Scaffold a new skill in `skills/` and link it into the right plugin.

## Workflow

1. **Find repo root**
   Run: `git rev-parse --show-toplevel`
   Store result as `<repo-root>`.

2. **Gather info via script**
   Run: `node <skill-dir>/scripts/gather-skill-info.cjs`
   The script prompts the user in the terminal and returns one JSON line:
   `{ name, description, triggers, plugin }`

3. **Create skill directory and SKILL.md**
   Create `<repo-root>/skills/<name>/SKILL.md` with a minimal skeleton — do not impose a structure:

   ```markdown
   ---
   name: <name>
   description: "<description>. Use when <triggers>."
   ---

   # <Title Case of name>

   Add instructions here. Structure freely: step-by-step workflow, reference tables, decision trees — whatever fits the skill.

   Optional subdirectories (create only if needed):
   - `scripts/`    — executable helpers (Node.js, Python, shell)
   - `references/` — supporting docs or templates
   - `assets/`     — static files (images, data)
   ```

4. **Symlink into plugin**
   This repo keeps canonical skill source in `skills/` and symlinks into plugins — a repo-specific convention.
   ```bash
   mkdir -p <repo-root>/plugins/<plugin>/skills
   ln -s ../../../skills/<name> <repo-root>/plugins/<plugin>/skills/<name>
   ```

5. **Validate**
   ```bash
   skills-ref validate <repo-root>/skills/<name>
   ```
   Fix any frontmatter or structure errors before proceeding.

6. **Report to user**
   - `skills/<name>/SKILL.md` created
   - Linked at `plugins/<plugin>/skills/<name>`
   - Next steps:
     - Fill in `skills/<name>/SKILL.md` with instructions
     - Add `scripts/` or `references/` dirs if the skill needs helper files
     - Alternative scaffold: `npx skills init <name>` (Vercel skills CLI)
