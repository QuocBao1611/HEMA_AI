import type { Metadata } from "next";

import { AppProviders } from "@/providers/app-providers";

import "./globals.css";

export const metadata: Metadata = {
  title: "HEMA-AI Workspace",
  description:
    "Workspace moi cho he thong phan tich te bao mau, duoc nang cap len Next.js va giu backend AI tren FastAPI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full bg-slate-950 text-slate-50">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
