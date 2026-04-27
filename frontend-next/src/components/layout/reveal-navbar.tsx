"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const navLinks = [
  { href: "/", label: "Phân tích" },
  { href: "/compare", label: "So sánh" },
  { href: "/dashboard", label: "Lịch sử" },
  { href: "/guide", label: "Hướng dẫn" },
];

export function RevealNavbar() {
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
        className={`absolute inset-x-0 top-0 flex min-h-16 items-center justify-between border-b border-white/8 bg-black/78 px-5 backdrop-blur-xl transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] sm:px-8 lg:px-14 md:bg-black/70 md:group-hover/reveal:translate-y-0 ${
          visible
            ? "translate-y-0"
            : "translate-y-0 md:-translate-y-full"
        }`}
      >
        <Link href="/" className="font-display text-2xl font-bold tracking-tight text-white">
          HEMA<span className="text-red-500">-AI</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-zinc-300 transition hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <Link
          href="/admin"
          className="rounded-md border border-white/10 bg-white/6 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-red-400/40 hover:bg-red-500/10 hover:text-white"
        >
          Admin
        </Link>
      </nav>
    </div>
  );
}
