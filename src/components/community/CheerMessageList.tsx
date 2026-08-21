import Link from "next/link";
import type { CheerMessage } from "@/types/app";

/**
 * 公開済みの応援メッセージ。
 *
 * 承認されたものしか来ない（RLS が status = 'published' を強制している）。
 * 本文は生HTMLを描画せず、テキストとしてそのまま出す。
 * Markdown も通さない（リンクを書き込ませないため）。
 *
 * `showSchool` は都道府県ページ用。**投稿欄は学校ページにしか無い**ので、
 * 県ページはその県の学校あての投稿を宛先つきで並べる集約表示になる（0008）。
 */
export function CheerMessageList({
  items,
  showSchool = false,
  emptyText = "まだ応援メッセージはありません。最初のひとことをどうぞ。",
}: {
  items: CheerMessage[];
  showSchool?: boolean;
  emptyText?: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-ink-muted">{emptyText}</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li
          key={item.id}
          className="rounded-xl border border-line bg-white p-4"
        >
          {showSchool && item.school && (
            <p className="mb-1.5 text-xs font-bold text-navy-800">
              <Link
                href={`/schools/${item.school.slug}`}
                className="hover:underline"
              >
                {item.school.name}
              </Link>
              <span className="font-medium text-ink-faint"> へ</span>
            </p>
          )}

          {/* whitespace-pre-line で改行だけ活かす。HTMLとしては解釈しない */}
          <p className="whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink">
            {item.body}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
            <span>{item.displayName ?? "名無しの応援団"}</span>

            {item.publishedAt && (
              <time dateTime={item.publishedAt}>
                {new Date(item.publishedAt).toLocaleDateString("ja-JP", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
