/**
 * 地方大会の**トーナメント表**を、試合の一覧から組み直す。
 *
 * ------------------------------------------------------------------
 * ★★ なぜ「組み直す」のか ── 生成物は枝を持っていない
 *
 *   1試合が持っているのは日付・大会名・回戦・球場・両校とスコアだけで、
 *   **スロット番号も「勝者がどの試合へ行くか」も入っていない。**
 *   枝の構造は生成側（`assembleSlotBracket`）の中にはあるが、
 *   **書き出すときに捨てている。**
 *
 *   ★**それでも組み直せる。** 全試合が揃っていれば、
 *   **「この回戦に出ている学校は、前の回戦のどの試合に勝って来たか」**を
 *   辿るだけで枝が決まる。前の回戦に見当たらなければシード（不戦）。
 *
 *   ★★**これは 2026-08-21 の方針変更（私立の戦績も引用する）があって
 *   初めて成り立つ。** それまでは私立どうしの試合が生成物に1件も無く、
 *   **枝が欠けるだけでなく「次の公立の試合に誰が上がってきたか」も辿れなかった。**
 *
 * ------------------------------------------------------------------
 * ★★ 組めない大会は組まない（このリポジトリの決まり）
 *
 *   実測（2026-08-22・95大会）では **57大会が組めて38大会が組めなかった。**
 *   組めない理由はどれも**本当に組めない**もので、握りつぶしていない。
 *
 *     ・いちばん深い回戦が2試合以上（**ブロック予選**。1枚から複数の代表が出る。
 *       茨城の秋季一次予選・徳島のブロック大会など。**勝ち抜きの木ではない**）
 *     ・決勝から辿り着けない試合がある（**出典に載っていない試合がある**）
 *     ・同じ試合が2つの試合へ繋がる（**校名が一意でない**。栃木・長崎の
 *       `連合` のように、**別のチームが同じ表記**になっている）
 *
 *   ★**どれか1つでも当たれば `null` を返す。**「だいたい合っている表」を
 *   出さない。石川で踏んだ「構造は合うのに対戦相手が違う」と同じ轍になる。
 */

import type { RegionalGame, RegionalTeam } from "@/lib/regional-results";

/**
 * 回戦の深さ。**`build-regional-results.mjs` の `ROUND_ORDER` と揃えること。**
 * 片方だけ足すと、その回戦の試合が枝から外れる。
 */
const ROUND_ORDER = [
  "1回戦",
  "2回戦",
  "3回戦",
  "4回戦",
  "5回戦",
  "6回戦",
  "7回戦",
  "代表決定戦",
  "準々決勝",
  "準決勝",
  "決勝",
];

const depthOf = (round: string | null) => ROUND_ORDER.indexOf(round ?? "");

export type BracketSeat = {
  team: RegionalTeam;
  /**
   * この学校がここへ来る前に勝った試合の番号。
   * **null はシード（前の回戦に出ていない）**。
   */
  from: number | null;
};

export type BracketGame = {
  /** `games` の中での番号。枝を辿るのに使う */
  index: number;
  game: RegionalGame;
  round: string;
  seats: [BracketSeat, BracketSeat];
};

export type RegionalBracket = {
  tournament: string | null;
  /** 浅い回戦から順。**画面はこれを左から並べる** */
  rounds: { round: string; games: BracketGame[] }[];
  /** 決勝の試合番号 */
  finalIndex: number;
  /** 枝に組み込んだ試合数 */
  total: number;
};

/**
 * 1つの大会の試合から枝を組む。**組めなければ null。**
 *
 * @param games **その大会の全試合**（私立どうしも含む）。
 *              季節・大会名で絞ってから渡すこと。
 */
export function buildRegionalBracket(games: RegionalGame[]): RegionalBracket | null {
  /*
    ★**3位決定戦と引き分けは枝から外す。**
    3位決定戦は勝ち抜きの枝ではない。引き分け（再試合になった試合）は
    勝者がいないので次に繋がらず、**入れると「決勝から辿れない試合」になる。**
    ★**外すのは枝からだけ**で、試合そのものは県のページに出ている。
  */
  const gs = games.filter(
    (g) =>
      depthOf(g.round) >= 0 &&
      g.round !== "3位決定戦" &&
      g.teams.some((t) => t.won),
  );
  if (gs.length < 3) return null;

  const maxDepth = Math.max(...gs.map((g) => depthOf(g.round)));
  const finals = gs.filter((g) => depthOf(g.round) === maxDepth);
  /*
    ★**いちばん深い回戦が1試合でなければ、勝ち抜きの木ではない。**
    ブロック予選（1枚から複数の代表が出る紙）がこれに当たる。
  */
  if (finals.length !== 1) return null;

  /** 校名 → その学校が勝った試合 */
  const wins = new Map<string, RegionalGame[]>();
  for (const g of gs) {
    for (const t of g.teams) {
      if (!t.won) continue;
      const list = wins.get(t.display);
      if (list) list.push(g);
      else wins.set(t.display, [g]);
    }
  }

  const indexOf = new Map<RegionalGame, number>(gs.map((g, i) => [g, i]));
  /** 前の回戦でその学校が勝った試合（いちばん深いもの） */
  const feederFor = (team: RegionalTeam, game: RegionalGame): number | null => {
    const prev = (wins.get(team.display) ?? [])
      .filter((p) => depthOf(p.round) < depthOf(game.round))
      .sort((a, b) => depthOf(b.round) - depthOf(a.round))[0];
    return prev ? (indexOf.get(prev) ?? null) : null;
  };

  /*
    ★**1つの試合が2つの試合へ繋がってはいけない。**
    当たるのは**校名が一意でないとき**（`連合` のように、別のチームが
    同じ表記になっている県がある）。**そこで組むと嘘の枝ができる。**
  */
  const used = new Set<number>();
  const built: BracketGame[] = [];
  for (const g of gs) {
    const seats = g.teams.map((t) => {
      const from = feederFor(t, g);
      return { team: t, from };
    }) as [BracketSeat, BracketSeat];
    for (const s of seats) {
      if (s.from === null) continue;
      if (used.has(s.from)) return null;
      used.add(s.from);
    }
    built.push({
      index: indexOf.get(g)!,
      game: g,
      round: g.round ?? "",
      seats,
    });
  }

  /*
    ★★**決勝から全部に辿り着けること。** ここがいちばん効く検算で、
    **出典に載っていない試合があると必ず落ちる**（実測で13大会が該当）。
    辿れない試合を黙って捨てると、**枝の途中が抜けた表**が出る。
  */
  const byIndex = new Map(built.map((b) => [b.index, b]));
  const finalIndex = indexOf.get(finals[0])!;
  const seen = new Set<number>();
  const stack = [finalIndex];
  while (stack.length) {
    const i = stack.pop()!;
    if (seen.has(i)) continue;
    seen.add(i);
    for (const s of byIndex.get(i)?.seats ?? []) {
      if (s.from !== null) stack.push(s.from);
    }
  }
  if (seen.size !== built.length) return null;

  /** 浅い回戦から順に並べる。**同じ回戦の中は出典の順のまま** */
  const rounds: RegionalBracket["rounds"] = [];
  for (const b of [...built].sort((a, b2) => depthOf(a.round) - depthOf(b2.round))) {
    const last = rounds.at(-1);
    if (last?.round === b.round) last.games.push(b);
    else rounds.push({ round: b.round, games: [b] });
  }

  return {
    tournament: gs[0].tournament ?? null,
    rounds,
    finalIndex,
    total: built.length,
  };
}

/**
 * その県のいちばん新しい大会の枝を組む。**組めなければ null。**
 *
 * ★**大会ごとに分けてから組むこと。** 1つの季節に複数の大会が入っている県がある
 * （徳島の秋は5大会）。まとめて渡すと「いちばん深い回戦が2試合以上」で必ず落ちる。
 */
export function bracketForGames(
  games: RegionalGame[],
  tournament: string | null,
): RegionalBracket | null {
  return buildRegionalBracket(games.filter((g) => g.tournament === tournament));
}
