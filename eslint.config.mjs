import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    files: ["**/*.{js,jsx,ts,tsx,mjs,cjs}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["./**", "../**"],
              message: "Use the @ alias for internal imports.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.{jsx,tsx}"],
    rules: {
      "react/button-has-type": "error",
      "react/checked-requires-onchange-or-readonly": "error",
      "react/jsx-no-leaked-render": "error",
      "react/no-array-index-key": "error",
      "react/no-danger": "error",
      "react/no-unstable-nested-components": "error",
      "react/prefer-read-only-props": "error",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
    },
  },
  prettier,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
