import type { NextConfig } from "next";

// Гігієна секретних маршрутів (openspec/changes/archive/2026-10-20-add-presentation-access/design.md «Гігієна секретних маршрутів»):
// токени не витікають через Referer, сторінки не індексуються й не кешуються. `:path*` охоплює й сам префікс.
const SECRET_ROUTE_HEADERS = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Cache-Control", value: "private, no-store" },
];

const SECRET_ROUTES = ["/e/:path*", "/p/:path*", "/admin/:path*", "/api/presentations/:path*", "/api/admin/:path*"];

// Тестова збірка Playwright (`HOVIR_TEST_PLUGINS=1` під час `next build`) підміняє реєстр плагінів реєстром із
// фікстурою редактора (openspec/changes/archive/2026-10-25-add-presentation-editor/design.md «Тестовий плагін»). Звичайна збірка її не містить.
const testPlugins = process.env.HOVIR_TEST_PLUGINS === "1";

const nextConfig: NextConfig = {
  async headers() {
    return SECRET_ROUTES.map((source) => ({ source, headers: SECRET_ROUTE_HEADERS }));
  },
  ...(testPlugins && { turbopack: { resolveAlias: { "@plugins/index": "./tests/fixtures/plugins/index.ts" } } }),
};

export default nextConfig;
