"use client";

import { Toaster } from "sonner";

import { QueryProvider } from "@/providers/query-provider";
import { AuthProvider } from "@/providers/auth-provider";

type AppProvidersProps = {
  children: React.ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <QueryProvider>
      <AuthProvider>
        {children}
      </AuthProvider>
      <Toaster
        position="top-right"
        richColors
        closeButton
        toastOptions={{
          className: "border border-white/10 bg-slate-950 text-slate-100",
        }}
      />
    </QueryProvider>
  );
}
