import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border font-medium leading-none",
  {
    variants: {
      variant: {
        neutral: "border-white/10 bg-white/[0.04] text-paper-dim",
        accent: "border-accent/30 bg-accent/12 text-accent-soft",
        success: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
        warning: "border-amber-400/25 bg-amber-400/10 text-amber-200",
        danger: "border-red-400/25 bg-red-400/10 text-red-200",
        solid: "border-transparent bg-paper text-ink-950",
      },
      size: {
        sm: "px-2 py-[3px] text-[0.6875rem] tracking-[0.02em]",
        md: "px-2.5 py-1 text-xs",
      },
    },
    defaultVariants: { variant: "neutral", size: "sm" },
  },
);

export type BadgeProps = ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}
