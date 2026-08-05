// /tools — help-server's tabbed dashboard, landed BESIDE the app's own sections.
//
// help-server put this at `/`. Maestro's `/` is the project picker and stays that way: the desktop
// app opens with no project at all, so the first question it has to ask is which one — a dashboard
// there would be describing a machine and a project the user has not chosen yet. So the dashboard
// is a route like any other, reached from the top bar's Library menu.
//
// FOUR TABS, AND THE FOURTH IS NOT LIKE THE OTHERS. Three are pure reads of this machine, served
// by the one `data:tools` round trip in the loader. Usage Stats is a COMMAND — help-server ran
// `npx ccusage@latest` on every view of it, downloading and executing a package from the network
// unannounced. It therefore has no loader data at all: it previews what it would run, shows that,
// and runs only when the user says so. See src/core/ccusage.ts.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, FolderOpen } from "lucide-react";
import TopNav from "../components/top-nav";
import CommandCenter from "../components/tabs/command-center";
import ProjectMarketplace from "../components/tabs/project-marketplace";
import CuratedTools from "../components/tabs/curated-tools";
import UsageStatsTab from "../components/tabs/usage-stats";
import { callMain } from "../utils/call-main";
import { getToolsData } from "../utils/tools";

export const Route = createFileRoute("/tools")({
  // Through `callMain`, like every other fallible channel: a loader that let the call reject would
  // hand TanStack an error boundary with Electron's `Error invoking remote method 'data:tools'`
  // framing in it, which tells a user nothing they can act on.
  loader: async () => callMain(() => getToolsData()),
  component: ToolsPage,
});

type TabId = "command-center" | "stats" | "marketplace" | "curated";

const TABS: { id: TabId; label: string }[] = [
  { id: "command-center", label: "Command Center" },
  { id: "stats", label: "Usage Stats" },
  { id: "marketplace", label: "Project Marketplace" },
  { id: "curated", label: "Curated Tools" },
];

function ToolsPage() {
  const result = Route.useLoaderData();
  const [tab, setTab] = useState<TabId>("command-center");

  if (!result.ok) {
    return (
      <div className="w-full h-screen bg-(--bg) font-sans text-(--ink) flex flex-col overflow-hidden">
        <TopNav />
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-red-500/10 max-w-lg">
            <AlertTriangle size={16} className="shrink-0 mt-px text-red-500" />
            <div>
              <p className="text-[13px] text-(--ink) m-0 mb-1">The dashboard could not be loaded.</p>
              <p className="text-[12px] text-(--ink-2) m-0">{result.error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const data = result.value;

  return (
    <div className="w-full h-screen bg-(--bg) font-sans text-(--ink) flex flex-col overflow-hidden">
      <TopNav />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 pb-16 pt-10">
          <div className="mb-8">
            <span className="section-label mb-3 inline-block">AI Dev Tools</span>
            <h1 className="text-2xl font-semibold text-(--ink) m-0 mb-1">Command Center</h1>
            <p className="text-[13px] text-subtle m-0">
              Plugins, commands and marketplace tools — what this machine and{" "}
              {data.projectRoot ? (
                <span className="font-mono text-(--ink-2)">{data.projectRoot}</span>
              ) : (
                "the open project"
              )}{" "}
              already have.
            </p>
          </div>

          {/*
            The project-scoped tabs read the OPEN PROJECT, so with none open two of the three are
            empty for a reason the user can't see from the tables. Say it once, here.
          */}
          {!data.projectRoot && (
            <div className="mb-6 flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 text-[12px]">
              <FolderOpen size={14} className="shrink-0 mt-px text-amber-500" />
              <span className="text-(--ink-2)">
                No project is open, so the marketplace, rule library and command table are empty. Installed and curated
                plugins are read from <span className="font-mono">~/.claude</span> and are shown either way.{" "}
                <Link to="/" className="text-primary underline">
                  Open a project
                </Link>
                .
              </span>
            </div>
          )}

          <div className="tabs mb-6">
            {TABS.map((t) => (
              <button key={t.id} type="button" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === "command-center" && (
            <CommandCenter installedPlugins={data.installedPlugins} commands={data.commands} />
          )}
          {/* No loader data: this tab reads nothing until the user asks it to run something. */}
          {tab === "stats" && <UsageStatsTab />}
          {tab === "marketplace" && (
            <ProjectMarketplace plugins={data.projectMarketplace} ruleLibrary={data.ruleLibrary} />
          )}
          {tab === "curated" && <CuratedTools plugins={data.curated} />}
        </div>
      </div>
    </div>
  );
}
