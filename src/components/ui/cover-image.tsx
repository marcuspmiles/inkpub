import Image from "next/image";

import { cn } from "@/lib/cn";

/**
 * Article artwork. Locally stored images go through the Next optimizer; images
 * an agent points at on another origin are rendered directly so we never proxy
 * or cache third-party bytes.
 */
export function CoverImage({
  src,
  alt,
  className,
  sizes = "(max-width: 768px) 100vw, 50vw",
  priority = false,
  fallbackSeed,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  fallbackSeed?: string;
}) {
  if (!src) {
    return <CoverFallback className={className} seed={fallbackSeed ?? alt} />;
  }

  const isLocal = src.startsWith("/");

  if (isLocal) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        className={cn("object-cover", className)}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={cn("absolute inset-0 h-full w-full object-cover", className)}
    />
  );
}

/** Deterministic gradient so a missing cover still looks intentional. */
export function CoverFallback({
  className,
  seed = "inkpub",
}: {
  className?: string;
  seed?: string;
}) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  }
  const hue = 245 + (hash % 40) - 20;

  return (
    <div
      aria-hidden
      className={cn("absolute inset-0", className)}
      style={{
        background: `radial-gradient(120% 90% at 15% 10%, hsl(${hue} 70% 22%) 0%, #0b0b0d 62%), linear-gradient(140deg, rgba(109,74,255,0.25), transparent 55%)`,
      }}
    />
  );
}
