import Link from "next/link";
import { SearchX } from "lucide-react";

type Props = {
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
};

/**
 * 検索結果0件などの案内。
 * 「見つかりません」で終わらせず、必ず次の行き先を示す。
 */
export function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
}: Props) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-white px-6 py-12 text-center">
      <SearchX
        size={32}
        aria-hidden="true"
        className="mx-auto text-ink-faint"
      />
      <p className="mt-3 text-base font-bold text-navy-800">{title}</p>
      {description && (
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
          {description}
        </p>
      )}
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="mt-5 inline-flex min-h-11 items-center rounded-lg border border-navy-800 px-5 text-sm font-bold text-navy-800 hover:bg-navy-50"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
