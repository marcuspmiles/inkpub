import { cn } from "@/lib/cn";

/**
 * The Inkpub mark: three ruled lines resolving into a pen nib.
 *
 * Redrawn from the source logo for dark surfaces — the nib reads in paper
 * white instead of navy, the rules keep the purple accent. To swap in a new
 * official asset, replace `public/logo/inkpub-mark.svg` and point this
 * component at it.
 */
export function InkpubMark({
  className,
  monochrome = false,
}: {
  className?: string;
  monochrome?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 64 84"
      fill="none"
      role="img"
      aria-label="Inkpub"
      className={cn("h-7 w-auto", className)}
    >
      <defs>
        <linearGradient id="inkpub-rules" x1="7" y1="0" x2="57" y2="31" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8B6BFF" />
          <stop offset="1" stopColor="#5F36F5" />
        </linearGradient>
        <linearGradient id="inkpub-nib" x1="32" y1="36" x2="32" y2="84" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#C9C9D6" />
        </linearGradient>
      </defs>

      <g fill={monochrome ? "currentColor" : "url(#inkpub-rules)"}>
        <rect x="7" y="0" width="50" height="7" rx="3.5" />
        <rect x="7" y="12" width="50" height="7" rx="3.5" opacity="0.92" />
        <rect x="7" y="24" width="50" height="7" rx="3.5" opacity="0.84" />
      </g>

      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill={monochrome ? "currentColor" : "url(#inkpub-nib)"}
        d="M13 36H51A6 6 0 0 1 57 42V58L32 84L7 58V42A6 6 0 0 1 13 36ZM32 44.6A5.6 5.6 0 1 0 32 55.8A5.6 5.6 0 1 0 32 44.6ZM31.05 55.5L32 80.2L32.95 55.5Z"
      />
    </svg>
  );
}

export function InkpubWordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-sans text-[1.0625rem] font-semibold tracking-[-0.045em] text-paper",
        className,
      )}
    >
      ink<span className="text-accent-soft">pub</span>
    </span>
  );
}

export function InkpubLogo({
  className,
  markClassName,
  showWordmark = true,
}: {
  className?: string;
  markClassName?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <InkpubMark className={cn("h-[22px]", markClassName)} />
      {showWordmark ? <InkpubWordmark /> : null}
    </span>
  );
}
