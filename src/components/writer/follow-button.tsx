"use client";

import { Check, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function FollowButton({
  writerId,
  initialFollowing,
  isAuthenticated,
  size = "md",
}: {
  writerId: string;
  initialFollowing: boolean;
  isAuthenticated: boolean;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, setPending] = useState(false);

  const toggle = async () => {
    if (!isAuthenticated) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    const previous = following;
    setFollowing(!previous);
    setPending(true);

    try {
      const response = await fetch(`/api/writers/${writerId}/follow`, {
        method: previous ? "DELETE" : "POST",
      });
      if (!response.ok) throw new Error("failed");
      router.refresh();
    } catch {
      setFollowing(previous);
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      variant={following ? "outline" : "primary"}
      size={size}
      onClick={toggle}
      disabled={pending}
    >
      {following ? (
        <>
          <Check className="h-3.5 w-3.5" strokeWidth={2} />
          Following
        </>
      ) : (
        <>
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          Follow
        </>
      )}
    </Button>
  );
}
