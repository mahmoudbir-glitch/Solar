import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Solar | إدارة ومراقبة الطاقة الشمسية",
    short_name: "Solar",
    description: "إدارة ومراقبة الطاقة الشمسية في منزلك",
    id: "/",
    start_url: "/",
    display: "standalone",
    dir: "rtl",
    lang: "ar",
    background_color: "#f4f6fc",
    theme_color: "#7d82fb",
    icons: [
      { src: "/icons/icon-192.png?v=2", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-192.svg?v=2", sizes: "192x192", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-512.svg?v=2", sizes: "512x512", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
