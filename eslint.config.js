import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist", "coverage"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // 15 rather than the stricter 10: the engine's event/action dispatchers are
      // flat switches, which cyclomatic complexity penalises per-case.
      complexity: ["error", 15],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["tests/**/*.ts", "src/sim/**/*.ts"],
    languageOptions: { globals: globals.vitest },
  },
  {
    files: ["*.config.ts", "*.config.js"],
    languageOptions: { globals: globals.node },
  },
  // Must stay last: turns off stylistic rules that would fight Prettier.
  prettier
);
