import { createFileRoute } from "@tanstack/react-router";
import fs from "fs";
import { resolveLogFile, parseLogLines } from "../../utils/afk-session-log";

export const Route = createFileRoute("/api/session-log-stream")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const encoder = new TextEncoder();

        const stream = new ReadableStream({
          start(controller) {
            const send = (event: string, data: unknown) => {
              try {
                controller.enqueue(
                  encoder.encode(
                    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
                  )
                );
              } catch {
                // client disconnected
              }
            };

            // Send initial snapshot
            const file = resolveLogFile();
            let lineCount = 0;
            let lastResetSent = false;

            const readFile = (): string => {
              if (!file) return "";
              try {
                return fs.readFileSync(file, "utf8");
              } catch {
                return "";
              }
            };

            const snapshot = parseLogLines(readFile());
            send("init", snapshot);
            lineCount = snapshot.length;

            // Poll for new lines every 1 second
            const pollInterval = setInterval(() => {
              try {
                const raw = readFile();
                if (!raw) {
                  // File is gone (SessionEnd) — emit reset once
                  if (lineCount > 0 || !lastResetSent) {
                    send("reset", {});
                    lineCount = 0;
                    lastResetSent = true;
                  }
                  return;
                }
                lastResetSent = false;
                const next = parseLogLines(raw);
                if (next.length > lineCount) {
                  for (let i = lineCount; i < next.length; i++) {
                    send("entry", next[i]);
                  }
                  lineCount = next.length;
                } else if (next.length < lineCount) {
                  // File was truncated / replaced (new session)
                  send("reset", {});
                  lineCount = 0;
                  lastResetSent = false;
                  // Re-send init with the new content
                  send("init", next);
                  lineCount = next.length;
                }
              } catch {
                // best-effort — ignore poll errors
              }
            }, 1000);

            // Heartbeat to keep proxies alive
            const heartbeatInterval = setInterval(() => {
              try {
                controller.enqueue(encoder.encode(":\n\n"));
              } catch {
                // ignore
              }
            }, 15_000);

            const cleanup = () => {
              clearInterval(pollInterval);
              clearInterval(heartbeatInterval);
              try {
                controller.close();
              } catch {
                // already closed
              }
            };

            request.signal.addEventListener("abort", cleanup);
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
