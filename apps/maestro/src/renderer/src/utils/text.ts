// Small string helpers for the session log's origin labels.
//
// The module came over from the web app whole, but half of it — firstSentence, joinOxford,
// buildDesc, clip — existed only for the four create-* routes, which are not ported (they need
// the `claude -p` bridge, M4). Those are dropped rather than carried as dead weight; when M4
// ports the routes it re-copies them from apps/ai-tools-manager/src/utils/text.ts along with
// everything else those routes need.

/** Drop a plugin/marketplace namespace prefix: "ai-tools-manager:frontend" -> "frontend". */
export function stripNamespace(name: string): string {
  const i = name.lastIndexOf(":");
  return i === -1 ? name : name.slice(i + 1);
}

export function titleFromName(name: string, fallback = "my-thing"): string {
  return (name || fallback)
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
