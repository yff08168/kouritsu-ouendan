import Link from "next/link";

import { seasonLabel } from "@/lib/regional-results";
import type { TournamentEntry } from "@/lib/regional-tournaments";

/**
 * 大会へのリンクの一覧。県のページと大会のページで同じものを使う。
 *
 * ------------------------------------------------------------------
 * ★★ 多い県があるので、途中から畳む
 *
 *   長野は**63大会**ある（地区予選まで1大会ずつ数えるため）。
 *   全部並べると 1,700px を超えて、**下の応援メッセージや投票がずっと遠くなる。**
 *   ★**ほとんどの県は1〜5大会**なので、畳むのは長野のような県だけ。
 *
 *   ★**`<details>` で畳む。** JavaScript を使わないので、
 *   **開いた状態で印刷・検索・読み上げができる**（`Ctrl+F` でも当たる）。
 *   ★**「ほか63件」と数だけ書いて省かないこと** —— 過去の大会に
 *   辿り着けなくなる。
 */
export function TournamentLinks({
  prefectureSlug,
  entries,
  initial = 8,
}: {
  prefectureSlug: string;
  entries: TournamentEntry[];
  /** 畳まずに出す件数 */
  initial?: number;
}) {
  if (!entries.length) return null;
  const head = entries.slice(0, initial);
  const rest = entries.slice(initial);

  return (
    <>
      <List prefectureSlug={prefectureSlug} entries={head} />
      {rest.length > 0 && (
        <details className="mt-2 group">
          <summary className="cursor-pointer list-none rounded-lg border border-line px-3 py-2 text-sm font-bold text-navy-800 hover:bg-navy-50">
            過去の大会をあと{rest.length}件見る
            <span className="ml-1 font-normal text-ink-muted group-open:hidden">
              ▼
            </span>
            <span className="ml-1 hidden font-normal text-ink-muted group-open:inline">
              ▲
            </span>
          </summary>
          <div className="mt-2">
            <List prefectureSlug={prefectureSlug} entries={rest} />
          </div>
        </details>
      )}
    </>
  );
}

function List({
  prefectureSlug,
  entries,
}: {
  prefectureSlug: string;
  entries: TournamentEntry[];
}) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {entries.map((t) => (
        <li key={t.slug}>
          <Link
            href={`/prefectures/${prefectureSlug}/${t.slug}`}
            className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 hover:bg-navy-50"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
              {t.name ?? `${t.year ?? ""}年${seasonLabel(t.season)}`}
            </span>
            <span className="shrink-0 text-xs text-ink-muted">
              {t.games.length}試合
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
