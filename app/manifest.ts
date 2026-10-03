import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Thehrav - Behavioral Circuit Breaker",
    short_name: "Thehrav",
    description: "A private pause between trading impulse and action.",
    start_url: "/home",
    display: "standalone",
    background_color: "#f7f5ef",
    theme_color: "#175c45",
    orientation: "portrait-primary",
    categories: ["finance", "lifestyle"],
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any"
      },
      {
        src: "/icons/maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable"
      }
    ]
  };
}
