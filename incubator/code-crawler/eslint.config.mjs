import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

const browserPublicGlobals = {
  AbortController: "readonly",
  console: "readonly",
  document: "readonly",
  fetch: "readonly",
  navigator: "readonly",
  window: "readonly",
};

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist/**", "node_modules/**", "scripts/**"],
  },
  {
    files: ["public/**/*.js"],
    languageOptions: {
      globals: browserPublicGlobals,
    },
  },
);
