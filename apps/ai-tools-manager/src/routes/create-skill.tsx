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
  marketplace: string;
  plugin: string;
}

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

const getMarketplaceData = createServerFn({ method: "GET" }).handler(async (): Promise<MarketplaceData> => {
  // Primary: read pre-computed data written by the host-side hook script.
  // The hook has full filesystem access and resolves all local marketplace paths.
  try {
    const data = JSON.parse(fs.readFileSync("/tmp/marketplace-data.json", "utf8")) as MarketplaceData;
    if (data.marketplaces.length > 0) return data;
  } catch { /* not running via hook, fall through */ }

  // Fallback for non-container / local dev environments where paths are accessible.
  const localMarketplaces = await getLocalMarketplaces();
  const byMarketplace: Record<string, string[]> = {};
  for (const [name, marketplace] of Object.entries(localMarketplaces)) {
    byMarketplace[name] = await getMarketplacePluginsFromPath(marketplace.installLocation);
  }
  return { marketplaces: Object.keys(localMarketplaces), byMarketplace };
});

const submitSkillForm = createServerFn({ method: "POST" })
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
          }),
      marketplacePath,
      plugin: data.plugin,
    });

    fs.writeFileSync(
      resultFile,
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptExpansion",
          additionalContext: `Skill form data: ${formData}`,
        },
      })
    );
    return { ok: true };
  });

const cancelSkillForm = createServerFn({ method: "POST" }).handler(async () => {
  const resultFile = process.env.RESULT_FILE ?? "/tmp/result.json";
  fs.writeFileSync(resultFile, JSON.stringify({ decision: "block", reason: "Skill creation cancelled." }));
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/create-skill")({
  loader: () => getMarketplaceData(),
  component: CreateSkill,
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function CreateSkill() {
  const { marketplaces, byMarketplace } = Route.useLoaderData();

  const [screen, setScreen] = useState<"form" | "success" | "cancelled">("form");
  const [mode, setMode] = useState<Mode>("auto");
  const [name, setName] = useState("");
  const [idea, setIdea] = useState("");
  const [description, setDescription] = useState("");
  const [triggers, setTriggers] = useState("");
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
    await submitSkillForm({
      data: { mode, name, idea, description, triggers, marketplace, plugin },
    });
    setScreen("success");
  }

  async function handleCancel() {
    await cancelSkillForm({ data: undefined });
    setScreen("cancelled");
  }

  if (screen === "success") return <DoneScreen title="Done! You can close this tab." subtitle="Returning control to Claude…" />;
  if (screen === "cancelled") return <DoneScreen title="Cancelled." subtitle="You can close this tab." />;

  return (
    <Page>
      <h1 className="mb-1.5 text-lg font-semibold tracking-tight text-white">New Skill</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--color-text-muted)" }}>
        Choose how you want to create the skill.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
        <div className="flex-1">
          {/* Mode selector */}
          <div className="mb-7 grid grid-cols-2 gap-2.5">
            <ModeCard
              active={mode === "auto"}
              onClick={() => setMode("auto")}
              title="Auto"
              description="Describe your idea in plain language. Claude generates the skill name, formats the description, and writes the full skill content for you."
            />
            <ModeCard
              active={mode === "manual"}
              onClick={() => setMode("manual")}
              title="Manual"
              description="Provide the name, description, and trigger conditions yourself. Claude creates a structured template you fill in."
            />
          </div>

          <Divider />

          {/* Auto fields */}
          {mode === "auto" && (
            <>
              <Field label="Skill name" hint="kebab-case — leave blank to let Claude derive one from your idea">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-skill"
                  pattern="[a-z][a-z0-9-]*"
                />
              </Field>
              <Field label="Describe your skill idea">
                <textarea
                  required
                  rows={6}
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  placeholder="e.g. A skill that reviews database migrations for safety issues — checks for missing rollbacks, destructive operations on large tables, and missing indexes on foreign keys."
                  className="input resize-y"
                  style={inputStyle}
                />
              </Field>
            </>
          )}

          {/* Manual fields */}
          {mode === "manual" && (
            <>
              <Field label="Skill name" hint="kebab-case, e.g. code-review">
                <Input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-skill"
                  pattern="[a-z][a-z0-9-]*"
                />
              </Field>
              <Field label="Description">
                <Input
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this skill does"
                />
              </Field>
              <Field label="When to trigger">
                <Input
                  required
                  value={triggers}
                  onChange={(e) => setTriggers(e.target.value)}
                  placeholder='e.g. "user asks to review code"'
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

        <FormActions onCancel={handleCancel} submitLabel="Create Skill" submitting={submitting} />
      </form>
    </Page>
  );
}

