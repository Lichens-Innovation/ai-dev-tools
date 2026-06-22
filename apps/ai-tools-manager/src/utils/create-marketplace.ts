import { createServerFn } from "@tanstack/react-start";
import { scaffoldMarketplace } from "./scaffold";
import { writeCreateResult, writeCancelResult } from "./create-result";

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
    const payload: Record<string, unknown> = {
      name: data.name.trim(),
      description: data.description.trim(),
      ownerName: data.ownerName.trim(),
      ownerEmail: data.ownerEmail.trim(),
      targetDir: data.targetDir.trim(),
      privateRepo: data.privateRepo,
    };
    if (data.homepage.trim()) payload.homepage = data.homepage.trim();

    // Deterministic pre-scaffold: write the marketplace.json manifest + README (when the target
    // dir is reachable — a brand-new external dir under Docker degrades to dispatcher-side).
    const scaffold = scaffoldMarketplace({
      name: data.name.trim(),
      description: data.description.trim(),
      ownerName: data.ownerName.trim(),
      ownerEmail: data.ownerEmail.trim(),
      homepage: data.homepage.trim() || undefined,
      targetDir: data.targetDir.trim(),
    });

    writeCreateResult({
      action: "create-marketplace",
      label: "Marketplace",
      formData: JSON.stringify(payload),
      scaffold,
    });
    return { ok: true };
  });

export const cancelMarketplaceForm = createServerFn({ method: "POST" }).handler(async () => {
  writeCancelResult("create-marketplace", "Marketplace creation cancelled.");
  return { ok: true };
});
