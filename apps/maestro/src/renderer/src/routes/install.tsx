import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import Button from "@repo/ui/button";
import { toast } from "@repo/ui/toast";
import {
  AlertTriangle,
  Check,
  Download,
  FolderOpen,
  RefreshCw,
  X,
} from "lucide-react";
import TopNav from "../components/top-nav";
import { useInstall } from "../utils/install-context";
import { useProject } from "../utils/project-context";
import type { InstallReport, InstallStatus } from "../../../shared/ipc";

export const Route = createFileRoute("/install")({
  component: InstallPage,
});

type Phase = "idle" | "installing";

function Row({ ok, label, detail }: { ok: boolean; label: string; detail: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-(--line) last:border-b-0">
      {ok ? (
        <Check size={14} className="shrink-0 mt-0.5 text-(--green)" />
      ) : (
        <X size={14} className="shrink-0 mt-0.5 text-amber-500" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-(--ink)">{label}</div>
        <div className="text-[12px] text-(--ink-3)">{detail}</div>
      </div>
    </div>
  );
}

function Note({ variant, children }: { variant: "warn" | "error"; children: React.ReactNode }) {
  const tone = variant === "error" ? "bg-red-500/10 text-red-500" : "bg-amber-500/10 text-amber-500";
  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-lg text-[12px] ${tone}`}>
      <AlertTriangle size={14} className="shrink-0 mt-px" />
      <span className="text-(--ink-2)">{children}</span>
    </div>
  );
}

/** What the install did, listed file by file — the report the plan asks the action to produce. */
function ReportCard({ report }: { report: InstallReport }) {
  const { orchestratorSkill: skill, scriptsWritten, hooksAdded } = report;
  return (
    <div className="flex flex-col gap-2 p-4 rounded-lg border border-(--line) bg-(--bg-elev)">
      <div className="text-[11px] font-semibold text-subtle uppercase tracking-wide">What changed on disk</div>
      {report.unchanged ? (
        <p className="text-[12px] text-(--ink-2) m-0">
          Nothing — this project already has the runtime the app ships.
        </p>
      ) : (
        <ul className="list-none p-0 m-0 flex flex-col gap-1 text-[12px] text-(--ink-2)">
          {skill.action !== "unchanged" && (
            <li>
              Orchestrator skill:{" "}
              <span className="text-(--ink)">
                {skill.action === "installed" && "installed"}
                {skill.action === "synced" && `re-synced (${skill.regions.join(", ")})`}
                {skill.action === "migrated" && "replaced — it predates Maestro's managed regions"}
              </span>
              {skill.backup && (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={() => void window.maestro.shell.reveal(skill.backup!)}
                    className="inline-flex items-center gap-1 text-primary underline cursor-pointer bg-transparent border-0 p-0 text-[12px]"
                  >
                    <FolderOpen size={11} /> show the backup
                  </button>
                </>
              )}
            </li>
          )}
          {scriptsWritten.length > 0 && (
            <li>
              {scriptsWritten.length} runtime file{scriptsWritten.length === 1 ? "" : "s"} written:{" "}
              {/*
                A first install writes ~35 files, most of them handoff-protocol templates. Listing
                every one buries the two lines that matter (the skill, the hooks) under a wall of
                paths, so the tail is summarised instead.
              */}
              <span className="font-mono text-(--ink-3)">
                {scriptsWritten.slice(0, 6).join(", ")}
                {scriptsWritten.length > 6 && ` and ${scriptsWritten.length - 6} more`}
              </span>
            </li>
          )}
          {hooksAdded.length > 0 && (
            <li>
              {hooksAdded.length} hook{hooksAdded.length === 1 ? "" : "s"} registered in{" "}
              <span className="font-mono text-(--ink)">.claude/settings.json</span>:{" "}
              <span className="font-mono text-(--ink-3)">{hooksAdded.join(", ")}</span>
            </li>
          )}
          {report.gitignoreUpdated && <li>Session files added to the repo&rsquo;s .gitignore.</li>}
        </ul>
      )}
    </div>
  );
}

function StatusCard({ status }: { status: InstallStatus }) {
  const scriptTrouble = status.scriptsMissing.length + status.scriptsOutOfDate.length;
  return (
    <div className="p-4 rounded-lg border border-(--line) bg-(--bg-elev)">
      <Row
        ok={status.orchestratorSkill && !status.orchestratorSkillOutOfDate}
        label="Orchestrator skill"
        detail={
          !status.orchestratorSkill
            ? "Not installed — .claude/skills/maestro/SKILL.md is absent."
            : status.orchestratorSkillOutOfDate
              ? "Older than the template the app ships. Updating re-syncs it and keeps your handoff table."
              : "Current."
        }
      />
      <Row
        ok={scriptTrouble === 0}
        label="Runtime scripts"
        detail={
          scriptTrouble === 0
            ? "Every hook script in .claude/scripts/ matches what the app ships."
            : [
                status.scriptsMissing.length > 0 && `${status.scriptsMissing.length} missing`,
                status.scriptsOutOfDate.length > 0 && `${status.scriptsOutOfDate.length} out of date`,
              ]
                .filter(Boolean)
                .join(", ")
        }
      />
      <Row
        ok={status.hooksMissing.length === 0}
        label="Session hooks"
        detail={
          status.hooksMissing.length === 0
            ? `All ${status.hooksRegistered.length} registered in this project's .claude/settings.json.`
            : `${status.hooksMissing.length} not registered: ${status.hooksMissing.join(", ")}`
        }
      />
      <Row
        ok={status.configFile}
        label="Workflow config"
        detail={
          status.configFile
            ? ".claude/maestro.json exists."
            : "No .claude/maestro.json yet — it is written the first time you save on Workflows."
        }
      />
      <div className="pt-3 mt-1 border-t border-(--line) text-[11px] text-(--ink-3) font-mono">
        runtime {status.installedRuntimeId} · ships {status.shippedRuntimeId}
      </div>
    </div>
  );
}

/**
 * Install / update Maestro's runtime in the open project.
 *
 * The whole page exists because the runtime used to be installed by `/maestro-install` inside a
 * Claude session — a model acting as transport for a file copy. Everything here is one IPC call.
 */
function InstallPage() {
  const { current } = useProject();
  const { status, error, install, refresh } = useInstall();
  const [phase, setPhase] = useState<Phase>("idle");
  const [report, setReport] = useState<InstallReport | null>(null);

  const run = async () => {
    setPhase("installing");
    setReport(null);
    // try/finally, not a bare reset after the await: a rejected install must still return the
    // button to its resting state rather than spinning forever.
    try {
      const res = await install();
      if (!res.ok) {
        toast(<>Could not install the runtime: {res.error}</>, { variant: "error" });
        return;
      }
      setReport(res.value);
      for (const warning of res.value.warnings) toast(<>{warning}</>, { variant: "error" });
      if (!res.value.unchanged && res.value.warnings.length === 0) {
        toast(<>Maestro&rsquo;s runtime is installed and up to date in this project.</>);
      }
    } finally {
      setPhase("idle");
    }
  };

  const action = !status || !status.installed ? "install" : status.stale ? "update" : "reinstall";

  return (
    <div className="w-full h-screen bg-(--bg) font-sans text-(--ink) overflow-hidden flex flex-col">
      <TopNav />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-8 flex flex-col gap-4">
          <div>
            <h1 className="text-[15px] font-semibold m-0">Maestro runtime</h1>
            <p className="text-[12px] text-(--ink-3) m-0 mt-1">
              The hook scripts that run inside a Claude Code session, installed into{" "}
              <span className="font-mono">
                {current ? `${current.root.replace(/\/+$/, "")}/.claude/` : "the open project"}
              </span>
              . Registered in this project&rsquo;s own settings — your global Claude configuration is
              never touched.
            </p>
          </div>

          {!current && <Note variant="warn">No project is open. Choose one from the top bar first.</Note>}

          {error && <Note variant="error">Could not read the install status: {error}</Note>}

          {status?.settingsUnreadable && (
            <Note variant="error">
              <span className="font-mono">.claude/settings.json</span> is not valid JSON. Installing would
              overwrite it, so nothing will be written until you fix or move that file — then press the
              button again.
            </Note>
          )}

          {status?.pluginHooksActive && (
            <Note variant="warn">
              The <span className="font-mono">ai-tools-manager</span> plugin is also installed on this
              machine and registers the same hooks globally, so tool calls would be logged twice here.
              Disable the plugin to let this project-local install take over — the app will not edit your
              global configuration for you.
            </Note>
          )}

          {status && <StatusCard status={status} />}

          <div className="flex items-center gap-2">
            <Button
              variant={action === "reinstall" ? "secondary" : "primary"}
              icon={action === "update" ? <RefreshCw size={14} /> : <Download size={14} />}
              loading={phase === "installing"}
              disabled={!current}
              onClick={() => void run()}
            >
              {phase === "installing"
                ? "Installing…"
                : action === "install"
                  ? "Install Maestro runtime"
                  : action === "update"
                    ? "Update runtime"
                    : "Reinstall"}
            </Button>
            <Button variant="ghost" icon={<RefreshCw size={13} />} onClick={() => void refresh()}>
              Re-check
            </Button>
            {status && !status.stale && status.installed && (
              <span className="text-[12px] text-(--ink-3)">Up to date — nothing to do.</span>
            )}
          </div>

          {report && <ReportCard report={report} />}
        </div>
      </div>
    </div>
  );
}
