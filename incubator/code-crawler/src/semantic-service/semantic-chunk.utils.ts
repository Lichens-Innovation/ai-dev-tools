import { isBlank } from "@lichens-innovation/ts-common";

/**
 * Line-based splitting of file content for semantic indexing (one embedding per chunk).
 */

export type SemanticLineChunk = {
  body: string;
  endLine: number;
  startLine: number;
};

const parsePositiveInt = (raw?: string): number | null => {
  const trimmed = raw?.trim();
  if (isBlank(trimmed)) {
    return null;
  }
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const getSemanticChunkParams = (): {
  maxCharsPerChunk: number; // "chars" here means UTF-8 bytes.
  maxLinesPerChunk: number;
  overlapLines: number;
} => ({
  maxCharsPerChunk: parsePositiveInt(process.env.CODE_CRAWLER_CHUNK_MAX_CHARS) ?? 1280,
  maxLinesPerChunk: parsePositiveInt(process.env.CODE_CRAWLER_CHUNK_MAX_LINES) ?? 48,
  overlapLines: parsePositiveInt(process.env.CODE_CRAWLER_CHUNK_OVERLAP_LINES) ?? 10,
});

const normalizeSourceNewlines = (content: string): string => content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

/**
 * Splits normalized content into overlapping line windows,
 * capped by UTF-8 length per chunk (line boundaries only).
 * Limits come from CODE_CRAWLER_CHUNK_* environment variables.
 */
export const buildSemanticLineChunks = (content: string): SemanticLineChunk[] => {
  const { maxCharsPerChunk, maxLinesPerChunk, overlapLines: overlapFromEnv } = getSemanticChunkParams();
  const overlapLines = Math.min(overlapFromEnv, maxLinesPerChunk - 1);

  const normalized = normalizeSourceNewlines(content);
  const lines = normalized.length === 0 ? [""] : normalized.split("\n");

  const chunks: SemanticLineChunk[] = [];
  let startIdx = 0;

  while (startIdx < lines.length) {
    let endIdx = startIdx;
    let bodyLines: string[] = [];

    while (endIdx < lines.length) {
      const candidateLine = lines[endIdx] ?? "";
      const nextLines = [...bodyLines, candidateLine];
      const nextBody = nextLines.join("\n");
      const nextLen = Buffer.byteLength(nextBody, "utf8");
      const lineCount = nextLines.length;

      if (lineCount > maxLinesPerChunk) {
        break;
      }
      if (lineCount > 1 && nextLen > maxCharsPerChunk) {
        break;
      }
      if (lineCount === 1 && nextLen > maxCharsPerChunk) {
        bodyLines = nextLines;
        endIdx += 1;
        break;
      }

      bodyLines = nextLines;
      endIdx += 1;

      if (nextLen >= maxCharsPerChunk) {
        break;
      }
    }

    if (bodyLines.length === 0) {
      const line = lines[startIdx] ?? "";
      bodyLines = [line];
      endIdx = startIdx + 1;
    }

    const startLine = startIdx + 1;
    const endLine = startIdx + bodyLines.length;
    chunks.push({
      startLine,
      endLine,
      body: bodyLines.join("\n"),
    });

    const lastEnd = endIdx - 1;
    const nextStart = lastEnd + 1 - overlapLines;
    startIdx = nextStart > startIdx ? nextStart : lastEnd + 1;
  }

  return chunks;
};
