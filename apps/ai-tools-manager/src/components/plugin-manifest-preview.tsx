import FilePreview from "@repo/ui/file-preview";
import { FileJson } from "lucide-react";

interface PluginManifestPreviewProps {
  name: string;
  description: string;
  keywords: string[];
  marketplace: string;
}

export default function PluginManifestPreview({
  name,
  description,
  keywords,
  marketplace,
}: PluginManifestPreviewProps) {
  const displayName = name || "my-plugin";
  const desc = description.trim() || "<what this plugin provides>";
  const keywordLines =
    keywords.length === 0
      ? ['  "keywords": []']
      : [
          '  "keywords": [',
          ...keywords.map((k, i) => `    "${k}"${i < keywords.length - 1 ? "," : ""}`),
          "  ]",
        ];
  const lines = [
    "{",
    `  "name": "${displayName}",`,
    `  "description": "${desc}",`,
    ...keywordLines,
    "}",
  ];
  return (
    <FilePreview
      filename="plugin.json"
      fileIcon={<FileJson size={11} />}
      path={`${marketplace}/${displayName}/`}
      lines={lines}
    />
  );
}
