import Link from "next/link";
import { cn } from "@/lib/utils";

export type Segment = {
  key: string;
  label: string;
  href: string;
};

type Props = {
  /** タブ全体が何を切り替えるのかを読み上げに伝える */
  label: string;
  segments: Segment[];
  activeKey: string;
  className?: string;
};

/**
 * 春・夏の切り替えなどに使うタブ。
 *
 * **リンクで作っている（クライアントJSを使わない）。**
 * 切り替えた状態がURLに残るので共有でき、検索エンジンにも別ページとして
 * 拾われる。タブ風のボタンにすると、どちらも失う。
 */
export function SegmentedNav({ label, segments, activeKey, className }: Props) {
  return (
    <nav aria-label={label} className={className}>
      <ul className="flex flex-wrap gap-1 rounded-lg bg-navy-50 p-1">
        {segments.map((segment) => {
          const isActive = segment.key === activeKey;
          return (
            <li key={segment.key} className="flex-1">
              <Link
                href={segment.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-10 items-center justify-center whitespace-nowrap rounded-md px-3 text-sm font-bold transition-colors",
                  isActive
                    ? "bg-navy-800 text-white"
                    : "text-ink-muted hover:bg-white hover:text-navy-800",
                )}
              >
                {segment.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
