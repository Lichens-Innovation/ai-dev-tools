import { createServerFn } from "@tanstack/react-start";
import fs from "fs";

// Writes a `shutdown` result so the persistent-session dispatcher (/ai-tools) breaks its
// listen-loop and reports done. This is the in-app "I'm finished" affordance for the
// always-listening mode — the counterpart to ending the Claude session or stopping the
// container from Docker Desktop. Container teardown itself still happens at SessionEnd
// (maestro-session-cleanup.sh); this only tells the dispatcher to stop waiting.
export const shutdownAppSession = createServerFn({ method: "POST" }).handler(async () => {
  const resultFile = process.env.RESULT_FILE ?? "/tmp/result.json";
  fs.writeFileSync(resultFile, JSON.stringify({ aiToolsAction: "shutdown" }));
  return { ok: true };
});
