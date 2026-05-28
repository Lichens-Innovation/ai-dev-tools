import FilePreview from "@repo/ui/file-preview";
import { FileText } from "lucide-react";
import type {
  AfkAgent,
  AfkHandoff,
  AfkSkillRef,
  AfkStep,
  AfkWorkflow,
} from "../utils/agents-framework-kickstarter";

interface AfkYamlPreviewProps {
  agents: AfkAgent[];
  rules: string[];
  skills: AfkSkillRef[];
  workflows: AfkWorkflow[];
  handoffs: AfkHandoff[];
  cwd: string;
}

function yamlList(items: string[]): string[] {
  return items.length === 0 ? [] : items.map((i) => `- ${i}`);
}

function stepLines(step: AfkStep, indent: string): string[] {
  const lines = [`${indent}- type: ${step.type}`];
  if (step.id) lines.push(`${indent}  id: ${step.id}`);
  return lines;
}

export default function AfkYamlPreview({
  agents,
  rules,
  skills,
  workflows,
  handoffs,
  cwd,
}: AfkYamlPreviewProps) {
  const lines: string[] = ["version: 1"];

  // agents
  lines.push("agents:");
  if (agents.length === 0) {
    lines.push("  # <no agents selected>");
  } else {
    for (const a of agents) {
      lines.push(`- id: ${a.id}`);
      if (a.skills.length === 0) {
        lines.push("  skills: []");
      } else {
        lines.push("  skills:");
        for (const s of a.skills) lines.push(`  - ${s}`);
      }
    }
  }

  // rules
  lines.push("rules:");
  if (rules.length === 0) lines.push("  # <no rules>");
  else for (const r of yamlList(rules)) lines.push(r);

  // skills
  lines.push("skills:");
  if (skills.length === 0) {
    lines.push("  # <no skills selected>");
  } else {
    for (const s of skills) {
      lines.push(`- id: ${s.id}`);
      lines.push(`  source: ${s.source}`);
      lines.push(`  user_invocable: ${s.user_invocable ? "true" : "false"}`);
    }
  }

  // workflows
  lines.push("workflows:");
  if (workflows.length === 0) {
    lines.push("  # <no workflows>");
  } else {
    for (const w of workflows) {
      lines.push(`- name: ${w.name || "<unnamed>"}`);
      if (w.steps.length === 0) {
        lines.push("  steps: []");
      } else {
        lines.push("  steps:");
        for (const step of w.steps) for (const l of stepLines(step, "  ")) lines.push(l);
      }
    }
  }

  // handoffs
  lines.push("handoffs:");
  if (handoffs.length === 0) {
    lines.push("  # <no handoffs>");
  } else {
    for (const h of handoffs) {
      lines.push(`- scenario: ${h.scenario || "<unnamed>"}`);
      if (h.steps.length === 0) {
        lines.push("  steps: []");
      } else {
        lines.push("  steps:");
        for (const step of h.steps) for (const l of stepLines(step, "  ")) lines.push(l);
      }
    }
  }

  const path = `${(cwd || "<cwd>").replace(/\/+$/, "")}/afk.yaml`;
  return <FilePreview filename="afk.yaml" fileIcon={<FileText size={11} />} path={path} lines={lines} />;
}
