export function firstSentence(s: string): string {
  const m = s.match(/^[^.!?]+[.!?]/);
  return m ? m[0].trim() : s.trim();
}

export function titleFromName(name: string, fallback = "my-thing"): string {
  return (name || fallback)
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function joinOxford(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return items.slice(0, -1).join(", ") + " or " + items.slice(-1)[0];
}

export function buildDesc(
  mode: "auto" | "manual",
  idea: string,
  triggers: string[],
  opts: { manualFallback?: string; whatFallback?: string } = {},
): string {
  const {
    manualFallback = "<short description of what this does>",
    whatFallback = "<what this does>",
  } = opts;
  if (mode === "manual") return idea.trim() || manualFallback;
  const what = firstSentence(idea) || whatFallback;
  if (!triggers.length) return `${what} Use when <add triggers on the left>.`;
  return `${what} Use when ${joinOxford(triggers)}.`;
}

export function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
