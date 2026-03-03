/**
 * ESLint flat config — React & TypeScript + TODO ticket reference (company default).
 *
 * Copy this file to the project root as eslint.config.js.
 * Copy eslint-rules/todo-ticket-ref.js to the project (e.g. eslint-rules/todo-ticket-ref.js).
 *
 * Prerequisites (devDependencies): see package.json.snippet.json
 */

import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import testingLibrary from "eslint-plugin-testing-library";
import { globalIgnores } from "eslint/config";
import todoTicketRef from "./eslint-rules/todo-ticket-ref.js";

const testFiles = ["**/__tests__/**", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"];

const baseConfig = tseslint.config(
  globalIgnores([
    "dist",
    "src/api/generated/**",
    // "src/components/ui/**",
  ]),
  js.configs.recommended,
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
      "prefer-const": "error",
      eqeqeq: ["error", "always"],
      "no-nested-ternary": "error",
      "no-empty": ["error", { allowEmptyCatch: false }],
      "no-useless-catch": "error",
      "max-depth": ["warn", 4],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/consistent-indexed-object-style": ["error", "record"],
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

export default [
  ...baseConfig,
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    plugins: { "todo-plz": todoTicketRef },
    rules: {
      "todo-plz/ticket-ref": [
        "warn",
        {
          pattern: "([A-Z0-9]+-\\d+)",
          comment: "TODO must include a ticket reference (e.g. TODO: JIRA-1234, TODO: https://…/browse/TBDT2-173)",
        },
      ],
    },
  },
  { files: ["eslint-rules/**"], rules: { "todo-plz/ticket-ref": "off" } },
];
