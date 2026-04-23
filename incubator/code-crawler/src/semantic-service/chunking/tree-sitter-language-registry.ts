import { extname } from "node:path";
import type { Language } from "tree-sitter";
import tsGrammars from "tree-sitter-typescript";
import javascriptGrammar from "tree-sitter-javascript";
import pythonGrammar from "tree-sitter-python";
import cppGrammar from "tree-sitter-cpp";
import { loadCSharpLanguage } from "./load-csharp-tree-sitter";

const csharpLanguage = loadCSharpLanguage();

/**
 * Maps file extension to the tree-sitter grammar used for parsing.
 * Extend when adding languages (new extension → npm grammar package).
 */
const EXTENSION_TO_LANGUAGE = new Map<string, Language>([
  [".ts", tsGrammars.typescript as Language],
  [".tsx", tsGrammars.tsx as Language],
  [".js", javascriptGrammar as Language],
  [".jsx", javascriptGrammar as Language],
  [".mjs", javascriptGrammar as Language],
  [".cjs", javascriptGrammar as Language],
  [".py", pythonGrammar as Language],
  [".pyi", pythonGrammar as Language],
  [".cpp", cppGrammar as Language],
  [".cc", cppGrammar as Language],
  [".cxx", cppGrammar as Language],
  [".hpp", cppGrammar as Language],
  [".hh", cppGrammar as Language],
  [".hxx", cppGrammar as Language],
  [".h", cppGrammar as Language],
  [".cs", csharpLanguage],
]);

export const getTreeSitterLanguageForPath = (pathRelative: string): Language | null => {
  const ext = extname(pathRelative).toLowerCase();
  return EXTENSION_TO_LANGUAGE.get(ext) ?? null;
};
