import { isNullish } from "@lichens-innovation/ts-common";
import { extname } from "node:path";
import Parser from "tree-sitter";
import { normalizeSourceNewlines } from "../../utils/text/newlines.utils";
import {
  CPP_FILE_EXTENSIONS,
  CSHARP_FILE_EXTENSIONS,
  JAVASCRIPT_FILE_EXTENSIONS,
  PYTHON_FILE_EXTENSIONS,
  TYPESCRIPT_FILE_EXTENSIONS,
} from "./chunk-language-file-extensions";
import { cppAstExtractor } from "./graph-chunks-for-cpp";
import { csharpAstExtractor } from "./graph-chunks-for-csharp";
import { javascriptAstExtractor, typescriptAstExtractor } from "./graph-chunks-for-ecmascript";
import { pythonAstExtractor } from "./graph-chunks-for-python";
import type { LanguageAstExtractor, SemanticGraphChunk, SemanticGraphChunksArgs } from "./graph-chunks.types";
import {
  buildCalledByDisplayLists,
  buildCallsAndCalledBy,
  buildDefsIndex,
  expandChunksToMaxUtf8,
  finalizeSemanticGraphChunks,
} from "./graph-chunks.utils";
import { getTreeSitterLanguageForPath } from "./tree-sitter-language-registry";

const EXTRACTOR_BY_EXTENSION: ReadonlyMap<string, LanguageAstExtractor> = new Map([
  ...TYPESCRIPT_FILE_EXTENSIONS.map((ext) => [ext, typescriptAstExtractor] as const),
  ...JAVASCRIPT_FILE_EXTENSIONS.map((ext) => [ext, javascriptAstExtractor] as const),
  ...PYTHON_FILE_EXTENSIONS.map((ext) => [ext, pythonAstExtractor] as const),
  ...CPP_FILE_EXTENSIONS.map((ext) => [ext, cppAstExtractor] as const),
  ...CSHARP_FILE_EXTENSIONS.map((ext) => [ext, csharpAstExtractor] as const),
]);

interface BuildSemanticGraphChunksArgs {
  graphChunksArgs: SemanticGraphChunksArgs;
  extractor: LanguageAstExtractor;
}

const buildSemanticGraphChunks = ({
  graphChunksArgs,
  extractor,
}: BuildSemanticGraphChunksArgs): SemanticGraphChunk[] => {
  const normalized = normalizeSourceNewlines(graphChunksArgs.source);
  const language = getTreeSitterLanguageForPath(graphChunksArgs.pathRelative);
  if (isNullish(language)) {
    return [];
  }

  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(normalized);

  if (tree.rootNode.hasError) {
    console.warn(
      `[buildSemanticGraphChunksForSource] parse has errors, skipping file: ${graphChunksArgs.pathRelative}`
    );
    return [];
  }

  const raw = extractor.collectRawChunks(tree.rootNode);
  if (raw.length === 0) {
    return [];
  }

  raw.sort((left, right) => left.node.startIndex - right.node.startIndex || left.node.endIndex - right.node.endIndex);

  const defs = buildDefsIndex(raw);
  const { callsByChunkIndex, calledByByResolveName } = buildCallsAndCalledBy(raw, defs, extractor.collectCallsInBody);
  const calledByDisplay = buildCalledByDisplayLists(raw, calledByByResolveName);

  const expanded = expandChunksToMaxUtf8({
    calledByDisplayByCaller: calledByDisplay,
    callsByIdx: callsByChunkIndex,
    maxEmbedUtf8Bytes: graphChunksArgs.maxEmbedUtf8Bytes,
    pathRelative: graphChunksArgs.pathRelative,
    raw,
    repository: graphChunksArgs.repository,
  });

  return finalizeSemanticGraphChunks(expanded);
};

/**
 * Routes to the language-specific AST extractor by file extension, then runs the
 * shared chunking orchestration (parse → raw chunks → graph enrichment → UTF-8 split).
 */
export const buildSemanticGraphChunksForSource = (graphChunksArgs: SemanticGraphChunksArgs): SemanticGraphChunk[] => {
  const ext = extname(graphChunksArgs.pathRelative).toLowerCase();
  const extractor = EXTRACTOR_BY_EXTENSION.get(ext);
  if (isNullish(extractor)) {
    return [];
  }

  return buildSemanticGraphChunks({ graphChunksArgs, extractor });
};
