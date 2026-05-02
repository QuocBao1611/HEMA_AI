"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const navLinks = [
  { href: "/", label: "Phân tích" },
  { href: "/compare", label: "So sánh" },
  { href: "/dashboard", label: "Lịch sử" },
  { href: "/guide", label: "Hướng dẫn" },
];

export function RevealNavbar() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(true);
  const hideTimer = useRef<number | null>(null);
  const pointerInside = useRef(false);

  const isInBanner = () => window.scrollY <= 80;

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const show = useCallback(() => {
    clearHideTimer();
    setVisible(true);
  }, [clearHideTimer]);

  const scheduleHide = () => {
    clearHideTimer();
    if (isInBanner()) {
      setVisible(true);
      return;
    }
    hideTimer.current = window.setTimeout(() => setVisible(false), 360);
  };

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (event.clientY <= 36) {
        show();
      }
    };

    const handleScroll = () => {
      if (isInBanner()) {
        show();
        return;
      }
      if (!pointerInside.current) {
        setVisible(false);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("scroll", handleScroll);
      clearHideTimer();
    };
  }, [clearHideTimer, show]);

  return (
    <div
      onMouseEnter={() => {
        pointerInside.current = true;
        show();
      }}
      onMouseLeave={() => {
        pointerInside.current = false;
        scheduleHide();
      }}
      className="group/reveal fixed inset-x-0 top-0 z-50 h-20 md:h-24"
    >
      <nav
        onFocus={show}
        onMouseEnter={() => {
          pointerInside.current = true;
          show();
        }}
        onMouseLeave={() => {
          pointerInside.current = false;
          scheduleHide();
        }}
        className={`absolute inset-x-0 top-0 flex min-h-16 items-center justify-between px-5 backdrop-blur-xl transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] sm:px-8 lg:px-14 md:group-hover/reveal:translate-y-0 border-b border-black/8 bg-white/88 md:bg-white/80 dark:border-white/8 dark:bg-black/78 dark:md:bg-black/70 ${
          visible ? "translate-y-0" : "translate-y-0 md:-translate-y-full"
        }`}
      >
        {/* Logo */}
        <Link
          href="/"
          className="font-display text-2xl font-bold tracking-tight transition-colors text-slate-900 dark:text-white"
        >
          HEMA<span className="text-red-500">-AI</span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-semibold transition-colors ${
                  isActive
                    ? "text-red-600 dark:text-red-400"
                    : "text-slate-600 hover:text-red-600 dark:text-slate-300 dark:hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/admin"
            className="rounded-md border px-3 py-2 text-xs font-semibold transition border-slate-200 bg-slate-100 text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:border-white/10 dark:bg-white/6 dark:text-zinc-200 dark:hover:border-red-400/40 dark:hover:bg-red-500/10 dark:hover:text-white"
          >
            Admin
          </Link>
        </div>
      </nav>
    </div>
  );
}
