import FilePreview from "@repo/ui/file-preview";
import { FileText } from "lucide-react";
import { buildDesc, clip, titleFromName } from "../utils/text";

interface SkillTemplatePreviewProps {
  mode: "auto" | "manual";
  target: "marketplace" | "project";
  name: string;
  idea: string;
  useWhen: string[];
  marketplace: string;
  plugin: string;
  cwd: string;
}

export default function SkillTemplatePreview({
  mode,
  target,
  name,
  idea,
  useWhen,
  marketplace,
  plugin,
  cwd,
}: SkillTemplatePreviewProps) {
  const displayName = name || "my-skill";
  const description = clip(
    buildDesc(mode, idea, useWhen, {
      manualFallback: "<short description of what this skill does>",
      whatFallback: "<what this skill does>",
    }),
    140,
  );
  const lines = [
    "---",
    `name: ${displayName}`,
    `description: ${description}`,
    "---",
    "",
    `# ${titleFromName(displayName, "my-skill")}`,
    "",
    "## Quick start",
    "",
    "<Claude will write a minimal working example>",
    "",
    "## Workflows",
    "",
    "<Claude will write the step-by-step process>",
    "",
    "## Advanced features",
    "",
    "<linked from a REFERENCE.md if the skill grows>",
  ];
  const path =
    target === "project"
      ? `${(cwd || "<cwd>").replace(/\/+$/, "")}/.claude/skills/${displayName}/`
      : `${marketplace}/${plugin}/${displayName}/`;
  return <FilePreview filename="SKILL.md" fileIcon={<FileText size={11} />} path={path} lines={lines} />;
}
