import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes = ["", "/assess", "/design-partners", "/pilot", "/compliance", "/book", "/contact", "/request-audit", "/enterprise-pathways", "/licensing", "/partners", "/live-demo", "/enterprise"];
  return routes.map((path) => ({
    url: `${SITE.url}${path}`,
    lastModified: now,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path === "/book" || path === "/request-audit" ? 0.9 : 0.7,
  }));
}
