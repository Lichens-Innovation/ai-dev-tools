import { isNullish } from "@lichens-innovation/ts-common";
import { Buffer } from "node:buffer";
import { type SyntaxNode } from "tree-sitter";
import { normalizeSourceNewlines } from "../../utils/text/newlines.utils";
import type { DefinitionEntry, RawAstChunk, SemanticGraphChunk, SemanticGraphSymbolKind } from "./graph-chunks.types";

/** Tree-sitter `SyntaxNode.type` string equality against two or more alternatives. */
export const isSyntaxNodeType = (type: string, ...allowed: string[]): boolean => allowed.includes(type);

export const lineNumber1Based = (node: SyntaxNode): { endLine: number; startLine: number } => ({
  startLine: node.startPosition.row + 1,
  endLine: node.endPosition.row + 1,
});

export const lastSegment = (displayName: string): string => {
  const parts = displayName.split(".");
  return parts[parts.length - 1] ?? displayName;
};

/** Same AST node can be reached from export and declaration paths in broken trees; keep one. */
export const dedupeRawChunks = (chunks: RawAstChunk[]): RawAstChunk[] => {
  const seen = new Set<string>();
  const out: RawAstChunk[] = [];

  for (const rawChunk of chunks) {
    const key = `${rawChunk.node.startIndex}:${rawChunk.node.endIndex}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    out.push(rawChunk);
  }

  return out;
};

export const buildDefsIndex = (raw: RawAstChunk[]): Map<string, DefinitionEntry[]> => {
  const map = new Map<string, DefinitionEntry[]>();

  for (const rawChunk of raw) {
    const { startLine, endLine } = lineNumber1Based(rawChunk.node);
    const entry: DefinitionEntry = {
      displayName: rawChunk.displayName,
      endLine,
      resolveName: rawChunk.resolveName,
      startLine,
      startIndex: rawChunk.node.startIndex,
    };
    const list = map.get(rawChunk.resolveName) ?? [];
    list.push(entry);
    map.set(rawChunk.resolveName, list);
  }

  for (const [, list] of map) {
    list.sort((left, right) => left.startLine - right.startLine || left.startIndex - right.startIndex);
  }

  return map;
};

interface ResolveLocalCalleeArgs {
  calleeName: string;
  callLine: number;
  defsByResolveName: Map<string, DefinitionEntry[]>;
}

export const resolveLocalCallee = ({ calleeName, callLine, defsByResolveName }: ResolveLocalCalleeArgs): boolean => {
  const candidates = defsByResolveName.get(calleeName);
  if (isNullish(candidates) || candidates.length === 0) {
    return false;
  }

  const bestAtOrAboveCallLine = candidates.reduce<DefinitionEntry | null>((best, candidate) => {
    if (candidate.startLine > callLine) {
      return best;
    }

    if (isNullish(best) || candidate.startLine > best.startLine) {
      return candidate;
    }

    return best;
  }, null);

  if (!isNullish(bestAtOrAboveCallLine)) {
    return true;
  }

  return candidates.length > 0;
};

export interface CallsAndCalledByIndex {
  calledByByResolveName: Map<string, Set<string>>;
  callsByChunkIndex: string[][];
}

export const buildCallsAndCalledBy = (
  raw: RawAstChunk[],
  defsByResolveName: Map<string, DefinitionEntry[]>,
  collectCallsInBody: (body: SyntaxNode) => Map<string, number[]>
): CallsAndCalledByIndex => {
  const callsByChunkIndex: string[][] = raw.map(() => []);
  const calledByByResolveName = new Map<string, Set<string>>();

  const addCalledBy = (calleeResolve: string, callerDisplay: string): void => {
    const set = calledByByResolveName.get(calleeResolve) ?? new Set();
    set.add(callerDisplay);
    calledByByResolveName.set(calleeResolve, set);
  };

  raw.forEach((rawChunk, chunkIndex) => {
    if (isNullish(rawChunk.bodyNode)) {
      return;
    }

    const seen = new Set<string>();
    const callsLines = collectCallsInBody(rawChunk.bodyNode);

    for (const [calleeName, lines] of callsLines) {
      for (const line of lines) {
        if (!resolveLocalCallee({ calleeName, callLine: line, defsByResolveName })) {
          continue;
        }

        if (seen.has(calleeName)) {
          continue;
        }

        seen.add(calleeName);
        callsByChunkIndex[chunkIndex].push(calleeName);
        addCalledBy(calleeName, rawChunk.displayName);
      }
    }
  });

  return { callsByChunkIndex, calledByByResolveName };
};

interface BuildEmbedHeaderArgs {
  calledBy: string[];
  calls: string[];
  displayName: string;
  pathRelative: string;
  repository: string;
  symbolKind: SemanticGraphSymbolKind;
}

export const buildEmbedHeader = (args: BuildEmbedHeaderArgs): string =>
  [
    `File: ${args.pathRelative}`,
    `Repo: ${args.repository}`,
    "",
    `Type: ${args.symbolKind}`,
    `Name: ${args.displayName}`,
    `Calls: ${args.calls.length > 0 ? args.calls.join(", ") : "none"}`,
    `CalledBy: ${args.calledBy.length > 0 ? args.calledBy.join(", ") : "none"}`,
    "",
    "Code:",
  ].join("\n");

export const utf8ByteLength = (text: string): number => Buffer.byteLength(text, "utf8");

interface SplitLongLineByUtf8Args {
  line: string;
  maxBytes: number;
}

export const splitLongLineByUtf8 = ({ line, maxBytes }: SplitLongLineByUtf8Args): string[] => {
  const out: string[] = [];
  let start = 0;

  while (start < line.length) {
    let end = start;
    let size = 0;

    while (end < line.length) {
      const character = line[end]!;
      const characterBytes = utf8ByteLength(character);
      if (size + characterBytes > maxBytes) {
        break;
      }

      size += characterBytes;
      end += 1;
    }
    if (end === start) {
      end = start + 1;
    }

    out.push(line.slice(start, end));
    start = end;
  }

  return out;
};

interface SplitCodeByUtf8BudgetArgs {
  code: string;
  maxCodeBytes: number;
}

export const splitCodeByUtf8Budget = ({ code, maxCodeBytes }: SplitCodeByUtf8BudgetArgs): string[] => {
  if (maxCodeBytes < 1) {
    return [code];
  }

  if (utf8ByteLength(code) <= maxCodeBytes) {
    return [code];
  }

  const lines = code.split("\n");
  const parts: string[] = [];
  let buf: string[] = [];
  let bufBytes = 0;

  const flush = (): void => {
    if (buf.length > 0) {
      parts.push(buf.join("\n"));
      buf = [];
      bufBytes = 0;
    }
  };

  for (const line of lines) {
    const lineBytes = utf8ByteLength(line) + (buf.length > 0 ? 1 : 0);
    if (lineBytes > maxCodeBytes) {
      flush();
      parts.push(...splitLongLineByUtf8({ line, maxBytes: maxCodeBytes }));

      continue;
    }
    if (bufBytes + lineBytes > maxCodeBytes) {
      flush();
    }
    if (buf.length > 0) {
      bufBytes += 1;
    }
    buf.push(line);
    bufBytes += utf8ByteLength(line);
  }

  flush();

  return parts.length > 0 ? parts : [""];
};

interface ExpandChunksToMaxUtf8Args {
  calledByDisplayByCaller: string[][];
  callsByIdx: string[][];
  maxEmbedUtf8Bytes: number;
  pathRelative: string;
  raw: RawAstChunk[];
  repository: string;
}

export const expandChunksToMaxUtf8 = ({
  calledByDisplayByCaller,
  callsByIdx,
  maxEmbedUtf8Bytes,
  pathRelative,
  raw,
  repository,
}: ExpandChunksToMaxUtf8Args): SemanticGraphChunk[] => {
  const out: SemanticGraphChunk[] = [];
  let chunkIndex = 0;

  for (let rawIndex = 0; rawIndex < raw.length; rawIndex += 1) {
    const rawChunk = raw[rawIndex]!;
    const calls = callsByIdx[rawIndex] ?? [];
    const calledBy = calledByDisplayByCaller[rawIndex] ?? [];
    const header = buildEmbedHeader({
      calledBy,
      calls,
      displayName: rawChunk.displayName,
      pathRelative,
      repository,
      symbolKind: rawChunk.symbolKind,
    });
    const headerBytes = utf8ByteLength(`${header}\n\n`);
    const maxCodeBytes = Math.max(64, maxEmbedUtf8Bytes - headerBytes - 32);
    const code = normalizeSourceNewlines(rawChunk.node.text);
    const codeParts = splitCodeByUtf8Budget({ code, maxCodeBytes });
    const totalParts = codeParts.length;

    for (const [partIndex, codePart] of codeParts.entries()) {
      const partLabel = totalParts > 1 ? ` (part ${partIndex + 1}/${totalParts})` : "";
      const embedText = `${header}${partLabel}\n\n${codePart}\n`;
      const { startLine, endLine } = lineNumber1Based(rawChunk.node);
      out.push({
        chunkIndex,
        embedText,
        endLine,
        startLine,
      });
      chunkIndex += 1;
    }
  }

  return out;
};

export const buildCalledByDisplayLists = (
  raw: RawAstChunk[],
  calledByByResolveName: Map<string, Set<string>>
): string[][] => {
  return raw.map((rawChunk) => {
    const set = calledByByResolveName.get(rawChunk.resolveName);
    if (isNullish(set)) {
      return [];
    }

    return [...set].sort((left, right) => left.localeCompare(right));
  });
};

export const finalizeSemanticGraphChunks = (expanded: SemanticGraphChunk[]): SemanticGraphChunk[] =>
  expanded.map((chunk, index) => ({ ...chunk, chunkIndex: index }));
