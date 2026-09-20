import { createServerFn } from "@tanstack/react-start";
import { getKnownMarketplaces } from "@repo/claude-fs";
import { scaffoldSkill } from "./scaffold";
import { writeCreateResult, writeCancelResult } from "./create-result";
import { titleFromName } from "./text";

interface FormPayload {
  mode: "auto" | "manual";
  target: "marketplace" | "project";
  name: string;
  idea: string;
  useWhen: string[];
  marketplace: string;
  plugin: string;
  cwd: string;
}

export const submitSkillForm = createServerFn({ method: "POST" })
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
    const name = data.name?.trim() || titleFromName(data.idea ?? "").split(" ")[0]?.toLowerCase() || "new-skill";
    const formData = JSON.stringify({
      mode: data.mode,
      target: data.target,
      name: data.name?.trim() || undefined,
      ...(data.mode === "auto"
        ? { idea: data.idea?.trim(), useWhen: data.useWhen }
        : { description: data.idea?.trim(), triggers: data.useWhen }),
      ...destination,
    });

    // Deterministic pre-scaffold: write the dir + frontmatter (+ skeleton for manual mode) now.
    const scaffold = scaffoldSkill({
      target: data.target,
      name,
      mode: data.mode,
      idea: data.idea?.trim() ?? "",
      triggers: data.useWhen ?? [],
      projectPath: "projectPath" in destination ? destination.projectPath : undefined,
      marketplacePath: "marketplacePath" in destination ? destination.marketplacePath : undefined,
      plugin: "plugin" in destination ? destination.plugin : undefined,
    });

    writeCreateResult({ action: "create-skill", label: "Skill", formData, scaffold });
    return { ok: true };
  });

export const cancelSkillForm = createServerFn({ method: "POST" }).handler(async () => {
  writeCancelResult("create-skill", "Skill creation cancelled.");
  return { ok: true };
});
