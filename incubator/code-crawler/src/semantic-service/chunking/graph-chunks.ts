import { extname } from "node:path";
import type { BuildSemanticGraphChunksForSourceArgs, SemanticGraphChunk } from "./graph-chunks.types";
import { buildSemanticGraphChunksForCppSource } from "./graph-chunks-for-cpp";
import { buildSemanticGraphChunksForCSharpSource } from "./graph-chunks-for-csharp";
import { buildSemanticGraphChunksForJavaScriptSource } from "./graph-chunks-for-javascript";
import { buildSemanticGraphChunksForPythonSource } from "./graph-chunks-for-python";
import { buildSemanticGraphChunksForTypescriptSource } from "./graph-chunks-for-typescript";

export type { BuildSemanticGraphChunksForSourceArgs, SemanticGraphChunk } from "./graph-chunks.types";

/**
 * Routes to the language-specific semantic graph chunker based on file extension.
 */
export const buildSemanticGraphChunksForSource = (
  args: BuildSemanticGraphChunksForSourceArgs
): SemanticGraphChunk[] => {
  const ext = extname(args.pathRelative).toLowerCase();

  if ([".ts", ".tsx"].includes(ext)) {
    return buildSemanticGraphChunksForTypescriptSource(args);
  }

  if ([".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
    return buildSemanticGraphChunksForJavaScriptSource(args);
  }

  if ([".py", ".pyi"].includes(ext)) {
    return buildSemanticGraphChunksForPythonSource(args);
  }

  if ([".cpp", ".cc", ".cxx", ".hpp", ".hh", ".hxx", ".h"].includes(ext)) {
    return buildSemanticGraphChunksForCppSource(args);
  }

  if (ext === ".cs") {
    return buildSemanticGraphChunksForCSharpSource(args);
  }

  return [];
};
