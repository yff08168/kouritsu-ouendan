import Link from "next/link";

import { cn } from "@/lib/utils";
import type { NationalSeason } from "@/lib/national-tournaments";

/**
 * 甲子園の大会へのリンクを、**10年ごとにまとめて**並べる。
 *
 * ------------------------------------------------------------------
 * ★★ なぜ10年ごとか
 *
 *   1915年からの**190大会**を平らに並べると、どこを見ているのか
 *   分からないまま190行が続く。**年でまとめると19グループ**になり、
 *   これも多い。**10年ごとなら12グループ**で、
 *   「1980年代の甲子園」という探し方にそのまま合う。
 *
 * ★★**タブ（JavaScript）にしないこと**（`TournamentLinks` と同じ理由）。
 *   `<details>` なら**畳んだままでも `Ctrl+F` で当たり、クローラからも見える。**
 *   タブにすると**過去の大会が検索エンジンから見えなくなり、内部リンクが死ぬ。**
 *
 * ★**公立が優勝した大会はオレンジ**（このサイトの見どころ）。
 *   ★**面ではなく字の色**（アクセントは小面積のみ。AGENTS.md）。
 */
export type KoshienListEntry = {
  slug: string;
  year: number;
  season: NationalSeason;
  name: string;
  games: number;
  /** 優勝校。決勝が読めていない大会は null */
  champion: string | null;
  /** 優勝校が公立なら slug。私立・旧制中等学校は null */
  championSlug: string | null;
};

export function KoshienTournamentList({ entries }: { entries: KoshienListEntry[] }) {
  if (!entries.length) return null;
  const decades = groupByDecade(entries);

  return (
    <div className="space-y-2">
      {decades.map((group, i) => (
        <details
          key={group.decade}
          // ★いちばん新しい10年だけ開いておく
          open={i === 0}
          className="group rounded-lg border border-line"
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-bold text-navy-800 hover:bg-navy-50">
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              {group.decade}年代
              {group.publicChampions > 0 && (
                <span className="text-xs font-normal text-accent-800">
                  公立の優勝 {group.publicChampions}回
                </span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-2 text-xs font-normal text-ink-muted">
              {group.entries.length}大会
              <span className="group-open:hidden" aria-hidden="true">
                ▼
              </span>
              <span className="hidden group-open:inline" aria-hidden="true">
                ▲
              </span>
            </span>
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {group.entries.map((t) => (
              <li key={t.slug}>
                <Link
                  href={`/koshien/${t.slug}`}
                  className="flex min-h-11 items-center gap-3 px-3 py-2.5 hover:bg-navy-50"
                >
                  <span className="w-20 shrink-0 text-sm font-bold tabular-nums text-navy-800 sm:w-24">
                    {t.year}年
                    <span className="ml-1 text-xs font-normal text-ink-muted">
                      {t.season === "spring" ? "春" : "夏"}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{t.name}</span>
                    {t.champion && (
                      <span
                        className={cn(
                          "block truncate text-xs",
                          t.championSlug ? "text-accent-800" : "text-ink-muted",
                        )}
                      >
                        優勝　{t.champion}
                        {t.championSlug && "（公立）"}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-ink-muted">
                    {t.games}試合
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

type DecadeGroup = {
  decade: number;
  entries: KoshienListEntry[];
  publicChampions: number;
};

/** 10年ごとにまとめる。**並びは元のまま**（新しい順で渡ってくる） */
function groupByDecade(entries: KoshienListEntry[]): DecadeGroup[] {
  const groups = new Map<number, DecadeGroup>();
  for (const e of entries) {
    const decade = Math.floor(e.year / 10) * 10;
    let group = groups.get(decade);
    if (!group) {
      group = { decade, entries: [], publicChampions: 0 };
      groups.set(decade, group);
    }
    group.entries.push(e);
    if (e.championSlug) group.publicChampions += 1;
  }
  return [...groups.values()];
}
