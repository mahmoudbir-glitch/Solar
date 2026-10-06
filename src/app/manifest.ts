import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Solar | إدارة ومراقبة الطاقة الشمسية",
    short_name: "Solar | إدارة ومراقبة الطاقة الشمسية",
    description: "إدارة ومراقبة الطاقة الشمسية في منزلك",
    start_url: "/",
    display: "standalone",
    dir: "rtl",
    lang: "ar",
    background_color: "#f4f6fc",
    theme_color: "#7d82fb",
    icons: [
      { src: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
