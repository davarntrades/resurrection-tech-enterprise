import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name,
    short_name: "Resurrection Tech",
    description: SITE.description,
    start_url: "/",
    display: "standalone",
    background_color: "#08090b",
    theme_color: "#08090b",
    icons: [
      { src: "/assets/logo/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { src: "/assets/logo/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { src: "/assets/logo/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
