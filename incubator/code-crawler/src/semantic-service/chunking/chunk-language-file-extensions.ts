/**
 * Per-language extension groups for semantic graph chunking and tree-sitter grammar selection.
 * Each language: a readonly tuple (`*_FILE_EXTENSIONS`) and a lookup set (`*_FILE_EXTENSION_SET`).
 */

import { extname } from "node:path";

import type { SourceLanguageId } from "../types/source-language.types";

export const TYPESCRIPT_FILE_EXTENSIONS = [".ts", ".tsx"] as const;
export const TYPESCRIPT_FILE_EXTENSION_SET = new Set<string>(TYPESCRIPT_FILE_EXTENSIONS);

export const JAVASCRIPT_FILE_EXTENSIONS = [".js", ".jsx", ".mjs", ".cjs"] as const;
export const JAVASCRIPT_FILE_EXTENSION_SET = new Set<string>(JAVASCRIPT_FILE_EXTENSIONS);

export const PYTHON_FILE_EXTENSIONS = [".py", ".pyi"] as const;
export const PYTHON_FILE_EXTENSION_SET = new Set<string>(PYTHON_FILE_EXTENSIONS);

/** C/C++ sources and headers parsed with tree-sitter-cpp. */
export const CPP_FILE_EXTENSIONS = [".cpp", ".cc", ".cxx", ".hpp", ".hh", ".hxx", ".h"] as const;
export const CPP_FILE_EXTENSION_SET = new Set<string>(CPP_FILE_EXTENSIONS);

export const CSHARP_FILE_EXTENSIONS = [".cs"] as const;
export const CSHARP_FILE_EXTENSION_SET = new Set<string>(CSHARP_FILE_EXTENSIONS);

/** Same extensions as `tree-sitter-language-registry` / graph chunkers — single source for index discovery. */
export const TREE_SITTER_INDEXABLE_EXTENSIONS: readonly string[] = [
  ...TYPESCRIPT_FILE_EXTENSIONS,
  ...JAVASCRIPT_FILE_EXTENSIONS,
  ...PYTHON_FILE_EXTENSIONS,
  ...CPP_FILE_EXTENSIONS,
  ...CSHARP_FILE_EXTENSIONS,
];

export const TREE_SITTER_INDEXABLE_EXTENSION_SET = new Set<string>(
  TREE_SITTER_INDEXABLE_EXTENSIONS.map((e) => e.toLowerCase())
);

/**
 * Same routing order as {@link buildSemanticGraphChunksForSource} in `graph-chunks.ts`.
 */
export const inferSourceLanguageFromPath = (pathRelative: string): SourceLanguageId | null => {
  const ext = extname(pathRelative).toLowerCase();

  if (TYPESCRIPT_FILE_EXTENSION_SET.has(ext)) {
    return "typescript";
  }
  if (JAVASCRIPT_FILE_EXTENSION_SET.has(ext)) {
    return "javascript";
  }
  if (PYTHON_FILE_EXTENSION_SET.has(ext)) {
    return "python";
  }
  if (CPP_FILE_EXTENSION_SET.has(ext)) {
    return "cpp";
  }
  if (CSHARP_FILE_EXTENSION_SET.has(ext)) {
    return "csharp";
  }

  return null;
};
