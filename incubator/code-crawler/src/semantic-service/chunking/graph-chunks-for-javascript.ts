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
  isSyntaxNodeType,
  lastSegment,
} from "./graph-chunks.utils";
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

  if (expr.type === "member_expression") {
    const prop = expr.childForFieldName("property");
    if (!isNullish(prop) && isSyntaxNodeType(prop.type, "property_identifier", "private_property_identifier")) {
      return prop.text;
    }
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

const classDisplayName = (classNode: SyntaxNode): string => {
  const name = classNode.childForFieldName("name");
  if (isNullish(name)) {
    return "(anonymous class)";
  }

  return name.text;
};

const shouldIndexMethodDefinition = (methodNode: SyntaxNode): boolean => {
  const parentNode = methodNode.parent;
  if (isNullish(parentNode)) {
    return false;
  }

  return isSyntaxNodeType(parentNode.type, "class_body", "object");
};

const methodDisplayName = (methodNode: SyntaxNode): string => {
  const prop = methodNode.childForFieldName("name");
  const methodName = prop?.text ?? "(method)";
  const parentNode = methodNode.parent;
  if (parentNode?.type !== "class_body") {
    return methodName;
  }

  const classNode = parentNode.parent;
  if (isNullish(classNode) || !isSyntaxNodeType(classNode.type, "class_declaration", "class")) {
    return methodName;
  }

  return `${classDisplayName(classNode)}.${methodName}`;
};

const variableDeclaratorName = (declaratorNode: SyntaxNode): string => {
  const name = declaratorNode.childForFieldName("name");
  return name?.text ?? "(const)";
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

interface RawChunkFromFunctionLikeArgs {
  bodyNode: SyntaxNode | null;
  displayName: string;
  node: SyntaxNode;
  resolveName: string;
  symbolKind: SemanticGraphSymbolKind;
}

const rawChunkFromFunctionLike = ({
  bodyNode,
  displayName,
  node,
  resolveName,
  symbolKind,
}: RawChunkFromFunctionLikeArgs): RawAstChunk => ({
  bodyNode,
  displayName,
  node,
  resolveName,
  symbolKind,
});

const bodyOfFunctionLike = (node: SyntaxNode): SyntaxNode | null =>
  node.childForFieldName("body") ??
  node.namedChildren.find((childNode) => childNode.type === "statement_block") ??
  null;

const functionDeclarationChunk = (node: SyntaxNode): RawAstChunk => {
  const nameNode = node.childForFieldName("name");
  const displayName = nameNode?.text ?? "(anonymous function)";
  return rawChunkFromFunctionLike({
    bodyNode: bodyOfFunctionLike(node),
    displayName,
    node,
    resolveName: lastSegment(displayName),
    symbolKind: "Function",
  });
};

const generatorFunctionDeclarationChunk = (declarationNode: SyntaxNode): RawAstChunk => {
  const nameNode = declarationNode.childForFieldName("name");
  const displayName = nameNode?.text ?? "(anonymous generator)";
  return rawChunkFromFunctionLike({
    bodyNode: bodyOfFunctionLike(declarationNode),
    displayName,
    node: declarationNode,
    resolveName: lastSegment(displayName),
    symbolKind: "Function",
  });
};

interface LexicalDeclaratorChunkArgs {
  declaratorNode: SyntaxNode;
  isExported: boolean;
  symbolKind: SemanticGraphSymbolKind;
}

const lexicalDeclaratorChunk = ({
  declaratorNode,
  isExported,
  symbolKind,
}: LexicalDeclaratorChunkArgs): RawAstChunk | null => {
  const val = declaratorNode.childForFieldName("value");
  if (isNullish(val)) {
    if (!isExported) {
      return null;
    }

    const declaratorName = variableDeclaratorName(declaratorNode);

    return {
      bodyNode: null,
      displayName: declaratorName,
      node: declaratorNode,
      resolveName: lastSegment(declaratorName),
      symbolKind: "Const",
    };
  }

  const declaratorDisplayName = variableDeclaratorName(declaratorNode);
  if (isSyntaxNodeType(val.type, "arrow_function", "function_expression", "class", "class_declaration")) {
    const body = isSyntaxNodeType(val.type, "arrow_function", "function_expression")
      ? bodyOfFunctionLike(val)
      : val.childForFieldName("body");

    return rawChunkFromFunctionLike({
      bodyNode: body,
      displayName: declaratorDisplayName,
      node: declaratorNode,
      resolveName: lastSegment(declaratorDisplayName),
      symbolKind: "Function",
    });
  }

  if (isExported) {
    return {
      bodyNode: null,
      displayName: declaratorDisplayName,
      node: declaratorNode,
      resolveName: lastSegment(declaratorDisplayName),
      symbolKind,
    };
  }

  return null;
};

interface CollectLexicalDeclarationArgs {
  isExported: boolean;
  lex: SyntaxNode;
  out: RawAstChunk[];
}

const collectLexicalDeclaration = ({ isExported, lex, out }: CollectLexicalDeclarationArgs): void => {
  const symbolKind: SemanticGraphSymbolKind = lex.text.startsWith("const") ? "Const" : "Let";

  for (const declaratorNode of lex.namedChildren) {
    if (declaratorNode.type === "variable_declarator") {
      tryPushRawChunk({ out, chunk: lexicalDeclaratorChunk({ declaratorNode, isExported, symbolKind }) });
    }
  }
};

interface CollectFromExportStatementArgs {
  node: SyntaxNode;
  out: RawAstChunk[];
}

const collectDefaultExportFunctionLike = ({ node, out }: CollectFromExportStatementArgs): void => {
  tryPushRawChunk({
    out,
    chunk: rawChunkFromFunctionLike({
      bodyNode: bodyOfFunctionLike(node),
      displayName: "(default export)",
      node,
      resolveName: "default",
      symbolKind: "Function",
    }),
  });

  for (const childNode of node.namedChildren) {
    walkIndexableChunks({ node: childNode, out });
  }
};

const collectFromExportStatement = ({ node, out }: CollectFromExportStatementArgs): void => {
  const decl = node.childForFieldName("declaration");
  if (!isNullish(decl)) {
    collectFromStatementLike({ isExported: true, node: decl, out });
    return;
  }

  const val = node.childForFieldName("value");
  if (isNullish(val)) {
    return;
  }

  if (isSyntaxNodeType(val.type, "function_expression", "arrow_function")) {
    collectDefaultExportFunctionLike({ node: val, out });
    return;
  }

  if (isSyntaxNodeType(val.type, "class_declaration", "class")) {
    for (const childNode of val.namedChildren) {
      walkIndexableChunks({ node: childNode, out });
    }
  }
};

interface CollectFromStatementLikeArgs {
  isExported: boolean;
  node: SyntaxNode;
  out: RawAstChunk[];
}

const collectFromStatementLike = ({ isExported, node, out }: CollectFromStatementLikeArgs): void => {
  switch (node.type) {
    case "function_declaration":
      tryPushRawChunk({ out, chunk: functionDeclarationChunk(node) });

      for (const childNode of node.namedChildren) {
        walkIndexableChunks({ node: childNode, out });
      }

      return;
    case "generator_function_declaration":
      tryPushRawChunk({ out, chunk: generatorFunctionDeclarationChunk(node) });

      for (const childNode of node.namedChildren) {
        walkIndexableChunks({ node: childNode, out });
      }

      return;
    case "class_declaration":
    case "class":
      for (const childNode of node.namedChildren) {
        walkIndexableChunks({ node: childNode, out });
      }

      return;
    case "lexical_declaration":
      collectLexicalDeclaration({ isExported, lex: node, out });

      for (const childNode of node.namedChildren) {
        walkIndexableChunks({ node: childNode, out });
      }

      return;
    default:
      for (const childNode of node.namedChildren) {
        walkIndexableChunks({ node: childNode, out });
      }
  }
};

interface WalkNamedChildrenArgs {
  node: SyntaxNode;
  out: RawAstChunk[];
}

const walkNamedChildren = ({ node, out }: WalkNamedChildrenArgs): void => {
  for (const childNode of node.namedChildren) {
    walkIndexableChunks({ node: childNode, out });
  }
};

interface CollectIndexedMethodDefinitionArgs {
  node: SyntaxNode;
  out: RawAstChunk[];
}

const collectIndexedMethodDefinition = ({ node, out }: CollectIndexedMethodDefinitionArgs): void => {
  const display = methodDisplayName(node);
  tryPushRawChunk({
    out,
    chunk: rawChunkFromFunctionLike({
      bodyNode: bodyOfFunctionLike(node),
      displayName: display,
      node,
      resolveName: lastSegment(display),
      symbolKind: "Method",
    }),
  });

  walkNamedChildren({ node, out });
};

interface CollectFromPublicFieldDefinitionArgs {
  node: SyntaxNode;
  out: RawAstChunk[];
}

const collectFromPublicFieldDefinition = ({ node, out }: CollectFromPublicFieldDefinitionArgs): void => {
  const val = node.childForFieldName("value");
  if (!isNullish(val) && isSyntaxNodeType(val.type, "arrow_function", "function_expression")) {
    const classNode = node.parent?.parent ?? null;
    const fieldName =
      node.childForFieldName("name")?.text ??
      node.namedChildren.find((childNode) =>
        isSyntaxNodeType(childNode.type, "property_identifier", "private_property_identifier")
      )?.text ??
      "(field)";
    const displayName =
      !isNullish(classNode) && isSyntaxNodeType(classNode.type, "class_declaration", "class")
        ? `${classDisplayName(classNode)}.${fieldName}`
        : fieldName;

    tryPushRawChunk({
      out,
      chunk: rawChunkFromFunctionLike({
        bodyNode: bodyOfFunctionLike(val),
        displayName,
        node,
        resolveName: lastSegment(displayName),
        symbolKind: "Method",
      }),
    });

    walkNamedChildren({ node, out });
    return;
  }

  walkNamedChildren({ node, out });
};

interface WalkIndexableChunksArgs {
  node: SyntaxNode;
  out: RawAstChunk[];
}

/**
 * DFS over the syntax tree: index declarations, descend into bodies so nested
 * functions and class methods are included.
 */
const walkIndexableChunks = ({ node, out }: WalkIndexableChunksArgs): void => {
  if (node.type === "import_statement") {
    return;
  }

  if (node.type === "export_statement") {
    collectFromExportStatement({ node, out });
    return;
  }

  if (node.type === "method_definition" && shouldIndexMethodDefinition(node)) {
    collectIndexedMethodDefinition({ node, out });
    return;
  }

  if (node.type === "public_field_definition") {
    collectFromPublicFieldDefinition({ node, out });
    return;
  }

  collectFromStatementLike({ isExported: false, node, out });
};

const collectRawChunks = (root: SyntaxNode): RawAstChunk[] => {
  const out: RawAstChunk[] = [];

  for (const childNode of root.namedChildren) {
    walkIndexableChunks({ node: childNode, out });
  }

  return dedupeRawChunks(out);
};

const isJavascriptPath = (pathRelative: string): boolean =>
  [".js", ".jsx", ".mjs", ".cjs"].includes(extname(pathRelative).toLowerCase());

/**
 * Parses JavaScript with tree-sitter, builds AST-first chunks with intra-file
 * `calls` / `calledBy`, splits embedding text to stay under `maxEmbedUtf8Bytes`.
 *
 * On parse errors (`rootNode.hasError`), logs a warning and returns [] (caller should not index the file).
 */
export const buildSemanticGraphChunksForJavaScriptSource = (
  args: BuildSemanticGraphChunksForSourceArgs
): SemanticGraphChunk[] => {
  if (!isJavascriptPath(args.pathRelative)) {
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
