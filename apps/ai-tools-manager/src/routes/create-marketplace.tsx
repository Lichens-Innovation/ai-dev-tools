import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";
import fs from "fs";
import { Page, Divider, Field, Input, DoneScreen, FormActions, inputStyle } from "../components/form-ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MarketplaceDefaults {
  cwd: string;
}

interface FormPayload {
  name: string;
  description: string;
  ownerName: string;
  ownerEmail: string;
  homepage: string;
  targetDir: string;
  privateRepo: boolean;
}

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

const getMarketplaceDefaults = createServerFn({ method: "GET" }).handler(async (): Promise<MarketplaceDefaults> => {
  if (process.env.RUNNING_IN_DOCKER) {
    const data = JSON.parse(fs.readFileSync("/tmp/marketplace-data.json", "utf8"));
    return { cwd: data.cwd ?? "" };
  }
  return { cwd: "" };
});

const submitMarketplaceForm = createServerFn({ method: "POST" })
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

    fs.writeFileSync(
      resultFile,
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptExpansion",
          additionalContext: `Marketplace form data: ${JSON.stringify(payload)}`,
        },
      })
    );
    return { ok: true };
  });

const cancelMarketplaceForm = createServerFn({ method: "POST" }).handler(async () => {
  const resultFile = process.env.RESULT_FILE ?? "/tmp/result.json";
  fs.writeFileSync(resultFile, JSON.stringify({ decision: "block", reason: "Marketplace creation cancelled." }));
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/create-marketplace")({
  loader: () => getMarketplaceDefaults(),
  component: CreateMarketplace,
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function CreateMarketplace() {
  const { cwd } = Route.useLoaderData();

  const [screen, setScreen] = useState<"form" | "success" | "cancelled">("form");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [homepage, setHomepage] = useState("");
  const [targetDir, setTargetDir] = useState(cwd);
  const [privateRepo, setPrivateRepo] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await submitMarketplaceForm({ data: { name, description, ownerName, ownerEmail, homepage, targetDir, privateRepo } });
    setScreen("success");
  }

  async function handleCancel() {
    await cancelMarketplaceForm({ data: undefined });
    setScreen("cancelled");
  }

  if (screen === "success") return <DoneScreen title="Done! You can close this tab." subtitle="Returning control to Claude…" />;
  if (screen === "cancelled") return <DoneScreen title="Cancelled." subtitle="You can close this tab." />;

  return (
    <Page>
      <h1 className="mb-1.5 text-lg font-semibold tracking-tight text-(--ink)">New Marketplace</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--ink-3)" }}>
        Scaffold a new plugin marketplace with manifest and documentation.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
        <div className="flex-1">
          <Field label="Marketplace name" hint="kebab-case, e.g. my-tools">
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-tools"
              pattern="[a-z][a-z0-9-]*"
            />
          </Field>
          <Field label="Description">
            <Input
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this marketplace provides"
            />
          </Field>

          <Divider />

          <Field label="Owner name">
            <Input
              required
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="Your name or organization"
            />
          </Field>
          <Field label="Owner email">
            <Input
              required
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <Field label="Homepage" hint="optional">
            <Input
              value={homepage}
              onChange={(e) => setHomepage(e.target.value)}
              placeholder="https://github.com/you/my-tools"
            />
          </Field>

          <Divider />

          <Field label="Target directory" hint="where to create the marketplace folder">
            <Input
              required
              value={targetDir}
              onChange={(e) => setTargetDir(e.target.value)}
              placeholder="/path/to/my-tools"
            />
          </Field>
          <div className="mb-4.5 flex items-center gap-2.5">
            <input
              id="private-repo"
              type="checkbox"
              checked={privateRepo}
              onChange={(e) => setPrivateRepo(e.target.checked)}
              style={{
                width: 16,
                height: 16,
                accentColor: "var(--primary)",
                cursor: "pointer",
              }}
            />
            <label
              htmlFor="private-repo"
              className="cursor-pointer text-sm"
              style={{ color: "var(--ink)" }}
            >
              Private repository
            </label>
            <span className="text-xs" style={{ color: "var(--ink-3)" }}>
              — adds token-based auth setup instructions
            </span>
          </div>
        </div>

        <FormActions onCancel={handleCancel} submitLabel="Create Marketplace" submitting={submitting} />
      </form>
    </Page>
  );
}
