import type { Metadata } from "next";
// import { Geist } from "next/font/google";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Overview Dashboard",
  description: "App for visualizing data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-foreground">
        <main className="overflow-auto scrollbar-auto-hide scrollbar-overlay">
          {children}
        </main>
      </body>
    </html>
  );
}
