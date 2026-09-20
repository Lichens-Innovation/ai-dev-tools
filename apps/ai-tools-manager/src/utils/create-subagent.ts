import { createServerFn } from "@tanstack/react-start";
import { getKnownMarketplaces } from "@repo/claude-fs";
import { scaffoldSubagent } from "./scaffold";
import { writeCreateResult, writeCancelResult } from "./create-result";
import { titleFromName } from "./text";

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
    const destination =
      data.target === "project"
        ? { projectPath: data.cwd }
        : {
            marketplacePath:
              (await getKnownMarketplaces())[data.marketplace]?.installLocation ?? "",
            plugin: data.plugin,
          };
    const ideaOrDesc = (data.mode === "auto" ? data.idea : data.description)?.trim() ?? "";
    const name = data.name?.trim() || titleFromName(ideaOrDesc).split(" ")[0]?.toLowerCase() || "new-agent";
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

    // Deterministic pre-scaffold: write the agent file frontmatter (+ skeleton for manual mode).
    const scaffold = scaffoldSubagent({
      target: data.target,
      name,
      mode: data.mode,
      idea: ideaOrDesc,
      triggers: data.triggers ?? [],
      tools: data.tools ?? [],
      projectPath: "projectPath" in destination ? destination.projectPath : undefined,
      marketplacePath: "marketplacePath" in destination ? destination.marketplacePath : undefined,
      plugin: "plugin" in destination ? destination.plugin : undefined,
    });

    writeCreateResult({ action: "create-subagent", label: "Subagent", formData, scaffold });
    return { ok: true };
  });

export const cancelSubagentForm = createServerFn({ method: "POST" }).handler(async () => {
  writeCancelResult("create-subagent", "Subagent creation cancelled.");
  return { ok: true };
});
