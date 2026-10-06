import type { Metadata, Viewport } from "next";
import React from "react";
import { Cairo } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/app-shell";

// Vercel sets the project's production domain at build time, so the link
// shared in previews always points at this app and never at another project.
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Solar | مراقبة الطاقة الشمسية",
  description: "الطاقة البديلة — مراقبة منظومة الطاقة الشمسية",
  icons: { icon: [{ url: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml" }, { url: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml" }] },
  robots: { index: false, follow: false },
  openGraph: {
    title: "Solar",
    description: "إدارة ومراقبة الطاقة الشمسية في منزلك",
    url: siteUrl,
    siteName: "Solar",
    locale: "ar_LB",
    type: "website",
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#7d82fb" };

const INITIAL_BACKGROUND = "#f4f6fc";

// خط عربي واحد للتطبيق كله (عناوين ونصوص وأرقام).
const cairo = Cairo({ subsets: ["arabic", "latin"], weight: ["400", "600", "700", "800", "900"], display: "swap" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" style={{ backgroundColor: INITIAL_BACKGROUND }}>
      <body
        className={cairo.className + " min-h-screen w-full bg-[#f4f6fc] text-slate-900 antialiased"}
        style={{ backgroundColor: INITIAL_BACKGROUND }}
      >
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
