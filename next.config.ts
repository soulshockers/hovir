import type { NextConfig } from "next";

// Гігієна секретних маршрутів (openspec/changes/add-presentation-access/design.md «Гігієна секретних маршрутів»):
// токени не витікають через Referer, сторінки не індексуються й не кешуються. `:path*` охоплює й сам префікс.
const SECRET_ROUTE_HEADERS = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Cache-Control", value: "private, no-store" },
];

const SECRET_ROUTES = ["/e/:path*", "/p/:path*", "/admin/:path*", "/api/presentations/:path*", "/api/admin/:path*"];

const nextConfig: NextConfig = {
  async headers() {
    return SECRET_ROUTES.map((source) => ({ source, headers: SECRET_ROUTE_HEADERS }));
  },
};

export default nextConfig;
