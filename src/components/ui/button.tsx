import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium " +
    "transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] " +
    "active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        primary:
          "bg-paper text-ink-950 hover:bg-white shadow-[0_1px_0_0_rgba(255,255,255,0.35)_inset,0_10px_30px_-12px_rgba(0,0,0,0.9)]",
        accent:
          "bg-accent text-white hover:bg-accent-bright shadow-[0_10px_40px_-16px_var(--color-accent)]",
        outline:
          "border border-white/12 bg-white/[0.03] text-paper hover:border-white/25 hover:bg-white/[0.07]",
        ghost: "text-paper-dim hover:bg-white/[0.06] hover:text-paper",
        danger:
          "border border-red-500/25 bg-red-500/10 text-red-200 hover:border-red-500/45 hover:bg-red-500/16",
      },
      size: {
        sm: "h-8 px-3.5 text-[0.8125rem]",
        md: "h-10 px-5 text-sm",
        lg: "h-12 px-7 text-[0.9375rem]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}

export type ButtonLinkProps = ComponentProps<typeof Link> &
  VariantProps<typeof buttonVariants>;

export function ButtonLink({ className, variant, size, ...props }: ButtonLinkProps) {
  return (
    <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
