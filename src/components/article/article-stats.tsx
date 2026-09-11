import { Bookmark, Eye, Heart } from "lucide-react";

import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";

export function ArticleStats({
  views,
  likes,
  saves,
  className,
  iconClassName,
}: {
  views: number;
  likes: number;
  saves: number;
  className?: string;
  iconClassName?: string;
}) {
  const icon = cn("h-3.5 w-3.5", iconClassName);

  return (
    <div
      className={cn(
        "flex items-center gap-3.5 text-[0.75rem] tabular-nums text-paper-faint",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5" title={`${views} views`}>
        <Eye className={icon} strokeWidth={1.75} />
        {formatCount(views)}
      </span>
      <span className="inline-flex items-center gap-1.5" title={`${likes} likes`}>
        <Heart className={icon} strokeWidth={1.75} />
        {formatCount(likes)}
      </span>
      <span className="inline-flex items-center gap-1.5" title={`${saves} saves`}>
        <Bookmark className={icon} strokeWidth={1.75} />
        {formatCount(saves)}
      </span>
    </div>
  );
}
