/**
 * 開催中の甲子園の試合結果。
 *
 * データ本体は `src/lib/data/live-results.ts`（**生成物・直接編集しない**）。
 * `scripts/build-live-results.mjs` が Wikipedia から作り、GitHub Actions が
 * 定期的に回してコミットする。
 *
 * DBに入れていないのは、書き込みに `service_role` キーが要るため。
 * このプロジェクトは意図的にそのキーを持たない（README参照）ので、
 * **生成物をリポジトリに置いてデプロイで反映する**形にしている。
 * 差分がGitに残るので、Wikipediaが荒らされても後から追える。
 */

export type LiveTeam = {
  /** Wikipediaのブラケット上の表記（「高岡商」など） */
  display: string;
  /** 学校マスタの校名。公立でなければ display と同じ */
  name: string;
  /** 公立校なら slug。私立は null */
  slug: string | null;
  /** 公立校なら都道府県名 */
  prefecture: string | null;
  score: number;
  won: boolean;
};

export type LiveGame = {
  /** 「1回戦」「準々決勝」など */
  round: string;
  /** 「8月12日」 */
  date: string;
  /** 同じ日の第何試合か。無ければ null */
  order: string | null;
  /** 「8:03」。高野連の日別ページから。実施済みは実際の開始時刻 */
  startTime: string | null;
  /** サヨナラ決着か */
  walkOff: boolean;
  teams: LiveTeam[];
};

/** まだ負けていない公立校 */
export type LiveAliveSchool = {
  slug: string;
  /** 大会記事の略称（「大分商」）。**画面ではこちらを使う。** */
  display: string;
  /** 学校マスタの校名（「大分商業高校」）。リンクのtitleなどに使う */
  name: string;
  prefecture: string | null;
  wins: number;
  /**
   * 次戦。
   *
   * 高野連は**日程が発表された日ぶんしかページを出さない。**
   * 対戦カードが決まっていても、その日の日程がまだ出ていなければ null。
   * 「相手だけ分かっていて日付が無い」状態は作らない
   * （Wikipedia由来だったころは日付が常に空だった）。
   */
  next: {
    round: string;
    /** 「8月13日」 */
    date: string;
    /** その日の第何試合か */
    order: string | null;
    /** 「18:00」。開始予定時刻 */
    startTime: string | null;
    opponent: string;
  } | null;
};

export type LiveResults = {
  tournamentTitle: string;
  season: "spring" | "summer";
  year: number;
  sourceUrl: string;
  /**
   * 公立校が絡む試合だけ。新しい順ではなくブラケット順。
   *
   * **生成時刻は持たせていない。** 埋め込むとCIが3時間おきに中身の同じ
   * コミットを積み続けるため。鮮度は `latestGameDate()` で出す。
   */
  games: LiveGame[];
  alive: LiveAliveSchool[];
};

/** 並べ替え用の数値。「8月12日（2）」→ 81202。年をまたがないので月日で足りる。 */
function sortKey(game: LiveGame): number {
  const m = game.date.match(/(\d+)月(\d+)日/);
  const md = m ? Number(m[1]) * 100 + Number(m[2]) : 0;
  return md * 100 + Number(game.order ?? 0);
}

/** 新しい試合が上に来るように並べ替える。同じ日なら試合順の遅いほうが上。 */
export function sortGamesByRecency(games: LiveGame[]): LiveGame[] {
  return [...games].sort((a, b) => sortKey(b) - sortKey(a));
}

/**
 * 反映されている最新の試合日。「8月12日」のような文字列を返す。
 * 試合がまだ無ければ null。
 *
 * 生成時刻の代わりに鮮度を示すために使う。読者にとっても
 * 「いつ生成したか」より「どこまで反映されているか」のほうが意味がある。
 */
export function latestGameDate(games: LiveGame[]): string | null {
  if (games.length === 0) return null;
  return games.reduce((a, b) => (sortKey(b) > sortKey(a) ? b : a)).date;
}

/** 大会での、その学校のいまの状況 */
export type LiveStatus = {
  wins: number;
  /** まだ負けていない */
  alive: boolean;
  /** 負けた試合の回戦名。勝ち残っていれば null */
  lostAt: string | null;
};

/**
 * 公立校ごとの勝敗をまとめる。トップの「今夏の甲子園に出場している公立校」で、
 * 各校が勝ち残っているのか、どこで負けたのかを出すのに使う。
 *
 * **勝ち残りの判定は `alive` を正とする。** 試合結果だけから
 * 「負けていない＝勝ち残り」と決めると、初戦がまだの学校（1試合も
 * 記録が無い）を取りこぼす。`alive` はブラケット全体から作られている。
 */
export function statusBySlug(results: LiveResults): Map<string, LiveStatus> {
  const aliveSlugs = new Set(results.alive.map((s) => s.slug));
  const status = new Map<string, LiveStatus>();

  for (const game of sortGamesByRecency(results.games)) {
    for (const team of game.teams) {
      if (!team.slug) continue;
      const current = status.get(team.slug) ?? {
        wins: 0,
        alive: aliveSlugs.has(team.slug),
        lostAt: null,
      };
      if (team.won) current.wins += 1;
      // 新しい順に見ているので、最初に見つかった負けが最後の試合
      else if (current.lostAt === null) current.lostAt = game.round;
      status.set(team.slug, current);
    }
  }

  // 初戦がまだの勝ち残り校は試合が1件も無い。ここで拾う
  for (const school of results.alive) {
    if (!status.has(school.slug)) {
      status.set(school.slug, { wins: school.wins, alive: true, lostAt: null });
    }
  }

  return status;
}
