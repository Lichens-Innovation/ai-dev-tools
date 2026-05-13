import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";
import fs from "fs";
import { getKnownMarketplaces, getLocalMarketplaces } from "@repo/claude-fs";
import { Page, Divider, Field, Input, Select, DoneScreen, FormActions } from "../components/form-ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MarketplaceList {
  marketplaces: string[];
}

interface FormPayload {
  name: string;
  description: string;
  keywords: string;
  marketplace: string;
}

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

const getMarketplaceList = createServerFn({ method: "GET" }).handler(async (): Promise<MarketplaceList> => {
  try {
    const data = JSON.parse(fs.readFileSync("/tmp/marketplace-data.json", "utf8"));
    if (data.marketplaces?.length > 0) return { marketplaces: data.marketplaces };
  } catch { /* fall through */ }

  const localMarketplaces = await getLocalMarketplaces();
  return { marketplaces: Object.keys(localMarketplaces) };
});

const submitPluginForm = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as FormPayload)
  .handler(async ({ data }) => {
    const resultFile = process.env.RESULT_FILE ?? "/tmp/result.json";
    const knownMarketplaces = await getKnownMarketplaces();
    const marketplacePath = knownMarketplaces[data.marketplace]?.installLocation ?? "";

    fs.writeFileSync(
      resultFile,
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptExpansion",
          additionalContext: `Plugin form data: ${JSON.stringify({
            name: data.name.trim(),
            description: data.description.trim(),
            keywords: data.keywords.trim(),
            marketplacePath,
          })}`,
        },
      })
    );
    return { ok: true };
  });

const cancelPluginForm = createServerFn({ method: "POST" }).handler(async () => {
  const resultFile = process.env.RESULT_FILE ?? "/tmp/result.json";
  fs.writeFileSync(resultFile, JSON.stringify({ decision: "block", reason: "Plugin creation cancelled." }));
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/create-plugin")({
  loader: () => getMarketplaceList(),
  component: CreatePlugin,
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function CreatePlugin() {
  const { marketplaces } = Route.useLoaderData();

  const [screen, setScreen] = useState<"form" | "success" | "cancelled">("form");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState("");
  const [marketplace, setMarketplace] = useState(marketplaces[0] ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await submitPluginForm({ data: { name, description, keywords, marketplace } });
    setScreen("success");
  }

  async function handleCancel() {
    await cancelPluginForm({ data: undefined });
    setScreen("cancelled");
  }

  if (screen === "success") return <DoneScreen title="Done! You can close this tab." subtitle="Returning control to Claude…" />;
  if (screen === "cancelled") return <DoneScreen title="Cancelled." subtitle="You can close this tab." />;

  return (
    <Page>
      <h1 className="mb-1.5 text-lg font-semibold tracking-tight text-white">New Plugin</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--color-text-muted)" }}>
        Scaffold a new plugin and register it in the marketplace.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
        <div className="flex-1">
          <Field label="Plugin name" hint="kebab-case, e.g. my-plugin">
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-plugin"
              pattern="[a-z][a-z0-9-]*"
            />
          </Field>
          <Field label="Description">
            <Input
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this plugin provides"
            />
          </Field>
          <Field label="Keywords" hint="comma-separated, e.g. testing, automation">
            <Input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="e.g. testing, automation"
            />
          </Field>

          <Divider />

          <Field label="Marketplace">
            <Select value={marketplace} onChange={(e) => setMarketplace(e.target.value)}>
              {marketplaces.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <FormActions onCancel={handleCancel} submitLabel="Create Plugin" submitting={submitting} />
      </form>
    </Page>
  );
}
