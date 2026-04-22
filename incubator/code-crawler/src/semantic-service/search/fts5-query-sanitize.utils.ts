import { isBlank } from "@lichens-innovation/ts-common";

/**
 * Builds a conservative FTS5 `MATCH` string (implicit AND between tokens).
 * Returns `null` when there is nothing safe to search.
 */
export const buildSafeFts5MatchQuery = (queryText: string): string | null => {
  const trimmed = queryText.trim();
  if (isBlank(trimmed)) {
    return null;
  }

  // Keep only Unicode letter/digit/underscore runs; strip punctuation and other FTS5-special chars.
  const tokens = trimmed.match(/[\p{L}\p{N}_]+/gu) ?? [];
  if (tokens.length === 0) {
    return null;
  }

  const escaped = tokens.map((t) => {
    const inner = t.replaceAll('"', "");
    return `"${inner}"`;
  });

  return escaped.join(" ");
};
