/**
 * 明治神宮大会（高校の部）のトーナメント表を、主催者の日程表（`getJinguLive`）から組む。
 *
 * ------------------------------------------------------------------
 * ★★ 10校の形だけを扱う（1回戦2・2回戦4・準決勝2・決勝1）
 *
 *   高校の部は10地区の代表10校で、**シードの6校が2回戦から、4校が1回戦から**出る形が続いている。
 *   この形に**ならなければ表を組まず null を返す**（半端な表を出さない）。
 *
 * ★★ 枝は**構造で決める**（校名の突き合わせに頼らない）
 *
 *     1回戦の第1試合の勝者 → 2回戦の第3試合の下の席
 *     1回戦の第2試合の勝者 → 2回戦の第4試合の上の席
 *     2回戦の第1・2試合の勝者 → 準決勝の第1試合／第3・4試合の勝者 → 準決勝の第2試合
 *     準決勝の勝者 → 決勝
 *
 *   ★**主催者の表はこの並びで出ている**（2026年: 2回戦第3試合「横浜 vs 仙台育英」＝1回戦第1試合の勝者が
 *   下の席、第4試合「北海 vs 京都国際」＝1回戦第2試合の勝者が上の席）。
 *   ★**主催者の表に校名があればそれを使い、無ければ（勝者が決まったのに表がまだ更新されていない
 *   ときは）上の勝者で埋める。** 食い違うときは主催者の表を信じる。
 *
 * ★★ 勝者は `isFinished`（開始から3時間たった試合）だけ。**途中の得点は出すが、勝ちの印は付けない。**
 *   同点・「中止」などの注記つきは勝者なし。
 */

import { isFinished, type JinguLive, type JinguLiveGame } from "@/lib/jingu-live";

export type BracketSlot = {
  /** 「仙台育英」。決まっていなければ null（「未定」と出す） */
  name: string | null;
  score: number | null;
  /** 勝った（終わった試合だけ） */
  won: boolean;
};

export type BracketGame = {
  teams: [BracketSlot, BracketSlot];
  /** 終わって勝者が決まった */
  decided: boolean;
  /** 「11/20 8:30」。出典に無ければ null */
  label: string | null;
  /** 勝者の校名（決まっていれば） */
  winner: string | null;
};

export type JinguBracket = {
  r1: BracketGame[];
  r2: BracketGame[];
  sf: BracketGame[];
  f: BracketGame;
  champion: string | null;
};

/**
 * 「仙台育英高」「仙台育英高校」→「仙台育英」。
 * ★**「大高」は残す**（「二松学舎大高」→「二松学舎大」にすると大学名に見える。神宮の出典の略し方）。
 */
export const shortJinguName = (name: string): string => name.replace(/(?<!大)高校?$/, "");

const labelOf = (g: JinguLiveGame): string => `${g.month}/${g.day}${g.time ? ` ${g.time}` : ""}`;

export function buildJinguBracket(live: JinguLive, now: Date): JinguBracket | null {
  const byRound = (round: string) => live.games.filter((g) => g.round === round);
  const r1Raw = byRound("1回戦");
  const r2Raw = byRound("2回戦");
  const sfRaw = byRound("準決勝");
  const fRaw = byRound("決勝");
  if (r1Raw.length !== 2 || r2Raw.length !== 4 || sfRaw.length !== 2 || fRaw.length !== 1) return null;

  /** 出典の1試合 → 画面の1試合（席の校名は上から埋める） */
  const make = (g: JinguLiveGame, fill: [string | null, string | null]): BracketGame => {
    const done = isFinished(g, live.year, now);
    const [sa, sb] = g.scores ?? [null, null];
    const names: [string | null, string | null] = [
      g.teams[0] ? shortJinguName(g.teams[0]) : fill[0],
      g.teams[1] ? shortJinguName(g.teams[1]) : fill[1],
    ];
    const aWon = done && sa !== null && sb !== null && sa > sb;
    const bWon = done && sa !== null && sb !== null && sb > sa;
    const winner = aWon ? names[0] : bWon ? names[1] : null;
    return {
      teams: [
        { name: names[0], score: sa, won: aWon },
        { name: names[1], score: sb, won: bWon },
      ],
      decided: Boolean(winner),
      label: labelOf(g),
      winner,
    };
  };

  const r1 = r1Raw.map((g) => make(g, [null, null]));
  const r2 = [
    make(r2Raw[0], [null, null]),
    make(r2Raw[1], [null, null]),
    make(r2Raw[2], [null, r1[0].winner]),
    make(r2Raw[3], [r1[1].winner, null]),
  ];
  const sf = [
    make(sfRaw[0], [r2[0].winner, r2[1].winner]),
    make(sfRaw[1], [r2[2].winner, r2[3].winner]),
  ];
  const f = make(fRaw[0], [sf[0].winner, sf[1].winner]);

  return { r1, r2, sf, f, champion: f.winner };
}
