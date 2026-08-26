import Link from "next/link";

import { cn } from "@/lib/utils";
import { vsPath, type HeadToHead } from "@/lib/head-to-head";

/**
 * 直接対決・通算成績。学校ページに出す。
 *
 * ------------------------------------------------------------------
 * ★★ 「◯勝◯敗」と書かない（AGENTS.md「敗戦数を画面に出さない」）
 *
 *   **両側の勝った数**で書く（`3勝 － 2勝`）。
 *   直接対決では相手の勝ち数がそのまま自分の負け数になるが、
 *   **画面の数字はどちらも「勝利数」**にそろえてある。
 *
 * ------------------------------------------------------------------
 * ★ 並びは対戦の多い順（勝率順にしない）
 *
 *   勝率で並べると**1勝0敗の相手が10戦6勝の相手より上に来る。**
 *   「よく当たる相手」を見せるのが目的なので、回数で並べる。
 *
 * ★**多い順に8件まで出して、残りは `<details>` で畳む**
 *   （タブにしない。畳んだままでも `Ctrl+F` で当たりクローラからも見える）。
 */
export function HeadToHeadList({
  items,
  schoolSlug,
  limit = 8,
}: {
  items: HeadToHead[];
  schoolSlug: string;
  limit?: number;
}) {
  if (!items.length) return null;
  const head = items.slice(0, limit);
  const rest = items.slice(limit);

  return (
    <div>
      <ul className="divide-y divide-line border-t border-line">
        {head.map((h) => (
          <Row key={h.slug ?? h.display} item={h} schoolSlug={schoolSlug} />
        ))}
      </ul>

      {rest.length > 0 && (
        <details className="group mt-2 rounded-lg border border-line">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-bold text-navy-800 hover:bg-navy-50">
            ほかの対戦相手
            <span className="flex shrink-0 items-center gap-2 text-xs font-normal text-ink-muted">
              {rest.length}校
              <span className="group-open:hidden" aria-hidden="true">
                ▼
              </span>
              <span className="hidden group-open:inline" aria-hidden="true">
                ▲
              </span>
            </span>
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {rest.map((h) => (
              <Row key={h.slug ?? h.display} item={h} schoolSlug={schoolSlug} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Row({ item, schoolSlug }: { item: HeadToHead; schoolSlug: string }) {
  const total = item.meetings.length;
  // ★公立どうしの組だけ、対戦の詳しいページがある
  const href = item.slug ? vsPath(schoolSlug, item.slug) : null;

  const name = (
    <span
      className={cn(
        "block truncate text-sm font-bold",
        item.slug ? "text-accent-800" : "text-navy-800",
      )}
    >
      {item.display}
    </span>
  );

  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="min-w-0 flex-1">
        {href ? (
          <Link href={href} className="hover:underline">
            {name}
          </Link>
        ) : (
          name
        )}
        <span className="mt-0.5 flex flex-wrap gap-x-2 text-[0.6875rem] text-ink-faint">
          {item.byStage.koshien > 0 && <span>甲子園 {item.byStage.koshien}</span>}
          {item.byStage.jingu > 0 && <span>神宮 {item.byStage.jingu}</span>}
          {item.byStage.regional > 0 && <span>地方大会 {item.byStage.regional}</span>}
          {item.lastDate && <span>最後の対戦 {item.lastDate.slice(0, 4)}年</span>}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className="block text-sm tabular-nums">
          <strong className="font-bold text-navy-800">{item.wins}勝</strong>
          <span className="mx-1 text-ink-faint">－</span>
          <span className="text-ink-muted">{item.opponentWins}勝</span>
          {item.draws > 0 && (
            <span className="ml-1 text-ink-faint">△{item.draws}</span>
          )}
        </span>
        <span className="block text-[0.6875rem] text-ink-faint">通算{total}戦</span>
      </span>
    </li>
  );
}
