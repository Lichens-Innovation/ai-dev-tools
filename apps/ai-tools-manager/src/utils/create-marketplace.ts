import { createServerFn } from "@tanstack/react-start";
import fs from "fs";

interface FormPayload {
  name: string;
  description: string;
  ownerName: string;
  ownerEmail: string;
  homepage: string;
  targetDir: string;
  privateRepo: boolean;
}

export const submitMarketplaceForm = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as FormPayload)
  .handler(async ({ data }) => {
    const resultFile = process.env.RESULT_FILE ?? "/tmp/result.json";
    const payload: Record<string, unknown> = {
      name: data.name.trim(),
      description: data.description.trim(),
      ownerName: data.ownerName.trim(),
      ownerEmail: data.ownerEmail.trim(),
      targetDir: data.targetDir.trim(),
      privateRepo: data.privateRepo,
    };
    if (data.homepage.trim()) payload.homepage = data.homepage.trim();
    fs.writeFileSync(resultFile, JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptExpansion",
        additionalContext: `Marketplace form data: ${JSON.stringify(payload)}`,
      },
    }));
    return { ok: true };
  });

export const cancelMarketplaceForm = createServerFn({ method: "POST" }).handler(async () => {
  const resultFile = process.env.RESULT_FILE ?? "/tmp/result.json";
  fs.writeFileSync(resultFile, JSON.stringify({ decision: "block", reason: "Marketplace creation cancelled." }));
  return { ok: true };
});
