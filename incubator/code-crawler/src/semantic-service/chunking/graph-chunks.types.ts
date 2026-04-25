import type { SyntaxNode } from "tree-sitter";

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

export interface BuildSemanticGraphChunksForSourceArgs {
  maxEmbedUtf8Bytes: number;
  pathRelative: string;
  repository: string;
  source: string;
}
