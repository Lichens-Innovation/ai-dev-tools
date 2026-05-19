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
import SuccessState from "@repo/ui/success-state";
import ShortcutsDialog from "@repo/ui/shortcuts-dialog";
import { Sparkles, Pencil, Keyboard, Check, Store, Folder } from "lucide-react";
import { getMarketplaceData } from "../utils/marketplace";
import { submitSkillForm, cancelSkillForm } from "../utils/create-skill";
import SkillTemplatePreview from "../components/skill-template-preview";

// ── Schema ─────────────────────────────────────────────────────────
const skillSchema = z
  .object({
    mode: z.enum(["auto", "manual"]),
    target: z.enum(["marketplace", "project"]),
    name: z.string().refine((v) => v === "" || /^[a-z][a-z0-9-]*$/.test(v), {
      message: "Use kebab-case: lowercase letters, numbers, and dashes.",
    }),
    idea: z.string().min(1, "Tell Claude what this skill should do."),
    useWhen: z.array(z.string()),
    marketplace: z.string(),
    plugin: z.string(),
  })
  .refine((v) => v.target === "project" || (v.marketplace.length > 0 && v.plugin.length > 0), {
    message: "Pick a marketplace and plugin, or switch to Project.",
    path: ["marketplace"],
  });

type SkillForm = z.infer<typeof skillSchema>;
type Phase = "idle" | "creating" | "done" | "cancelled";

// ── Route ──────────────────────────────────────────────────────────
export const Route = createFileRoute("/create-skill")({
  loader: () => getMarketplaceData(),
  component: CreateSkill,
});

const SHORTCUT_SECTIONS = [
  {
    title: "Navigation",
    items: [
      ["Jump to field 1–5", "⌘1–5"],
      ["Next / previous field", "Tab / ⇧Tab"],
    ] satisfies [string, string][],
  },
  {
    title: "Actions",
    items: [
      ["Toggle Auto / Manual", "⌘M"],
      ["Create skill", "⌘↵"],
      ["Show this help", "?"],
      ["Close overlay", "Esc"],
    ] satisfies [string, string][],
  },
];

// ── CreateSkill ────────────────────────────────────────────────────
function CreateSkill() {
  const { marketplaces, byMarketplace, cwd } = Route.useLoaderData();
  const [phase, setPhase] = useState<Phase>("idle");
  const [helpOpen, setHelpOpen] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<SkillForm>({
    resolver: zodResolver(skillSchema),
    defaultValues: {
      mode: "auto",
      target: marketplaces.length > 0 ? "marketplace" : "project",
      name: "",
      idea: "",
      useWhen: [],
      marketplace: marketplaces[0] ?? "",
      plugin: byMarketplace[marketplaces[0] ?? ""]?.[0] ?? "",
    },
  });

  const mode = watch("mode");
  const target = watch("target");
  const name = watch("name");
  const idea = watch("idea");
  const useWhen = watch("useWhen");
  const marketplace = watch("marketplace");
  const plugin = watch("plugin");

  const marketplaceOptions = marketplaces.map((m) => ({ id: m, name: m }));
  const pluginOptions = (byMarketplace[marketplace] ?? []).map((p) => ({ id: p, name: p }));

  function jumpTo(n: number) {
    const fieldIds = ["cs-name", "cs-idea", "cs-useWhen", "cs-marketplace", "cs-plugin"];
    const rowIds = ["cs-row-1", "cs-row-2", "cs-row-3", "cs-row-4", "cs-row-5"];
    document.getElementById(fieldIds[n - 1])?.focus();
    const row = document.getElementById(rowIds[n - 1]);
    if (row) {
      row.style.boxShadow = "0 0 0 4px var(--primary-glow)";
      setTimeout(() => {
        if (row) row.style.boxShadow = "none";
      }, 600);
    }
  }

  const onSubmit = async (values: SkillForm) => {
    setPhase("creating");
    await submitSkillForm({ data: { ...values, cwd } });
    setPhase("done");
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
      if ((e.metaKey || e.ctrlKey) && /^[1-5]$/.test(e.key)) {
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
          <p className="text-base text-(--ink-2)">Skill creation cancelled.</p>
          <p className="text-[13px] text-subtle mt-1.5">You can close this tab.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-(--bg) font-sans text-(--ink) overflow-hidden">
      <div
        className="h-full grid transition-[grid-template-columns] duration-300 ease-out"
        style={{ gridTemplateColumns: phase === "done" ? "1fr" : "minmax(0, 1fr) 460px" }}
      >
        {/* Left — Form */}
        <div className="overflow-y-auto px-10 py-8">
          <div className="max-w-155 mx-auto">
            {phase === "done" ? (
              <SuccessState
                icon={<Check size={28} strokeWidth={2.4} />}
                title="Your skill is being created"
                description={
                  <>
                    The repository is generating it now. You can close this page — you'll find{" "}
                    <span className="font-mono text-(--ink-2)">{name || "my-skill"}</span> in your marketplace when it's
                    ready.
                  </>
                }
              />
            ) : (
              <>
                {/* Header */}
                <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                  <h1 className="m-0 text-2xl font-bold text-(--ink) tracking-[-0.5px]">New skill</h1>
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
                    ? "Describe your idea — Claude writes the skill for you."
                    : "Provide name, description and triggers — Claude scaffolds the template."}
                </p>

                {/* Mode descriptor card */}
                <div className="flex items-center gap-3 px-3.5 py-3 mb-1 bg-(--bg-elev) border border-(--line) rounded-lg text-[13px] text-(--ink-2)">
                  <div className="w-7 h-7 rounded-[7px] bg-(--primary-dim) text-primary flex items-center justify-center">
                    {mode === "auto" ? <Sparkles size={15} /> : <Pencil size={15} />}
                  </div>
                  <div className="flex-1 leading-normal">
                    {mode === "auto" ? (
                      <>
                        <strong className="text-(--ink)">Auto.</strong> Claude generates the skill from your idea +
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
                  label="Skill name"
                  hint="kebab-case. Leave blank to let Claude derive one from your idea."
                  error={errors.name?.message ?? null}
                >
                  <Controller
                    name="name"
                    control={control}
                    render={({ field }) => (
                      <Input id="cs-name" {...field} mono placeholder="my-skill" error={errors.name?.message ?? null} />
                    )}
                  />
                </Field>

                <Field
                  id="cs-row-2"
                  label={mode === "auto" ? "Skill idea" : "Description"}
                  hint={
                    mode === "auto"
                      ? 'Describe what the skill does. Best descriptions start with a verb ("Reviews…", "Writes…", "Extracts…").'
                      : "Used as the docstring. First sentence: what it does."
                  }
                  error={errors.idea?.message ?? null}
                >
                  <Controller
                    name="idea"
                    control={control}
                    render={({ field }) => (
                      <Textarea
                        id="cs-idea"
                        {...field}
                        rows={4}
                        placeholder={
                          mode === "auto"
                            ? "Reviews database migrations for safety issues. Checks for missing rollbacks, destructive operations on large tables, and missing indexes on foreign keys."
                            : "A short, focused description of what this skill does and when it applies."
                        }
                        error={errors.idea?.message ?? null}
                      />
                    )}
                  />
                </Field>

                <Field
                  id="cs-row-3"
                  label="Use when…"
                  hint="Specific triggers that tell Claude when to load this skill. Press Enter to add each."
                >
                  <Controller
                    name="useWhen"
                    control={control}
                    render={({ field }) => (
                      <ChipInput
                        id="cs-useWhen"
                        values={field.value}
                        onChange={field.onChange}
                        placeholder="e.g. user shares a .sql file"
                      />
                    )}
                  />
                </Field>

                {target === "marketplace" ? (
                  <>
                    <Field
                      id="cs-row-4"
                      label="Marketplace"
                      hint="The workspace this skill belongs to."
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

                    <Field id="cs-row-5" label="Plugin" hint="Which plugin group to file the skill under.">
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
                    id="cs-row-4"
                    label="Project location"
                    hint="The skill will be created at <project>/.claude/skills/<name>/."
                  >
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-(--bg-2) border border-(--line) font-mono text-[12px] text-(--ink-2)">
                      <Folder size={13} className="text-(--ink-3)" />
                      {cwd || "<current working directory not available>"}
                    </div>
                  </Field>
                )}

                {/* Submit row */}
                <div className="mt-6 pt-4 border-t border-(--line) flex items-center gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => void cancelSkillForm({ data: undefined }).then(() => setPhase("cancelled"))}
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
                    {phase === "creating" ? "Creating…" : "Create skill"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right — Template preview */}
        {phase !== "done" && (
          <div className="border-l border-(--line) overflow-y-auto flex flex-col">
            <SkillTemplatePreview
              mode={mode}
              target={target}
              name={name}
              idea={idea}
              useWhen={useWhen}
              marketplace={marketplace}
              plugin={plugin}
              cwd={cwd}
            />
          </div>
        )}
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
