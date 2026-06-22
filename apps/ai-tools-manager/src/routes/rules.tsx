import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import Button from "@repo/ui/button";
import { Sparkles } from "lucide-react";
import { toast } from "@repo/ui/toast";
import TopNav from "../components/top-nav";
import RuleTree from "../components/rule-tree";
import ChipMultiSelect from "../components/chip-multi-select";
import {
  getAfkConfig,
  submitAfkConfig,
  type AfkConfigV3,
  type AfkRuleV3,
  type AfkConfigResult,
} from "../utils/agents-framework-kickstarter";
import { getProjectTree, type TreeNode } from "../utils/afk-tree";
import { getProjectRules, type ProjectRule } from "../utils/afk-rules";
import { getVibeRules } from "../utils/afk-vibe";

type RuleSource = "project" | "vibe-rules";

interface RulesLoaderData extends AfkConfigResult {
  tree: TreeNode[];
  availableRules: ProjectRule[];
  vibeRules: string[];
}

export const Route = createFileRoute("/rules")({
  loader: async (): Promise<RulesLoaderData> => {
    const [configData, tree, availableRules, vibeRules] = await Promise.all([
      getAfkConfig(),
      getProjectTree(),
      getProjectRules(),
      getVibeRules(),
    ]);
    return { ...configData, tree, availableRules, vibeRules };
  },
  component: RulesPage,
});

type Phase = "idle" | "saving";

function RulesPage() {
  const loaderData = Route.useLoaderData() as RulesLoaderData;
  const { cwd, tree, availableRules, vibeRules } = loaderData;

  const [config, setConfig] = useState<AfkConfigV3>(loaderData.config);
  const [phase, setPhase] = useState<Phase>("idle");

  // IDs of rules the user has "selected" (toggled on) — the pool the tree can assign.
  const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>(
    loaderData.config.rules.map((r) => r.id),
  );

  const projectRuleIds = useMemo(() => availableRules.map((r) => r.id), [availableRules]);

  // Source lookup. A project rule (on-disk file) wins over a same-named vibe-rules entry,
  // since it's a real file we can move. The vibe section only lists ids that resolve to
  // "vibe-rules" so a name present in both doesn't appear twice.
  const ruleSource = useMemo(() => {
    const map: Record<string, RuleSource> = {};
    for (const id of projectRuleIds) map[id] = "project";
    for (const id of vibeRules) if (!(id in map)) map[id] = "vibe-rules";
    return map;
  }, [projectRuleIds, vibeRules]);

  const vibeOnlyIds = useMemo(
    () => vibeRules.filter((id) => ruleSource[id] === "vibe-rules"),
    [vibeRules, ruleSource],
  );

  const selectedProject = selectedRuleIds.filter((id) => projectRuleIds.includes(id));
  const selectedVibe = selectedRuleIds.filter((id) => vibeOnlyIds.includes(id));

  // Toggle selection within one source group, leaving the other group's selection intact.
  // De-selecting a rule also drops any assignment it had (config.rules is pruned to the
  // still-selected ids) — removing it from the menu unassigns it everywhere.
  const setGroupSelection = (groupIds: string[], next: string[]) => {
    const others = selectedRuleIds.filter((id) => !groupIds.includes(id));
    const merged = [...others, ...next];
    setSelectedRuleIds(merged);
    setConfig((c) => ({ ...c, rules: c.rules.filter((r) => merged.includes(r.id)) }));
  };

  // One location per rule: assigning replaces any prior assignment of the same id
  // (root or another path), so re-assigning effectively MOVES it. Source is stamped
  // from the lookup so the host-side apply step knows move-file vs vibe-rules-load.
  const handleAssign = (assignment: AfkRuleV3) => {
    setConfig((c) => ({
      ...c,
      rules: [
        ...c.rules.filter((r) => r.id !== assignment.id),
        { ...assignment, source: ruleSource[assignment.id] ?? "project" },
      ],
    }));
  };

  const handleUnassign = (ruleId: string) => {
    setConfig((c) => ({ ...c, rules: c.rules.filter((r) => r.id !== ruleId) }));
  };

  const handleSubmit = async () => {
    setPhase("saving");
    await submitAfkConfig({
      data: {
        cwd,
        sliceType: "rules",
        slice: { cwd, rules: config.rules },
      },
    });
    toast(
      <>
        Rules saved to{" "}
        <span className="font-mono text-(--ink)">{(cwd || "<cwd>").replace(/\/+$/, "")}/.claude/afk.json</span> and moved
        into their assigned directories.
      </>,
    );
    setPhase("idle");
  };

  return (
    <div className="w-full h-screen bg-(--bg) font-sans text-(--ink) overflow-hidden flex flex-col">
      <TopNav />

      <div
        className="flex-1 grid overflow-hidden"
        style={{ gridTemplateColumns: "280px 1fr" }}
      >
        {/* Left pane */}
        <div className="border-r border-(--line) overflow-y-auto flex flex-col p-4 gap-4">
          <div>
            <div className="text-[11px] font-semibold text-subtle uppercase tracking-wide mb-2">
              Available rules
            </div>
            {projectRuleIds.length === 0 ? (
              <p className="text-[12px] text-subtle">
                No rules found under{" "}
                <span className="font-mono">{(cwd || "<cwd>").replace(/\/+$/, "")}/.claude/rules/</span>. Create{" "}
                <span className="font-mono">.md</span> files there to see them here.
              </p>
            ) : (
              <ChipMultiSelect
                options={projectRuleIds}
                value={selectedProject}
                onChange={(next) => setGroupSelection(projectRuleIds, next)}
                emptyText="No rules found."
              />
            )}
          </div>

          <div>
            <div className="text-[11px] font-semibold text-subtle uppercase tracking-wide mb-2">
              Installable rules (vibe-rules)
            </div>
            {vibeOnlyIds.length === 0 ? (
              <p className="text-[12px] text-subtle">
                None found via <span className="font-mono">vibe-rules list</span>. These are installed into the
                assigned directory with <span className="font-mono">vibe-rules load</span> on save.
              </p>
            ) : (
              <ChipMultiSelect
                options={vibeOnlyIds}
                value={selectedVibe}
                onChange={(next) => setGroupSelection(vibeOnlyIds, next)}
                emptyText="No installable rules."
              />
            )}
          </div>

          {selectedRuleIds.length > 0 && (
            <p className="text-[12px] text-subtle">
              Use the directory tree on the right to assign selected rules to paths. Each rule lives in one
              place — assigning it elsewhere moves it.
            </p>
          )}

          <div className="flex-1" />

          <Button
            variant="primary"
            icon={phase === "idle" ? <Sparkles size={14} /> : undefined}
            loading={phase === "saving"}
            onClick={() => void handleSubmit()}
          >
            {phase === "saving" ? "Saving…" : "Save rules"}
          </Button>
        </div>

        {/* Center — tree */}
        <div className="overflow-y-auto p-4">
          {selectedRuleIds.length === 0 ? (
            <div className="flex items-center justify-center h-full text-(--ink-2) text-[13px]">
              Select rules on the left to assign them to paths.
            </div>
          ) : (
            <RuleTree
              tree={tree}
              rules={availableRules}
              selectedRuleIds={selectedRuleIds}
              ruleAssignments={config.rules}
              ruleSource={ruleSource}
              onAssign={handleAssign}
              onUnassign={handleUnassign}
            />
          )}
        </div>
      </div>
    </div>
  );
}
