"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ArrowRight, ShieldCheck, LogOut } from "lucide-react";

import { useAuthStore } from "@/stores/auth-store";
import {
  secondaryNavigation,
  workspaceNavigation,
} from "@/lib/constants/navigation";
import { cn } from "@/lib/utils/cn";

function NavLink({
  href,
  label,
  eyebrow,
  description,
  active,
}: {
  href: string;
  label: string;
  eyebrow: string;
  description: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col rounded-[22px] border px-4 py-4 transition duration-200",
        active
          ? "border-white/20 bg-white/12 shadow-[0_16px_38px_rgba(15,23,42,0.2)]"
          : "border-white/6 bg-white/[0.03] hover:border-white/12 hover:bg-white/[0.07]",
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-orange-300/80">
          {eyebrow}
        </span>
        <ArrowRight
          className={cn(
            "h-4 w-4 transition duration-200",
            active
              ? "text-white"
              : "text-slate-500 group-hover:translate-x-0.5 group-hover:text-slate-200",
          )}
        />
      </div>
      <span className="text-base font-semibold text-white">{label}</span>
      <span className="mt-1 text-sm leading-6 text-slate-300/78">
        {description}
      </span>
    </Link>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  return (
    <aside className="sticky top-0 hidden h-screen border-r border-white/6 bg-slate-950/70 px-6 py-8 backdrop-blur xl:block">
      <div className="flex h-full flex-col">
        <div className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(248,113,113,0.28),transparent_48%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/12 text-lg font-black text-white">
              HA
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-orange-200/70">
                Hema AI
              </p>
              <h1 className="text-xl font-semibold text-white">
                Bàn làm việc
              </h1>
            </div>
          </div>
        </div>

        <div className="mt-8 flex-1 space-y-3">
          {workspaceNavigation.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                eyebrow={item.eyebrow}
                description={item.description}
                active={active}
              />
            );
          })}
        </div>

        <div className="mt-6 rounded-[24px] border border-emerald-400/18 bg-emerald-500/8 p-4">
          <div className="flex items-center gap-2 text-emerald-200">
            <ShieldCheck className="h-4 w-4" />
            <span className="text-sm font-semibold">Đang vận hành</span>
          </div>
        </div>

        <div className="mt-4 rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
          <div className="mb-3 flex items-center gap-2 text-slate-200">
            <Activity className="h-4 w-4" />
            <span className="text-sm font-semibold">Lối tắt điều khiển</span>
          </div>
          <div className="space-y-2">
            {secondaryNavigation
              .filter((item) => item.href !== "/login")
              .filter((item) => (item.href === "/admin" ? user?.role === "admin" : true))
              .map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-2xl border border-transparent px-3 py-2 text-sm text-slate-300 transition hover:border-white/8 hover:bg-white/[0.05] hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        {/* User Profile & Logout */}
        <div className="mt-auto pt-6">
          <div className="flex items-center gap-3 rounded-2xl border border-white/6 bg-white/[0.03] p-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-sm font-bold text-orange-400">
              {user?.username?.substring(0, 2).toUpperCase() || "HA"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">
                {user?.full_name || user?.username || "Người dùng"}
              </p>
              <p className="truncate text-[10px] uppercase tracking-wider text-slate-500">
                {user?.role || "user"}
              </p>
            </div>
            <button
              onClick={() => {
                logout();
                window.location.href = "/login";
              }}
              className="group flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-slate-500 transition hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-400"
              title="Đăng xuất"
            >
              <LogOut size={16} className="transition group-hover:scale-110" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
