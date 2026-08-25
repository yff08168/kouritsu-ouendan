/**
 * 地方大会の**手で書いた補足**。
 *
 * ------------------------------------------------------------------
 * ★★ なぜ生成物と分けてあるか
 *
 *   `src/lib/data/regional/<県>.ts` は `scripts/build-regional-results.mjs` の
 *   **生成物で、走らせるたびに上書きされる。** そこへ手で足したものは消える。
 *   `src/lib/content/` は**手で書く編集コンテンツ**の置き場で、
 *   `tournament-runs.ts` と同じ扱い（AGENTS.md「ディレクトリ」）。
 *
 * ------------------------------------------------------------------
 * ★★ ここに置いてよいのは「出典が県の出典と違う試合」だけ
 *
 *   出典が同じなら**アダプタ側で取れるはず**で、手で書く理由が無い。
 *   ★**取れるものを手で書かないこと。** 出典が更新されたときに
 *   自動で追随しなくなり、**古い値が残り続ける。**
 *
 * ------------------------------------------------------------------
 * ★★ 重複したら生成物を優先する
 *
 *   出典（連盟）が後から結果を載せたら、**そちらが本来の出所**なので
 *   生成物が勝つ（`mergeRegionalSupplements` がそうしている）。
 *   ここの行は**そのとき黙って無視される**ので、消し忘れても害は無い。
 */
import type { RegionalGame } from "@/lib/regional-results";

/**
 * 富山（第108回全国高等学校野球選手権富山大会・2026年）。
 *
 * ★★**連盟の紙は準々決勝までしか埋まっていない**（2026-08-24 時点）。
 *   トーナメント表PDFの枝は、準決勝・決勝が黒のまま＝結果が入っていない。
 *   連盟が更新すれば `toyama.ts` に入り、下の3件は自動で使われなくなる。
 *
 * ★**出典が2つに分かれている。**
 *   - **決勝** … Wikipedia「全国高等学校野球選手権富山大会」の歴代結果の表。
 *     `|2026年（第108回大会）||39||高岡商||10 - 4||富山第一||`
 *     ★**要約ではなく wikitext を直接読んで確かめた**（AGENTS.md の決めごと）。
 *     ★**同じ表の「校数 39」が、連盟の紙から組み立てた39校と一致する。**
 *   - **準決勝** … 運営者自身の記録。Wikipedia の表は**決勝スコアしか持たない**
 *     （見出しは `年度（大会）!!校数!!優勝校!!決勝スコア!!準優勝校!!備考`）。
 *
 * ★**この4校は、連盟の紙から組み立てた準々決勝の勝者4校と一致している**
 *   （富山商業・富山第一・高岡第一・高岡商業）。組み合わせも左右の山のとおり。
 *
 * ★**日付と球場は連盟の紙に刷ってある日程**（準決勝 23日・決勝 25日／富山市民球場）。
 */
const TOYAMA_2026: RegionalGame[] = [
  {
    date: "2026-07-23",
    season: "summer",
    tournament: "第108回全国高等学校野球選手権富山大会",
    round: "準決勝",
    venue: "富山市民球場",
    source: { name: "運営者の記録" },
    teams: [
      { display: "富山第一", name: "富山第一", slug: null, score: 6, won: true },
      { display: "富山商業", name: "富山商業高校", slug: "toyamashogyo", score: 5, won: false },
    ],
  },
  {
    date: "2026-07-23",
    season: "summer",
    tournament: "第108回全国高等学校野球選手権富山大会",
    round: "準決勝",
    venue: "富山市民球場",
    source: { name: "運営者の記録" },
    teams: [
      { display: "高岡商業", name: "高岡商業高校", slug: "takaokashogyo", score: 5, won: true },
      { display: "高岡第一", name: "高岡第一", slug: null, score: 2, won: false },
    ],
  },
  {
    date: "2026-07-25",
    season: "summer",
    tournament: "第108回全国高等学校野球選手権富山大会",
    round: "決勝",
    venue: "富山市民球場",
    source: {
      name: "Wikipedia「全国高等学校野球選手権富山大会」",
      url: "https://ja.wikipedia.org/wiki/全国高等学校野球選手権富山大会",
    },
    teams: [
      { display: "高岡商業", name: "高岡商業高校", slug: "takaokashogyo", score: 10, won: true },
      { display: "富山第一", name: "富山第一", slug: null, score: 4, won: false },
    ],
  },
];

/** 県slug → 手で書いた試合 */
export const REGIONAL_SUPPLEMENTS: Record<string, RegionalGame[]> = {
  toyama: TOYAMA_2026,
};

/**
 * 生成物に手書きの補足を合流させる。
 *
 * ★**同じ大会・同じ回戦・同じ顔合わせが生成物にあれば、生成物を採る。**
 * 出典が本来の出所を載せたということなので、そちらが正しい。
 */
export function mergeRegionalSupplements(slug: string, games: RegionalGame[]): RegionalGame[] {
  const extra = REGIONAL_SUPPLEMENTS[slug];
  if (!extra?.length) return games;

  const key = (g: RegionalGame) =>
    [g.tournament, g.round, ...g.teams.map((t) => t.display).sort()].join("\t");
  const known = new Set(games.map(key));
  const add = extra.filter((g) => !known.has(key(g)));
  return add.length ? [...games, ...add] : games;
}
