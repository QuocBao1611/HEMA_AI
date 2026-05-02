import type { Metadata } from "next";

import { AppProviders } from "@/providers/app-providers";
import { OfflineIndicator } from "@/components/ui/offline-indicator";

import "./globals.css";

export const metadata: Metadata = {
  title: "HEMA-AI Workspace",
  description:
    "Workspace mới cho hệ thống phân tích tế bào máu, được nâng cấp lên Next.js và giữ backend AI trên FastAPI.",
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
          {children}
          <OfflineIndicator />
        </AppProviders>
      </body>
    </html>
  );
}
