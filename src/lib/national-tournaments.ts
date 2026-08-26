/**
 * 全国大会（甲子園・明治神宮大会）を**大会ごと**に数え上げる。
 *
 * ------------------------------------------------------------------
 * ★★ なぜ要るか（2026-08-26）
 *
 *   試合の生成物（`koshien-games.json` / `jingu-games.json`）は
 *   **1試合ずつ平らに並んだ配列**で、これまで**学校ページの中でしか
 *   使われていなかった。** 地方大会には `/prefectures/<県>/<年-季節>` という
 *   大会ごとのページが514件あるのに、**全国大会のページは1枚も無かった。**
 *
 *   ここは `regional-tournaments.ts` と同じ役割を、全国大会に対して果たす。
 *
 * ------------------------------------------------------------------
 * ★ slug はローマ字（AGENTS.md の決めごと）
 *
 *   甲子園 …… `2025-summer` / `2025-spring`
 *   神宮   …… `2025`（高校の部は年に1大会）
 *
 *   ★**`第107回…` のような日本語をURLにしない。** 共有したときに読めなくなる。
 *
 * ------------------------------------------------------------------
 * ★★ 画面のために `RegionalGame` の形へ寄せる
 *
 *   トーナメント表（`RegionalBracket`）も試合の一覧（`RegionalGameList`）も
 *   枝を組む `buildRegionalBracket` も、**すべて `RegionalGame` を受け取る。**
 *   全国大会の試合は形がほとんど同じなので、**同じ部品を使い回す**ために
 *   ここで変換する（`toRegionalGames`）。
 *
 *   ★**公立かどうかは「学校マスタに完全一致で当たるか」で決める。**
 *   当てるのは呼び出し側が渡す索引（`src/lib/queries/schools.ts` の
 *   `getSchoolNameIndex`）で、**学校ページの `koshienGamesOf` と同じ規則**。
 *   ★**そろえてあるので「学校ページには出るのに大会ページでは公立でない」
 *   という食い違いが起きない。**
 */

import { KOSHIEN_GAMES, teamPrefecture, type KoshienGame } from "@/lib/koshien-games";
import { JINGU_GAMES, type JinguGame } from "@/lib/jingu-games";
import { TOURNAMENT_BY_KEY } from "@/lib/data/koshien-tournaments";
import type { RegionalGame, RegionalSeason } from "@/lib/regional-results";

export type NationalSeason = "spring" | "summer" | "autumn";

/** 大会ページ1枚ぶん */
export type NationalTournament = {
  /** 甲子園か明治神宮か */
  kind: "koshien" | "jingu";
  year: number;
  season: NationalSeason;
  /** 第N回。神宮は持たない */
  no: number | null;
  /** 「第107回全国高等学校野球選手権大会」 */
  name: string;
  /** URLに使うローマ字の slug */
  slug: string;
  games: (KoshienGame | JinguGame)[];
  /** 決勝。読めていない大会がある */
  final: KoshienGame | JinguGame | null;
  /** いちばん古い試合の日付・いちばん新しい試合の日付（無い大会がある） */
  firstDate: string | null;
  lastDate: string | null;
  /**
   * ★**出典の別の場所から作った「出場校数・試合数」**（甲子園のみ）。
   * ★★**検算には使わない**（AGENTS.md）。199大会のうち43件で
   * 「出場校数 − 1 ≠ 試合数」になっており、**参照側が誤っている。**
   * 画面には「収録できている試合数」と並べて出し、**足りないことを隠さない。**
   */
  reference: { schoolCount: number; gameCount: number } | null;
};

const SEASON_LABEL: Record<NationalSeason, string> = {
  spring: "春",
  summer: "夏",
  autumn: "秋",
};

export const nationalSeasonLabel = (s: NationalSeason) => SEASON_LABEL[s];

/** 甲子園の全大会。**新しい順**（年 → 夏・春） */
export function listKoshienTournaments(): NationalTournament[] {
  const byKey = new Map<string, KoshienGame[]>();
  for (const g of KOSHIEN_GAMES) {
    const key = `${g.year}-${g.season}`;
    const list = byKey.get(key);
    if (list) list.push(g);
    else byKey.set(key, [g]);
  }

  const entries = [...byKey.entries()].map(([slug, games]) => {
    const dates = games.map((g) => g.date).filter((d): d is string => Boolean(d)).sort();
    const head = games[0];
    return {
      kind: "koshien" as const,
      year: head.year,
      season: head.season as NationalSeason,
      no: head.no,
      name: head.tournament,
      slug,
      games,
      final: games.find((g) => g.round === "決勝") ?? null,
      firstDate: dates[0] ?? null,
      lastDate: dates.at(-1) ?? null,
      reference: TOURNAMENT_BY_KEY.get(`${head.year}:${head.season}`) ?? null,
    };
  });

  // 新しい順。同じ年なら夏 → 春（夏のほうが後に行われる）
  return entries.sort(
    (a, b) => b.year - a.year || (a.season === "summer" ? -1 : 1),
  );
}

/** 明治神宮大会（高校の部）の全大会。**新しい順** */
export function listJinguTournaments(): NationalTournament[] {
  const byYear = new Map<number, JinguGame[]>();
  for (const g of JINGU_GAMES) {
    const list = byYear.get(g.year);
    if (list) list.push(g);
    else byYear.set(g.year, [g]);
  }

  return [...byYear.entries()]
    .map(([year, games]) => {
      const dates = games.map((g) => g.date).filter((d): d is string => Boolean(d)).sort();
      return {
        kind: "jingu" as const,
        year,
        // ★11月の大会なので秋
        season: "autumn" as const,
        no: null,
        name: games[0].tournament,
        slug: String(year),
        games,
        final: games.find((g) => g.round === "決勝") ?? null,
        firstDate: dates[0] ?? null,
        lastDate: dates.at(-1) ?? null,
        reference: null,
      };
    })
    .sort((a, b) => b.year - a.year);
}

/** slug から1件引く。無ければ null（呼び出し側で404にする） */
export function findKoshienTournament(slug: string): NationalTournament | null {
  return listKoshienTournaments().find((t) => t.slug === slug) ?? null;
}

export function findJinguTournament(slug: string): NationalTournament | null {
  return listJinguTournaments().find((t) => t.slug === slug) ?? null;
}

/**
 * その大会の試合が**別の出典から補われている**なら、その出典。
 *
 * ★**既定は ja.wikipedia の大会記事**なので、そこは返さない（注記に書いてある）。
 * ★**1試合でも出所が違えば出す。** 出典の表示は実際の出所と一致させること。
 */
export function supplementSource(
  t: NationalTournament,
): { name: string; url?: string } | null {
  for (const g of t.games) {
    const source = (g as { source?: { name: string; url?: string } }).source;
    if (source) return source;
  }
  return null;
}

/**
 * 優勝校・準優勝校。決勝が読めていない大会は null。
 * ★**都道府県も返す**（同名の別校に当てないため。甲子園だけが持っている）。
 */
export function finalists(t: NationalTournament): {
  champion: string;
  championPref?: string;
  runnerUp: string;
} | null {
  if (!t.final) return null;
  const champion = t.final.teams.find((x) => x.won);
  const runnerUp = t.final.teams.find((x) => !x.won);
  if (!champion || !runnerUp) return null;
  return {
    champion: champion.display,
    championPref: teamPrefecture(
      champion as { display: string; pref?: string; score: number; won: boolean },
    ),
    runnerUp: runnerUp.display,
  };
}

/**
 * 画面の部品が受け取れる形（`RegionalGame`）に変換する。
 *
 * @param resolve 校名 → 学校マスタの学校。**当たらなければ null**（私立・旧制中等学校）
 *
 * ★**`slug` が付いた学校だけがオレンジになり、学校ページへ繋がる。**
 * ★**当たらない学校もそのまま出す。** 全国大会は全試合が揃って初めて
 * 大会の記録になる（地方大会で私立の戦績も引用しているのと同じ考え方）。
 */
export function toRegionalGames(
  t: NationalTournament,
  resolve: (display: string, pref?: string) => { slug: string; name: string } | null,
): RegionalGame[] {
  return t.games.map((g) => ({
    date: g.date,
    season: t.season as RegionalSeason,
    tournament: t.name,
    round: g.round,
    /*
      ★**球場を書かない。** 甲子園でも**第1〜9回は豊中・鳴尾**で行われており、
      「阪神甲子園球場」と補うと**事実でないものを足す**ことになる。
      出典（大会記事の試合結果）に球場は入っていない。
    */
    venue: null,
    teams: g.teams.map((x) => {
      // ★県も渡す（甲子園の生成物だけが持っている。神宮は持たない）
      const school = resolve(x.display, teamPrefecture(x as { display: string; pref?: string; score: number; won: boolean }));
      return {
        display: x.display,
        name: school?.name ?? x.display,
        slug: school?.slug ?? null,
        score: x.score,
        won: x.won,
      };
    }),
    /*
      ★**注記（延長・サヨナラ）は試合の一覧に出す。**
      `RegionalGame.note` は地方大会では使っていないが、
      全国大会の出典は「延長15回」「サヨナラ」を持っている。**捨てない。**
    */
    note: [
      "walkOff" in g.teams[0] && g.teams.some((x) => "walkOff" in x && x.walkOff)
        ? "サヨナラ"
        : null,
      "note" in g ? g.note : null,
    ]
      .filter(Boolean)
      .join("・") || null,
  }));
}

/**
 * その大会に出た公立校。**学校マスタに当たったものだけ。**
 *
 * ★**成績は「その学校の最後の試合」から出す。**
 * 優勝／準優勝は決勝の勝敗、それ以外は**負けた回戦の名前**をそのまま書く。
 * ★**「ベスト16」のような段階名に言い換えないこと** —— 大会によって
 * 出場校数が違い、同じ回戦でも段階名が変わる。**紙に書いてあることだけを出す。**
 */
export type PublicEntrant = {
  slug: string;
  name: string;
  display: string;
  /** 「優勝」「準優勝」「3回戦敗退」「1回戦敗退」 */
  result: string;
  /** 勝った試合の数 */
  wins: number;
};

export function publicEntrants(
  t: NationalTournament,
  resolve: (display: string, pref?: string) => { slug: string; name: string } | null,
): PublicEntrant[] {
  const ROUND_ORDER = ["1回戦", "2回戦", "3回戦", "4回戦", "準々決勝", "準決勝", "決勝"];
  const depth = (round: string | null) => ROUND_ORDER.indexOf(round ?? "1回戦");

  const found = new Map<string, PublicEntrant & { deepest: number }>();
  for (const g of t.games) {
    for (const x of g.teams) {
      const school = resolve(x.display, teamPrefecture(x as { display: string; pref?: string; score: number; won: boolean }));
      if (!school) continue;
      const entry = found.get(school.slug) ?? {
        slug: school.slug,
        name: school.name,
        display: x.display,
        result: "",
        wins: 0,
        deepest: -1,
      };
      if (x.won) entry.wins += 1;
      const d = depth(g.round);
      // ★負けた試合＝その学校の最後の試合。引き分け（再試合）は最後ではない
      const decided = g.teams.some((y) => y.won);
      if (decided && !x.won && d >= entry.deepest) {
        entry.deepest = d;
        entry.result = g.round === "決勝" ? "準優勝" : `${g.round ?? "1回戦"}敗退`;
      }
      found.set(school.slug, entry);
    }
  }

  /*
    ★**優勝校は1度も負けていないので、上の「負けた試合」から成績が付かない。**
    ★**並び順も別に決める** —— `deepest` は負けた回戦の深さなので、
    そのままだと**優勝校が一覧のいちばん下に来る**（実際にそうなっていた）。
    決勝より1つ深い値を入れて先頭に置く。
  */
  const champion = finalists(t)?.champion;
  for (const entry of found.values()) {
    if (champion && entry.display === champion) {
      entry.result = "優勝";
      entry.deepest = ROUND_ORDER.length;
    } else if (!entry.result) {
      // ★負けた試合が読めていない学校は言い切らない
      entry.result = "成績不明";
    }
  }

  return [...found.values()]
    .sort((a, b) => b.deepest - a.deepest || b.wins - a.wins || a.name.localeCompare(b.name, "ja"))
    .map(({ deepest: _deepest, ...rest }) => rest);
}
