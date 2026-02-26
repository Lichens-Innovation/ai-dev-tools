/**
 * ESLint flat config — React & TypeScript coding standards
 *
 * Place this file in the root of your project as eslint.config.js.
 *
 * Prerequisites (devDependencies): see package.json.snippet
 *   eslint, @eslint/js, typescript-eslint, eslint-plugin-react, eslint-plugin-react-hooks,
 *   eslint-plugin-testing-library, globals
 *
 * Usage: eslint . or yarn lint
 */

import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import testingLibrary from "eslint-plugin-testing-library";
import { globalIgnores } from "eslint/config";

const testFiles = ["**/__tests__/**", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"];

export default tseslint.config(
  globalIgnores([
    "dist",
    // Add paths to generated or third-party code, e.g.:
    // "src/components/ui/**",
    // "src/api/generated/**",
  ]),
  js.configs.recommended,
  // Node / config files (commitlint, scripts)
  {
    files: ["commitlint.config.js", "scripts/**"],
    languageOptions: {
      globals: { ...globals.node, console: "readonly", process: "readonly", module: "readonly" },
    },
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      react,
      "react-hooks": reactHooks,
      "testing-library": testingLibrary,
    },
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: globals.browser,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      // — Coding patterns (common-coding-patterns)
      "prefer-const": "error",
      eqeqeq: ["error", "always"],
      "no-nested-ternary": "error",
      "no-empty": ["error", { allowEmptyCatch: false }],
      "no-useless-catch": "error",
      "max-depth": ["warn", 4],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/consistent-indexed-object-style": ["error", "record"],

      // — React patterns (common-react-patterns)
      "react/no-array-index-key": "warn",
      "react/jsx-fragments": ["error", "syntax"],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: testFiles,
    rules: {
      "testing-library/prefer-screen-queries": "error",
    },
  }
);
