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
  name: string;
  prefecture: string | null;
  wins: number;
};

export type LiveResults = {
  tournamentTitle: string;
  season: "spring" | "summer";
  year: number;
  sourceUrl: string;
  /** Wikipedia側の最終更新（ISO文字列） */
  revisedAt: string | null;
  /** 生成した時刻（ISO文字列） */
  generatedAt: string;
  /** 公立校が絡む試合だけ。新しい順ではなくブラケット順 */
  games: LiveGame[];
  alive: LiveAliveSchool[];
};

/** 新しい試合が上に来るように並べ替える。同じ日なら試合順の遅いほうが上。 */
export function sortGamesByRecency(games: LiveGame[]): LiveGame[] {
  const key = (g: LiveGame) => {
    // 「8月12日」→ 812 のような比較用の数値。年をまたがないので月日で足りる。
    const m = g.date.match(/(\d+)月(\d+)日/);
    const md = m ? Number(m[1]) * 100 + Number(m[2]) : 0;
    return md * 100 + Number(g.order ?? 0);
  };
  return [...games].sort((a, b) => key(b) - key(a));
}
