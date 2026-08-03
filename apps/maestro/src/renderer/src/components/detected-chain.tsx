import { Check, ScanSearch } from "lucide-react";
import type { RepoDetection } from "../utils/maestro";

/**
 * The implementation-agent chain the repo detection proposed, the evidence for it, and the
 * controls to change it — shown while the canvas is still a starter configuration.
 *
 * Three things have to be true at once here, and each is why one part of this exists:
 *
 *   • **The choice is visible.** The seed used to hardcode `["backend"]`; a frontend project got a
 *     backend agent and nothing on screen said where that came from.
 *   • **The reasoning is visible.** `evidence` names the dependencies and files that matched. A
 *     detector that is sometimes wrong but shows its work can be corrected; the same detector,
 *     silent, is just an unexplained choice the user is asked to trust.
 *   • **The user can override it before it counts.** Toggling a chip re-seeds the whole starter
 *     graph — nothing is on disk until Save, so being wrong here costs a click.
 */
export default function DetectedChain({
  detection,
  selected,
  candidates,
  busy,
  onChange,
}: {
  detection: RepoDetection;
  /** The chain currently in the canvas — the detection, or whatever the user changed it to. */
  selected: string[];
  /** Implementation agents on offer: the bundled ones, minus the core four every seed includes. */
  candidates: string[];
  busy: boolean;
  onChange(implAgents: string[]): void;
}) {
  const toggle = (agent: string) => {
    if (busy) return;
    const next = selected.includes(agent) ? selected.filter((a) => a !== agent) : [...selected, agent];
    // A workflow whose implementation step is missing has no happy path to run, so the last
    // remaining agent can't be turned off — the user swaps it, they don't empty the chain.
    if (next.length === 0) return;
    onChange(next);
  };

  return (
    <div
      data-testid="detected-chain"
      className="flex flex-col gap-2 px-4 py-2.5 border-b border-(--line) bg-(--bg-elev)"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <ScanSearch size={14} className="shrink-0 text-(--ink-3)" />
        <span className="text-[12px] text-(--ink-2)">
          {detection.fallback ? "Could not tell what this repo builds — starting with" : "Detected from this repo:"}
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {candidates.map((agent) => {
            const on = selected.includes(agent);
            return (
              <button
                key={agent}
                type="button"
                data-agent={agent}
                aria-pressed={on}
                disabled={busy}
                onClick={() => toggle(agent)}
                title={
                  on
                    ? `@${agent} implements the code in the seeded happy path — click to remove`
                    : `Add @${agent} to the seeded happy path`
                }
                className={`inline-flex items-center gap-1 h-6 px-2 rounded-full font-mono text-[11px] border cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                  on
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-(--line) text-(--ink-3) hover:text-(--ink)"
                }`}
              >
                {on && <Check size={10} />}
                {agent}
              </button>
            );
          })}
        </div>
        <span className="text-[11px] text-(--ink-3)">
          {busy ? "Re-seeding…" : "— change it and the starter workflows are rebuilt around it."}
        </span>
      </div>

      {/*
        The evidence, verbatim from the detector. Rendered as plain text with backticks intact
        rather than parsed into markup: these are dependency and file names, and a `react-dom` the
        user can copy out of the line is more useful than a styled one.
      */}
      <ul
        data-testid="detection-evidence"
        className="list-none p-0 m-0 pl-6 flex flex-col gap-0.5 text-[11px] text-(--ink-3) font-mono"
      >
        {detection.evidence.map((line) => (
          <li key={line} className="truncate" title={line}>
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
