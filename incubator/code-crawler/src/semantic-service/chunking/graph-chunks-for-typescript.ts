import { isNullish } from "@lichens-innovation/ts-common";
import { Buffer } from "node:buffer";
import Parser, { type SyntaxNode } from "tree-sitter";
import { normalizeSourceNewlines } from "../../utils/text/newlines.utils";
import { getTreeSitterLanguageForPath } from "./tree-sitter-language-registry";

/** One row-ready chunk after AST extraction, graph enrichment, and UTF-8 size splitting. */
export interface SemanticGraphChunk {
  chunkIndex: number;
  embedText: string;
  endLine: number;
  startLine: number;
}

export type SemanticGraphSymbolKind = "Const" | "Enum" | "Function" | "Interface" | "Let" | "Method" | "Type";

interface RawAstChunk {
  bodyNode: SyntaxNode | null;
  displayName: string;
  node: SyntaxNode;
  resolveName: string;
  symbolKind: SemanticGraphSymbolKind;
}

interface DefinitionEntry {
  displayName: string;
  endLine: number;
  resolveName: string;
  startLine: number;
  startIndex: number;
}

/** Tree-sitter `SyntaxNode.type` string equality against two or more alternatives. */
const isSyntaxNodeType = (type: string, ...allowed: string[]): boolean => allowed.includes(type);

const lineNumber1Based = (node: SyntaxNode): { endLine: number; startLine: number } => ({
  startLine: node.startPosition.row + 1,
  endLine: node.endPosition.row + 1,
});

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

/**
 * True if this name is defined somewhere in the file (same-file symbol).
 * Prefer definitions that appear at or above the call line (inner scopes / order);
 * if none (forward references, hoisted-style layout), still match any same-name definition
 * so top-level mutual recursion is captured.
 */
interface ResolveLocalCalleeArgs {
  calleeName: string;
  callLine: number;
  defsByResolveName: Map<string, DefinitionEntry[]>;
}

const resolveLocalCallee = ({ calleeName, callLine, defsByResolveName }: ResolveLocalCalleeArgs): boolean => {
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

const buildDefsIndex = (raw: RawAstChunk[]): Map<string, DefinitionEntry[]> => {
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

interface CallsAndCalledByIndex {
  calledByByResolveName: Map<string, Set<string>>;
  callsByChunkIndex: string[][];
}

const buildCallsAndCalledBy = (
  raw: RawAstChunk[],
  defsByResolveName: Map<string, DefinitionEntry[]>
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

const lastSegment = (displayName: string): string => {
  const parts = displayName.split(".");
  return parts[parts.length - 1] ?? displayName;
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

const tryPushRawChunk = (out: RawAstChunk[], chunk: RawAstChunk | null): void => {
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
      tryPushRawChunk(out, lexicalDeclaratorChunk({ declaratorNode, isExported, symbolKind }));
    }
  }
};

interface CollectFromExportStatementArgs {
  node: SyntaxNode;
  out: RawAstChunk[];
}

const collectDefaultExportFunctionLike = ({ node, out }: CollectFromExportStatementArgs): void => {
  tryPushRawChunk(
    out,
    rawChunkFromFunctionLike({
      bodyNode: bodyOfFunctionLike(node),
      displayName: "(default export)",
      node,
      resolveName: "default",
      symbolKind: "Function",
    })
  );

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
      tryPushRawChunk(out, functionDeclarationChunk(node));

      for (const childNode of node.namedChildren) {
        walkIndexableChunks({ node: childNode, out });
      }

      return;
    case "generator_function_declaration":
      tryPushRawChunk(out, generatorFunctionDeclarationChunk(node));

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
    case "interface_declaration":
      tryPushRawChunk(out, interfaceChunk(node));
      return;
    case "type_alias_declaration":
      tryPushRawChunk(out, typeAliasChunk(node));
      return;
    case "enum_declaration":
      tryPushRawChunk(out, enumChunk(node));
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
  tryPushRawChunk(
    out,
    rawChunkFromFunctionLike({
      bodyNode: bodyOfFunctionLike(node),
      displayName: display,
      node,
      resolveName: lastSegment(display),
      symbolKind: "Method",
    })
  );

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

    tryPushRawChunk(
      out,
      rawChunkFromFunctionLike({
        bodyNode: bodyOfFunctionLike(val),
        displayName,
        node,
        resolveName: lastSegment(displayName),
        symbolKind: "Method",
      })
    );

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
  if (isSyntaxNodeType(node.type, "import_statement", "import_type")) {
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
  const program = root;

  for (const childNode of program.namedChildren) {
    walkIndexableChunks({ node: childNode, out });
  }

  return dedupeRawChunks(out);
};

/** Same AST node can be reached from export and declaration paths in broken trees; keep one. */
const dedupeRawChunks = (chunks: RawAstChunk[]): RawAstChunk[] => {
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

interface BuildEmbedHeaderArgs {
  calledBy: string[];
  calls: string[];
  displayName: string;
  pathRelative: string;
  repository: string;
  symbolKind: SemanticGraphSymbolKind;
}

const buildEmbedHeader = (args: BuildEmbedHeaderArgs): string =>
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

const utf8ByteLength = (text: string): number => Buffer.byteLength(text, "utf8");

const splitCodeByUtf8Budget = (code: string, maxCodeBytes: number): string[] => {
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
      parts.push(...splitLongLineByUtf8(line, maxCodeBytes));

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

const splitLongLineByUtf8 = (line: string, maxBytes: number): string[] => {
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

interface ExpandChunksToMaxUtf8Args {
  calledByDisplayByCaller: string[][];
  callsByIdx: string[][];
  maxEmbedUtf8Bytes: number;
  pathRelative: string;
  raw: RawAstChunk[];
  repository: string;
}

const expandChunksToMaxUtf8 = ({
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
    const codeParts = splitCodeByUtf8Budget(code, maxCodeBytes);
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

const buildCalledByDisplayLists = (raw: RawAstChunk[], calledByByResolveName: Map<string, Set<string>>): string[][] => {
  return raw.map((rawChunk) => {
    const set = calledByByResolveName.get(rawChunk.resolveName);
    if (isNullish(set)) {
      return [];
    }

    return [...set].sort((left, right) => left.localeCompare(right));
  });
};

export interface BuildSemanticGraphChunksForSourceArgs {
  maxEmbedUtf8Bytes: number;
  pathRelative: string;
  repository: string;
  source: string;
}

/**
 * Parses TypeScript/TSX with tree-sitter, builds AST-first chunks with intra-file
 * `calls` / `calledBy`, splits embedding text to stay under `maxEmbedUtf8Bytes`.
 *
 * On parse errors (`rootNode.hasError`), logs a warning and returns [] (caller should not index the file).
 */
export const buildSemanticGraphChunksForSource = ({
  maxEmbedUtf8Bytes,
  pathRelative,
  repository,
  source,
}: BuildSemanticGraphChunksForSourceArgs): SemanticGraphChunk[] => {
  const normalized = normalizeSourceNewlines(source);
  const language = getTreeSitterLanguageForPath(pathRelative);
  if (isNullish(language)) {
    return [];
  }

  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(normalized);

  if (tree.rootNode.hasError) {
    console.warn(`[semantic-chunking] parse has errors, skipping file: ${pathRelative}`);
    return [];
  }

  const raw = collectRawChunks(tree.rootNode);
  if (raw.length === 0) {
    return [];
  }

  raw.sort((left, right) => left.node.startIndex - right.node.startIndex || left.node.endIndex - right.node.endIndex);

  const defs = buildDefsIndex(raw);
  const { callsByChunkIndex, calledByByResolveName } = buildCallsAndCalledBy(raw, defs);
  const calledByDisplay = buildCalledByDisplayLists(raw, calledByByResolveName);

  const expanded = expandChunksToMaxUtf8({
    calledByDisplayByCaller: calledByDisplay,
    callsByIdx: callsByChunkIndex,
    maxEmbedUtf8Bytes,
    pathRelative,
    raw,
    repository,
  });

  return expanded.map((chunk, index) => ({ ...chunk, chunkIndex: index }));
};
