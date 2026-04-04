import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bloom & Grow — Garden & Home",
  description: "Your garden, elevated. Shop plants, tools, soils, and services with AI-powered help.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
