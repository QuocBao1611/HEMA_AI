import type { Metadata, Viewport } from "next";

import { AppProviders } from "@/providers/app-providers";
import { OfflineIndicator } from "@/components/ui/offline-indicator";
import { PwaRegister } from "@/components/pwa-register";

import "./globals.css";

export const metadata: Metadata = {
  title: "HemaVision AI",
  description: "Hệ thống AI phân tích tiêu bản máu chuyên nghiệp",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "HemaVision",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full">
        <AppProviders>
          <PwaRegister />
          {children}
          <OfflineIndicator />
        </AppProviders>
      </body>
    </html>
  );
}
