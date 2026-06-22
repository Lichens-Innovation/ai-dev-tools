import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Button from "@repo/ui/button";
import { Field, Input, Textarea } from "@repo/ui/field";
import ChipInput from "@repo/ui/chip-input";
import Select from "@repo/ui/select";
import ModePill from "@repo/ui/mode-pill";
import ThemeToggle from "@repo/ui/theme-toggle";
import { toast } from "@repo/ui/toast";
import ShortcutsDialog from "@repo/ui/shortcuts-dialog";
import { Sparkles, Pencil, Keyboard, Store, Folder } from "lucide-react";
import { getMarketplaceData } from "../utils/marketplace";
import { submitSubagentForm, cancelSubagentForm } from "../utils/create-subagent";
import SubagentTemplatePreview from "../components/subagent-template-preview";

const subagentSchema = z
  .object({
    mode: z.enum(["auto", "manual"]),
    target: z.enum(["marketplace", "project"]),
    name: z.string().refine((v) => v === "" || /^[a-z][a-z0-9-]*$/.test(v), {
      message: "Use kebab-case: lowercase letters, numbers, and dashes.",
    }),
    idea: z.string(),
    description: z.string(),
    triggers: z.array(z.string()),
    tools: z.array(z.string()),
    marketplace: z.string(),
    plugin: z.string(),
  })
  .refine((v) => (v.mode === "auto" ? v.idea.trim().length > 0 : v.description.trim().length > 0), {
    message: "Tell Claude what this subagent should do.",
    path: ["idea"],
  })
  .refine((v) => v.mode === "auto" || v.name.trim().length > 0, {
    message: "Manual mode requires a name.",
    path: ["name"],
  })
  .refine((v) => v.target === "project" || (v.marketplace.length > 0 && v.plugin.length > 0), {
    message: "Pick a marketplace and plugin, or switch to Project.",
    path: ["marketplace"],
  });

type SubagentForm = z.infer<typeof subagentSchema>;
type Phase = "idle" | "creating" | "cancelled";

export const Route = createFileRoute("/create-subagent")({
  loader: () => getMarketplaceData(),
  component: CreateSubagent,
});

const SHORTCUT_SECTIONS = [
  {
    title: "Navigation",
    items: [
      ["Jump to field 1–6", "⌘1–6"],
      ["Next / previous field", "Tab / ⇧Tab"],
    ] satisfies [string, string][],
  },
  {
    title: "Actions",
    items: [
      ["Toggle Auto / Manual", "⌘M"],
      ["Create subagent", "⌘↵"],
      ["Show this help", "?"],
      ["Close overlay", "Esc"],
    ] satisfies [string, string][],
  },
];

const FIELD_IDS = ["cs-name", "cs-idea", "cs-triggers", "cs-tools", "cs-marketplace", "cs-plugin"];
const ROW_IDS = ["cs-row-1", "cs-row-2", "cs-row-3", "cs-row-4", "cs-row-5", "cs-row-6"];

function CreateSubagent() {
  const { marketplaces, byMarketplace, cwd } = Route.useLoaderData();
  const [phase, setPhase] = useState<Phase>("idle");
  const [helpOpen, setHelpOpen] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    reset,
    formState: { errors },
  } = useForm<SubagentForm>({
    resolver: zodResolver(subagentSchema),
    defaultValues: {
      mode: "auto",
      target: marketplaces.length > 0 ? "marketplace" : "project",
      name: "",
      idea: "",
      description: "",
      triggers: [],
      tools: [],
      marketplace: marketplaces[0] ?? "",
      plugin: byMarketplace[marketplaces[0] ?? ""]?.[0] ?? "",
    },
  });

  const mode = watch("mode");
  const target = watch("target");
  const name = watch("name");
  const idea = watch("idea");
  const description = watch("description");
  const triggers = watch("triggers");
  const tools = watch("tools");
  const marketplace = watch("marketplace");
  const plugin = watch("plugin");

  const marketplaceOptions = marketplaces.map((m) => ({ id: m, name: m }));
  const pluginOptions = (byMarketplace[marketplace] ?? []).map((p) => ({ id: p, name: p }));

  function jumpTo(n: number) {
    document.getElementById(FIELD_IDS[n - 1])?.focus();
    const row = document.getElementById(ROW_IDS[n - 1]);
    if (row) {
      row.style.boxShadow = "0 0 0 4px var(--primary-glow)";
      setTimeout(() => {
        if (row) row.style.boxShadow = "none";
      }, 600);
    }
  }

  const onSubmit = async (values: SubagentForm) => {
    setPhase("creating");
    await submitSubagentForm({ data: { ...values, cwd } });
    toast(
      <>
        Subagent <span className="font-mono text-(--ink)">{values.name || "my-agent"}</span> submitted — generating now.
      </>,
    );
    reset();
    setPhase("idle");
  };

  const onError = (errs: typeof errors) => {
    if (errs.idea) jumpTo(2);
    else if (errs.name) jumpTo(1);
  };

  const submitRef = useRef<() => void>(() => {});
  submitRef.current = () => void handleSubmit(onSubmit, onError)();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = ["INPUT", "TEXTAREA"].includes((document.activeElement as HTMLElement)?.tagName ?? "");
      if ((e.metaKey || e.ctrlKey) && /^[1-6]$/.test(e.key)) {
        e.preventDefault();
        jumpTo(Number(e.key));
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "m") {
        e.preventDefault();
        setValue("mode", getValues("mode") === "auto" ? "manual" : "auto");
      } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        submitRef.current();
      } else if (e.key === "?" && !inField) {
        e.preventDefault();
        setHelpOpen(true);
      } else if (e.key === "Escape") {
        setHelpOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (phase === "cancelled") {
    return (
      <div className="w-full h-screen bg-(--bg) font-sans flex items-center justify-center">
        <div className="text-center">
          <p className="text-base text-(--ink-2)">Subagent creation cancelled.</p>
          <p className="text-[13px] text-subtle mt-1.5">You can close this tab.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-(--bg) font-sans text-(--ink) overflow-hidden">
      <div
        className="h-full grid"
        style={{ gridTemplateColumns: "minmax(0, 1fr) 460px" }}
      >
        <div className="overflow-y-auto px-10 py-8">
          <div className="max-w-155 mx-auto">
            <>
                <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                  <h1 className="m-0 text-2xl font-bold text-(--ink) tracking-[-0.5px]">New subagent</h1>
                  <Controller
                    name="mode"
                    control={control}
                    render={({ field }) => (
                      <ModePill
                        value={field.value}
                        onChange={field.onChange}
                        options={[
                          { value: "auto", label: "Auto", icon: <Sparkles size={12} /> },
                          { value: "manual", label: "Manual", icon: <Pencil size={12} /> },
                        ]}
                      />
                    )}
                  />
                  <Controller
                    name="target"
                    control={control}
                    render={({ field }) => (
                      <ModePill
                        value={field.value}
                        onChange={field.onChange}
                        options={[
                          { value: "marketplace", label: "Marketplace", icon: <Store size={12} /> },
                          { value: "project", label: "Project", icon: <Folder size={12} /> },
                        ]}
                      />
                    )}
                  />
                  <div className="flex-1" />
                  <ThemeToggle />
                  <button
                    type="button"
                    onClick={() => setHelpOpen(true)}
                    title="Keyboard shortcuts (?)"
                    className="w-7.5 h-7.5 rounded-lg bg-(--bg-elev) border border-(--line) flex items-center justify-center text-subtle text-[13px] font-bold cursor-pointer focus:outline-none focus:shadow-none"
                  >
                    ?
                  </button>
                </div>
                <p className="m-0 mb-4.5 text-[13px] text-subtle">
                  {mode === "auto"
                    ? "Describe your idea — Claude writes the subagent for you."
                    : "Provide name, description, triggers and tools — Claude scaffolds the template."}
                </p>

                <div className="flex items-center gap-3 px-3.5 py-3 mb-1 bg-(--bg-elev) border border-(--line) rounded-lg text-[13px] text-(--ink-2)">
                  <div className="w-7 h-7 rounded-[7px] bg-(--primary-dim) text-primary flex items-center justify-center">
                    {mode === "auto" ? <Sparkles size={15} /> : <Pencil size={15} />}
                  </div>
                  <div className="flex-1 leading-normal">
                    {mode === "auto" ? (
                      <>
                        <strong className="text-(--ink)">Auto.</strong> Claude generates the subagent from your idea +
                        triggers.
                      </>
                    ) : (
                      <>
                        <strong className="text-(--ink)">Manual.</strong> You provide every field — Claude only
                        scaffolds the file.
                      </>
                    )}
                  </div>
                </div>

                <Field
                  id="cs-row-1"
                  label="Subagent name"
                  hint={
                    mode === "auto"
                      ? "kebab-case. Leave blank to let Claude derive one from your idea."
                      : "kebab-case, e.g. security-reviewer."
                  }
                  error={errors.name?.message ?? null}
                >
                  <Controller
                    name="name"
                    control={control}
                    render={({ field }) => (
                      <Input id="cs-name" {...field} mono placeholder="my-agent" error={errors.name?.message ?? null} />
                    )}
                  />
                </Field>

                <Field
                  id="cs-row-2"
                  label={mode === "auto" ? "Subagent idea" : "Role description"}
                  hint={
                    mode === "auto"
                      ? 'Describe what the subagent does. Best descriptions start with a verb ("Reviews…", "Audits…", "Drafts…").'
                      : "Used as the docstring. First sentence: what it does."
                  }
                  error={errors.idea?.message ?? null}
                >
                  <Controller
                    name={mode === "auto" ? "idea" : "description"}
                    control={control}
                    render={({ field }) => (
                      <Textarea
                        id="cs-idea"
                        {...field}
                        rows={4}
                        placeholder={
                          mode === "auto"
                            ? "Audits pull requests for security issues. Checks for hardcoded secrets, missing input validation, and unsafe dependencies."
                            : "A short, focused description of what this subagent does and when it applies."
                        }
                        error={errors.idea?.message ?? null}
                      />
                    )}
                  />
                </Field>

                <Field
                  id="cs-row-3"
                  label="When to apply"
                  hint="Specific triggers that tell Claude when to hand off to this subagent. Press Enter to add each."
                >
                  <Controller
                    name="triggers"
                    control={control}
                    render={({ field }) => (
                      <ChipInput
                        id="cs-triggers"
                        values={field.value}
                        onChange={field.onChange}
                        placeholder="e.g. user asks to review a PR for security"
                      />
                    )}
                  />
                </Field>

                <Field
                  id="cs-row-4"
                  label="Tools"
                  hint="Tools this subagent is allowed to use. Press Enter to add each."
                >
                  <Controller
                    name="tools"
                    control={control}
                    render={({ field }) => (
                      <ChipInput
                        id="cs-tools"
                        values={field.value}
                        onChange={field.onChange}
                        placeholder="e.g. Bash, Read, WebSearch"
                      />
                    )}
                  />
                </Field>

                {target === "marketplace" ? (
                  <>
                    <Field
                      id="cs-row-5"
                      label="Marketplace"
                      hint="The workspace this subagent belongs to."
                      error={errors.marketplace?.message ?? null}
                    >
                      <Controller
                        name="marketplace"
                        control={control}
                        render={({ field }) => (
                          <Select
                            id="cs-marketplace"
                            value={field.value}
                            options={marketplaceOptions}
                            onChange={(v) => {
                              field.onChange(v);
                              setValue("plugin", byMarketplace[v]?.[0] ?? "");
                            }}
                          />
                        )}
                      />
                    </Field>

                    <Field id="cs-row-6" label="Plugin" hint="Which plugin group to file the subagent under.">
                      <Controller
                        name="plugin"
                        control={control}
                        render={({ field }) => (
                          <Select
                            id="cs-plugin"
                            value={field.value}
                            options={pluginOptions}
                            onChange={field.onChange}
                          />
                        )}
                      />
                    </Field>
                  </>
                ) : (
                  <Field
                    id="cs-row-5"
                    label="Project location"
                    hint="The subagent will be created at <project>/.claude/agents/<name>.md."
                  >
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-(--bg-2) border border-(--line) font-mono text-[12px] text-(--ink-2)">
                      <Folder size={13} className="text-(--ink-3)" />
                      {cwd || "<current working directory not available>"}
                    </div>
                  </Field>
                )}

                <div className="mt-6 pt-4 border-t border-(--line) flex items-center gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => void cancelSubagentForm({ data: undefined }).then(() => setPhase("cancelled"))}
                  >
                    Cancel
                  </Button>
                  <div className="flex-1" />
                  <Button
                    variant="primary"
                    icon={phase === "idle" ? <Sparkles size={14} /> : undefined}
                    loading={phase === "creating"}
                    onClick={() => submitRef.current()}
                  >
                    {phase === "creating" ? "Creating…" : "Create subagent"}
                  </Button>
                </div>
            </>
          </div>
        </div>

        <div className="border-l border-(--line) overflow-y-auto flex flex-col">
          <SubagentTemplatePreview
            mode={mode}
            target={target}
            name={name}
            idea={idea}
            description={description}
            triggers={triggers}
            tools={tools}
            marketplace={marketplace}
            plugin={plugin}
            cwd={cwd}
          />
        </div>
      </div>
      <ShortcutsDialog
        open={helpOpen}
        onOpenChange={setHelpOpen}
        titleIcon={<Keyboard size={15} />}
        sections={SHORTCUT_SECTIONS}
      />
    </div>
  );
}
