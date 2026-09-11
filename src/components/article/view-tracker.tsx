"use client";

import { useEffect } from "react";

/**
 * Registers a view once per mount. The server enforces the real de-duplication
 * window, so a refresh loop cannot inflate the count.
 */
export function ViewTracker({ articleId }: { articleId: string }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      void fetch(`/api/articles/${articleId}/view`, {
        method: "POST",
        keepalive: true,
      }).catch(() => {});
    }, 1200);

    return () => clearTimeout(timer);
  }, [articleId]);

  return null;
}
