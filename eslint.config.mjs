import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Плагіни не залежать від застосунку (openspec/specs/slide-plugin-contract/spec.md, «Готовність до npm-пакетів»):
    // з `@/…` дозволено лише контракт і тест-хелпери ядра.
    files: ["plugins/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["server-only", "postgres", "drizzle-orm"].map((name) => ({
            name,
            message: "Плагін не працює з БД і серверними модулями застосунку напряму.",
          })),
          patterns: [
            {
              regex: "^@/(?!lib/plugins(/testing)?$)",
              message: "Плагін імпортує із застосунку лише `@/lib/plugins` і `@/lib/plugins/testing`.",
            },
            { regex: "^(next|drizzle-orm)/", message: "Плагін не залежить від Next.js і Drizzle." },
            { regex: "(^|/)src/", message: "Плагін імпортує із застосунку лише `@/lib/plugins`." },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "test-results/**",
    "playwright-report/**",
  ]),
]);
