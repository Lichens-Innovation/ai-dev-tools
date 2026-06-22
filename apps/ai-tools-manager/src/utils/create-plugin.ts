import { createServerFn } from "@tanstack/react-start";
import { getKnownMarketplaces } from "@repo/claude-fs";
import { scaffoldPlugin } from "./scaffold";
import { writeCreateResult, writeCancelResult } from "./create-result";

interface FormPayload {
  name: string;
  description: string;
  keywords: string[];
  marketplace: string;
}

export const submitPluginForm = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as FormPayload)
  .handler(async ({ data }) => {
    const knownMarketplaces = await getKnownMarketplaces();
    const marketplacePath = knownMarketplaces[data.marketplace]?.installLocation ?? "";
    const formData = JSON.stringify({
      name: data.name.trim(),
      description: data.description.trim(),
      keywords: data.keywords,
      marketplacePath,
    });

    // Deterministic pre-scaffold: write plugin.json + skills/ and register in marketplace.json.
    const scaffold = scaffoldPlugin({
      name: data.name.trim(),
      description: data.description.trim(),
      keywords: data.keywords,
      marketplacePath,
    });

    writeCreateResult({ action: "create-plugin", label: "Plugin", formData, scaffold });
    return { ok: true };
  });

export const cancelPluginForm = createServerFn({ method: "POST" }).handler(async () => {
  writeCancelResult("create-plugin", "Plugin creation cancelled.");
  return { ok: true };
});
