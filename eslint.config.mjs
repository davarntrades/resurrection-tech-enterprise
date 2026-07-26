import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  globalIgnores([
    "node_modules/**",
    ".next/**",
    "out/**",
    "dist/**",
    "build/**",
    "coverage/**",
    "public/reports/**",
    "public/generated/**",
    "runtime-data/**",
    "tmp/**",
    "temp/**",
    "**/*.generated.*",
    // Retained historical copy of the application, not a separately shipped target.
    "project/**",
  ]),
  ...nextVitals,
  {
    files: ["**/*.{js,jsx,ts,tsx,mjs,cjs}"],
    rules: {
      /*
       * ESLint 9 + eslint-config-next 16 activates React Compiler eligibility
       * diagnostics that were not part of this repository's previous `next lint`
       * contract. The application intentionally contains mature callback-driven
       * data loading, refs read by event handlers, and small render-local view
       * helpers. These patterns are valid React and are covered by type/build and
       * runtime suites, but they are not yet compiler-optimisable. Keep the
       * correctness-focused Hooks rules enabled while opting out of compiler-only
       * eligibility rules until those components are deliberately refactored.
       */
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
      /* Static JSX copy is safely escaped by React; this rule is stylistic and
       * conflicts with existing enterprise prose containing apostrophes/quotes. */
      "react/no-unescaped-entities": "off",
    },
  },
  {
    files: ["components/AuditForm.tsx"],
    rules: {
      // The leading `//` is intentional visible terminal-style copy, not a JSX comment.
      "react/jsx-no-comment-textnodes": "off",
    },
  },
]);
