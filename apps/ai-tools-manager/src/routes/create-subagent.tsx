import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";
import fs from "fs";
import { getKnownMarketplaces, getLocalMarketplaces, getMarketplacePluginsFromPath } from "@repo/claude-fs";
import { Page, ModeCard, Divider, Field, Input, Select, DoneScreen, FormActions, inputStyle } from "../components/form-ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Mode = "auto" | "manual";

interface MarketplaceData {
  marketplaces: string[];
  byMarketplace: Record<string, string[]>;
}

interface FormPayload {
  mode: Mode;
  name?: string;
  idea?: string;
  description?: string;
  triggers?: string;
  tools?: string;
  marketplace: string;
  plugin: string;
}

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

const getMarketplaceData = createServerFn({ method: "GET" }).handler(async (): Promise<MarketplaceData> => {
  if (process.env.RUNNING_IN_DOCKER) {
    return JSON.parse(fs.readFileSync("/tmp/marketplace-data.json", "utf8")) as MarketplaceData;
  }

  const localMarketplaces = await getLocalMarketplaces();
  const byMarketplace: Record<string, string[]> = {};
  for (const [name, marketplace] of Object.entries(localMarketplaces)) {
    byMarketplace[name] = await getMarketplacePluginsFromPath(marketplace.installLocation);
  }
  return { marketplaces: Object.keys(localMarketplaces), byMarketplace };
});

const submitSubagentForm = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as FormPayload)
  .handler(async ({ data }) => {
    const resultFile = process.env.RESULT_FILE ?? "/tmp/result.json";
    const knownMarketplaces = await getKnownMarketplaces();
    const marketplacePath = knownMarketplaces[data.marketplace]?.installLocation ?? "";

    const formData = JSON.stringify({
      mode: data.mode,
      ...(data.mode === "auto"
        ? { name: data.name?.trim() || undefined, idea: data.idea?.trim() }
        : {
            name: data.name?.trim(),
            description: data.description?.trim(),
            triggers: data.triggers?.trim(),
            tools: data.tools?.trim(),
          }),
      marketplacePath,
      plugin: data.plugin,
    });

    fs.writeFileSync(
      resultFile,
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptExpansion",
          additionalContext: `Subagent form data: ${formData}`,
        },
      })
    );
    return { ok: true };
  });

const cancelSubagentForm = createServerFn({ method: "POST" }).handler(async () => {
  const resultFile = process.env.RESULT_FILE ?? "/tmp/result.json";
  fs.writeFileSync(resultFile, JSON.stringify({ decision: "block", reason: "Subagent creation cancelled." }));
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/create-subagent")({
  loader: () => getMarketplaceData(),
  component: CreateSubagent,
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function CreateSubagent() {
  const { marketplaces, byMarketplace } = Route.useLoaderData();

  const [screen, setScreen] = useState<"form" | "success" | "cancelled">("form");
  const [mode, setMode] = useState<Mode>("auto");
  const [name, setName] = useState("");
  const [idea, setIdea] = useState("");
  const [description, setDescription] = useState("");
  const [triggers, setTriggers] = useState("");
  const [tools, setTools] = useState("");
  const [marketplace, setMarketplace] = useState(marketplaces[0] ?? "");
  const [plugin, setPlugin] = useState(byMarketplace[marketplaces[0] ?? ""]?.[0] ?? "");
  const [submitting, setSubmitting] = useState(false);

  const plugins = byMarketplace[marketplace] ?? [];

  function handleMarketplaceChange(value: string) {
    setMarketplace(value);
    setPlugin(byMarketplace[value]?.[0] ?? "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await submitSubagentForm({ data: { mode, name, idea, description, triggers, tools, marketplace, plugin } });
    setScreen("success");
  }

  async function handleCancel() {
    await cancelSubagentForm({ data: undefined });
    setScreen("cancelled");
  }

  if (screen === "success") return <DoneScreen title="Done! You can close this tab." subtitle="Returning control to Claude…" />;
  if (screen === "cancelled") return <DoneScreen title="Cancelled." subtitle="You can close this tab." />;

  return (
    <Page>
      <h1 className="mb-1.5 text-lg font-semibold tracking-tight text-(--ink)">New Subagent</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--ink-3)" }}>
        Choose how you want to create the subagent.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
        <div className="flex-1">
          <div className="mb-7 grid grid-cols-2 gap-2.5">
            <ModeCard
              active={mode === "auto"}
              onClick={() => setMode("auto")}
              title="Auto"
              description="Describe your idea in plain language. Claude generates the subagent name, role description, and full workflow for you."
            />
            <ModeCard
              active={mode === "manual"}
              onClick={() => setMode("manual")}
              title="Manual"
              description="Provide the name, role description, trigger conditions, and tools yourself. Claude creates a structured template you fill in."
            />
          </div>

          <Divider />

          {mode === "auto" && (
            <>
              <Field label="Subagent name" hint="kebab-case — leave blank to let Claude derive one from your idea">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-agent"
                  pattern="[a-z][a-z0-9-]*"
                />
              </Field>
              <Field label="Describe your subagent idea">
                <textarea
                  required
                  rows={6}
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  placeholder="e.g. A subagent that audits pull requests for security issues — checks for hardcoded secrets, missing input validation, and unsafe dependencies."
                  className="input resize-y"
                  style={inputStyle}
                />
              </Field>
            </>
          )}

          {mode === "manual" && (
            <>
              <Field label="Subagent name" hint="kebab-case, e.g. security-reviewer">
                <Input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-agent"
                  pattern="[a-z][a-z0-9-]*"
                />
              </Field>
              <Field label="Role description">
                <Input
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this subagent does"
                />
              </Field>
              <Field label="When to apply">
                <Input
                  required
                  value={triggers}
                  onChange={(e) => setTriggers(e.target.value)}
                  placeholder='e.g. "user asks to review a PR for security"'
                />
              </Field>
              <Field label="Tools" hint="comma-separated list of tools the agent should use">
                <Input
                  value={tools}
                  onChange={(e) => setTools(e.target.value)}
                  placeholder="e.g. Bash, Read, WebSearch"
                />
              </Field>
            </>
          )}

          <Divider />

          <Field label="Marketplace">
            <Select value={marketplace} onChange={(e) => handleMarketplaceChange(e.target.value)}>
              {marketplaces.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Plugin">
            <Select value={plugin} onChange={(e) => setPlugin(e.target.value)}>
              {plugins.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <FormActions onCancel={handleCancel} submitLabel="Create Subagent" submitting={submitting} />
      </form>
    </Page>
  );
}
