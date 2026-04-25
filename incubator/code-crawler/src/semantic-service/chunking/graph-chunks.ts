import { extname } from "node:path";
import {
  CPP_FILE_EXTENSION_SET,
  CSHARP_FILE_EXTENSION_SET,
  JAVASCRIPT_FILE_EXTENSION_SET,
  PYTHON_FILE_EXTENSION_SET,
  TYPESCRIPT_FILE_EXTENSION_SET,
} from "./chunk-language-file-extensions";
import type { BuildSemanticGraphChunksForSourceArgs, SemanticGraphChunk } from "./graph-chunks.types";
import { buildSemanticGraphChunksForCppSource } from "./graph-chunks-for-cpp";
import { buildSemanticGraphChunksForCSharpSource } from "./graph-chunks-for-csharp";
import {
  buildSemanticGraphChunksForJavaScriptSource,
  buildSemanticGraphChunksForTypescriptSource,
} from "./graph-chunks-for-ecmascript";
import { buildSemanticGraphChunksForPythonSource } from "./graph-chunks-for-python";

/**
 * Routes to the language-specific semantic graph chunker based on file extension.
 */
export const buildSemanticGraphChunksForSource = (
  args: BuildSemanticGraphChunksForSourceArgs
): SemanticGraphChunk[] => {
  const ext = extname(args.pathRelative).toLowerCase();

  if (TYPESCRIPT_FILE_EXTENSION_SET.has(ext)) {
    return buildSemanticGraphChunksForTypescriptSource(args);
  }

  if (JAVASCRIPT_FILE_EXTENSION_SET.has(ext)) {
    return buildSemanticGraphChunksForJavaScriptSource(args);
  }

  if (PYTHON_FILE_EXTENSION_SET.has(ext)) {
    return buildSemanticGraphChunksForPythonSource(args);
  }

  if (CPP_FILE_EXTENSION_SET.has(ext)) {
    return buildSemanticGraphChunksForCppSource(args);
  }

  if (CSHARP_FILE_EXTENSION_SET.has(ext)) {
    return buildSemanticGraphChunksForCSharpSource(args);
  }

  return [];
};
