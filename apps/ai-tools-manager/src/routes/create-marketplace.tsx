import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Button from "@repo/ui/button";
import { Field, Input } from "@repo/ui/field";
import ThemeToggle from "@repo/ui/theme-toggle";
import SuccessState from "@repo/ui/success-state";
import ShortcutsDialog from "@repo/ui/shortcuts-dialog";
import { Sparkles, Keyboard, Check } from "lucide-react";
import { getMarketplaceDefaults } from "../utils/marketplace";
import { submitMarketplaceForm, cancelMarketplaceForm } from "../utils/create-marketplace";
import MarketplaceManifestPreview from "../components/marketplace-manifest-preview";

const marketplaceSchema = z.object({
  name: z
    .string()
    .min(1, "Required.")
    .refine((v) => /^[a-z][a-z0-9-]*$/.test(v), {
      message: "Use kebab-case: lowercase letters, numbers, and dashes.",
    }),
  description: z.string().min(1, "Tell Claude what this marketplace provides."),
  ownerName: z.string().min(1, "Required."),
  ownerEmail: z.string().email("Enter a valid email."),
  homepage: z.string(),
  targetDir: z.string().min(1, "Required."),
  privateRepo: z.boolean(),
});

type MarketplaceForm = z.infer<typeof marketplaceSchema>;
type Phase = "idle" | "creating" | "done" | "cancelled";

export const Route = createFileRoute("/create-marketplace")({
  loader: () => getMarketplaceDefaults(),
  component: CreateMarketplace,
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
      ["Create marketplace", "⌘↵"],
      ["Show this help", "?"],
      ["Close overlay", "Esc"],
    ] satisfies [string, string][],
  },
];

const FIELD_IDS = ["cm-name", "cm-description", "cm-owner-name", "cm-owner-email", "cm-homepage", "cm-target-dir"];
const ROW_IDS = ["cm-row-1", "cm-row-2", "cm-row-3", "cm-row-4", "cm-row-5", "cm-row-6"];

function CreateMarketplace() {
  const { cwd } = Route.useLoaderData();
  const [phase, setPhase] = useState<Phase>("idle");
  const [helpOpen, setHelpOpen] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<MarketplaceForm>({
    resolver: zodResolver(marketplaceSchema),
    defaultValues: {
      name: "",
      description: "",
      ownerName: "",
      ownerEmail: "",
      homepage: "",
      targetDir: cwd,
      privateRepo: false,
    },
  });

  const name = watch("name");
  const description = watch("description");
  const ownerName = watch("ownerName");
  const ownerEmail = watch("ownerEmail");
  const homepage = watch("homepage");
  const targetDir = watch("targetDir");

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

  const onSubmit = async (values: MarketplaceForm) => {
    setPhase("creating");
    await submitMarketplaceForm({ data: values });
    setPhase("done");
  };

  const onError = (errs: typeof errors) => {
    if (errs.name) jumpTo(1);
    else if (errs.description) jumpTo(2);
    else if (errs.ownerName) jumpTo(3);
    else if (errs.ownerEmail) jumpTo(4);
    else if (errs.targetDir) jumpTo(6);
  };

  const submitRef = useRef<() => void>(() => {});
  submitRef.current = () => void handleSubmit(onSubmit, onError)();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = ["INPUT", "TEXTAREA"].includes((document.activeElement as HTMLElement)?.tagName ?? "");
      if ((e.metaKey || e.ctrlKey) && /^[1-6]$/.test(e.key)) {
        e.preventDefault();
        jumpTo(Number(e.key));
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
          <p className="text-base text-(--ink-2)">Marketplace creation cancelled.</p>
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
        <div className="overflow-y-auto px-10 py-8">
          <div className="max-w-155 mx-auto">
            {phase === "done" ? (
              <SuccessState
                icon={<Check size={28} strokeWidth={2.4} />}
                title="Your marketplace is being created"
                description={
                  <>
                    The repository is generating it now. You can close this page — you'll find{" "}
                    <span className="font-mono text-(--ink-2)">{name || "my-tools"}</span> scaffolded at{" "}
                    <span className="font-mono text-(--ink-2)">{targetDir || "<target/dir>"}</span> when it's ready.
                  </>
                }
              />
            ) : (
              <>
                <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                  <h1 className="m-0 text-2xl font-bold text-(--ink) tracking-[-0.5px]">New marketplace</h1>
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
                  Scaffold a new plugin marketplace with manifest and documentation.
                </p>

                <Field
                  id="cm-row-1"
                  label="Marketplace name"
                  hint="kebab-case, e.g. my-tools."
                  error={errors.name?.message ?? null}
                >
                  <Controller
                    name="name"
                    control={control}
                    render={({ field }) => (
                      <Input
                        id="cm-name"
                        {...field}
                        mono
                        placeholder="my-tools"
                        error={errors.name?.message ?? null}
                      />
                    )}
                  />
                </Field>

                <Field
                  id="cm-row-2"
                  label="Description"
                  hint="One-line summary of what this marketplace provides."
                  error={errors.description?.message ?? null}
                >
                  <Controller
                    name="description"
                    control={control}
                    render={({ field }) => (
                      <Input
                        id="cm-description"
                        {...field}
                        placeholder="What this marketplace provides"
                        error={errors.description?.message ?? null}
                      />
                    )}
                  />
                </Field>

                <Field id="cm-row-3" label="Owner name" error={errors.ownerName?.message ?? null}>
                  <Controller
                    name="ownerName"
                    control={control}
                    render={({ field }) => (
                      <Input
                        id="cm-owner-name"
                        {...field}
                        placeholder="Your name or organization"
                        error={errors.ownerName?.message ?? null}
                      />
                    )}
                  />
                </Field>

                <Field id="cm-row-4" label="Owner email" error={errors.ownerEmail?.message ?? null}>
                  <Controller
                    name="ownerEmail"
                    control={control}
                    render={({ field }) => (
                      <Input
                        id="cm-owner-email"
                        type="email"
                        {...field}
                        placeholder="you@example.com"
                        error={errors.ownerEmail?.message ?? null}
                      />
                    )}
                  />
                </Field>

                <Field id="cm-row-5" label="Homepage" hint="Optional. Shown on marketplace listings.">
                  <Controller
                    name="homepage"
                    control={control}
                    render={({ field }) => (
                      <Input id="cm-homepage" {...field} placeholder="https://github.com/you/my-tools" />
                    )}
                  />
                </Field>

                <Field
                  id="cm-row-6"
                  label="Target directory"
                  hint="Where to create the marketplace folder."
                  error={errors.targetDir?.message ?? null}
                >
                  <Controller
                    name="targetDir"
                    control={control}
                    render={({ field }) => (
                      <Input
                        id="cm-target-dir"
                        {...field}
                        mono
                        placeholder="/path/to/my-tools"
                        error={errors.targetDir?.message ?? null}
                      />
                    )}
                  />
                </Field>

                <Controller
                  name="privateRepo"
                  control={control}
                  render={({ field }) => (
                    <label className="mb-4.5 flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                        className="w-4 h-4 cursor-pointer accent-(--primary)"
                      />
                      <span className="text-sm text-(--ink)">Private repository</span>
                      <span className="text-xs text-subtle">— adds token-based auth setup instructions</span>
                    </label>
                  )}
                />

                <div className="mt-6 pt-4 border-t border-(--line) flex items-center gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => void cancelMarketplaceForm({ data: undefined }).then(() => setPhase("cancelled"))}
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
                    {phase === "creating" ? "Creating…" : "Create marketplace"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>

        {phase !== "done" && (
          <div className="border-l border-(--line) overflow-y-auto flex flex-col">
            <MarketplaceManifestPreview
              name={name}
              description={description}
              ownerName={ownerName}
              ownerEmail={ownerEmail}
              homepage={homepage}
              targetDir={targetDir}
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
