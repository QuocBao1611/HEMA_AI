"use client";

import { useOnlineStatus } from "@/hooks/use-online-status";
import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const [show, setShow] = useState(!isOnline);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (!isOnline) {
      // Small delay to prevent synchronous setState warning and provide debounce
      timer = setTimeout(() => setShow(true), 50);
    } else {
      timer = setTimeout(() => setShow(false), 2000);
    }
    return () => clearTimeout(timer);
  }, [isOnline]);

  if (!show) return null;

  return (
    <div
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg transition-all duration-300 ${
        isOnline
          ? "bg-emerald-500/90 text-white translate-y-0 opacity-0"
          : "bg-red-500/90 text-white translate-y-0 opacity-100 animate-bounce"
      }`}
    >
      <WifiOff className="h-4 w-4" />
      <span>{isOnline ? "Đã khôi phục kết nối" : "Mất kết nối mạng. Vui lòng kiểm tra lại."}</span>
    </div>
  );
}
