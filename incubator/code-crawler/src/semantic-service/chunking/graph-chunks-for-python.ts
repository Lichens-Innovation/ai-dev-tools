import { isNullish } from "@lichens-innovation/ts-common";
import { extname } from "node:path";
import Parser from "tree-sitter";
import type { SyntaxNode } from "tree-sitter";
import { normalizeSourceNewlines } from "../../utils/text/newlines.utils";
import type {
  BuildSemanticGraphChunksForSourceArgs,
  RawAstChunk,
  SemanticGraphChunk,
  SemanticGraphSymbolKind,
} from "./graph-chunks.types";
import {
  buildCalledByDisplayLists,
  buildCallsAndCalledBy,
  buildDefsIndex,
  dedupeRawChunks,
  expandChunksToMaxUtf8,
  finalizeSemanticGraphChunks,
  lastSegment,
} from "./graph-chunks.utils";
import { PYTHON_FILE_EXTENSION_SET } from "./chunk-language-file-extensions";
import { getTreeSitterLanguageForPath } from "./tree-sitter-language-registry";

const calleeNameFromPythonExpression = (expr: SyntaxNode): string | null => {
  if (expr.type === "identifier") {
    return expr.text;
  }

  if (expr.type === "attribute") {
    const attr = expr.childForFieldName("attribute");
    return attr?.text ?? null;
  }

  return null;
};

const calleeNameFromPythonCall = (callNode: SyntaxNode): string | null => {
  const functionNode = callNode.childForFieldName("function");
  if (isNullish(functionNode)) {
    return null;
  }

  return calleeNameFromPythonExpression(functionNode);
};

const collectCallsInBody = (body: SyntaxNode): Map<string, number[]> => {
  const byName = new Map<string, number[]>();
  const visit = (syntaxNode: SyntaxNode): void => {
    if (syntaxNode.type === "call") {
      const name = calleeNameFromPythonCall(syntaxNode);
      if (!isNullish(name)) {
        const line = syntaxNode.startPosition.row + 1;
        const arr = byName.get(name) ?? [];
        arr.push(line);
        byName.set(name, arr);
      }
    }

    for (const childNode of syntaxNode.namedChildren) {
      visit(childNode);
    }
  };

  visit(body);

  return byName;
};

interface TryPushRawChunkArgs {
  out: RawAstChunk[];
  chunk: RawAstChunk | null;
}

const tryPushRawChunk = ({ out, chunk }: TryPushRawChunkArgs): void => {
  if (isNullish(chunk)) {
    return;
  }

  out.push(chunk);
};

interface PythonFunctionChunkArgs {
  node: SyntaxNode;
  className: string | null;
}

const pythonFunctionChunk = ({ node, className }: PythonFunctionChunkArgs): RawAstChunk => {
  const name = node.childForFieldName("name")?.text ?? "(anonymous)";
  const displayName = className === null ? name : `${className}.${name}`;
  const symbolKind: SemanticGraphSymbolKind = className === null ? "Function" : "Method";

  return {
    bodyNode: node.childForFieldName("body"),
    displayName,
    node,
    resolveName: lastSegment(displayName),
    symbolKind,
  };
};

interface WalkPythonBlockArgs {
  block: SyntaxNode;
  out: RawAstChunk[];
  classContext: string | null;
}

const walkPythonBlock = ({ block, out, classContext }: WalkPythonBlockArgs): void => {
  for (const stmt of block.namedChildren) {
    walkPythonStatement({ stmt, out, classContext });
  }
};

interface WalkPythonStatementArgs {
  stmt: SyntaxNode;
  out: RawAstChunk[];
  classContext: string | null;
}

const walkPythonStatement = ({ stmt, out, classContext }: WalkPythonStatementArgs): void => {
  if (stmt.type === "decorated_definition") {
    for (const child of stmt.namedChildren) {
      if (["function_definition", "class_definition"].includes(child.type)) {
        walkPythonStatement({ stmt: child, out, classContext });
      }
    }

    return;
  }

  if (stmt.type === "function_definition") {
    tryPushRawChunk({ out, chunk: pythonFunctionChunk({ node: stmt, className: classContext }) });
    const body = stmt.childForFieldName("body");
    if (!isNullish(body)) {
      walkPythonBlock({ block: body, out, classContext: null });
    }

    return;
  }

  if (stmt.type === "class_definition") {
    const className = stmt.childForFieldName("name")?.text ?? "(anonymous class)";
    const body = stmt.childForFieldName("body");
    if (!isNullish(body)) {
      walkPythonBlock({ block: body, out, classContext: className });
    }

    return;
  }

  for (const child of stmt.namedChildren) {
    if (child.type === "block") {
      walkPythonBlock({ block: child, out, classContext });
    }
  }
};

const collectRawChunks = (root: SyntaxNode): RawAstChunk[] => {
  const out: RawAstChunk[] = [];

  if (root.type !== "module") {
    return out;
  }

  for (const stmt of root.namedChildren) {
    walkPythonStatement({ stmt, out, classContext: null });
  }

  return dedupeRawChunks(out);
};

const isPythonPath = (pathRelative: string): boolean =>
  PYTHON_FILE_EXTENSION_SET.has(extname(pathRelative).toLowerCase());

export const buildSemanticGraphChunksForPythonSource = (
  args: BuildSemanticGraphChunksForSourceArgs
): SemanticGraphChunk[] => {
  if (!isPythonPath(args.pathRelative)) {
    return [];
  }

  const normalized = normalizeSourceNewlines(args.source);
  const language = getTreeSitterLanguageForPath(args.pathRelative);
  if (isNullish(language)) {
    return [];
  }

  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(normalized);

  if (tree.rootNode.hasError) {
    console.warn(`[semantic-chunking] parse has errors, skipping file: ${args.pathRelative}`);
    return [];
  }

  const raw = collectRawChunks(tree.rootNode);
  if (raw.length === 0) {
    return [];
  }

  raw.sort((left, right) => left.node.startIndex - right.node.startIndex || left.node.endIndex - right.node.endIndex);

  const defs = buildDefsIndex(raw);
  const { callsByChunkIndex, calledByByResolveName } = buildCallsAndCalledBy(raw, defs, collectCallsInBody);
  const calledByDisplay = buildCalledByDisplayLists(raw, calledByByResolveName);

  const expanded = expandChunksToMaxUtf8({
    calledByDisplayByCaller: calledByDisplay,
    callsByIdx: callsByChunkIndex,
    maxEmbedUtf8Bytes: args.maxEmbedUtf8Bytes,
    pathRelative: args.pathRelative,
    raw,
    repository: args.repository,
  });

  return finalizeSemanticGraphChunks(expanded);
};
