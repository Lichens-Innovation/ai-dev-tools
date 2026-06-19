import { createContext, useContext, useEffect, useState } from "react";
import type { SessionLogEntry } from "./afk-session-log";

interface SessionLogContextValue {
  entries: SessionLogEntry[];
  connected: boolean;
}

const SessionLogContext = createContext<SessionLogContextValue>({
  entries: [],
  connected: false,
});

export function SessionLogProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<SessionLogEntry[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (typeof EventSource === "undefined") return;

    const es = new EventSource("/api/session-log-stream");

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.addEventListener("init", (e: MessageEvent) => {
      try {
        setEntries(JSON.parse(e.data) as SessionLogEntry[]);
        setConnected(true);
      } catch {
        // ignore malformed
      }
    });

    es.addEventListener("entry", (e: MessageEvent) => {
      try {
        const entry = JSON.parse(e.data) as SessionLogEntry;
        setEntries((prev) => [...prev, entry]);
      } catch {
        // ignore malformed
      }
    });

    es.addEventListener("reset", () => {
      setEntries([]);
    });

    return () => {
      es.close();
    };
  }, []);

  return (
    <SessionLogContext.Provider value={{ entries, connected }}>
      {children}
    </SessionLogContext.Provider>
  );
}

export function useSessionLog(): SessionLogContextValue {
  return useContext(SessionLogContext);
}
