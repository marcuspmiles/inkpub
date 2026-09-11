import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

const CONTROL_CLASSES =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-paper " +
  "placeholder:text-paper-faint/70 transition-colors duration-200 " +
  "hover:border-white/16 focus:border-accent/60 focus:bg-white/[0.05] focus:outline-none " +
  "focus:ring-2 focus:ring-accent/25 disabled:opacity-50";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(CONTROL_CLASSES, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea className={cn(CONTROL_CLASSES, "resize-y leading-relaxed", className)} {...props} />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(CONTROL_CLASSES, "appearance-none bg-ink-900 pr-9", className)}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
  required,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
  required?: boolean;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="flex items-baseline justify-between gap-3 text-[0.8125rem] font-medium text-paper-dim"
      >
        <span>
          {label}
          {required ? <span className="ml-0.5 text-accent-soft">*</span> : null}
        </span>
        {hint ? <span className="text-xs font-normal text-paper-faint">{hint}</span> : null}
      </label>
      {children}
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-500/25 bg-red-500/10 px-3.5 py-3 text-[0.8125rem] leading-relaxed text-red-200"
    >
      {children}
    </div>
  );
}

export function FormNotice({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3.5 py-3 text-[0.8125rem] leading-relaxed text-emerald-200">
      {children}
    </div>
  );
}
