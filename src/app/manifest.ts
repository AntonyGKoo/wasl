import type { MetadataRoute } from "next";

// Lets people add Wasl to their home screen and open it full screen, like an installed app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Wasl",
    short_name: "Wasl",
    description:
      "Remember who you met, why it mattered, and who can help next.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#111418",
    theme_color: "#111418",
    categories: ["business", "productivity", "social"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
