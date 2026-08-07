import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Copy, FilePen, Play, Square, Terminal } from "lucide-react";
import CopyableText from "@repo/ui/copyable-text";
import ReadScope from "./read-scope";
import { callMain } from "../utils/call-main";
import type { ClaudePreview, ClaudeRunResult } from "../../../shared/ipc";

/**
 * The confirmation modal — the user-facing half of the preview/run split.
 *
 * It exists because of a decision taken when this migration was planned: the app may spawn
 * `claude -p` on the user's behalf, **but it asks first and shows the prompt it will send**. So
 * this is not a generic "are you sure?" — a generic confirmation is consent to something the user
 * has not been told. It renders the full prompt text, scrollable and selectable, the exact argv,
 * the working directory, and what the run may write, and only then offers Run.
 *
 * Four behaviours here are load-bearing rather than decorative:
 *
 *   • **Nothing spawns until Run.** The `preview` prop was produced by a channel that cannot spawn;
 *     opening, reading and closing this dialog therefore cannot start a process, and Cancel is
 *     genuinely a no-op rather than a stop.
 *   • **Output streams.** These runs are minutes long. Chunks are appended as they arrive, so a
 *     working run never looks like a hung one.
 *   • **Stop kills.** It signals the child's process group, so the CLI's own children go with it.
 *   • **Copy prompt works in every state**, including with no CLI installed and mid-failure. It is
 *     not a nicety — it is what keeps the app useful on a machine without the CLI, so it is the one
 *     control that is never hidden or disabled.
 *   • **Reads are disclosed as prominently as writes**, and above them. Writes announce themselves
 *     anyway — the prompt names its file and `acceptEdits` is in the argv on screen — while reads
 *     announce nothing at all: they are auto-approved and never prompt. The read section therefore
 *     comes first, and everything in it was derived in the main process (see `ClaudeReadScope`);
 *     this component computes no path and consults no setting of its own.
 */
export default function ClaudeRunDialog({
  preview,
  title,
  onClose,
}: {
  preview: ClaudePreview;
  /** What the run is for, e.g. the task's title — the prompt says the rest. */
  title: string;
  onClose(): void;
}) {
  const [phase, setPhase] = useState<"confirm" | "running" | "done">("confirm");
  const [output, setOutput] = useState("");
  const [result, setResult] = useState<ClaudeRunResult | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const outputRef = useRef<HTMLPreElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const running = phase === "running";

  // Escape closes, except mid-run: a dialog that vanished while its child kept running would
  // leave a process the user has no way back to.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !running) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, onClose]);

  // Follow the tail as output arrives, the way a terminal does.
  useLayoutEffect(() => {
    const el = outputRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [output]);

  // The disclosure scrolls, and the output pane appears at the bottom of it — so a user who has
  // just read the prompt and pressed Run would otherwise watch a section they cannot see. Bring
  // the run into view once, when it starts.
  useLayoutEffect(() => {
    if (running && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [running]);

  const start = async () => {
    if (!preview.token) return;
    setPhase("running");
    setOutput("");
    setResult(null);
    setRefusal(null);
    try {
      // callMain, not a bare await: `claude:run` REJECTS on a refused token (forged, replayed, or
      // expired), and an unhandled rejection here would leave the dialog spinning with no message.
      const res = await callMain(() =>
        window.maestro.claude.run(preview.token!, (chunk) => setOutput((prev) => prev + chunk.chunk))
      );
      if (!res.ok) {
        setRefusal(res.error);
        return;
      }
      setResult(res.value);
    } finally {
      setPhase("done");
    }
  };

  const stop = () => {
    if (preview.token) void window.maestro.claude.cancel(preview.token);
  };

  const copyButton = (
    <CopyableText
      text={preview.prompt}
      copiedText="Prompt copied!"
      previewText="Copy the exact prompt, to run in a session yourself"
      className="inline-flex items-center gap-1.5 rounded-lg border border-(--line) bg-(--bg-elev) px-3 py-1.5 text-[12px] font-medium text-(--ink-2) transition-colors hover:text-(--ink) data-[copied]:border-(--green) data-[copied]:text-(--green)"
    >
      {(copied) =>
        copied ? (
          <>
            <Check size={13} /> Copied!
          </>
        ) : (
          <>
            <Copy size={13} /> Copy prompt
          </>
        )
      }
    </CopyableText>
  );

  return (
    <div
      data-testid="claude-run-dialog"
      className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center"
      onClick={() => !running && onClose()}
    >
      <div
        className="bg-(--bg) border border-(--line) rounded-xl p-5 shadow-xl w-[680px] max-w-[92vw] max-h-[88vh] flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-[13px] font-semibold text-(--ink)">
          <Terminal size={14} className="text-primary" />
          Run Claude on “{title}”
        </div>

        <p className="text-[12px] text-(--ink-2) m-0">
          This runs the Claude CLI headlessly in your project. Nothing has been started yet — read the prompt below,
          then press Run.
        </p>

        {/*
          ONE scroll region for the disclosure, rather than a fixed-height box per section.
          Each section used to shrink to fit the modal, which worked while there were three of them
          and broke the moment the read scope arrived: flex squeezed the prompt's `<pre>` to a
          sliver and the section below it rendered over the top. Whatever is here has to be
          readable in full — that is the whole premise of the dialog — so the modal scrolls and the
          sections keep their natural height. Title and buttons stay put outside it, because a Run
          button that scrolls away is a Run button people press without reaching the end.
        */}
        <div ref={bodyRef} className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 pr-0.5">
          {/* Working directory + argv: the two things "what will actually happen" reduces to. */}
          <div className="flex flex-col gap-1.5 text-[11px]">
            <div className="flex gap-2">
              <span className="shrink-0 w-[86px] text-(--ink-3)">Working dir</span>
              <span data-testid="claude-cwd" className="font-mono text-(--ink) break-all select-text">
                {preview.cwd}
              </span>
            </div>
            <div className="flex gap-2">
              <span className="shrink-0 w-[86px] text-(--ink-3)">Command</span>
              <span data-testid="claude-argv" className="font-mono text-(--ink-2) break-all select-text">
                {/* Quoted so the prompt argument reads as one argument, which is what it is. */}
                {preview.argv.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ")}
              </span>
            </div>
          </div>

          {/* The full prompt, verbatim. Never a summary — this is the thing being consented to. */}
          <div className="flex flex-col gap-1">
            <div className="text-[11px] font-semibold text-subtle uppercase tracking-wide">Prompt sent to Claude</div>
            <pre
              data-testid="claude-prompt"
              className="m-0 max-h-40 overflow-auto rounded-lg border border-(--line) bg-(--bg-elev) p-3 font-mono text-[11px] leading-5 text-(--ink) whitespace-pre-wrap break-words select-text"
            >
              {preview.prompt}
            </pre>
          </div>

          <ReadScope read={preview.read} />

          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-subtle uppercase tracking-wide">
              <FilePen size={12} /> What it may write
            </div>
            <ul data-testid="claude-targets" className="list-none p-0 m-0 flex flex-col gap-0.5">
              {preview.targets.length === 0 && (
                <li className="text-[11px] text-(--ink-3)">Nothing — this invocation carries no write authority.</li>
              )}
              {preview.targets.map((t) => (
                <li key={t.path} className="text-[11px] text-(--ink-3)">
                  <span className="font-mono text-(--ink-2) break-all">{t.path}</span>
                  {t.note && <span> — {t.note}</span>}
                </li>
              ))}
            </ul>
          </div>

          {/* No CLI: say so, name where we looked, and keep the escape hatch. Run is not rendered. */}
          {!preview.available && (
            <div
              data-testid="claude-unavailable"
              className="flex items-start gap-2 px-3 py-2 rounded-lg text-[12px] bg-amber-500/10"
            >
              <AlertTriangle size={14} className="shrink-0 mt-px text-amber-500" />
              <div className="text-(--ink-2)">
                <div>{preview.unavailable}</div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-(--ink-3)">Where it looked</summary>
                  <ul className="list-none p-0 m-0 mt-1 max-h-24 overflow-y-auto font-mono text-[10px] text-(--ink-3)">
                    {preview.searched.map((dir) => (
                      <li key={dir} className="truncate" title={dir}>
                        {dir}
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            </div>
          )}

          {refusal && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-[12px] bg-red-500/10">
              <AlertTriangle size={14} className="shrink-0 mt-px text-red-500" />
              <span className="text-(--ink-2)">{refusal}</span>
            </div>
          )}

          {(running || result) && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold text-subtle uppercase tracking-wide">Output</div>
                {running && <span className="text-[11px] text-(--ink-3)">● running</span>}
              </div>
              <pre
                ref={outputRef}
                data-testid="claude-output"
                className="m-0 h-44 overflow-auto rounded-lg border border-(--line) bg-(--bg-elev) p-3 font-mono text-[11px] leading-5 text-(--ink-2) whitespace-pre-wrap break-words select-text"
              >
                {output || (running ? "Waiting for output…" : "")}
              </pre>
            </div>
          )}

          {result && <Outcome result={result} />}
        </div>

        <div className="flex gap-2 justify-end items-center pt-1">
          {copyButton}
          <div className="flex-1" />
          {running ? (
            <button
              type="button"
              onClick={stop}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-lg bg-red-500/10 border border-red-500/40 text-red-500 hover:bg-red-500/20 cursor-pointer focus:outline-none"
            >
              <Square size={12} /> Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-[12px] rounded-lg bg-(--bg-elev) border border-(--line) text-(--ink-2) hover:text-(--ink) cursor-pointer focus:outline-none"
            >
              {phase === "done" ? "Close" : "Cancel"}
            </button>
          )}
          {/* Hidden outright when the CLI is missing: a disabled Run invites a click that can only
              disappoint, and the useful control in that state is Copy prompt. */}
          {preview.available && phase !== "done" && (
            <button
              type="button"
              disabled={running}
              onClick={() => void start()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-primary text-white cursor-pointer focus:outline-none hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Play size={12} /> {running ? "Running…" : "Run"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * How the run ended.
 *
 * The four outcomes read differently on purpose. A non-zero exit means the CLI ran and disagreed —
 * its stderr is the explanation. A crash means it never ran, or was killed — that is a fact about
 * the machine, not about the prompt, and sending the user to re-read their prompt would be wrong.
 */
function Outcome({ result }: { result: ClaudeRunResult }) {
  const tone =
    result.outcome === "ok"
      ? "bg-(--green-dim) text-(--green)"
      : result.outcome === "cancelled"
        ? "bg-(--bg-elev) text-(--ink-2)"
        : "bg-red-500/10 text-red-500";

  const line =
    result.outcome === "ok"
      ? `Finished in ${(result.durationMs / 1000).toFixed(1)}s.`
      : result.outcome === "cancelled"
        ? "Stopped. The Claude process and everything it started were terminated."
        : result.outcome === "failed"
          ? `The CLI exited with code ${result.code}. Its error output is above.`
          : (result.error ?? "The CLI could not be run.");

  return (
    <div
      data-testid="claude-outcome"
      data-outcome={result.outcome}
      className={`px-3 py-2 rounded-lg text-[12px] ${tone}`}
    >
      {line}
      {result.truncated && <span className="text-(--ink-3)"> (earlier output was dropped)</span>}
    </div>
  );
}
