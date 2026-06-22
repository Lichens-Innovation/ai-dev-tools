import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Button from "@repo/ui/button";
import { Field, Input } from "@repo/ui/field";
import ChipInput from "@repo/ui/chip-input";
import Select from "@repo/ui/select";
import ThemeToggle from "@repo/ui/theme-toggle";
import { toast } from "@repo/ui/toast";
import ShortcutsDialog from "@repo/ui/shortcuts-dialog";
import { Sparkles, Keyboard } from "lucide-react";
import { getMarketplaceList } from "../utils/marketplace";
import { submitPluginForm, cancelPluginForm } from "../utils/create-plugin";
import PluginManifestPreview from "../components/plugin-manifest-preview";

const pluginSchema = z.object({
  name: z
    .string()
    .min(1, "Required.")
    .refine((v) => /^[a-z][a-z0-9-]*$/.test(v), {
      message: "Use kebab-case: lowercase letters, numbers, and dashes.",
    }),
  description: z.string().min(1, "Tell Claude what this plugin provides."),
  keywords: z.array(z.string()),
  marketplace: z.string(),
});

type PluginForm = z.infer<typeof pluginSchema>;
type Phase = "idle" | "creating" | "cancelled";

export const Route = createFileRoute("/create-plugin")({
  loader: () => getMarketplaceList(),
  component: CreatePlugin,
});

const SHORTCUT_SECTIONS = [
  {
    title: "Navigation",
    items: [
      ["Jump to field 1–4", "⌘1–4"],
      ["Next / previous field", "Tab / ⇧Tab"],
    ] satisfies [string, string][],
  },
  {
    title: "Actions",
    items: [
      ["Create plugin", "⌘↵"],
      ["Show this help", "?"],
      ["Close overlay", "Esc"],
    ] satisfies [string, string][],
  },
];

const FIELD_IDS = ["cp-name", "cp-description", "cp-keywords", "cp-marketplace"];
const ROW_IDS = ["cp-row-1", "cp-row-2", "cp-row-3", "cp-row-4"];

function CreatePlugin() {
  const { marketplaces } = Route.useLoaderData();
  const [phase, setPhase] = useState<Phase>("idle");
  const [helpOpen, setHelpOpen] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<PluginForm>({
    resolver: zodResolver(pluginSchema),
    defaultValues: {
      name: "",
      description: "",
      keywords: [],
      marketplace: marketplaces[0] ?? "",
    },
  });

  const name = watch("name");
  const description = watch("description");
  const keywords = watch("keywords");
  const marketplace = watch("marketplace");

  const marketplaceOptions = marketplaces.map((m) => ({ id: m, name: m }));

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

  const onSubmit = async (values: PluginForm) => {
    setPhase("creating");
    await submitPluginForm({ data: values });
    toast(
      <>
        Plugin <span className="font-mono text-(--ink)">{values.name || "my-plugin"}</span> submitted — generating now.
      </>,
    );
    reset();
    setPhase("idle");
  };

  const onError = (errs: typeof errors) => {
    if (errs.name) jumpTo(1);
    else if (errs.description) jumpTo(2);
  };

  const submitRef = useRef<() => void>(() => {});
  submitRef.current = () => void handleSubmit(onSubmit, onError)();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = ["INPUT", "TEXTAREA"].includes((document.activeElement as HTMLElement)?.tagName ?? "");
      if ((e.metaKey || e.ctrlKey) && /^[1-4]$/.test(e.key)) {
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
          <p className="text-base text-(--ink-2)">Plugin creation cancelled.</p>
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
                  <h1 className="m-0 text-2xl font-bold text-(--ink) tracking-[-0.5px]">New plugin</h1>
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
                  Scaffold a new plugin and register it in the marketplace.
                </p>

                <Field
                  id="cp-row-1"
                  label="Plugin name"
                  hint="kebab-case, e.g. my-plugin."
                  error={errors.name?.message ?? null}
                >
                  <Controller
                    name="name"
                    control={control}
                    render={({ field }) => (
                      <Input
                        id="cp-name"
                        {...field}
                        mono
                        placeholder="my-plugin"
                        error={errors.name?.message ?? null}
                      />
                    )}
                  />
                </Field>

                <Field
                  id="cp-row-2"
                  label="Description"
                  hint="One-line summary of what this plugin provides."
                  error={errors.description?.message ?? null}
                >
                  <Controller
                    name="description"
                    control={control}
                    render={({ field }) => (
                      <Input
                        id="cp-description"
                        {...field}
                        placeholder="What this plugin provides"
                        error={errors.description?.message ?? null}
                      />
                    )}
                  />
                </Field>

                <Field
                  id="cp-row-3"
                  label="Keywords"
                  hint="Searchable tags. Press Enter to add each."
                >
                  <Controller
                    name="keywords"
                    control={control}
                    render={({ field }) => (
                      <ChipInput
                        id="cp-keywords"
                        values={field.value}
                        onChange={field.onChange}
                        placeholder="e.g. testing"
                      />
                    )}
                  />
                </Field>

                <Field id="cp-row-4" label="Marketplace" hint="The workspace this plugin belongs to.">
                  <Controller
                    name="marketplace"
                    control={control}
                    render={({ field }) => (
                      <Select
                        id="cp-marketplace"
                        value={field.value}
                        options={marketplaceOptions}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </Field>

                <div className="mt-6 pt-4 border-t border-(--line) flex items-center gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => void cancelPluginForm({ data: undefined }).then(() => setPhase("cancelled"))}
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
                    {phase === "creating" ? "Creating…" : "Create plugin"}
                  </Button>
                </div>
            </>
          </div>
        </div>

        <div className="border-l border-(--line) overflow-y-auto flex flex-col">
          <PluginManifestPreview
            name={name}
            description={description}
            keywords={keywords}
            marketplace={marketplace}
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
