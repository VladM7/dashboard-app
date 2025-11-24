import type { Metadata } from "next";
import "./globals.css";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

export const metadata: Metadata = {
  title: "Overview Dashboard",
  description: "App for visualizing data.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body
        className={[
          // Expose CSS variables so Tailwind's font-sans and font-mono map to Geist fonts
          GeistSans.variable,
          GeistMono.variable,
          // Use sans as the default body font
          "font-sans",
          "bg-background",
          "text-foreground",
        ].join(" ")}
      >
        <main className="overflow-auto scrollbar-auto-hide scrollbar-overlay">
          {children}
        </main>
      </body>
    </html>
  );
}
