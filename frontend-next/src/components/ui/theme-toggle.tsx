"use client";

import { useThemeStore } from "@/stores/theme-store";

export function ThemeToggle() {
  const { toggleTheme } = useThemeStore();

  return (
    <button
      id="theme-toggle"
      onClick={toggleTheme}
      aria-label="Chuyển đổi giao diện"
      title="Chuyển đổi giao diện"
      className="relative flex h-8 w-16 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-300 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 bg-[#d8dbe0] dark:bg-[#28292c] border-2 border-transparent"
    >
      <span
        aria-hidden
        className="absolute left-1 top-1 h-5 w-5 rounded-full bg-[#28292c] transition-all duration-300 ease-in-out translate-x-8 shadow-none dark:translate-x-0 dark:shadow-[inset_9px_-3px_0_0_#d8dbe0]"
      />
    </button>
  );
}
