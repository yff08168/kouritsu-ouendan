import Link from "next/link";
import type { CheerMessage } from "@/types/app";

/**
 * 公開済みの応援メッセージ。
 *
 * 承認されたものしか来ない（RLS が status = 'published' を強制している）。
 * 本文は生HTMLを描画せず、テキストとしてそのまま出す。
 * Markdown も通さない（リンクを書き込ませないため）。
 */
export function CheerMessageList({
  items,
  showPrefecture = false,
}: {
  items: CheerMessage[];
  showPrefecture?: boolean;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        まだ応援メッセージはありません。最初のひとことをどうぞ。
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li
          key={item.id}
          className="rounded-xl border border-line bg-white p-4"
        >
          {/* whitespace-pre-line で改行だけ活かす。HTMLとしては解釈しない */}
          <p className="whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink">
            {item.body}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
            <span>{item.displayName ?? "名無しの応援団"}</span>

            {showPrefecture && item.prefecture && (
              <Link
                href={`/prefectures/${item.prefecture.slug}`}
                className="hover:text-navy-800 hover:underline"
              >
                {item.prefecture.name}
              </Link>
            )}

            {item.topicTitle && <span>{item.topicTitle}</span>}

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
