import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import Button from "@repo/ui/button";
import { toast } from "@repo/ui/toast";
import { AlertTriangle, Check, Download, FolderOpen, PowerOff, RefreshCw, Trash2, X } from "lucide-react";
import TopNav from "../components/top-nav";
import { useInstall } from "../utils/install-context";
import { useProject } from "../utils/project-context";
import type { InstallReport, InstallStatus, UninstallPlan, UninstallReport } from "../../../shared/ipc";

export const Route = createFileRoute("/install")({
  component: InstallPage,
});

type Phase = "idle" | "installing" | "uninstalling" | "purging";

/** The last thing that ran, so the page reports install and removal in the same slot. */
type Outcome = { kind: "install"; report: InstallReport } | { kind: "uninstall"; report: UninstallReport };

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
        <p className="text-[12px] text-(--ink-2) m-0">Nothing — this project already has the runtime the app ships.</p>
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

/** What the uninstall took — and, just as importantly, what it left. */
function RemovalCard({ report }: { report: UninstallReport }) {
  return (
    <div className="flex flex-col gap-2 p-4 rounded-lg border border-(--line) bg-(--bg-elev)">
      <div className="text-[11px] font-semibold text-subtle uppercase tracking-wide">
        {report.purge ? "What was deleted" : "What was removed"}
      </div>
      {report.noop ? (
        <p className="text-[12px] text-(--ink-2) m-0">
          Nothing — this project had no Maestro runtime installed. No files were changed.
        </p>
      ) : (
        <ul className="list-none p-0 m-0 flex flex-col gap-1 text-[12px] text-(--ink-2)">
          {report.hooksRemoved.length > 0 && (
            <li>
              {report.hooksRemoved.length} hook{report.hooksRemoved.length === 1 ? "" : "s"} unregistered from{" "}
              <span className="font-mono text-(--ink)">.claude/settings.json</span>:{" "}
              <span className="font-mono text-(--ink-3)">{report.hooksRemoved.join(", ")}</span>
            </li>
          )}
          {report.sessionFilesRemoved.length > 0 && (
            <li>
              {report.sessionFilesRemoved.length} ephemeral session file
              {report.sessionFilesRemoved.length === 1 ? "" : "s"} deleted — recreated by the next session.
            </li>
          )}
          {report.legacyAgentSettingRemoved && (
            <li>
              The legacy <span className="font-mono">agent: &quot;maestro&quot;</span> setting was cleared.
            </li>
          )}
          {report.purged.length > 0 && (
            <li>
              {report.purged.length} file{report.purged.length === 1 ? "" : "s"} deleted:{" "}
              <span className="font-mono text-(--ink-3)">
                {report.purged.slice(0, 6).join(", ")}
                {report.purged.length > 6 && ` and ${report.purged.length - 6} more`}
              </span>
            </li>
          )}
        </ul>
      )}
      {/* The half that makes the two levels legible: say what is still there. */}
      <div className="pt-2 mt-1 border-t border-(--line) text-[12px] text-(--ink-3)">
        {report.configKept ? (
          <>
            Kept: <span className="font-mono text-(--ink-2)">.claude/maestro.json</span> — your workflow and rule
            configuration. Install again to switch the hooks back on.
          </>
        ) : report.purge ? (
          <>Nothing of Maestro&rsquo;s is left in this project. Installing again starts from a fresh config.</>
        ) : (
          <>
            This project had no <span className="font-mono text-(--ink-2)">.claude/maestro.json</span> to keep.
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The purge confirmation.
 *
 * It lists the files by name rather than asking "are you sure?", because the list is the whole
 * point: `maestro.json` is on it, it is hand-authored, and nothing else in the app can restore it.
 * A generic confirmation would be consent to something the user hasn't been told.
 */
function PurgeDialog({
  plan,
  busy,
  onCancel,
  onConfirm,
}: {
  plan: UninstallPlan;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center"
      onClick={() => !busy && onCancel()}
    >
      <div
        className="bg-(--bg) border border-(--line) rounded-xl p-5 shadow-xl w-[520px] max-w-[90vw] flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-[13px] font-semibold text-(--ink)">
          <Trash2 size={14} className="text-red-500" />
          Delete Maestro from this project
        </div>
        <p className="text-[12px] text-(--ink-2) m-0">
          This permanently deletes {plan.purgeFiles.length} file
          {plan.purgeFiles.length === 1 ? "" : "s"} from{" "}
          <span className="font-mono text-(--ink)">{plan.projectRoot}</span>, plus the registered hooks and the session
          files. It cannot be undone from the app.
        </p>
        {plan.purgeRemovesConfig && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-[12px] bg-red-500/10 text-red-500">
            <AlertTriangle size={14} className="shrink-0 mt-px" />
            <span className="text-(--ink-2)">
              <span className="font-mono text-(--ink)">.claude/maestro.json</span> is included — your workflow graph and
              rule assignments go with it. Plain <b>Uninstall</b> keeps that file.
            </span>
          </div>
        )}
        <div className="max-h-60 overflow-y-auto rounded-lg border border-(--line) bg-(--bg-elev) p-2">
          <ul className="list-none p-0 m-0 flex flex-col">
            {plan.purgeFiles.map((file) => (
              <li
                key={file}
                className={`font-mono text-[11px] leading-5 truncate ${
                  file.endsWith("maestro.json") ? "text-red-500" : "text-(--ink-3)"
                }`}
                title={file}
              >
                {file}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="px-3 py-1.5 text-[12px] rounded-lg bg-(--bg-elev) border border-(--line) text-(--ink-2) hover:text-(--ink) cursor-pointer focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="px-3 py-1.5 text-[12px] rounded-lg bg-red-500 text-white cursor-pointer focus:outline-none hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? "Deleting…" : `Delete ${plan.purgeFiles.length} file${plan.purgeFiles.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
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
  const { status, error, install, refresh, uninstall, uninstallPlan } = useInstall();
  const [phase, setPhase] = useState<Phase>("idle");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  /** Non-null while the purge confirmation is open — and it is the only way to reach a purge. */
  const [purgePlan, setPurgePlan] = useState<UninstallPlan | null>(null);

  const run = async () => {
    setPhase("installing");
    setOutcome(null);
    // try/finally, not a bare reset after the await: a rejected install must still return the
    // button to its resting state rather than spinning forever.
    try {
      const res = await install();
      if (!res.ok) {
        toast(<>Could not install the runtime: {res.error}</>, { variant: "error" });
        return;
      }
      setOutcome({ kind: "install", report: res.value });
      for (const warning of res.value.warnings) toast(<>{warning}</>, { variant: "error" });
      if (!res.value.unchanged && res.value.warnings.length === 0) {
        toast(<>Maestro&rsquo;s runtime is installed and up to date in this project.</>);
      }
    } finally {
      setPhase("idle");
    }
  };

  const runUninstall = async (purge: boolean) => {
    setPhase(purge ? "purging" : "uninstalling");
    setOutcome(null);
    try {
      const res = await uninstall(purge);
      if (!res.ok) {
        toast(<>Could not uninstall: {res.error}</>, { variant: "error" });
        return;
      }
      setPurgePlan(null);
      setOutcome({ kind: "uninstall", report: res.value });
      for (const warning of res.value.warnings) toast(<>{warning}</>, { variant: "error" });
      if (res.value.noop) {
        toast(<>Nothing to remove — this project has no Maestro runtime installed.</>);
      } else if (res.value.warnings.length === 0) {
        toast(
          purge ? (
            <>Maestro was deleted from this project.</>
          ) : (
            <>Maestro&rsquo;s hooks are off. Your maestro.json was kept.</>
          )
        );
      }
    } finally {
      setPhase("idle");
    }
  };

  /** Fetch the plan, then open the confirmation — the dialog never renders an unnamed file list. */
  const openPurge = async () => {
    const res = await uninstallPlan();
    if (!res.ok) {
      toast(<>Could not work out what to delete: {res.error}</>, { variant: "error" });
      return;
    }
    if (res.value.purgeFiles.length === 0) {
      toast(<>No Maestro files to delete — this project has none left.</>);
      return;
    }
    setPurgePlan(res.value);
  };

  const action = !status || !status.installed ? "install" : status.stale ? "update" : "reinstall";
  const busy = phase !== "idle";

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
              . Registered in this project&rsquo;s own settings — your global Claude configuration is never touched.
            </p>
          </div>

          {!current && <Note variant="warn">No project is open. Choose one from the top bar first.</Note>}

          {error && <Note variant="error">Could not read the install status: {error}</Note>}

          {status?.settingsUnreadable && (
            <Note variant="error">
              <span className="font-mono">.claude/settings.json</span> is not valid JSON. Installing would overwrite it,
              so nothing will be written until you fix or move that file — then press the button again.
            </Note>
          )}

          {status?.pluginHooksActive && (
            <Note variant="warn">
              The <span className="font-mono">ai-tools-manager</span> plugin is also installed on this machine and
              registers the same hooks globally, so tool calls would be logged twice here. Disable the plugin to let
              this project-local install take over — the app will not edit your global configuration for you.
            </Note>
          )}

          {status && <StatusCard status={status} />}

          <div className="flex items-center gap-2">
            <Button
              variant={action === "reinstall" ? "secondary" : "primary"}
              icon={action === "update" ? <RefreshCw size={14} /> : <Download size={14} />}
              loading={phase === "installing"}
              disabled={!current || busy}
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

          {outcome?.kind === "install" && <ReportCard report={outcome.report} />}
          {outcome?.kind === "uninstall" && <RemovalCard report={outcome.report} />}

          {/*
            Two removal levels, kept visibly apart. The default is the one a user reaching for
            "turn this off" means; the purge is a differently-shaped, differently-coloured control
            behind a confirmation that names its files. Collapsing them into one button — or giving
            the destructive one the same weight — is how "stop the hooks firing" becomes data loss.
          */}
          <div className="mt-2 p-4 rounded-lg border border-(--line) bg-(--bg-elev) flex flex-col gap-4">
            <div className="text-[11px] font-semibold text-subtle uppercase tracking-wide">Remove</div>

            <div className="flex flex-col gap-1.5">
              <div>
                <Button
                  variant="secondary"
                  icon={<PowerOff size={14} />}
                  loading={phase === "uninstalling"}
                  disabled={!current || busy}
                  onClick={() => void runUninstall(false)}
                >
                  Uninstall
                </Button>
              </div>
              <p className="text-[12px] text-(--ink-3) m-0">
                Unregisters the hooks and deletes the ephemeral session files, so nothing fires in a Claude session any
                more. <span className="font-mono">.claude/maestro.json</span>, the orchestrator skill and the copied
                scripts all stay — installing again switches it back on.
              </p>
            </div>

            <div className="flex flex-col gap-1.5 pt-3 border-t border-(--line)">
              <div>
                <button
                  type="button"
                  disabled={!current || busy}
                  onClick={() => void openPurge()}
                  className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg text-[13px] font-semibold border box-border transition-all duration-150 border-red-500/40 text-red-500 hover:bg-red-500/10 cursor-pointer focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  <Trash2 size={14} />
                  <span>{phase === "purging" ? "Deleting…" : "Delete everything…"}</span>
                </button>
              </div>
              <p className="text-[12px] text-(--ink-3) m-0">
                Everything above, plus the orchestrator skill, the copied scripts and{" "}
                <span className="font-mono">.claude/maestro.json</span> — your workflow graph and rule assignments. You
                will see the exact list of files before anything is deleted.
              </p>
            </div>
          </div>
        </div>
      </div>

      {purgePlan && (
        <PurgeDialog
          plan={purgePlan}
          busy={phase === "purging"}
          onCancel={() => setPurgePlan(null)}
          onConfirm={() => void runUninstall(true)}
        />
      )}
    </div>
  );
}
