import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-semibold transition duration-200 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-[linear-gradient(135deg,#be123c,#ef4444)] px-5 py-3 text-white shadow-[0_18px_38px_rgba(190,18,60,0.24)] hover:bg-red-500 hover:shadow-[0_22px_46px_rgba(190,18,60,0.32)]",
        secondary:
          "border border-white/12 bg-white/6 px-5 py-3 text-white hover:border-white/22 hover:bg-white/10",
        ghost:
          "px-4 py-3 text-slate-200 hover:bg-white/6 hover:text-white",
      },
      size: {
        sm: "h-10 px-4",
        md: "h-11 px-5",
        lg: "h-12 px-6",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
