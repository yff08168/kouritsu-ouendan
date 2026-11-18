/**
 * 秋季都道府県大会のまとめ（`/regional/autumn/<年>`）が読むデータ。
 *
 * ------------------------------------------------------------------
 * ★★ 新しい出典は要らない。**地方大会の生成物（`regional/<県>.json`）の並べ替えだけ**
 *
 *   47都道府県の「その年の秋季大会」を1つずつ選び、優勝校・準優勝校・準決勝で負けた2校
 *   （＝ベスト4の残り）を取り出して、秋季大会の10地区（北海道・東北・関東・東京・北信越・
 *   東海・近畿・中国・四国・九州）ごとに並べる。**生成AIに1文字も書かせていない。**
 *
 * ★★ **優勝校は `summarizeTournament` からしか取らない**（決勝がちょうど1試合のときだけ）。
 *   ブロックごとに決勝がある予選を「優勝」と書かない。**取れなければ「開催中」か「データなし」。**
 *   ★**「第3位」とは書かない** —— 3位決定戦を持たない大会があり、準決勝で負けた2校は
 *   **「ベスト4」としか言えない。**
 *
 * ★★ **地区大会（東北大会・関東大会など）の本大会はここには入っていない。**
 *   取り込む出典がまだ決まっていない（HSB flash は都道府県大会だけ。連盟別の地区大会ページは
 *   別々の作り）。**入っていないものを「結果なし」と書かない**（ページ側の注記は「取り込み前」）。
 *   北海道と東京は、都道府県大会そのものが地区大会（北海道大会・東京都大会）。
 *
 * ★ **全県を読むが1回だけ**（`guide-data.ts` の `allDistricts` と同じ構え。`getRegionalDistrict` は県ごとに憶えている）。
 */

import { getRegionalDistrict, type RegionalDistrict, type RegionalGame, type RegionalTeam } from "@/lib/regional-results";
import { listTournaments, summarizeTournament, type TournamentEntry } from "@/lib/regional-tournaments";

/**
 * まとめページを作る年。**足すときは、その年の秋季大会が決勝まで収録できているか**
 * （`getAutumnSummary` を見て）を確かめてから。薄いページを作らない。
 */
export const AUTUMN_SUMMARY_YEARS: readonly number[] = [2026];

/** 秋季大会の10地区（選抜の一般選考の地区と同じ）。**並びは北から南** */
export const AUTUMN_AREAS: readonly { name: string; slugs: readonly string[]; note?: string }[] = [
  { name: "北海道", slugs: ["hokkaido"], note: "北海道大会（全道大会）が地区大会を兼ねる" },
  { name: "東北", slugs: ["aomori", "iwate", "miyagi", "akita", "yamagata", "fukushima"] },
  {
    name: "関東",
    slugs: ["ibaraki", "tochigi", "gunma", "saitama", "chiba", "kanagawa", "yamanashi"],
  },
  { name: "東京", slugs: ["tokyo"], note: "東京都大会が地区大会を兼ねる" },
  { name: "北信越", slugs: ["niigata", "toyama", "ishikawa", "fukui", "nagano"] },
  { name: "東海", slugs: ["gifu", "shizuoka", "aichi", "mie"] },
  { name: "近畿", slugs: ["shiga", "kyoto", "osaka", "hyogo", "nara", "wakayama"] },
  { name: "中国", slugs: ["tottori", "shimane", "okayama", "hiroshima", "yamaguchi"] },
  { name: "四国", slugs: ["tokushima", "kagawa", "ehime", "kochi"] },
  {
    name: "九州",
    slugs: ["fukuoka", "saga", "nagasaki", "kumamoto", "oita", "miyazaki", "kagoshima", "okinawa"],
  },
];

export type AutumnTeam = {
  display: string;
  /** 公立の学校ページ。私立・連合チームは null */
  slug: string | null;
  /** 出典が添えている注記（地区大会での「神奈川2位」など）。無ければ省略 */
  note?: string;
};

export type AutumnPrefecture = {
  /** 地区（都道府県）の slug */
  slug: string;
  /** 「長野」 */
  name: string;
  /** 大会ページ（`/prefectures/<slug>/<大会slug>`）。大会が無ければ null */
  tournamentSlug: string | null;
  /** 画面に出す大会名 */
  tournamentName: string | null;
  state: "done" | "playing" | "none";
  games: number;
  /** 開催中のとき、いちばん深く進んだ回戦（「準々決勝」など） */
  deepestRound: string | null;
  /** いちばん新しい試合の日付 */
  lastDate: string | null;
  champion: AutumnTeam | null;
  runnerUp: AutumnTeam | null;
  /** 準決勝で負けた学校（決勝が終わった大会だけ。引き分けは含まない） */
  semifinalists: AutumnTeam[];
};

/**
 * 地区大会（関東大会など）の結果。**ある県の出典が、県大会と同じページに載せている試合**から読む。
 * ★**取り込んだ出典がたまたま載せている地区だけ**に付く（いまは神奈川の出典が載せる関東大会）。
 */
export type AutumnAreaTournament = {
  /** 「関東大会」 */
  label: string;
  /** どの県の出典に載っていた試合か（「神奈川高校野球ステーション」） */
  sourceName: string;
  games: number;
  champion: AutumnTeam | null;
  runnerUp: AutumnTeam | null;
  semifinalists: AutumnTeam[];
  lastDate: string | null;
};

export type AutumnArea = {
  name: string;
  note?: string;
  prefectures: AutumnPrefecture[];
  /** 地区大会の結果。読めたときだけ */
  areaTournament: AutumnAreaTournament | null;
};

const ROUND_DEPTH: [RegExp, number][] = [
  [/^決勝$/, 100],
  [/^準決勝$/, 90],
  [/^準々決勝$/, 80],
];

/** 回戦の深さ。「3回戦」は数字そのまま（準々決勝より浅い） */
function roundDepth(round: string | null): number {
  if (!round) return -1;
  for (const [re, d] of ROUND_DEPTH) if (re.test(round)) return d;
  const m = round.match(/^(\d+)回戦$/);
  return m ? Number(m[1]) : -1;
}

/**
 * 地区大会の試合のしるし。**チーム名の後ろに「（群馬 1位）」「（神奈川2位）」と、
 * 都道府県大会での順位が付く**（神奈川の出典が関東大会を同じページに載せている）。
 * ★**県大会の試合には付かない**ので、これで見分ける。
 */
const AREA_LABEL = /\s*[（(]\s*([^）)]*?\d\s*位)\s*[）)]\s*$/;
const isAreaGame = (g: RegionalGame): boolean => g.teams.some((t) => AREA_LABEL.test(t.display));

const toTeam = (t: RegionalTeam): AutumnTeam => {
  const m = t.display.match(AREA_LABEL);
  return {
    display: m ? t.display.replace(AREA_LABEL, "").trim() : t.display,
    // ★ラベル付きは地区大会のチーム。学校マスタへの結び付きは当てにしない（県名の注記が付いている）
    slug: !m && t.slug && !t.combined ? t.slug : null,
    ...(m ? { note: m[1].replace(/\s+/g, "") } : {}),
  };
};

type Outcome = {
  champion: RegionalTeam | null;
  runnerUp: RegionalTeam | null;
  semifinalists: RegionalTeam[];
};

/** 決勝がちょうど1試合のときだけ優勝校を出す。準決勝がちょうど2試合のときだけベスト4を出す */
function outcomeOf(games: RegionalGame[]): Outcome {
  const finals = games.filter((g) => g.round === "決勝");
  const final = finals.length === 1 ? finals[0] : null;
  const champion = final?.teams.find((t) => t.won) ?? null;
  const runnerUp = champion ? (final?.teams.find((t) => t !== champion) ?? null) : null;
  const semis = games
    .filter((g) => g.round === "準決勝")
    .map((g) => (g.teams.some((t) => t.won) ? g.teams.find((t) => !t.won) : undefined))
    .filter((t): t is RegionalTeam => Boolean(t));
  return { champion, runnerUp, semifinalists: semis.length === 2 && champion ? semis : [] };
}

/** その年の秋季大会を1つ選ぶ。**決勝が読めた大会を先に、同じなら試合数の多いほう** */
function pickTournament(district: RegionalDistrict, year: number): TournamentEntry | null {
  const candidates = listTournaments(district).filter(
    (t) => t.season === "autumn" && t.year === year,
  );
  if (candidates.length === 0) return null;
  const scored = candidates.map((t) => ({
    t,
    done: summarizeTournament(t).champion ? 1 : 0,
  }));
  scored.sort((a, b) => b.done - a.done || b.t.games.length - a.t.games.length);
  return scored[0].t;
}

function summarizePrefecture(district: RegionalDistrict, year: number): AutumnPrefecture {
  const base = {
    slug: district.slug,
    name: district.district,
    tournamentSlug: null,
    tournamentName: null,
    state: "none" as const,
    games: 0,
    deepestRound: null,
    lastDate: null,
    champion: null,
    runnerUp: null,
    semifinalists: [] as AutumnTeam[],
  };
  const picked = pickTournament(district, year);
  if (!picked) return base;
  // ★**地区大会の試合（「（群馬 1位）」付き）を県大会から外してから数える**
  //   （神奈川の出典は関東大会を県大会と同じ大会名で載せていて、決勝が2試合になり優勝校が決まらなかった）
  const entry: TournamentEntry = { ...picked, games: picked.games.filter((g) => !isAreaGame(g)) };

  const sum = summarizeTournament(entry);
  const deepest = entry.games.reduce<RegionalGame | null>(
    (best, g) => (roundDepth(g.round) > roundDepth(best?.round ?? null) ? g : best),
    null,
  );

  const common = {
    ...base,
    tournamentSlug: entry.slug,
    tournamentName: entry.displayName,
    games: entry.games.length,
    lastDate: entry.lastDate,
  };

  if (sum.champion) {
    const o = outcomeOf(entry.games);
    return {
      ...common,
      state: "done",
      champion: o.champion ? toTeam(o.champion) : { display: sum.champion, slug: null },
      runnerUp: o.runnerUp
        ? toTeam(o.runnerUp)
        : sum.runnerUp
          ? { display: sum.runnerUp, slug: null }
          : null,
      // ★**準決勝がちょうど2試合のときだけ**（ブロックごとに準決勝がある大会・欠けがある大会で嘘を出さない）
      semifinalists: o.semifinalists.map(toTeam),
    };
  }

  return {
    ...common,
    state: "playing",
    deepestRound: deepest?.round ?? null,
  };
}

/** 地区大会の名前（「関東大会」）。**地区名から付ける**（東京・北海道は都道府県大会が地区大会なので付かない） */
const areaTournamentLabel = (area: string): string => `${area}大会`;

function areaTournamentOf(
  area: string,
  found: { games: RegionalGame[]; sourceName: string }[],
): AutumnAreaTournament | null {
  // 2つ以上の県の出典に載っていたら、どれを採るか決められない（二重に数えない）→ 載せない
  if (found.length !== 1) return null;
  const { games, sourceName } = found[0];
  const o = outcomeOf(games);
  const dates = games.map((g) => g.date).filter((d): d is string => Boolean(d)).sort();
  return {
    label: areaTournamentLabel(area),
    sourceName,
    games: games.length,
    champion: o.champion ? toTeam(o.champion) : null,
    runnerUp: o.runnerUp ? toTeam(o.runnerUp) : null,
    semifinalists: o.semifinalists.map(toTeam),
    lastDate: dates.at(-1) ?? null,
  };
}

const cache = new Map<number, Promise<AutumnArea[]>>();

/** その年の秋季都道府県大会のまとめ。**1回だけ組む**（中身は生成物で、デプロイまで変わらない） */
export function getAutumnSummary(year: number): Promise<AutumnArea[]> {
  let hit = cache.get(year);
  if (!hit) {
    hit = (async () => {
      const areas: AutumnArea[] = [];
      for (const area of AUTUMN_AREAS) {
        const prefectures: AutumnPrefecture[] = [];
        const areaGames: { games: RegionalGame[]; sourceName: string }[] = [];
        for (const slug of area.slugs) {
          const district = await getRegionalDistrict(slug);
          if (!district) continue;
          prefectures.push(summarizePrefecture(district, year));
          const picked = pickTournament(district, year);
          const labelled = picked?.games.filter(isAreaGame) ?? [];
          if (labelled.length > 0) areaGames.push({ games: labelled, sourceName: district.sourceName });
        }
        areas.push({
          name: area.name,
          note: area.note,
          prefectures,
          areaTournament: areaTournamentOf(area.name, areaGames),
        });
      }
      return areas;
    })();
    cache.set(year, hit);
  }
  return hit;
}
