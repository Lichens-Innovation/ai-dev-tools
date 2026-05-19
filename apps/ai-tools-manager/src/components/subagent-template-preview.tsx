import FilePreview from "@repo/ui/file-preview";
import { FileText } from "lucide-react";
import { buildDesc, clip, titleFromName } from "../utils/text";

interface SubagentTemplatePreviewProps {
  mode: "auto" | "manual";
  target: "marketplace" | "project";
  name: string;
  idea: string;
  description: string;
  triggers: string[];
  tools: string[];
  marketplace: string;
  plugin: string;
  cwd: string;
}

export default function SubagentTemplatePreview({
  mode,
  target,
  name,
  idea,
  description,
  triggers,
  tools,
  marketplace,
  plugin,
  cwd,
}: SubagentTemplatePreviewProps) {
  const displayName = name || "my-agent";
  const source = mode === "auto" ? idea : description;
  const desc = clip(
    buildDesc(mode, source, triggers, {
      manualFallback: "<short description of what this subagent does>",
      whatFallback: "<what this subagent does>",
    }),
    140,
  );
  const toolsLine = tools.length ? tools.join(", ") : "<comma-separated tools>";
  const lines = [
    "---",
    `name: ${displayName}`,
    `description: ${desc}`,
    `tools: ${toolsLine}`,
    "---",
    "",
    `# ${titleFromName(displayName, "my-agent")}`,
    "",
    "## Role — workflow",
    "",
    "### When to apply",
    "",
    "<Claude will list triggers from your inputs>",
    "",
    "### Workflow",
    "",
    "<Claude will write the step-by-step workflow>",
    "",
    "### Output",
    "",
    "<Claude will describe the expected output format>",
  ];
  const isProject = target === "project";
  const filename = isProject ? `${displayName}.md` : "AGENTS.md";
  const path = isProject
    ? `${(cwd || "<cwd>").replace(/\/+$/, "")}/.claude/agents/`
    : `${marketplace}/${plugin}/agents/${displayName}/`;
  return (
    <FilePreview
      filename={filename}
      fileIcon={<FileText size={11} />}
      path={path}
      lines={lines}
    />
  );
}
