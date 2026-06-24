import { humanizeLog } from "../utils/session-log";
import type { Instance } from "../utils/session-log";

interface SessionLogDetailProps {
  instance: Instance | null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-[12px] font-semibold text-(--ink) mb-2">{title}</div>
      <div className="text-[12px] text-(--ink-2) leading-[1.7]">{children}</div>
    </div>
  );
}

export default function SessionLogDetail({ instance }: SessionLogDetailProps) {
  if (!instance) {
    return (
      <div className="border-l border-(--line) flex items-center justify-center h-full">
        <p className="text-[12px] text-(--ink-3)">Select a step to view details</p>
      </div>
    );
  }

  const processLines = instance.entries
    .map((e) => humanizeLog(e))
    .filter((line): line is string => line !== null);

  return (
    <div className="border-l border-(--line) flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-(--line) shrink-0">
        <span className="text-[13px] font-medium text-(--ink)">
          Logs: {instance.displayName}
        </span>
      </div>

      {/* Scrollable detail body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <Section title="Input">
          {instance.input ? (
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] m-0">
              {instance.input}
            </pre>
          ) : (
            <span className="text-(--ink-3) italic">No input captured</span>
          )}
        </Section>

        <Section title="Process">
          {processLines.length > 0 ? (
            processLines.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-words font-mono text-[11px]">
                - {instance.origin === "main_session"
                  ? line
                  : `[${instance.displayName}]: ${line}`}
              </div>
            ))
          ) : (
            <span className="text-(--ink-3) italic">No tool calls recorded</span>
          )}
        </Section>

        <Section title="Output">
          {instance.output ? (
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] m-0">
              {instance.output}
            </pre>
          ) : (
            <span className="text-(--ink-3) italic">No output captured</span>
          )}
        </Section>
      </div>
    </div>
  );
}
