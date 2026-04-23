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
import { CPP_FILE_EXTENSION_SET } from "./chunk-language-file-extensions";
import { getTreeSitterLanguageForPath } from "./tree-sitter-language-registry";

const calleeNameFromCallLike = (callNode: SyntaxNode): string | null => {
  const functionNode = callNode.childForFieldName("function");
  if (isNullish(functionNode)) {
    return null;
  }

  return calleeNameFromExpression(functionNode);
};

const calleeNameFromNewExpression = (newNode: SyntaxNode): string | null => {
  const ctor = newNode.namedChildren.find((childNode) => childNode.type !== "new");
  if (isNullish(ctor)) {
    return null;
  }

  return calleeNameFromExpression(ctor);
};

const calleeNameFromExpression = (expr: SyntaxNode): string | null => {
  if (expr.type === "identifier") {
    return expr.text;
  }

  if (expr.type === "field_expression") {
    const last = expr.childForFieldName("declarator") ?? expr.namedChildren[expr.namedChildren.length - 1];
    if (!isNullish(last) && last.type === "field_identifier") {
      return last.text;
    }
  }

  if (expr.type === "qualified_identifier") {
    const parts = expr.namedChildren.filter((c) => c.type === "identifier");
    const last = parts[parts.length - 1];
    return last?.text ?? null;
  }

  return null;
};

const collectCallsInBody = (body: SyntaxNode): Map<string, number[]> => {
  const byName = new Map<string, number[]>();
  const visit = (syntaxNode: SyntaxNode): void => {
    if (syntaxNode.type === "call_expression") {
      const name = calleeNameFromCallLike(syntaxNode);
      if (!isNullish(name)) {
        const line = syntaxNode.startPosition.row + 1;
        const arr = byName.get(name) ?? [];
        arr.push(line);
        byName.set(name, arr);
      }
    }

    if (syntaxNode.type === "new_expression") {
      const name = calleeNameFromNewExpression(syntaxNode);
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

const findDeclaratorName = (declarator: SyntaxNode): string | null => {
  if (["identifier", "field_identifier", "destructor_name"].includes(declarator.type)) {
    return declarator.text;
  }

  for (const child of declarator.namedChildren) {
    const found = findDeclaratorName(child);
    if (!isNullish(found)) {
      return found;
    }
  }

  return null;
};

const cppFunctionName = (node: SyntaxNode): string => {
  const declarator = node.namedChildren.find((c) => ["function_declarator", "reference_declarator"].includes(c.type));
  if (isNullish(declarator)) {
    return "(anonymous)";
  }

  return findDeclaratorName(declarator) ?? "(anonymous)";
};

interface CppFunctionChunkArgs {
  node: SyntaxNode;
  className: string | null;
}

const cppFunctionChunk = ({ node, className }: CppFunctionChunkArgs): RawAstChunk => {
  const name = cppFunctionName(node);
  const displayName = className === null ? name : `${className}::${name}`;
  const symbolKind: SemanticGraphSymbolKind = className === null ? "Function" : "Method";

  return {
    bodyNode: node.childForFieldName("body"),
    displayName,
    node,
    resolveName: lastSegment(displayName.replace(/::/g, ".")),
    symbolKind,
  };
};

interface WalkCppNodeArgs {
  node: SyntaxNode;
  out: RawAstChunk[];
  className: string | null;
}

const walkCppNode = ({ node, out, className }: WalkCppNodeArgs): void => {
  if (node.type === "function_definition") {
    tryPushRawChunk({ out, chunk: cppFunctionChunk({ node, className }) });
    const body = node.childForFieldName("body");
    if (!isNullish(body)) {
      walkCppNode({ node: body, out, className: null });
    }

    return;
  }

  if (node.type === "class_specifier") {
    const typeId = node.namedChildren.find((c) => ["type_identifier", "template_type"].includes(c.type));
    const cn = typeId?.text ?? "(anonymous class)";
    const fields = node.namedChildren.find((c) => c.type === "field_declaration_list");
    if (!isNullish(fields)) {
      for (const child of fields.namedChildren) {
        walkCppNode({ node: child, out, className: cn });
      }
    }

    return;
  }

  if (node.type === "namespace_definition") {
    const body = node.childForFieldName("body");
    if (!isNullish(body)) {
      for (const child of body.namedChildren) {
        walkCppNode({ node: child, out, className: null });
      }
    }

    return;
  }

  if (node.type === "field_declaration") {
    for (const child of node.namedChildren) {
      walkCppNode({ node: child, out, className });
    }

    return;
  }

  if (["declaration_list", "field_declaration_list", "compound_statement"].includes(node.type)) {
    for (const child of node.namedChildren) {
      walkCppNode({ node: child, out, className });
    }
  }
};

const collectRawChunks = (root: SyntaxNode): RawAstChunk[] => {
  const out: RawAstChunk[] = [];

  if (root.type !== "translation_unit") {
    return out;
  }

  for (const child of root.namedChildren) {
    walkCppNode({ node: child, out, className: null });
  }

  return dedupeRawChunks(out);
};

const isCppPath = (pathRelative: string): boolean => CPP_FILE_EXTENSION_SET.has(extname(pathRelative).toLowerCase());

export const buildSemanticGraphChunksForCppSource = (
  args: BuildSemanticGraphChunksForSourceArgs
): SemanticGraphChunk[] => {
  if (!isCppPath(args.pathRelative)) {
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
