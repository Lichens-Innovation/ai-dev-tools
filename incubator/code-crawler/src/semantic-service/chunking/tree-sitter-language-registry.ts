import { extname } from "node:path";
import type { Language } from "tree-sitter";
import cppGrammar from "tree-sitter-cpp";
import javascriptGrammar from "tree-sitter-javascript";
import pythonGrammar from "tree-sitter-python";
import tsGrammars from "tree-sitter-typescript";
import {
  CPP_FILE_EXTENSIONS,
  CSHARP_FILE_EXTENSIONS,
  JAVASCRIPT_FILE_EXTENSIONS,
  PYTHON_FILE_EXTENSIONS,
  TYPESCRIPT_FILE_EXTENSIONS,
} from "./chunk-language-file-extensions";
import { loadCSharpLanguage } from "./load-csharp-tree-sitter";

const csharpLanguage = loadCSharpLanguage();

/**
 * Maps file extension to the tree-sitter grammar used for parsing.
 * Extend when adding languages (new extension → npm grammar package).
 */
const EXTENSION_TO_LANGUAGE = new Map<string, Language>([
  ...TYPESCRIPT_FILE_EXTENSIONS.map((ext): [string, Language] => {
    const { tsx, typescript } = tsGrammars;
    const grammar = ext === ".tsx" ? tsx : typescript;
    return [ext, grammar as Language];
  }),
  ...JAVASCRIPT_FILE_EXTENSIONS.map((ext): [string, Language] => [ext, javascriptGrammar as Language]),
  ...PYTHON_FILE_EXTENSIONS.map((ext): [string, Language] => [ext, pythonGrammar as Language]),
  ...CPP_FILE_EXTENSIONS.map((ext): [string, Language] => [ext, cppGrammar as Language]),
  ...CSHARP_FILE_EXTENSIONS.map((ext): [string, Language] => [ext, csharpLanguage]),
]);

export const getTreeSitterLanguageForPath = (pathRelative: string): Language | null => {
  const ext = extname(pathRelative).toLowerCase();
  return EXTENSION_TO_LANGUAGE.get(ext) ?? null;
};
