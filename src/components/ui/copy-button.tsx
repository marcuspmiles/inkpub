"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/cn";

export function CopyButton({
  value,
  label = "Copy",
  className,
  variant = "subtle",
}: {
  value: string;
  label?: string;
  className?: string;
  variant?: "subtle" | "button";
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API is unavailable over plain http on some browsers.
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full text-[0.75rem] transition-colors duration-200",
        variant === "button"
          ? "border border-white/12 bg-white/[0.03] px-3 py-1.5 text-paper-dim hover:border-white/25 hover:text-paper"
          : "px-2 py-1 text-paper-faint hover:text-paper",
        className,
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-300" strokeWidth={2} />
      ) : (
        <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
      )}
      {copied ? "Copied" : label}
    </button>
  );
}
