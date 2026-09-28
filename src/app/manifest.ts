import type { MetadataRoute } from "next";

/** Installable PWA; share_target lets phones "Share → Larder" from Instagram/TikTok/browser. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Larder",
    short_name: "Larder",
    description: "Your food memory, meal planner and shopping list.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f3ed",
    theme_color: "#f6f3ed",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
    share_target: { action: "/add", method: "GET", params: { title: "title", text: "text", url: "url" } },
  } as MetadataRoute.Manifest;
}
