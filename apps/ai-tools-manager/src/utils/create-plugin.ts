import { createServerFn } from "@tanstack/react-start";
import fs from "fs";
import { getKnownMarketplaces } from "@repo/claude-fs";

interface FormPayload {
  name: string;
  description: string;
  keywords: string[];
  marketplace: string;
}

export const submitPluginForm = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as FormPayload)
  .handler(async ({ data }) => {
    const resultFile = process.env.RESULT_FILE ?? "/tmp/result.json";
    const knownMarketplaces = await getKnownMarketplaces();
    const marketplacePath = knownMarketplaces[data.marketplace]?.installLocation ?? "";
    fs.writeFileSync(resultFile, JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptExpansion",
        additionalContext: `Plugin form data: ${JSON.stringify({
          name: data.name.trim(),
          description: data.description.trim(),
          keywords: data.keywords,
          marketplacePath,
        })}`,
      },
    }));
    return { ok: true };
  });

export const cancelPluginForm = createServerFn({ method: "POST" }).handler(async () => {
  const resultFile = process.env.RESULT_FILE ?? "/tmp/result.json";
  fs.writeFileSync(resultFile, JSON.stringify({ decision: "block", reason: "Plugin creation cancelled." }));
  return { ok: true };
});
