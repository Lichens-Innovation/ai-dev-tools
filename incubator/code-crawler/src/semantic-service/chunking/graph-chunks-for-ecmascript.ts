import { isNullish } from "@lichens-innovation/ts-common";
import type { SyntaxNode } from "tree-sitter";
import type { LanguageAstExtractor, RawAstChunk, SemanticGraphSymbolKind } from "./graph-chunks.types";
import { dedupeRawChunks, isSyntaxNodeType, lastSegment } from "./graph-chunks.utils";

type EcmascriptChunkerKind = "javascript" | "typescript";

interface EcmascriptChunkWalkArgs {
  kind: EcmascriptChunkerKind;
  node: SyntaxNode;
  out: RawAstChunk[];
}

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

const interfaceChunk = (declarationNode: SyntaxNode): RawAstChunk => {
  const name = declarationNode.childForFieldName("name")?.text ?? "(anonymous interface)";
  return {
    bodyNode: null,
    displayName: name,
    node: declarationNode,
    resolveName: lastSegment(name),
    symbolKind: "Interface",
  };
};

const typeAliasChunk = (declarationNode: SyntaxNode): RawAstChunk => {
  const name = declarationNode.childForFieldName("name")?.text ?? "(anonymous type)";
  return {
    bodyNode: null,
    displayName: name,
    node: declarationNode,
    resolveName: lastSegment(name),
    symbolKind: "Type",
  };
};

const enumChunk = (declarationNode: SyntaxNode): RawAstChunk => {
  const name = declarationNode.childForFieldName("name")?.text ?? "(anonymous enum)";
  return {
    bodyNode: null,
    displayName: name,
    node: declarationNode,
    resolveName: lastSegment(name),
    symbolKind: "Enum",
  };
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

const collectDefaultExportFunctionLike = ({ kind, node, out }: EcmascriptChunkWalkArgs): void => {
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
    walkIndexableChunks({ kind, node: childNode, out });
  }
};

const collectFromExportStatement = ({ kind, node, out }: EcmascriptChunkWalkArgs): void => {
  const decl = node.childForFieldName("declaration");
  if (!isNullish(decl)) {
    collectFromStatementLike({ isExported: true, kind, node: decl, out });
    return;
  }

  const val = node.childForFieldName("value");
  if (isNullish(val)) {
    return;
  }

  if (isSyntaxNodeType(val.type, "function_expression", "arrow_function")) {
    collectDefaultExportFunctionLike({ kind, node: val, out });
    return;
  }

  if (isSyntaxNodeType(val.type, "class_declaration", "class")) {
    for (const childNode of val.namedChildren) {
      walkIndexableChunks({ kind, node: childNode, out });
    }
  }
};

interface CollectFromStatementLikeArgs {
  isExported: boolean;
  kind: EcmascriptChunkerKind;
  node: SyntaxNode;
  out: RawAstChunk[];
}

const walkNamedChildren = ({ kind, node, out }: EcmascriptChunkWalkArgs): void => {
  for (const childNode of node.namedChildren) {
    walkIndexableChunks({ kind, node: childNode, out });
  }
};

const collectFromStatementLike = ({ isExported, kind, node, out }: CollectFromStatementLikeArgs): void => {
  switch (node.type) {
    case "function_declaration":
      tryPushRawChunk({ out, chunk: functionDeclarationChunk(node) });
      walkNamedChildren({ kind, node, out });
      return;
    case "generator_function_declaration":
      tryPushRawChunk({ out, chunk: generatorFunctionDeclarationChunk(node) });
      walkNamedChildren({ kind, node, out });
      return;
    case "class_declaration":
    case "class":
      walkNamedChildren({ kind, node, out });
      return;
    case "lexical_declaration":
      collectLexicalDeclaration({ isExported, lex: node, out });
      walkNamedChildren({ kind, node, out });
      return;
    case "interface_declaration":
      if (kind === "typescript") {
        tryPushRawChunk({ out, chunk: interfaceChunk(node) });
        return;
      }
      walkNamedChildren({ kind, node, out });
      return;
    case "type_alias_declaration":
      if (kind === "typescript") {
        tryPushRawChunk({ out, chunk: typeAliasChunk(node) });
        return;
      }
      walkNamedChildren({ kind, node, out });
      return;
    case "enum_declaration":
      if (kind === "typescript") {
        tryPushRawChunk({ out, chunk: enumChunk(node) });
        return;
      }
      walkNamedChildren({ kind, node, out });
      return;
    default:
      walkNamedChildren({ kind, node, out });
  }
};

const collectIndexedMethodDefinition = ({ kind, node, out }: EcmascriptChunkWalkArgs): void => {
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

  walkNamedChildren({ kind, node, out });
};

const collectFromPublicFieldDefinition = ({ kind, node, out }: EcmascriptChunkWalkArgs): void => {
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

    walkNamedChildren({ kind, node, out });
    return;
  }

  walkNamedChildren({ kind, node, out });
};

/**
 * DFS over the syntax tree: index declarations, descend into bodies so nested
 * functions and class methods are included.
 */
const walkIndexableChunks = ({ kind, node, out }: EcmascriptChunkWalkArgs): void => {
  if (kind === "typescript") {
    if (isSyntaxNodeType(node.type, "import_statement", "import_type")) {
      return;
    }
  } else if (node.type === "import_statement") {
    return;
  }

  if (node.type === "export_statement") {
    collectFromExportStatement({ kind, node, out });
    return;
  }

  if (node.type === "method_definition" && shouldIndexMethodDefinition(node)) {
    collectIndexedMethodDefinition({ kind, node, out });
    return;
  }

  if (node.type === "public_field_definition") {
    collectFromPublicFieldDefinition({ kind, node, out });
    return;
  }

  collectFromStatementLike({ isExported: false, kind, node, out });
};

const collectRawChunks = (root: SyntaxNode, kind: EcmascriptChunkerKind): RawAstChunk[] => {
  const out: RawAstChunk[] = [];

  for (const childNode of root.namedChildren) {
    walkIndexableChunks({ kind, node: childNode, out });
  }

  return dedupeRawChunks(out);
};

const makeEcmascriptExtractor = (kind: EcmascriptChunkerKind): LanguageAstExtractor => ({
  collectRawChunks: (root) => collectRawChunks(root, kind),
  collectCallsInBody,
});

export const typescriptAstExtractor: LanguageAstExtractor = makeEcmascriptExtractor("typescript");
export const javascriptAstExtractor: LanguageAstExtractor = makeEcmascriptExtractor("javascript");
