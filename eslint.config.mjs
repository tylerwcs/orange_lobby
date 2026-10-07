import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // A feature is used only through its entry: @/features/<name> on the server, or
  // @/features/<name>/client in the browser (D403). Inside a feature, files import each other
  // relatively, which this pattern does not catch.
  {
    rules: {
      "no-restricted-imports": ["error", { patterns: [{
        group: ["**/features/*/**", "!**/features/*/client"],
        message: "Import a feature through its entry: @/features/<name> or @/features/<name>/client (D403).",
      }] }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
