import FilePreview from "@repo/ui/file-preview";
import { FileText } from "lucide-react";
import type { AfkConfigV3 } from "../utils/agents-framework-kickstarter";
import { afkConfigToYaml } from "../utils/afk-yaml";

interface AfkYamlPreviewProps {
  config: AfkConfigV3;
  cwd: string;
}

export default function AfkYamlPreview({ config, cwd }: AfkYamlPreviewProps) {
  // The preview renders the exact text the skill will write to afk.yaml.
  const lines = afkConfigToYaml(config).replace(/\n$/, "").split("\n");
  const filePath = `${(cwd || "<cwd>").replace(/\/+$/, "")}/afk.yaml`;
  return <FilePreview filename="afk.yaml" fileIcon={<FileText size={11} />} path={filePath} lines={lines} />;
}
