import { isNullish } from "@lichens-innovation/ts-common";
import type { SyntaxNode } from "tree-sitter";
import type { LanguageAstExtractor, RawAstChunk, SemanticGraphSymbolKind } from "./graph-chunks.types";
import { dedupeRawChunks, lastSegment } from "./graph-chunks.utils";

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

export const pythonAstExtractor: LanguageAstExtractor = {
  collectRawChunks,
  collectCallsInBody,
};
