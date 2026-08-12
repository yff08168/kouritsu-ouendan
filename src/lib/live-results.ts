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
   * 次戦。**日付は未定のことが多い。**
   * ブラケットに対戦カードだけ先に入り、日付は「月日（）」のままなので、
   * 実際の日付が入っていなければ null。
   */
  next: {
    round: string;
    date: string | null;
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
