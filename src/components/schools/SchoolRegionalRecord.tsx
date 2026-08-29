import Link from "next/link";

import { cn } from "@/lib/utils";
import {
  formatRegionalDateWithYear,
  seasonLabel,
  type RegionalGame,
  type RegionalSeason,
} from "@/lib/regional-results";
import { tournamentDisplayName } from "@/lib/regional-tournaments";

/**
 * その学校の地方大会の戦績。
 *
 * ------------------------------------------------------------------
 * ★**出どころは `src/lib/data/regional/<県>.ts`（生成物）。**
 * DBの `school_records` は未着手で0件なので、**画面に出せる戦績はこちら。**
 *
 * ★**大会ごとにまとめる。** 日付順に一列で並べると、春季・夏・秋季が
 * 地続きに見えて「どの大会の話か」が分からなくなる（県のページと同じ考え方）。
 *
 * ★**引き分けを「負け」と書かない。** 高校野球には引き分け再試合がある。
 * `won` は両方 false になるので、**スコアが同じかどうかで見る**
 * （`RegionalDistrictCard` と同じ）。
 *
 * ★**敗戦数は出さない**（サイトの方針）。**1試合ずつの結果は出す**が、
 * 「N勝M敗」のように**負けを数えて見出しにしない。**
 */
export function SchoolRegionalRecord({
  games,
  schoolSlug,
  tournamentLinks,
}: {
  games: RegionalGame[];
  schoolSlug: string;
  /**
   * ★**大会ページへのリンクと、そこで使っている表示名**（2026-08-29 追加）。
   * 鍵は下のグループ分けと同じ `${season}\t${大会名 ?? ""}`。
   *
   * ★**呼ぶ側が `listTournaments` から作る**（この部品はスラッグの決め方を知らない）。
   * ★★**名前も一緒に受け取るのは、大会名を持たない大会があるから。**
   * ここだけで組み立てると「大会名不明」になり、**同じ大会が大会ページでは
   * 「2019年選手権予選」と出て食い違う。**
   * ★**無い大会は素通し**（リンクを出さず、この部品の既定の名前で出す）。
   */
  tournamentLinks?: Record<string, { href: string; name: string }>;
}) {
  if (!games.length) return null;

  /** 大会ごと。**新しい順**（日付が無い大会は後ろ） */
  const groups: { key: string; season: RegionalSeason; tournament: string | null; games: RegionalGame[] }[] = [];
  for (const g of games) {
    const key = `${g.season}\t${g.tournament ?? ""}`;
    const last = groups.find((x) => x.key === key);
    if (last) last.games.push(g);
    else groups.push({ key, season: g.season, tournament: g.tournament, games: [g] });
  }
  const newestOf = (list: RegionalGame[]) =>
    list.map((g) => g.date).filter(Boolean).sort().at(-1) ?? "";
  groups.sort((a, b) => newestOf(b.games).localeCompare(newestOf(a.games)));

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        /*
          ★★**その大会のページへ張る**（2026-08-29 追加）。

          学校ページは戦績を並べているのに、**その試合がどの大会のものかへ
          辿れなかった**（逆向き＝大会ページから学校ページへは張ってある）。
          利用者にとっては「この大会の全体を見る」という自然な導線で、
          **2,303 の学校ページから 602 の大会ページへの道**にもなる。

          ★**リンクが引けない大会は素通しにする**（文字だけ出す）。
        */
        const link = tournamentLinks?.[group.key];
        const href = link?.href;
        // ★**大会ページと同じ名前を優先する**（食い違わせない）
        const name =
          link?.name ?? tournamentDisplayName(group.tournament) ?? "大会名不明";
        return (
        <div key={group.key}>
          <h3 className="flex flex-wrap items-baseline gap-x-2 border-b border-line pb-1.5">
            <span className="rounded bg-navy-50 px-1.5 py-0.5 text-xs font-bold text-navy-700">
              {seasonLabel(group.season)}
            </span>
            {href ? (
              <Link
                href={href}
                className="min-w-0 text-sm font-bold text-navy-800 underline decoration-line underline-offset-2 hover:decoration-navy-600"
              >
                {name}
              </Link>
            ) : (
              <span className="min-w-0 text-sm font-bold text-navy-800">{name}</span>
            )}
          </h3>
          <ul className="mt-1.5 divide-y divide-line">
            {group.games.map((g, i) => (
              <GameRow key={i} game={g} schoolSlug={schoolSlug} />
            ))}
          </ul>
          {href && (
            <p className="mt-1.5 text-right text-xs">
              <Link href={href} className="text-navy-700 hover:underline">
                この大会の全試合とトーナメント表 →
              </Link>
            </p>
          )}
        </div>
        );
      })}
    </div>
  );
}

function GameRow({ game, schoolSlug }: { game: RegionalGame; schoolSlug: string }) {
  const me = game.teams.find((t) => t.slug === schoolSlug);
  const other = game.teams.find((t) => t !== me);
  if (!me || !other) return null;
  // ★引き分けは「勝ち」でも「負け」でもない。スコアが同じかで見る
  const drawn = me.score === other.score;

  return (
    <li className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 py-2 text-sm">
      <span className="w-24 shrink-0 text-xs text-ink-muted">
        {game.date ? formatRegionalDateWithYear(game.date) : "日付なし"}
      </span>
      <span className="w-16 shrink-0 text-xs font-bold text-navy-700">
        {game.round ?? "回戦不明"}
      </span>
      <span
        className={cn(
          "w-9 shrink-0 rounded px-1 text-center text-xs font-bold",
          drawn
            ? "bg-navy-100 text-navy-700"
            : me.won
              ? "bg-accent-500 text-navy-900"
              : "bg-line text-ink-muted",
        )}
      >
        {drawn ? "△" : me.won ? "○" : "●"}
      </span>
      <span className="shrink-0 tabular-nums font-bold text-navy-800">
        {me.score} - {other.score}
      </span>
      <span className="min-w-0 flex-1 truncate text-ink-muted">{other.display}</span>
      {game.venue && (
        <span className="shrink-0 text-xs text-ink-faint">{game.venue}</span>
      )}
    </li>
  );
}
