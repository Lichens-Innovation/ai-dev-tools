import type { SyntaxNode } from "tree-sitter";

/**
 * Language-specific AST extraction strategy used by the shared chunking orchestrator.
 * Each language adapter provides the two language-specific operations; all common steps
 * (parse, sort, graph enrichment, UTF-8 splitting) are handled by the orchestrator.
 */
export interface LanguageAstExtractor {
  collectRawChunks: (root: SyntaxNode) => RawAstChunk[];
  collectCallsInBody: (body: SyntaxNode) => Map<string, number[]>;
}

/** One row-ready chunk after AST extraction, graph enrichment, and UTF-8 size splitting. */
export interface SemanticGraphChunk {
  chunkIndex: number;
  embedText: string;
  endLine: number;
  startLine: number;
}

export type SemanticGraphSymbolKind = "Const" | "Enum" | "Function" | "Interface" | "Let" | "Method" | "Type";

export interface RawAstChunk {
  bodyNode: SyntaxNode | null;
  displayName: string;
  node: SyntaxNode;
  resolveName: string;
  symbolKind: SemanticGraphSymbolKind;
}

export interface DefinitionEntry {
  displayName: string;
  endLine: number;
  resolveName: string;
  startLine: number;
  startIndex: number;
}

export interface SemanticGraphChunksArgs {
  maxEmbedUtf8Bytes: number;
  pathRelative: string;
  repository: string;
  source: string;
}
