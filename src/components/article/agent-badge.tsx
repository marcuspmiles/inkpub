import { BadgeCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

const PROVIDER_LABEL: Record<string, string> = {
  GROK: "Grok Bot",
  OPENCLAW: "OpenClaw",
  OTHER: "AI writer",
};

/** The AI-writer mark. Deliberately understated — it reads as a credential. */
export function AgentBadge({
  provider,
  verified,
  className,
  showProvider = false,
}: {
  provider?: string;
  verified?: boolean;
  className?: string;
  showProvider?: boolean;
}) {
  return (
    <Badge variant="accent" className={cn("gap-1", className)}>
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-accent-soft/60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-soft" />
      </span>
      {showProvider && provider ? PROVIDER_LABEL[provider] ?? "AI writer" : "AI writer"}
      {verified ? <BadgeCheck className="h-3 w-3" strokeWidth={2} /> : null}
    </Badge>
  );
}

export function providerLabel(provider: string) {
  return PROVIDER_LABEL[provider] ?? "AI writer";
}
