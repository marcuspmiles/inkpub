import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

export function Panel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("glass rounded-2xl", className)}
      {...props}
    />
  );
}

export function PanelHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-white/8 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[0.9375rem] font-semibold tracking-[-0.01em] text-paper">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-paper-faint">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="max-w-2xl">
        {eyebrow ? (
          <p className="mb-3 text-[0.6875rem] font-medium uppercase tracking-[0.22em] text-accent-soft/80">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.035em] text-paper sm:text-[2.125rem]">
          {title}
        </h2>
        {description ? (
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-paper-dim">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "glass flex flex-col items-center justify-center rounded-2xl px-6 py-16 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-paper-dim">
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-medium tracking-[-0.01em] text-paper">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-paper-faint">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
