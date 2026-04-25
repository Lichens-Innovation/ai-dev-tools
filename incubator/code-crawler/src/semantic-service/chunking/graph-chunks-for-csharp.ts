import { isNullish } from "@lichens-innovation/ts-common";
import type { SyntaxNode } from "tree-sitter";
import type { LanguageAstExtractor, RawAstChunk } from "./graph-chunks.types";
import { dedupeRawChunks, lastSegment } from "./graph-chunks.utils";

const calleeNameFromInvocation = (invocation: SyntaxNode): string | null => {
  const expr = invocation.namedChildren[0];
  if (isNullish(expr)) {
    return null;
  }

  if (expr.type === "identifier") {
    return expr.text;
  }

  if (expr.type === "member_access_expression") {
    const name = expr.childForFieldName("name");
    return name?.text ?? null;
  }

  return null;
};

const collectCallsInBody = (body: SyntaxNode): Map<string, number[]> => {
  const byName = new Map<string, number[]>();
  const visit = (syntaxNode: SyntaxNode): void => {
    if (syntaxNode.type === "invocation_expression") {
      const name = calleeNameFromInvocation(syntaxNode);
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

interface WalkCSharpClassBodyArgs {
  declList: SyntaxNode;
  typeName: string;
  out: RawAstChunk[];
}

const walkCSharpClassBody = ({ declList, typeName, out }: WalkCSharpClassBodyArgs): void => {
  for (const member of declList.namedChildren) {
    if (member.type === "method_declaration") {
      const name = member.childForFieldName("name")?.text ?? "(method)";
      const displayName = `${typeName}.${name}`;
      tryPushRawChunk({
        out,
        chunk: {
          bodyNode: member.childForFieldName("body"),
          displayName,
          node: member,
          resolveName: lastSegment(displayName),
          symbolKind: "Method",
        },
      });
    }

    if (member.type === "class_declaration") {
      walkCSharpTypeDeclaration({ node: member, out });
    }
  }
};

interface WalkCSharpTypeDeclarationArgs {
  node: SyntaxNode;
  out: RawAstChunk[];
}

const walkCSharpTypeDeclaration = ({ node, out }: WalkCSharpTypeDeclarationArgs): void => {
  const typeName = node.childForFieldName("name")?.text ?? "(type)";
  const declList = node.namedChildren.find((c) => c.type === "declaration_list");
  if (!isNullish(declList)) {
    walkCSharpClassBody({ declList, typeName, out });
  }
};

interface WalkCSharpNodeArgs {
  node: SyntaxNode;
  out: RawAstChunk[];
}

const walkCSharpNode = ({ node, out }: WalkCSharpNodeArgs): void => {
  if (node.type === "namespace_declaration") {
    const declList = node.namedChildren.find((c) => c.type === "declaration_list");
    if (!isNullish(declList)) {
      for (const child of declList.namedChildren) {
        walkCSharpNode({ node: child, out });
      }
    }

    return;
  }

  if (["class_declaration", "struct_declaration", "interface_declaration"].includes(node.type)) {
    walkCSharpTypeDeclaration({ node, out });
    return;
  }

  for (const child of node.namedChildren) {
    walkCSharpNode({ node: child, out });
  }
};

const collectRawChunks = (root: SyntaxNode): RawAstChunk[] => {
  const out: RawAstChunk[] = [];

  if (root.type !== "compilation_unit") {
    return out;
  }

  for (const child of root.namedChildren) {
    walkCSharpNode({ node: child, out });
  }

  return dedupeRawChunks(out);
};

export const csharpAstExtractor: LanguageAstExtractor = {
  collectRawChunks,
  collectCallsInBody,
};
