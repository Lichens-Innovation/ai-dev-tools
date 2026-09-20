import fs from "fs";
import type { ScaffoldResult } from "./scaffold";

// Shared result-file writers for the four create-* server fns. Every create submit ends with the
// same shape (top-level aiToolsAction + scaffold + a UserPromptExpansion additionalContext), and
// every cancel writes the same decision:"block". Centralised here so the four flows can't drift.

function resultFile(): string {
  return process.env.RESULT_FILE ?? "/tmp/result.json";
}

// Success result the /ai-tools dispatcher (and the legacy UserPromptExpansion hook) consume.
// additionalContext is the verbatim contract the create-* skills parse:
//   "<Label> form data: <formData>\n\nDeterministic scaffold: <scaffold JSON>"
export function writeCreateResult(opts: {
  action: string; // aiToolsAction discriminator, e.g. "create-skill"
  label: string; // human label for the form data line, e.g. "Skill"
  formData: string; // already-stringified form payload
  scaffold: ScaffoldResult;
}): void {
  fs.writeFileSync(
    resultFile(),
    JSON.stringify({
      aiToolsAction: opts.action,
      scaffold: opts.scaffold,
      hookSpecificOutput: {
        hookEventName: "UserPromptExpansion",
        additionalContext:
          `${opts.label} form data: ${opts.formData}\n\n` +
          `Deterministic scaffold: ${JSON.stringify(opts.scaffold)}`,
      },
    }),
  );
}

// Cancellation result that blocks the consuming skill.
export function writeCancelResult(action: string, reason: string): void {
  fs.writeFileSync(resultFile(), JSON.stringify({ aiToolsAction: action, decision: "block", reason }));
}
