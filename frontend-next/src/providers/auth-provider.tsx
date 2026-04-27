"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { getMe } from "@/lib/api/auth";
import { useAuthStore } from "@/stores/auth-store";

const PUBLIC_ROUTES = ["/login"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { token, isAuthenticated, setUser, logout } = useAuthStore();
  const [, setIsReady] = useState(true);
  const hasValidatedRef = useRef(false);

  useEffect(() => {
    const store = useAuthStore;

    if (store.persist.hasHydrated()) {
      store.getState().setHydrated(true);
      return;
    }

    const rehydrateResult = store.persist.rehydrate();
    if (rehydrateResult instanceof Promise) {
      void rehydrateResult.finally(() => {
        store.getState().setHydrated(true);
      });
      return;
    }

    store.getState().setHydrated(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

    async function syncAuth() {
      if (!token) {
        hasValidatedRef.current = false;
        if (!isPublicRoute) {
          router.replace("/login");
        }
        if (!cancelled) {
          setIsReady(true);
        }
        return;
      }

      if (!hasValidatedRef.current) {
        try {
          const user = await getMe();
          if (cancelled) {
            return;
          }
          setUser(user);
          hasValidatedRef.current = true;
        } catch {
          logout();
          hasValidatedRef.current = false;
          if (!isPublicRoute) {
            router.replace("/login");
          }
          if (!cancelled) {
            setIsReady(true);
          }
          return;
        }
      }

      if (isPublicRoute) {
        router.replace("/");
      }
      if (!cancelled) {
        setIsReady(true);
      }
    }

    void syncAuth();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, logout, pathname, router, setUser, token]);

  return <>{children}</>;
}
