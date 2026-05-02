import * as React from "react";

import { cn } from "@/lib/utils/cn";

type SurfaceCardProps = React.HTMLAttributes<HTMLDivElement>;

export function SurfaceCard({
  className,
  children,
  ...props
}: SurfaceCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-black/5 dark:border-white/10 bg-white/70 dark:bg-zinc-900/40 p-6 backdrop-blur-xl",
        "shadow-lg dark:shadow-[0_18px_60px_rgba(0,0,0,0.3)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
