import { extname } from "node:path";
import type { Language } from "tree-sitter";
import tsGrammars from "tree-sitter-typescript";

/**
 * Maps file extension to the tree-sitter grammar used for parsing.
 * Extend when adding languages (new extension → npm grammar package).
 */
const EXTENSION_TO_LANGUAGE = new Map<string, Language>([
  [".ts", tsGrammars.typescript as Language],
  [".tsx", tsGrammars.tsx as Language],
]);

export const getTreeSitterLanguageForPath = (pathRelative: string): Language | null => {
  const ext = extname(pathRelative).toLowerCase();
  return EXTENSION_TO_LANGUAGE.get(ext) ?? null;
};
