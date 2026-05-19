import FilePreview from "@repo/ui/file-preview";
import { FileJson } from "lucide-react";

interface MarketplaceManifestPreviewProps {
  name: string;
  description: string;
  ownerName: string;
  ownerEmail: string;
  homepage: string;
  targetDir: string;
}

export default function MarketplaceManifestPreview({
  name,
  description,
  ownerName,
  ownerEmail,
  homepage,
  targetDir,
}: MarketplaceManifestPreviewProps) {
  const displayName = name || "my-tools";
  const desc = description.trim() || "<what this marketplace provides>";
  const owner = ownerName.trim() || "<your name>";
  const email = ownerEmail.trim() || "<you@example.com>";
  const home = homepage.trim();
  const lines = [
    "{",
    `  "name": "${displayName}",`,
    `  "description": "${desc}",`,
    `  "owner": {`,
    `    "name": "${owner}",`,
    `    "email": "${email}"`,
    `  }${home ? "," : ""}`,
    ...(home ? [`  "homepage": "${home}"`] : []),
    "}",
  ];
  const path = (targetDir.trim() || "<target/dir>").replace(/\/+$/, "");
  return (
    <FilePreview
      filename="marketplace.json"
      fileIcon={<FileJson size={11} />}
      path={`${path}/${displayName}/`}
      lines={lines}
    />
  );
}
