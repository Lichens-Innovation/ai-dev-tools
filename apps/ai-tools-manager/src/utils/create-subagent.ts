import { createServerFn } from "@tanstack/react-start";
import fs from "fs";
import { getKnownMarketplaces } from "@repo/claude-fs";

interface FormPayload {
  mode: "auto" | "manual";
  target: "marketplace" | "project";
  name?: string;
  idea?: string;
  description?: string;
  triggers?: string[];
  tools?: string[];
  marketplace: string;
  plugin: string;
  cwd: string;
}

export const submitSubagentForm = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as FormPayload)
  .handler(async ({ data }) => {
    const resultFile = process.env.RESULT_FILE ?? "/tmp/result.json";
    const destination =
      data.target === "project"
        ? { projectPath: data.cwd }
        : {
            marketplacePath:
              (await getKnownMarketplaces())[data.marketplace]?.installLocation ?? "",
            plugin: data.plugin,
          };
    const formData = JSON.stringify({
      mode: data.mode,
      target: data.target,
      name: data.name?.trim() || undefined,
      ...(data.mode === "auto"
        ? { idea: data.idea?.trim() }
        : { description: data.description?.trim() }),
      triggers: data.triggers ?? [],
      tools: data.tools ?? [],
      ...destination,
    });
    fs.writeFileSync(resultFile, JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptExpansion",
        additionalContext: `Subagent form data: ${formData}`,
      },
    }));
    return { ok: true };
  });

export const cancelSubagentForm = createServerFn({ method: "POST" }).handler(async () => {
  const resultFile = process.env.RESULT_FILE ?? "/tmp/result.json";
  fs.writeFileSync(resultFile, JSON.stringify({ decision: "block", reason: "Subagent creation cancelled." }));
  return { ok: true };
});
