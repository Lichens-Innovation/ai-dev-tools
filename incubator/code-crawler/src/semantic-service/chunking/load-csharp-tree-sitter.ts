import { createRequire } from "node:module";
import path from "node:path";
import type { Language } from "tree-sitter";

/**
 * tree-sitter-c-sharp is ESM with top-level await; Nest compiles to CommonJS.
 * Load the native binding the same way the package would, without dynamic import().
 */
export const loadCSharpLanguage = (): Language => {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  const loadBinding = require("node-gyp-build") as (root: string) => Language;
  const root = path.dirname(require.resolve("tree-sitter-c-sharp/package.json"));
  return loadBinding(root);
};
