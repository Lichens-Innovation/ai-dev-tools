import { stringify } from "yaml";
import type { AfkConfigV3 } from "./agents-framework-kickstarter";
import { computeSuccessPath } from "./agents-framework-kickstarter";

// Single source of truth for rendering an AfkConfigV3 as human-readable afk.yaml.
// Used by the live preview, the server (local write), and passed to the skill so
// it writes the same text verbatim. The `yaml` package handles quoting/escaping of
// condition labels and glob paths that a hand-rolled serializer would mangle.
//
// `success_path` is DERIVED here (never stored in afk.json) and emitted per workflow
// as a human-readable convenience, matching the original plan's example.
export function afkConfigToYaml(config: AfkConfigV3): string {
  const doc: Record<string, unknown> = {
    version: config.version,
    agents_available: config.agents_available,
    skills_available: config.skills_available,
    main_session_loaded_skills: config.main_session_loaded_skills,
    workflow_instances: config.workflow_instances.map((i) => ({
      name: i.name,
      agent: i.agent,
      skills: i.skills,
    })),
    workflows: config.workflows.map((w) => {
      const successPath = computeSuccessPath(w, config.workflow_instances);
      return {
        name: w.name || "unnamed",
        ...(successPath ? { success_path: successPath } : {}),
        nodes: w.nodes.map((n) => ({
          id: n.id,
          type: n.type,
          ...(n.type === "agent" && n.instance ? { instance: n.instance } : {}),
          ...(n.type === "skill" && n.skill ? { skill: n.skill } : {}),
          ...(n.position ? { position: n.position } : {}),
        })),
        edges: w.edges.map((e) => ({
          from: e.from,
          to: e.to,
          kind: e.kind,
          ...(e.label ? { label: e.label } : {}),
        })),
      };
    }),
    rules: config.rules.map((r) => ({
      id: r.id,
      ...(r.scope ? { scope: r.scope } : {}),
      ...(r.paths && r.paths.length > 0 ? { paths: r.paths } : {}),
      ...(r.source ? { source: r.source } : {}),
    })),
  };

  return stringify(doc, { lineWidth: 0 });
}
