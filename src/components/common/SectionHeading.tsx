import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** aria-labelledby から参照するためのid */
  id?: string;
  title: string;
  /** 見出しの右に添える補足（例：「注目の公立高校」） */
  note?: string;
  icon?: React.ReactNode;
  moreHref?: string;
  moreLabel?: string;
  /** ネイビー背景のカード内で使う場合 */
  tone?: "onLight" | "onDark";
  className?: string;
};

export function SectionHeading({
  id,
  title,
  note,
  icon,
  moreHref,
  moreLabel = "もっと見る",
  tone = "onLight",
  className,
}: Props) {
  const onDark = tone === "onDark";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {icon && (
        <span
          aria-hidden="true"
          className={cn(
            "shrink-0",
            onDark ? "text-accent-500" : "text-accent-500",
          )}
        >
          {icon}
        </span>
      )}
      <h2
        id={id}
        className={cn(
          "text-base font-bold sm:text-lg",
          onDark ? "text-white" : "text-navy-800",
        )}
      >
        {title}
      </h2>
      {note && (
        <span
          className={cn(
            "hidden text-xs sm:inline",
            onDark ? "text-navy-100/80" : "text-ink-muted",
          )}
        >
          {note}
        </span>
      )}
      {moreHref && (
        <Link
          href={moreHref}
          className={cn(
            "ml-auto inline-flex shrink-0 items-center gap-0.5 text-xs font-medium hover:underline",
            onDark ? "text-navy-100" : "text-ink-muted hover:text-navy-800",
          )}
        >
          {moreLabel}
          <ChevronRight size={14} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
