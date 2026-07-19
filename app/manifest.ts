import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FamilyBrain",
    short_name: "FamilyBrain",
    description:
      "Private Wissensschicht für Paperless-Dokumente, Fristen, Finanzen und Reisen.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f3f4f6",
    theme_color: "#111827",
    categories: ["productivity", "utilities"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Dokumente",
        short_name: "Dokumente",
        url: "/documents",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Chat",
        short_name: "Chat",
        url: "/chat",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Synchronisieren",
        short_name: "Sync",
        url: "/sync",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
