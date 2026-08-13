import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { throwIfError, toPrefectureRef } from "@/lib/queries/shared";
import { PREFECTURES } from "@/lib/constants";
import { resultRank } from "@/lib/koshien";
import { shortSchoolName } from "@/lib/school-name";
import { TOURNAMENT_BY_KEY } from "@/lib/data/koshien-tournaments";
import { TWENTY_FIRST_CENTURY_BERTHS } from "@/lib/data/twenty-first-century";
import type { PrefectureJoin } from "@/types/database";
import type {
  KoshienBest,
  KoshienYearStat,
  PrefectureKoshienStats,
  SchoolKoshienStats,
  Season,
} from "@/types/app";
import type { Establishment, SchoolKind } from "@/lib/constants";

/**
 * ランキングの集計。
 *
 * ------------------------------------------------------------------
 * なぜDBのビューではなくアプリ側で集計するのか
 *
 *   ビューを足すとマイグレーションを人がSQL Editorで適用する必要があり、
 *   適用し忘れるとページが落ちる（このプロジェクトは Supabase CLI を使わず、
 *   SQLの実行を人がブラウザで行う運用）。集計対象は出場歴3千件・学校700件で、
 *   1回あたり4リクエスト・1.5秒ほど。ページは revalidate を長く取っており、
 *   出場歴は年に2回しか増えないので、これで足りる。
 *
 *   重くなってきたら 0007 でビューを足して差し替える。そのときも
 *   この関数の戻り値の形を保てば画面側は変えなくてよい。
 *
 * ------------------------------------------------------------------
 * ★ 収録範囲は公立・国立・高専だけ ★
 *
 *   私立は学校マスタに無いので、ここでの「1位」は全国1位ではなく
 *   **公立の中での1位**。画面には必ずその旨を出すこと。
 */

/** PostgREST が1回に返す上限。これを超える件数はページングで取る。 */
const PAGE_SIZE = 1000;

type ChampionshipAggRow = {
  school_id: string;
  year: number;
  season: Season;
  result: string | null;
  wins: number | null;
  losses: number | null;
};

type RankingSchoolRow = {
  id: string;
  slug: string;
  name: string;
  establishment: Establishment;
  school_kind: SchoolKind;
  prefecture: PrefectureJoin;
};

/**
 * 出場歴を全件取る。
 *
 * **並び順を一意に決めてからページングすること。** 並びが不定だと
 * ページの境目で同じ行が2回来たり抜けたりする。(school_id, year, season) は
 * このテーブルの一意キーなので、これで並べれば順序が確定する。
 */
async function fetchAllChampionships(): Promise<ChampionshipAggRow[]> {
  const supabase = createSupabaseServerClient();
  const rows: ChampionshipAggRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("school_championships")
      .select("school_id, year, season, result, wins, losses")
      .order("school_id", { ascending: true })
      .order("year", { ascending: true })
      .order("season", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    throwIfError(error, "甲子園出場歴の集計");

    const page = (data ?? []) as unknown as ChampionshipAggRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

/**
 * 甲子園に出たことのある学校。
 *
 * 非正規化列（koshien_*_count）で絞り込んでいるので、出場歴を入れたあとに
 * `select public.recalc_school_koshien_counts();` を流していないと0件になる。
 */
async function fetchKoshienSchools(): Promise<RankingSchoolRow[]> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("schools")
    .select(
      "id, slug, name, establishment, school_kind, prefecture:prefectures ( name, slug )",
    )
    .or("koshien_spring_count.gt.0,koshien_summer_count.gt.0")
    .order("slug", { ascending: true })
    .range(0, PAGE_SIZE - 1);

  throwIfError(error, "甲子園出場校の取得");

  return (data ?? []) as unknown as RankingSchoolRow[];
}

/** 出場1回ぶんの成績。`resultsByKey` の値。 */
export type AppearanceResult = {
  result: string | null;
  wins: number | null;
  losses: number | null;
};

export type KoshienDataset = {
  /** 出場歴のある学校。並びは未定（呼び出し側で並べ替える） */
  schools: SchoolKoshienStats[];
  /** 大会ごとの「公立が何校出たか」。古い順 */
  years: KoshienYearStat[];
  /**
   * 「slug:年:季」→ その大会の成績。
   * 21世紀枠のように「特定の学校の特定の年」を引きたい画面のために持つ。
   * 同じデータを2回取りに行かないための索引で、集計には使っていない。
   */
  resultsByKey: Map<string, AppearanceResult>;
  /** 収録している出場歴の件数 */
  appearanceCount: number;
  /** 出場歴が入っている最も新しい年 */
  latestYear: number | null;
};

/** resultsByKey のキーを作る */
export function appearanceKey(slug: string, year: number, season: Season): string {
  return `${slug}:${year}:${season}`;
}

/** slug → 21世紀枠で出場した年 */
const BERTH_YEARS_BY_SLUG = (() => {
  const map = new Map<string, number[]>();
  for (const berth of TWENTY_FIRST_CENTURY_BERTHS) {
    if (!berth.schoolSlug) continue;
    const years = map.get(berth.schoolSlug) ?? [];
    years.push(berth.year);
    map.set(berth.schoolSlug, years);
  }
  return map;
})();

const UNKNOWN_PREFECTURE = { name: "－", slug: "" };

function betterOf(a: KoshienBest | null, b: KoshienBest | null): KoshienBest | null {
  if (!a) return b;
  if (!b) return a;
  if (resultRank(b.result) < resultRank(a.result)) return b;
  // 同じ到達段階なら新しいほうを代表にする（「直近でどこまで行ったか」を出したい）
  if (resultRank(b.result) === resultRank(a.result) && b.year > a.year) return b;
  return a;
}

/**
 * 集計の本体。
 *
 * React の cache() で1リクエスト内は使い回す。ページ間の再利用は
 * 各ページの revalidate（ISR）が受け持つ。
 */
export const getKoshienDataset = cache(async (): Promise<KoshienDataset> => {
  const [schoolRows, championships] = await Promise.all([
    fetchKoshienSchools(),
    fetchAllChampionships(),
  ]);

  const statsById = new Map<string, SchoolKoshienStats>();
  for (const row of schoolRows) {
    statsById.set(row.id, {
      slug: row.slug,
      name: row.name,
      prefecture: toPrefectureRef(row.prefecture) ?? UNKNOWN_PREFECTURE,
      establishment: row.establishment,
      schoolKind: row.school_kind,
      spring: 0,
      summer: 0,
      total: 0,
      wins: 0,
      losses: 0,
      winRate: null,
      firstYear: null,
      lastYear: null,
      lastSpringYear: null,
      lastSummerYear: null,
      bestSpring: null,
      bestSummer: null,
      best: null,
      titles: 0,
      runnerUps: 0,
      finalFours: 0,
      twentyFirstCenturyYears: BERTH_YEARS_BY_SLUG.get(row.slug) ?? [],
    });
  }

  /** 「年:季」→ 公立の出場校数 */
  const publicByTournament = new Map<string, number>();
  const resultsByKey = new Map<string, AppearanceResult>();

  for (const row of championships) {
    const stats = statsById.get(row.school_id);
    // 学校が下書きなら schools 側がRLSで返らない。集計からも外す。
    if (!stats) continue;

    if (row.season === "spring") {
      stats.spring += 1;
      stats.lastSpringYear = Math.max(stats.lastSpringYear ?? row.year, row.year);
    } else if (row.season === "summer") {
      stats.summer += 1;
      stats.lastSummerYear = Math.max(stats.lastSummerYear ?? row.year, row.year);
    } else continue; // autumn は甲子園ではない

    stats.total += 1;
    stats.wins += row.wins ?? 0;
    stats.losses += row.losses ?? 0;
    stats.firstYear = stats.firstYear === null ? row.year : Math.min(stats.firstYear, row.year);
    stats.lastYear = stats.lastYear === null ? row.year : Math.max(stats.lastYear, row.year);

    if (row.result) {
      const best: KoshienBest = { result: row.result, year: row.year, season: row.season };
      if (row.season === "spring") stats.bestSpring = betterOf(stats.bestSpring, best);
      else stats.bestSummer = betterOf(stats.bestSummer, best);
      stats.best = betterOf(stats.best, best);

      if (row.result === "優勝") stats.titles += 1;
      if (row.result === "準優勝") stats.runnerUps += 1;
      if (resultRank(row.result) <= resultRank("ベスト4")) stats.finalFours += 1;
    }

    const key = `${row.year}:${row.season}`;
    publicByTournament.set(key, (publicByTournament.get(key) ?? 0) + 1);

    resultsByKey.set(appearanceKey(stats.slug, row.year, row.season), {
      result: row.result,
      wins: row.wins,
      losses: row.losses,
    });
  }

  const schools: SchoolKoshienStats[] = [];
  for (const stats of statsById.values()) {
    // 出場歴が1件も引けなかった学校は載せない（非正規化列だけが残っている状態）
    if (stats.total === 0) continue;
    const games = stats.wins + stats.losses;
    stats.winRate = games > 0 ? stats.wins / games : null;
    schools.push(stats);
  }

  const years: KoshienYearStat[] = [...publicByTournament.entries()]
    .map(([key, publicSchools]) => {
      const [year, season] = key.split(":");
      return {
        year: Number(year),
        season: season as Season,
        publicSchools,
        totalSchools: TOURNAMENT_BY_KEY.get(key)?.schoolCount ?? null,
      };
    })
    .sort((a, b) => a.year - b.year || a.season.localeCompare(b.season));

  return {
    schools,
    years,
    resultsByKey,
    appearanceCount: schools.reduce((sum, s) => sum + s.total, 0),
    latestYear: years.length > 0 ? Math.max(...years.map((y) => y.year)) : null,
  };
});

// ------------------------------------------------------------------
// 並べ替え
//
// 取得と並べ替えを分けているのは、1ページで複数の切り口を出すため
// （同じデータを何度も取りに行かない）。
// ------------------------------------------------------------------

export type AppearanceScope = "total" | "spring" | "summer";

export const APPEARANCE_SCOPES: Record<AppearanceScope, { label: string; note: string }> = {
  total: { label: "春夏通算", note: "選抜と選手権の合計" },
  spring: { label: "春（選抜）", note: "選抜高等学校野球大会" },
  summer: { label: "夏（選手権）", note: "全国高等学校野球選手権大会" },
};

export function countOf(stats: SchoolKoshienStats, scope: AppearanceScope): number {
  if (scope === "spring") return stats.spring;
  if (scope === "summer") return stats.summer;
  return stats.total;
}

/**
 * 出場回数の多い順。同数なら最終出場が新しい順 → 校名順。
 * **同順位は同じ順位番号にする**（3位が2校いたら次は5位）。
 */
export function rankByAppearances(
  schools: SchoolKoshienStats[],
  scope: AppearanceScope,
): { rank: number; stats: SchoolKoshienStats }[] {
  const sorted = schools
    .filter((s) => countOf(s, scope) > 0)
    .sort(
      (a, b) =>
        countOf(b, scope) - countOf(a, scope) ||
        (b.lastYear ?? 0) - (a.lastYear ?? 0) ||
        a.name.localeCompare(b.name, "ja"),
    );

  return withTiedRanks(sorted, (s) => countOf(s, scope));
}

/** 通算勝利数の多い順 */
export function rankByWins(
  schools: SchoolKoshienStats[],
): { rank: number; stats: SchoolKoshienStats }[] {
  const sorted = schools
    .filter((s) => s.wins > 0)
    .sort((a, b) => b.wins - a.wins || b.total - a.total || a.name.localeCompare(b.name, "ja"));

  return withTiedRanks(sorted, (s) => s.wins);
}

/**
 * 勝率の高い順。
 *
 * **試合数の下限を設けている。** 1回だけ出て1勝0敗の学校が
 * 勝率10割で首位に来ると、ランキングとして意味をなさないため。
 */
export function rankByWinRate(
  schools: SchoolKoshienStats[],
  minGames = 10,
): { rank: number; stats: SchoolKoshienStats }[] {
  const sorted = schools
    .filter((s) => s.winRate !== null && s.wins + s.losses >= minGames)
    .sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0) || b.wins - a.wins);

  return withTiedRanks(sorted, (s) => s.winRate ?? 0);
}

/** 同じ値には同じ順位を振る（1,2,2,4…） */
function withTiedRanks<T>(
  sorted: T[],
  valueOf: (item: T) => number,
): { rank: number; stats: T }[] {
  const out: { rank: number; stats: T }[] = [];
  let lastValue: number | null = null;
  let lastRank = 0;

  sorted.forEach((item, index) => {
    const value = valueOf(item);
    const rank = value === lastValue ? lastRank : index + 1;
    out.push({ rank, stats: item });
    lastValue = value;
    lastRank = rank;
  });

  return out;
}

/**
 * 最高成績ごとの学校の一覧。良い順に並べる。
 *
 * 成績が不明な出場しかない学校は**どの段階にも入れない**。
 * 「出場したが記録が取れていない」を「初戦敗退」に混ぜないため。
 */
export function groupByBestResult(
  schools: SchoolKoshienStats[],
  scope: AppearanceScope,
): { result: string; schools: SchoolKoshienStats[] }[] {
  const bestOf = (s: SchoolKoshienStats): KoshienBest | null =>
    scope === "spring" ? s.bestSpring : scope === "summer" ? s.bestSummer : s.best;

  const groups = new Map<string, SchoolKoshienStats[]>();
  for (const school of schools) {
    const best = bestOf(school);
    if (!best) continue;
    const list = groups.get(best.result) ?? [];
    list.push(school);
    groups.set(best.result, list);
  }

  return [...groups.entries()]
    .sort((a, b) => resultRank(a[0]) - resultRank(b[0]))
    .map(([result, list]) => ({
      result,
      schools: list.sort(
        (a, b) =>
          (bestOf(b)?.year ?? 0) - (bestOf(a)?.year ?? 0) ||
          a.name.localeCompare(b.name, "ja"),
      ),
    }));
}

/** 都道府県（甲子園の大会区分49件）ごとの集計。出場延べ回数の多い順。 */
export function aggregateByPrefecture(
  schools: SchoolKoshienStats[],
): PrefectureKoshienStats[] {
  const bySlug = new Map<string, PrefectureKoshienStats>();
  for (const prefecture of PREFECTURES) {
    bySlug.set(prefecture.slug, {
      name: prefecture.name,
      slug: prefecture.slug,
      region: prefecture.region,
      schools: 0,
      appearances: 0,
      spring: 0,
      summer: 0,
      wins: 0,
      titles: 0,
      best: null,
      lastYear: null,
    });
  }

  for (const school of schools) {
    const entry = bySlug.get(school.prefecture.slug);
    if (!entry) continue;
    entry.schools += 1;
    entry.appearances += school.total;
    entry.spring += school.spring;
    entry.summer += school.summer;
    entry.wins += school.wins;
    entry.titles += school.titles;
    entry.best = betterOf(entry.best, school.best);
    entry.lastYear =
      entry.lastYear === null
        ? school.lastYear
        : Math.max(entry.lastYear, school.lastYear ?? 0);
  }

  return [...bySlug.values()].sort(
    (a, b) => b.appearances - a.appearances || b.wins - a.wins,
  );
}

/** 「その地区で最後に甲子園へ出た公立校」1校ぶん */
export type LatestPublicAppearance = {
  year: number;
  /** 学校名。「〇〇高校」の接尾辞を落とした表示用の短い名前 */
  display: string;
  /** 読み上げ・title属性に使う正式な学校名 */
  name: string;
  slug: string;
};

/** 地区ごとの「春／夏それぞれで最後に出た公立校」 */
export type LatestPublicByPrefecture = Record<
  string,
  { spring: LatestPublicAppearance | null; summer: LatestPublicAppearance | null }
>;

/**
 * 地区ごとに「春・夏それぞれで直近に甲子園へ出た公立校」を求める。
 *
 * **私立は学校マスタに無い**ので、ここでいう「直近の出場校」は
 * その地区の代表校ではなく、**直近で出場した公立校**。
 * 画面では必ずその旨が伝わる書き方をすること。
 *
 * 同じ年に同じ地区から2校以上出ている場合（記念大会の複数代表）は、
 * 出場回数の多いほうを代表として出す。並びが不定だと再生成のたびに
 * 表示が入れ替わってしまうため、最後は slug で決める。
 */
export function latestPublicByPrefecture(
  schools: SchoolKoshienStats[],
): LatestPublicByPrefecture {
  /** 採用中の1校と、比べるのに使う出場回数 */
  type Pick = { appearance: LatestPublicAppearance; appearances: number };

  const picks = new Map<string, { spring: Pick | null; summer: Pick | null }>(
    PREFECTURES.map((p) => [p.slug, { spring: null, summer: null }]),
  );

  for (const school of schools) {
    const entry = picks.get(school.prefecture.slug);
    if (!entry) continue;

    for (const season of ["spring", "summer"] as const) {
      const year = season === "spring" ? school.lastSpringYear : school.lastSummerYear;
      if (year === null) continue;

      const appearances = season === "spring" ? school.spring : school.summer;
      const current = entry[season];
      if (
        current &&
        !(
          year > current.appearance.year ||
          (year === current.appearance.year &&
            (appearances > current.appearances ||
              (appearances === current.appearances &&
                school.slug < current.appearance.slug)))
        )
      ) {
        continue;
      }

      entry[season] = {
        appearances,
        appearance: {
          year,
          display: shortSchoolName(school.name, school.slug),
          name: school.name,
          slug: school.slug,
        },
      };
    }
  }

  const result: LatestPublicByPrefecture = {};
  for (const [slug, entry] of picks) {
    result[slug] = {
      spring: entry.spring?.appearance ?? null,
      summer: entry.summer?.appearance ?? null,
    };
  }
  return result;
}

/**
 * 「公立が何校出たか」を10年ごとにまとめる。
 *
 * 1大会ずつ出すと49代表のうち十数校という細かい上下でぶれるので、
 * 年代でならして傾向を見る。**分子は取りこぼしのぶんだけ少なめに出る**
 * （統廃合・表記ゆれで照合できなかった出場が残っている。README参照）。
 */
export function aggregateByDecade(
  years: KoshienYearStat[],
): { decade: number; publicSchools: number; totalSchools: number; tournaments: number }[] {
  const byDecade = new Map<
    number,
    { decade: number; publicSchools: number; totalSchools: number; tournaments: number }
  >();

  for (const year of years) {
    // 分母が取れない大会は比率を歪めるので、両方まとめて数えない
    if (year.totalSchools === null) continue;
    const decade = Math.floor(year.year / 10) * 10;
    const entry =
      byDecade.get(decade) ??
      { decade, publicSchools: 0, totalSchools: 0, tournaments: 0 };
    entry.publicSchools += year.publicSchools;
    entry.totalSchools += year.totalSchools;
    entry.tournaments += 1;
    byDecade.set(decade, entry);
  }

  return [...byDecade.values()].sort((a, b) => a.decade - b.decade);
}

/** 直近に出場した学校。「久しく出ていない名門」の逆で、いま勢いのある学校を出す。 */
export function recentAppearances(
  schools: SchoolKoshienStats[],
  limit = 12,
): SchoolKoshienStats[] {
  return [...schools]
    .filter((s) => s.lastYear !== null)
    .sort((a, b) => (b.lastYear ?? 0) - (a.lastYear ?? 0) || b.total - a.total)
    .slice(0, limit);
}

/**
 * 出場回数が多いのに長く遠ざかっている学校。
 *
 * 「かつての強豪がいま甲子園から遠い」という、このサイトが拾いたい話。
 * 回数の下限を設けないと、1回だけ出た学校が並んで意味をなさない。
 */
export function longAbsence(
  schools: SchoolKoshienStats[],
  { minAppearances = 5, limit = 12 } = {},
): SchoolKoshienStats[] {
  return [...schools]
    .filter((s) => s.total >= minAppearances && s.lastYear !== null)
    .sort((a, b) => (a.lastYear ?? 0) - (b.lastYear ?? 0) || b.total - a.total)
    .slice(0, limit);
}
