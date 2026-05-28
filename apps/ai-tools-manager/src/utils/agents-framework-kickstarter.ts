import { createServerFn } from "@tanstack/react-start";
import fs from "fs";
import path from "path";

export interface BundledAgent {
  id: string;
  description: string;
}

export interface ProjectSkill {
  id: string;
  description: string;
}

export interface AfkFormData {
  cwd: string;
  bundledAgents: BundledAgent[];
  projectSkills: ProjectSkill[];
}

export type StepType = "agent" | "skill" | "human_approval" | "human_review";

export interface AfkStep {
  type: StepType;
  id?: string;
}

export interface AfkAgent {
  id: string;
  skills: string[];
}

export interface AfkSkillRef {
  id: string;
  source: "kickstarter" | "project";
  user_invocable: boolean;
}

export interface AfkWorkflow {
  name: string;
  steps: AfkStep[];
}

export interface AfkHandoff {
  scenario: string;
  steps: AfkStep[];
}

export interface AfkFormPayload {
  cwd: string;
  agents: AfkAgent[];
  rules: string[];
  skills: AfkSkillRef[];
  workflows: AfkWorkflow[];
  handoffs: AfkHandoff[];
}

function parseFrontmatter(text: string): Record<string, string> {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};
  const out: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

function findRepoRoot(start: string): string | null {
  let dir = start;
  while (dir && dir !== "/") {
    if (fs.existsSync(path.join(dir, "turbo.json"))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

function getAgentsDir(): string | null {
  if (process.env.RUNNING_IN_DOCKER === "true") {
    const docker = "/app/plugins/ai-tools-manager/agents";
    if (fs.existsSync(docker)) return docker;
  }
  const root = findRepoRoot(process.cwd());
  if (!root) return null;
  const local = path.join(root, "plugins/ai-tools-manager/agents");
  return fs.existsSync(local) ? local : null;
}

function readBundledAgents(): BundledAgent[] {
  const dir = getAgentsDir();
  if (!dir) return [];
  const out: BundledAgent[] = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".md")) continue;
    try {
      const fm = parseFrontmatter(fs.readFileSync(path.join(dir, file), "utf8"));
      if (fm.name) out.push({ id: fm.name, description: fm.description ?? "" });
    } catch {
      // skip unreadable
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function readProjectSkills(cwd: string): ProjectSkill[] {
  if (!cwd) return [];
  const skillsDir = path.join(cwd, ".claude", "skills");
  if (!fs.existsSync(skillsDir)) return [];
  const out: ProjectSkill[] = [];
  for (const entry of fs.readdirSync(skillsDir)) {
    const skillFile = path.join(skillsDir, entry, "SKILL.md");
    if (!fs.existsSync(skillFile)) continue;
    try {
      const fm = parseFrontmatter(fs.readFileSync(skillFile, "utf8"));
      const id = fm.name || entry;
      out.push({ id, description: fm.description ?? "" });
    } catch {
      // skip
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function readCwd(): string {
  if (process.env.RUNNING_IN_DOCKER === "true") {
    try {
      const data = JSON.parse(fs.readFileSync("/tmp/marketplace-data.json", "utf8")) as { cwd?: string };
      return data.cwd ?? "";
    } catch {
      // fall through
    }
  }
  return process.cwd();
}

export const getAfkFormData = createServerFn({ method: "GET" }).handler(async (): Promise<AfkFormData> => {
  const cwd = readCwd();
  return {
    cwd,
    bundledAgents: readBundledAgents(),
    projectSkills: readProjectSkills(cwd),
  };
});

export const submitAfkForm = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as AfkFormPayload)
  .handler(async ({ data }) => {
    const resultFile = process.env.RESULT_FILE ?? "/tmp/result.json";
    const formData = JSON.stringify({
      projectPath: data.cwd,
      config: {
        version: 1,
        agents: data.agents,
        rules: data.rules,
        skills: data.skills,
        workflows: data.workflows,
        handoffs: data.handoffs,
      },
    });
    fs.writeFileSync(
      resultFile,
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptExpansion",
          additionalContext: `AFK form data: ${formData}`,
        },
      }),
    );
    return { ok: true };
  });

export const cancelAfkForm = createServerFn({ method: "POST" }).handler(async () => {
  const resultFile = process.env.RESULT_FILE ?? "/tmp/result.json";
  fs.writeFileSync(resultFile, JSON.stringify({ decision: "block", reason: "AFK setup cancelled." }));
  return { ok: true };
});
