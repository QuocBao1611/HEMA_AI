"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { workspaceNavigation } from "@/lib/constants/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

function resolveHeading(pathname: string) {
  const fallback = {
    title: "Phân tích thông minh",
  };

  const matched = workspaceNavigation.find((item) =>
    item.href === "/"
      ? pathname === "/"
      : pathname.startsWith(item.href),
  );

  if (!matched) {
    return fallback;
  }

  return {
    title: matched.label,
  };
}

export function AppHeader() {
  const pathname = usePathname();
  const heading = resolveHeading(pathname);

  return (
    <header className="sticky top-0 z-20 border-b border-white/6 bg-slate-950/55 backdrop-blur-xl">
      <div className="flex flex-col gap-5 px-4 py-5 sm:px-6 lg:px-10">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 xl:hidden">
            <div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-orange-300/70">
                Hema AI
              </p>
              <p className="text-sm font-semibold text-white">Hệ Thống Phân Tích</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/compare">
              <Button size="sm">Mở khu so sánh</Button>
            </Link>
          </div>
        </div>

        <div className="xl:hidden">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {workspaceNavigation.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition",
                    active
                      ? "border-orange-300/30 bg-orange-400/12 text-orange-100"
                      : "border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {heading.title}
          </h2>
        </div>
      </div>
    </header>
  );
}
