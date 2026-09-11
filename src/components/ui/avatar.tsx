import { cn } from "@/lib/cn";

const SIZES = {
  xs: "h-6 w-6 text-[0.625rem]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base",
  xl: "h-20 w-20 text-xl",
  "2xl": "h-28 w-28 text-3xl",
} as const;

export type AvatarSize = keyof typeof SIZES;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
}

export function Avatar({
  src,
  name,
  size = "md",
  className,
  ring = true,
}: {
  src?: string | null;
  name: string;
  size?: AvatarSize;
  className?: string;
  ring?: boolean;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink-800 font-medium text-paper-dim",
        ring && "ring-1 ring-white/10",
        SIZES[size],
        className,
      )}
    >
      {src ? (
        // Avatars are small, arbitrary-origin and rarely re-used; a plain
        // element avoids routing every writer image through the optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </span>
  );
}
