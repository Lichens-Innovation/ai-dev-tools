import { createServerFn } from "@tanstack/react-start";
import fs from "fs";
import path from "path";
import {
  readAgentsFromDir,
  readSkillsFromDir,
  getUserAgents,
  getUserSkills,
  getInstalledPluginAgents,
  getInstalledPluginSkills,
} from "@repo/claude-fs";
import { readCwd, mountedProjectPath } from "./afk-fs";
import { afkConfigToYaml } from "./afk-yaml";

// `source` records where the agent/skill was discovered: "project" (the project's
// own .claude/), "user" (the global ~/.claude/), the bundled AFK plugin, or an
// installed plugin's name. Surfaced in the UI so mixed-origin lists stay legible.
export interface BundledAgent {
  id: string;
  description: string;
  source: string;
}

export interface ProjectSkill {
  id: string;
  description: string;
  source: string;
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

// Dedupe by id, keeping the first occurrence — callers push sources in priority
// order (project > user > bundled > plugins).
function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

// All agents the user can choose from: project-scoped, global (~/.claude), the bundled
// AFK subagents, and every installed plugin's agents — each tagged with its `source`.
// Directory reading, the global/plugin sweeps, and host→container path rebasing live in
// @repo/claude-fs; this only layers the AFK-specific sources, tags, and priority.
async function discoverAgents(cwd: string): Promise<BundledAgent[]> {
  const projectRoot = mountedProjectPath(cwd);
  const bundledDir = getAgentsDir();
  const [project, user, bundled, plugins] = await Promise.all([
    projectRoot ? readAgentsFromDir(path.join(projectRoot, ".claude", "agents")) : Promise.resolve([]),
    getUserAgents(),
    bundledDir ? readAgentsFromDir(bundledDir) : Promise.resolve([]),
    getInstalledPluginAgents(),
  ]);
  const items: BundledAgent[] = [
    ...project.map((a) => ({ id: a.name, description: a.description, source: "project" })),
    ...user.map((a) => ({ id: a.name, description: a.description, source: "user" })),
    ...bundled.map((a) => ({ id: a.name, description: a.description, source: "ai-tools-manager" })),
    ...plugins.map((a) => ({ id: a.name, description: a.description, source: a.plugin })),
  ];
  return dedupeById(items).sort((a, b) => a.id.localeCompare(b.id));
}

// All skills the user can choose from: project-scoped, global (~/.claude), and every
// installed plugin's skills — each tagged with its `source`.
async function discoverSkills(cwd: string): Promise<ProjectSkill[]> {
  const projectRoot = mountedProjectPath(cwd);
  const [project, user, plugins] = await Promise.all([
    projectRoot ? readSkillsFromDir(path.join(projectRoot, ".claude", "skills")) : Promise.resolve([]),
    getUserSkills(),
    getInstalledPluginSkills(),
  ]);
  const items: ProjectSkill[] = [
    ...project.map((s) => ({ id: s.name, description: s.description, source: "project" })),
    ...user.map((s) => ({ id: s.name, description: s.description, source: "user" })),
    ...plugins.map((s) => ({ id: s.name, description: s.description, source: s.plugin })),
  ];
  return dedupeById(items).sort((a, b) => a.id.localeCompare(b.id));
}

// ── AFK v3 types ───────────────────────────────────────────────────

export interface AfkInstanceV3 {
  name: string;
  agent: string;
  skills: string[];
}

export interface AfkNodeV3 {
  id: string;
  type: "agent" | "human_review";
  instance?: string; // agent nodes only; references AfkInstanceV3.name
  position?: { x: number; y: number };
}

export interface AfkEdgeV3 {
  from: string;
  to: string;
  kind: "success" | "condition";
  label?: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface AfkWorkflowV3 {
  name: string;
  nodes: AfkNodeV3[];
  edges: AfkEdgeV3[];
  // success_path is DERIVED — never stored in afk.json
}

export interface AfkRuleV3 {
  id: string;
  scope?: "project";
  paths?: string[];
  // Origin of the rule, so the host-side apply step (afk-apply-rules.js) knows what to do:
  // "project" → MOVE the on-disk .claude/rules/<id>.md to the assigned directory;
  // "vibe-rules" → install via `vibe-rules load <id> claude-code -t <dir>/.claude/rules/<id>.md`.
  source?: "project" | "vibe-rules";
}

export interface AfkConfigV3 {
  version: 3;
  agents_available: string[];
  skills_available: string[];
  main_session_loaded_skills: string[];
  workflow_instances: AfkInstanceV3[]; // project-scoped reusable components
  workflows: AfkWorkflowV3[];
  rules: AfkRuleV3[];
}

export interface AfkWorkflowsSlice {
  cwd: string;
  agents_available: string[];
  skills_available: string[];
  main_session_loaded_skills: string[];
  workflow_instances: AfkInstanceV3[];
  workflows: AfkWorkflowV3[];
}

export interface AfkRulesSlice {
  cwd: string;
  rules: AfkRuleV3[];
}

export interface AfkConfigResult {
  config: AfkConfigV3;
  cwd: string;
  bundledAgents: BundledAgent[];
  projectSkills: ProjectSkill[];
}

function blankV3Config(): AfkConfigV3 {
  return {
    version: 3,
    agents_available: [],
    skills_available: [],
    main_session_loaded_skills: [],
    workflow_instances: [],
    workflows: [],
    rules: [],
  };
}

function readConfig(jsonPath: string): AfkConfigV3 {
  if (!fs.existsSync(jsonPath)) return blankV3Config();
  try {
    const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as AfkConfigV3;
    return parsed.version === 3 ? parsed : blankV3Config();
  } catch {
    return blankV3Config();
  }
}

// NOTE: this is the TS twin of `successPath` in the plugin's
// scripts/afk-render-orchestrator.js. They can't share code (app TS vs plain-Node
// plugin), so their OUTPUT must stay byte-identical — afk.yaml's `success_path`
// (rendered here) and the orchestrator's AFK:HANDOFFS table (rendered there) describe
// the same path. Keep the separator (" → ") and labels ("@<instance>", "human review")
// in sync across both files.
export function computeSuccessPath(workflow: AfkWorkflowV3, instances: AfkInstanceV3[]): string {
  const labelFor = (nodeId: string): string => {
    if (nodeId === "main-session") return "";
    const n = workflow.nodes.find((x) => x.id === nodeId);
    if (!n) return nodeId;
    if (n.type === "agent") {
      const inst = instances.find((i) => i.name === n.instance);
      return "@" + (inst?.name ?? n.instance ?? n.id);
    }
    return "human review";
  };
  const out: string[] = [];
  let cur = "main-session";
  const seen = new Set<string>();
  while (!seen.has(cur)) {
    seen.add(cur);
    const next = workflow.edges.find((e) => e.from === cur && e.kind === "success");
    if (!next) break;
    const label = labelFor(next.to);
    if (label) out.push(label);
    cur = next.to;
  }
  return out.join(" → ");
}

export const getAfkConfig = createServerFn({ method: "GET" }).handler(async (): Promise<AfkConfigResult> => {
  const cwd = readCwd();
  const config = readConfig(path.join(mountedProjectPath(cwd), ".claude", "afk.json"));
  const [bundledAgents, projectSkills] = await Promise.all([discoverAgents(cwd), discoverSkills(cwd)]);
  return { config, cwd, bundledAgents, projectSkills };
});

export const submitAfkConfig = createServerFn({ method: "POST" })
  .inputValidator(
    (data: unknown) => data as { cwd: string; slice: AfkWorkflowsSlice | AfkRulesSlice; sliceType: "workflows" | "rules" },
  )
  .handler(async ({ data }) => {
    const claudeDir = path.join(data.cwd, ".claude");
    const jsonPath = path.join(claudeDir, "afk.json");
    const current = readConfig(jsonPath);
    current.version = 3;

    if (data.sliceType === "workflows") {
      const s = data.slice as AfkWorkflowsSlice;
      current.agents_available = s.agents_available;
      current.skills_available = s.skills_available;
      current.main_session_loaded_skills = s.main_session_loaded_skills;
      current.workflow_instances = s.workflow_instances;
      current.workflows = s.workflows;
    } else {
      const s = data.slice as AfkRulesSlice;
      current.rules = s.rules;
    }

    // afk.json is the source of truth (read by the SubagentStart hook). afk.yaml is
    // the human-readable rendering. Both are written here for local dev; the skill
    // re-writes them verbatim from additionalContext so Docker runs work too.
    const afkYaml = afkConfigToYaml(current);
    if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(current, null, 2));
    try {
      fs.writeFileSync(path.join(data.cwd, "afk.yaml"), afkYaml);
    } catch {
      // In Docker the host cwd may not be mounted; the skill writes afk.yaml instead.
    }

    const resultFile = process.env.RESULT_FILE ?? "/tmp/result.json";
    fs.writeFileSync(
      resultFile,
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptExpansion",
          additionalContext:
            `AFK v3 config data: ${JSON.stringify({ projectPath: data.cwd, config: current })}\n\n` +
            `Canonical afk.yaml to write verbatim to <projectPath>/afk.yaml:\n\`\`\`yaml\n${afkYaml}\`\`\``,
        },
      }),
    );
    return { ok: true };
  });
