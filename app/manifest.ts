import type { MetadataRoute } from "next";
import { BRAND, BRAND_TAGLINE } from "@/lib/branding";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.app,
    short_name: BRAND.app,
    description: BRAND_TAGLINE,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["productivity", "utilities"],
    icons: [
      {
        src: "/icon-192.png?v=b4",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png?v=b4",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png?v=b4",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Dashboard",
        short_name: "Home",
        url: "/dashboard",
        icons: [{ src: "/icon-192.png?v=b4", sizes: "192x192" }],
      },
      {
        name: BRAND.travel,
        short_name: "Reisen",
        url: "/trips",
        icons: [{ src: "/icon-192.png?v=b4", sizes: "192x192" }],
      },
      {
        name: BRAND.finance,
        short_name: "Finanzen",
        url: "/finance-brain",
        icons: [{ src: "/icon-192.png?v=b4", sizes: "192x192" }],
      },
    ],
  };
}
