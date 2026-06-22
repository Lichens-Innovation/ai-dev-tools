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
  // Skills the SubagentStart hook auto-loads (Skill tool) before the agent starts working.
  loaded_skills: string[];
  // Skills surfaced to the agent as available — it loads one only if the task involves the
  // logic that skill describes. Defaults are referenced; promote to loaded in the canvas.
  referenced_skills: string[];
}

export interface AfkNodeV3 {
  id: string;
  type: "agent" | "human_review" | "skill";
  instance?: string; // agent nodes only; references AfkInstanceV3.name
  skill?: string; // skill nodes only; the skill id run inline by the orchestrator
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

// The non-implementation agents every seeded workflow shares.
const CORE_INSTANCES: AfkInstanceV3[] = [
  { name: "test", agent: "test", loaded_skills: [], referenced_skills: [] },
  { name: "reviewer", agent: "reviewer", loaded_skills: [], referenced_skills: [] },
  { name: "refactor", agent: "refactor", loaded_skills: [], referenced_skills: [] },
  { name: "scribe", agent: "scribe", loaded_skills: [], referenced_skills: [] },
];

const succ = (from: string, to: string): AfkEdgeV3 => ({
  from,
  to,
  kind: "success",
  sourceHandle: "bottom",
  targetHandle: "top",
});

const cond = (from: string, to: string, label: string): AfkEdgeV3 => ({
  from,
  to,
  kind: "condition",
  label,
  sourceHandle: "right",
  targetHandle: "top",
});

// Vertical rhythm for the seeded layout. A skill-less node gets BASE_STEP of room; each
// attached skill chip wraps onto ~its own row in the canvas, so we add PER_SKILL_STEP per
// skill to keep a tall (many-skill) node from overlapping the one below it.
const BASE_STEP = 140;
const PER_SKILL_STEP = 30;

// Number of skills attached to a seeded instance — used only to size vertical spacing.
type SkillCount = (instanceName: string) => number;

// Lay out a vertical column of nodes at x:0, each node's y offset by the cumulative height
// of the nodes above it (taller when an instance carries skills). `human_review-1` becomes a
// human_review node; every other id becomes an agent node whose instance == its id.
function columnNodes(ids: string[], skillCount: SkillCount = () => 0): AfkNodeV3[] {
  let y = BASE_STEP;
  return ids.map((id): AfkNodeV3 => {
    const position = { x: 0, y };
    const node: AfkNodeV3 =
      id === "human_review-1"
        ? { id, type: "human_review", position }
        : { id, type: "agent", instance: id, position };
    const skills = id === "human_review-1" ? 0 : skillCount(id);
    y += BASE_STEP + skills * PER_SKILL_STEP;
    return node;
  });
}

// Build a seeded workflow. `impl` is the implementation-agent chain inserted into the
// happy path (e.g. ["backend"], ["frontend"], or ["backend","frontend"] for fullstack).
//   kind "default": impl runs first — main-session → [impl] → human review → test → reviewer → scribe.
//     Reviewer/refactor code FAILs route to the impl agent(s); split per-agent when impl.length > 1.
//   kind "tdd": tests first — main-session → test → human review → [impl] → reviewer → scribe.
//     Code FAILs always route to @test (failures drive more tests), so impl never changes the conditions.
function buildWorkflow(
  name: string,
  kind: "default" | "tdd",
  impl: string[],
  skillCount: SkillCount = () => 0
): AfkWorkflowV3 {
  const column =
    kind === "tdd"
      ? ["test", "human_review-1", ...impl, "reviewer", "scribe"]
      : [...impl, "human_review-1", "test", "reviewer", "scribe"];
  const colNodes = columnNodes(column, skillCount);
  const reviewerY = colNodes.find((n) => n.id === "reviewer")?.position?.y ?? BASE_STEP;
  const nodes: AfkNodeV3[] = [
    ...colNodes,
    { id: "refactor", type: "agent", instance: "refactor", position: { x: 360, y: reviewerY } },
  ];

  // Success chain: main-session through the whole happy-path column.
  const seq = ["main-session", ...column];
  const edges: AfkEdgeV3[] = [];
  for (let i = 0; i < seq.length - 1; i++) edges.push(succ(seq[i], seq[i + 1]));

  // Code-issue routes vary by workflow kind and impl-agent count.
  const reviewerCode: AfkEdgeV3[] = [];
  const refactorCode: AfkEdgeV3[] = [];
  if (kind === "tdd") {
    reviewerCode.push(cond("reviewer", "test", "FAIL: style, data layer, error handling, security, or persistence"));
    refactorCode.push(cond("refactor", "test", "finding requires code changes"));
  } else if (impl.length === 1) {
    reviewerCode.push(cond("reviewer", impl[0], "FAIL: style, data layer, error handling, security, or persistence"));
    refactorCode.push(cond("refactor", impl[0], "finding requires code changes"));
  } else {
    // Fullstack / multi-agent: split the code FAIL and code-change routes per impl agent.
    for (const a of impl) {
      reviewerCode.push(
        cond("reviewer", a, `FAIL: ${a} code (style, data layer, error handling, security, or persistence)`)
      );
    }
    for (const a of impl) {
      refactorCode.push(cond("refactor", a, `finding requires ${a} code changes`));
    }
  }

  edges.push(
    cond("reviewer", "refactor", "FAIL: code pattern violation or code redundancy"),
    cond("reviewer", "test", "FAIL: a test"),
    ...reviewerCode,
    cond("refactor", "scribe", "finding is a recurring pattern an agent should know going forward"),
    ...refactorCode,
    cond(
      "refactor",
      "reviewer",
      "triggered by reviewer on a systemic FAIL; notify when delegation is complete so it can re-review"
    )
  );

  return { name, nodes, edges };
}

// Build a simple linear happy-path workflow: main-session → each step in order, success edges only.
// Step ids: "human_review-1" → human_review node; "skill:<id>" → skill node (run inline by the
// orchestrator); anything else → an agent node whose instance == the id.
function linearWorkflow(name: string, steps: string[], skillCount: SkillCount = () => 0): AfkWorkflowV3 {
  let y = BASE_STEP;
  const nodes: AfkNodeV3[] = steps.map((step): AfkNodeV3 => {
    const position = { x: 0, y };
    let node: AfkNodeV3;
    let skills = 0;
    if (step === "human_review-1") {
      node = { id: step, type: "human_review", position };
    } else if (step.startsWith("skill:")) {
      const skill = step.slice("skill:".length);
      node = { id: skill, type: "skill", skill, position };
    } else {
      node = { id: step, type: "agent", instance: step, position };
      skills = skillCount(step);
    }
    y += BASE_STEP + skills * PER_SKILL_STEP;
    return node;
  });
  const seq = ["main-session", ...nodes.map((n) => n.id)];
  const edges: AfkEdgeV3[] = [];
  for (let i = 0; i < seq.length - 1; i++) edges.push(succ(seq[i], seq[i + 1]));
  return { name, nodes, edges };
}

// "Tests" workflow: happy path @test → @reviewer → @scribe, plus two reviewer fix routes through
// the implementation agent(s), both of which re-run @test once the code changes land:
//   • simple fix: @reviewer → @<impl> directly;
//   • bigger finding: @reviewer → @refactor → @<impl> (delegate the refactor before re-testing).
// Splits per-agent when impl.length > 1 (fullstack).
function buildTestsWorkflow(name: string, impl: string[], skillCount: SkillCount = () => 0): AfkWorkflowV3 {
  const column = ["test", "reviewer", "scribe"];
  const colNodes = columnNodes(column, skillCount);
  const reviewerY = colNodes.find((n) => n.id === "reviewer")?.position?.y ?? BASE_STEP;
  // Side column: refactor on the reviewer's row, then the impl agent(s) stacked below it,
  // each offset by its own skill height so a tall impl node doesn't overlap the next.
  const sideNodes: AfkNodeV3[] = [
    { id: "refactor", type: "agent", instance: "refactor", position: { x: 360, y: reviewerY } },
  ];
  let implY = reviewerY;
  for (const a of impl) {
    sideNodes.push({ id: a, type: "agent", instance: a, position: { x: 720, y: implY } });
    implY += BASE_STEP + skillCount(a) * PER_SKILL_STEP;
  }
  const nodes: AfkNodeV3[] = [...colNodes, ...sideNodes];

  const seq = ["main-session", ...column];
  const edges: AfkEdgeV3[] = [];
  for (let i = 0; i < seq.length - 1; i++) edges.push(succ(seq[i], seq[i + 1]));

  // Bigger finding: reviewer delegates to refactor before the impl agent(s) re-do the code.
  edges.push(cond("reviewer", "refactor", "FAIL: a finding big enough to delegate to the refactor agent"));

  if (impl.length === 1) {
    edges.push(cond("reviewer", impl[0], "FAIL: a simple code fix found while testing"));
    edges.push(cond("refactor", impl[0], "finding requires code changes"));
    edges.push(cond(impl[0], "test", "fix applied; re-run the tests"));
  } else {
    for (const a of impl) edges.push(cond("reviewer", a, `FAIL: a simple ${a} code fix found while testing`));
    for (const a of impl) edges.push(cond("refactor", a, `finding requires ${a} code changes`));
    for (const a of impl) edges.push(cond(a, "test", `${a} fix applied; re-run the tests`));
  }

  return { name, nodes, edges };
}

// Best-fit project-skill → seeded-agent assignments discovered at install time by the
// afk-install skill (one entry per agent the user checked skills for). Passed through the
// precompute file; see readSkillAssignments. Empty when no skills were found/selected.
export type SkillMap = Record<string, string[]>;

// Returned on first install (no afk.json yet). Seeds the bundled agents as reusable
// instances and wires them into two ready-to-use workflows ("default" + "tdd") so the
// canvas isn't empty. `implAgents` is the repo-detected implementation agent chain in the
// happy path (the kickstarter skill passes it via launch-ai-tools-manager-app.sh); falls back to ["backend"].
// `skillMap` attaches the install-time discovered project skills to their best-fit instance.
function defaultV3Config(implAgents: string[], skillMap: SkillMap = {}): AfkConfigV3 {
  const impl = implAgents.length > 0 ? implAgents : ["backend"];
  // Defensive: only attach skills to instances that actually exist in this seed.
  const skillsFor = (agent: string): string[] => Array.from(new Set(skillMap[agent] ?? [])).filter(Boolean);
  // Install-time discovered skills seed as referenced (the default mode); promote in the canvas.
  const instances: AfkInstanceV3[] = [
    ...impl.map((a) => ({ name: a, agent: a, loaded_skills: [], referenced_skills: skillsFor(a) })),
    ...CORE_INSTANCES.map((i) => ({ ...i, referenced_skills: skillsFor(i.name) })),
  ];
  const agentsAvailable = Array.from(new Set([...impl, "test", "reviewer", "refactor", "scribe"])).sort();
  // skills_available = the always-present gate skill + every skill assigned to an instance.
  const skillsAvailable = Array.from(
    new Set(["use-design-check", ...instances.flatMap((i) => [...i.loaded_skills, ...i.referenced_skills])])
  );
  // Vertical spacing in the seeded layout grows with each instance's skill count.
  const skillCount: SkillCount = (name) => skillsFor(name).length;
  return {
    version: 3,
    agents_available: agentsAvailable,
    skills_available: skillsAvailable,
    main_session_loaded_skills: [],
    workflow_instances: instances,
    workflows: [
      buildWorkflow("default", "default", impl, skillCount),
      buildWorkflow("tdd", "tdd", impl, skillCount),
      linearWorkflow("Refactor", ["skill:use-design-check", "human_review-1", "refactor"], skillCount),
      linearWorkflow("Documentation", ["scribe"], skillCount),
      linearWorkflow("Review", ["reviewer"], skillCount),
      buildTestsWorkflow("Tests", impl, skillCount),
    ],
    rules: [],
  };
}

// Implementation agent(s) for the seeded workflows' happy path. Under Docker the kickstarter
// skill analyzes the repo and passes them through the marketplace precompute file (see
// launch-ai-tools-manager-app.sh's AFK_IMPL_AGENTS handling). Falls back to ["backend"].
function readImplAgents(): string[] {
  if (process.env.RUNNING_IN_DOCKER === "true") {
    try {
      const data = JSON.parse(fs.readFileSync("/tmp/marketplace-data.json", "utf8")) as { implAgents?: string[] };
      if (Array.isArray(data.implAgents) && data.implAgents.length > 0) return data.implAgents;
    } catch {
      // fall through to the default
    }
  }
  return ["backend"];
}

// Install-time project-skill → seeded-agent assignments, mirroring readImplAgents: the
// afk-install skill discovers/maps them and passes a JSON object via AFK_SKILL_MAP, which
// launch-ai-tools-manager-app.sh writes into the precompute file as `skillMap`. Empty by default.
function readSkillAssignments(): SkillMap {
  if (process.env.RUNNING_IN_DOCKER === "true") {
    try {
      const data = JSON.parse(fs.readFileSync("/tmp/marketplace-data.json", "utf8")) as { skillMap?: SkillMap };
      if (data.skillMap && typeof data.skillMap === "object") return data.skillMap;
    } catch {
      // fall through to the default
    }
  }
  return {};
}

function readConfig(jsonPath: string, implAgents: string[] = ["backend"], skillMap: SkillMap = {}): AfkConfigV3 {
  if (!fs.existsSync(jsonPath)) return defaultV3Config(implAgents, skillMap);
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
    if (n.type === "skill") return "/" + (n.skill ?? n.id);
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
  const config = readConfig(
    path.join(mountedProjectPath(cwd), ".claude", "afk.json"),
    readImplAgents(),
    readSkillAssignments()
  );
  const [bundledAgents, projectSkills] = await Promise.all([discoverAgents(cwd), discoverSkills(cwd)]);
  return { config, cwd, bundledAgents, projectSkills };
});

export const submitAfkConfig = createServerFn({ method: "POST" })
  .inputValidator(
    (data: unknown) =>
      data as { cwd: string; slice: AfkWorkflowsSlice | AfkRulesSlice; sliceType: "workflows" | "rules" }
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
      })
    );
    return { ok: true };
  });
