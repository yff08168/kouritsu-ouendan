import { cn } from "@/lib/utils";
import { normalizeKoshienName } from "@/lib/koshien-games";

/**
 * ★**甲子園と明治神宮の両方をここで出す**（2026-08-24）。
 * どちらも「全国大会の試合」で見せ方は同じなので、**部品を分けない。**
 * `KoshienGame` も `JinguGame` もこの形に収まる
 * （`note` と `walkOff` は片方にしか無いので省略できるようにしてある）。
 */
type KoshienGame = {
  tournament: string;
  round: string | null;
  date: string | null;
  note?: string | null;
  teams: { display: string; score: number; won: boolean; walkOff?: boolean }[];
};
type KoshienGameTeam = KoshienGame["teams"][number];

/**
 * その学校の甲子園の試合。
 *
 * ★**大会ごとにまとめて、新しい順。** 春の選抜と夏の選手権が混ざるので、
 * 大会名を必ず添える。
 *
 * ★**敗戦数は数えて出さない**（サイトの方針）。1試合ずつの結果は出す。
 * ★**サヨナラは印を出す**（記事の `6x`）。
 */
export function SchoolKoshienRecord({
  games,
  names,
}: {
  games: KoshienGame[];
  /** この学校として認めてよい表記。どちらが「自分」かを決めるのに使う */
  names: readonly string[];
}) {
  if (!games.length) return null;
  const want = new Set(names.map(normalizeKoshienName).filter(Boolean));

  const groups: { key: string; tournament: string; games: KoshienGame[] }[] = [];
  for (const g of [...games].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))) {
    const key = g.tournament;
    const last = groups.find((x) => x.key === key);
    if (last) last.games.push(g);
    else groups.push({ key, tournament: g.tournament, games: [g] });
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.key}>
          <h3 className="flex flex-wrap items-baseline gap-x-2 border-b border-line pb-1.5">
            {/* ★大会の種類はバッジで分ける（甲子園／神宮） */}
            <span className="rounded bg-accent-500 px-1.5 py-0.5 text-xs font-bold text-navy-900">
              {group.tournament.includes("明治神宮") ? "神宮" : "甲子園"}
            </span>
            <span className="min-w-0 text-sm font-bold text-navy-800">
              {group.tournament}
            </span>
          </h3>
          <ul className="mt-1.5 divide-y divide-line">
            {group.games.map((g, i) => (
              <Row key={i} game={g} want={want} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Row({ game, want }: { game: KoshienGame; want: Set<string> }) {
  const me = game.teams.find((t) => want.has(normalizeKoshienName(t.display)));
  const other = game.teams.find((t: KoshienGameTeam) => t !== me);
  if (!me || !other) return null;

  return (
    <li className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 py-2 text-sm">
      <span className="w-24 shrink-0 text-xs text-ink-muted">
        {game.date ? formatMonthDay(game.date) : "日付なし"}
      </span>
      <span className="w-16 shrink-0 text-xs font-bold text-navy-700">
        {game.round ?? "回戦不明"}
      </span>
      <span
        className={cn(
          "w-9 shrink-0 rounded px-1 text-center text-xs font-bold",
          me.won ? "bg-accent-500 text-navy-900" : "bg-line text-ink-muted",
        )}
      >
        {me.won ? "○" : "●"}
      </span>
      <span className="shrink-0 tabular-nums font-bold text-navy-800">
        {me.score} - {other.score}
      </span>
      <span className="min-w-0 flex-1 truncate text-ink-muted">{other.display}</span>
      {(me.walkOff || other.walkOff) && (
        <span className="shrink-0 rounded bg-navy-50 px-1 text-xs text-navy-700">
          サヨナラ
        </span>
      )}
      {game.note && (
        <span className="shrink-0 text-xs text-ink-faint">{game.note}</span>
      )}
    </li>
  );
}

/** 「2025-08-23」→「2025年8月23日」 */
function formatMonthDay(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`;
}
