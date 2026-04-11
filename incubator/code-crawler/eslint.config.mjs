import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

const browserPublicGlobals = {
  document: "readonly",
  fetch: "readonly",
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
