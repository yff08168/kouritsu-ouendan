/**
 * 解説ページ（`/guide/<slug>`）の「データで見る」の部分。**描画時に生成物から数える。**
 *
 * ★★**本文に数字を書き写さない**（AGENTS.md「リード文と記録ページは生成物にしない。描画時に組む」）。
 *   各回の得点は1日1回増え、甲子園の記録も大会ごとに増えるので、ここで数えれば
 *   データが増えた瞬間に文も変わる。
 * ★**数えるだけ。推測しない。** 9回より前に終わった試合を「コールド」と呼ぶのは、
 *   勝敗が決まった試合が9回より前に終わる理由が規則上コールドゲームしかないため。
 *   引き分け（勝敗の無い試合）は数えない。
 */

import { REGIONAL_INNINGS } from "@/lib/data/regional-innings";
import { PREFECTURES, REGIONAL_ONLY_DISTRICTS } from "@/lib/constants";
import { gameKeyOfSeed } from "@/lib/regional-results";
import { KOSHIEN_GAMES, prefectureKey } from "@/lib/koshien-games";
import { finalists, listJinguTournaments, listKoshienTournaments } from "@/lib/national-tournaments";
import { TWENTY_FIRST_CENTURY_BERTHS } from "@/lib/data/twenty-first-century";
import { KOKUTAI_CHAMPIONS, KOKUTAI_SOURCE, type KokutaiChampion } from "@/lib/data/kokutai-champions";

const DISTRICT_NAME = new Map<string, string>(
  [...PREFECTURES, ...REGIONAL_ONLY_DISTRICTS].map((p) => [p.slug, p.name]),
);

export type InningsExample = {
  slug: string;
  district: string;
  date: string | null;
  round: string | null;
  teams: { display: string; score: number }[];
  innings: number;
  href: string;
};

export type InningsStats = {
  /** 各回の得点を持っている試合 */
  total: number;
  /** 9回より前に終わった試合（勝敗あり） */
  short: number;
  /** 10回以上まで行った試合 */
  long: number;
  from: string | null;
  to: string | null;
  byDistrict: { slug: string; district: string; total: number; short: number; long: number }[];
  shortExamples: InningsExample[];
  longExamples: InningsExample[];
};

/** `gameSeed` の文字列（日付|回戦|校名:得点|校名:得点）を分解する */
function parseSeed(seed: string) {
  const [date, round, ...rest] = seed.split("|");
  const teams = rest.map((part) => {
    const at = part.lastIndexOf(":");
    return { display: part.slice(0, at), score: Number(part.slice(at + 1)) };
  });
  return { date: date || null, round: round || null, teams };
}

let inningsCache: InningsStats | null = null;

export function inningsStats(): InningsStats {
  if (inningsCache) return inningsCache;

  const byDistrict: InningsStats["byDistrict"] = [];
  const shortAll: InningsExample[] = [];
  const longAll: InningsExample[] = [];
  const dates: string[] = [];

  for (const [slug, games] of Object.entries(REGIONAL_INNINGS)) {
    const district = DISTRICT_NAME.get(slug) ?? slug;
    let total = 0;
    let short = 0;
    let long = 0;
    for (const [seed, v] of Object.entries(games)) {
      const innings = Math.max(...v.innings.map((a) => a.length));
      if (!innings) continue;
      const parsed = parseSeed(seed);
      if (parsed.teams.length !== 2) continue;
      total += 1;
      if (parsed.date) dates.push(parsed.date);
      // ★引き分けは「終わっていない」ので数えない
      const decided = parsed.teams[0].score !== parsed.teams[1].score;
      const example: InningsExample = {
        slug,
        district,
        date: parsed.date,
        round: parsed.round,
        teams: parsed.teams,
        innings,
        href: `/prefectures/${slug}/game/${gameKeyOfSeed(seed)}`,
      };
      if (innings < 9 && decided) {
        short += 1;
        shortAll.push(example);
      } else if (innings > 9) {
        long += 1;
        longAll.push(example);
      }
    }
    if (total > 0) byDistrict.push({ slug, district, total, short, long });
  }

  byDistrict.sort((a, b) => b.short - a.short || b.total - a.total || a.district.localeCompare(b.district, "ja"));
  const newest = (a: InningsExample, b: InningsExample) => (b.date ?? "").localeCompare(a.date ?? "");
  dates.sort();

  inningsCache = {
    total: byDistrict.reduce((n, d) => n + d.total, 0),
    short: byDistrict.reduce((n, d) => n + d.short, 0),
    long: byDistrict.reduce((n, d) => n + d.long, 0),
    from: dates[0] ?? null,
    to: dates.at(-1) ?? null,
    byDistrict,
    shortExamples: shortAll.sort(newest).slice(0, 5),
    longExamples: longAll.sort(newest).slice(0, 5),
  };
  return inningsCache;
}

export type KoshienExtraStats = {
  games: number;
  extra: number;
  /** 2018年以降（タイブレーク導入後）の延長 */
  extraSince2018: number;
  /** 記事が「TB」と書いている延長 */
  tieBreak: number;
  draws: number;
  from: number;
  to: number;
};

let koshienCache: KoshienExtraStats | null = null;

export function koshienExtraStats(): KoshienExtraStats {
  if (koshienCache) return koshienCache;
  let extra = 0;
  let extraSince2018 = 0;
  let tieBreak = 0;
  let draws = 0;
  let from = Infinity;
  let to = -Infinity;
  for (const g of KOSHIEN_GAMES) {
    from = Math.min(from, g.year);
    to = Math.max(to, g.year);
    const note = g.note ?? "";
    if (note.includes("延長")) {
      extra += 1;
      if (g.year >= 2018) extraSince2018 += 1;
      if (/TB|タイブレーク/.test(note)) tieBreak += 1;
    }
    if (note.includes("引き分け")) draws += 1;
  }
  koshienCache = { games: KOSHIEN_GAMES.length, extra, extraSince2018, tieBreak, draws, from, to };
  return koshienCache;
}

/** 国スポ（硬式）の歴代優勝校。**新しい順**。出典表示も一緒に返す */
export function kokutaiChampions(): { rows: KokutaiChampion[]; source: typeof KOKUTAI_SOURCE } {
  return { rows: [...KOKUTAI_CHAMPIONS].sort((a, b) => b.year - a.year), source: KOKUTAI_SOURCE };
}

/**
 * 抽選会の解説用。**いちばん新しい夏と春の大会の形**（出場校数・1回戦の試合数・2回戦から登場する校数）。
 * ★回戦名の無い大会（古い記事）では数えられないので null。
 */
export type DrawShape = {
  year: number;
  season: "spring" | "summer";
  no: number | null;
  slug: string;
  schools: number;
  firstRoundGames: number;
  fromSecondRound: number;
};

export function koshienDrawShape(): { summer: DrawShape | null; spring: DrawShape | null } {
  const shape = (season: "spring" | "summer"): DrawShape | null => {
    const t = listKoshienTournaments().find((x) => x.season === season);
    if (!t) return null;
    const teams = new Set<string>();
    const inFirst = new Set<string>();
    let firstRoundGames = 0;
    for (const g of t.games) {
      for (const x of g.teams) teams.add(x.display);
      if (g.round === "1回戦") {
        firstRoundGames += 1;
        for (const x of g.teams) inFirst.add(x.display);
      }
    }
    if (firstRoundGames === 0) return null;
    return {
      year: t.year,
      season,
      no: t.no,
      slug: t.slug,
      schools: teams.size,
      firstRoundGames,
      fromSecondRound: teams.size - inFirst.size,
    };
  };
  return { summer: shape("summer"), spring: shape("spring") };
}

/**
 * 同じ都道府県の学校どうしが甲子園で当たった試合。**両校に県が付いている試合だけ**（古い大会は付かない）。
 * 北北海道・南北海道、東東京・西東京、記念大会の北大阪・南大阪などは `prefectureKey` で同じ都道府県に寄せる。
 * 新しい順。
 */
export type SamePrefGame = {
  year: number;
  season: "spring" | "summer";
  slug: string;
  round: string | null;
  date: string | null;
  pref: string;
  winner: { name: string; score: number; pref: string } | null;
  loser: { name: string; score: number; pref: string } | null;
  /** 引き分けなど勝敗の無い試合はそのまま2校 */
  teams: { name: string; score: number; pref: string }[];
};

let samePrefCache: SamePrefGame[] | null = null;

export function samePrefectureGames(): SamePrefGame[] {
  if (samePrefCache) return samePrefCache;
  const out: SamePrefGame[] = [];
  for (const g of KOSHIEN_GAMES) {
    const [a, b] = g.teams;
    if (!a?.pref || !b?.pref) continue;
    if (prefectureKey(a.pref) !== prefectureKey(b.pref)) continue;
    const teams = g.teams.map((x) => ({ name: x.display, score: x.score, pref: x.pref ?? "" }));
    const w = g.teams.find((x) => x.won);
    const l = g.teams.find((x) => !x.won);
    out.push({
      year: g.year,
      season: g.season,
      slug: `${g.year}-${g.season}`,
      round: g.round,
      date: g.date,
      pref: prefectureKey(a.pref),
      winner: w && l ? { name: w.display, score: w.score, pref: w.pref ?? "" } : null,
      loser: w && l ? { name: l.display, score: l.score, pref: l.pref ?? "" } : null,
      teams,
    });
  }
  out.sort(
    (x, y) =>
      y.year - x.year ||
      (x.season === "summer" ? -1 : 1) - (y.season === "summer" ? -1 : 1) ||
      (y.date ?? "").localeCompare(x.date ?? ""),
  );
  samePrefCache = out;
  return out;
}

/**
 * 日程の解説用。**大会ごとの最初の試合の日と最後の試合の日**（収録している試合の日付から）。
 * ★試合の日付を持たない古い大会は出さない。決勝が引き分け再試合の年は再試合の日が「最後の日」。
 * 新しい順。
 */
export type KoshienDateRow = {
  year: number;
  season: "spring" | "summer";
  no: number | null;
  slug: string;
  first: string;
  last: string;
  /** 最初の日から最後の日までの日数（両端を含む） */
  days: number;
  games: number;
};

export function koshienDates(limit = 15): { summer: KoshienDateRow[]; spring: KoshienDateRow[] } {
  const rows = listKoshienTournaments()
    .filter((t) => t.firstDate && t.lastDate)
    .map((t) => {
      const first = t.firstDate as string;
      const last = t.lastDate as string;
      const days = Math.round((Date.parse(last) - Date.parse(first)) / 86400000) + 1;
      return { year: t.year, season: t.season as "spring" | "summer", no: t.no, slug: t.slug, first, last, days, games: t.games.length };
    });
  return {
    summer: rows.filter((r) => r.season === "summer").slice(0, limit),
    spring: rows.filter((r) => r.season === "spring").slice(0, limit),
  };
}

export function jinguLatest(): { year: number; champion: string; runnerUp: string; slug: string } | null {
  const t = listJinguTournaments()[0];
  if (!t) return null;
  const f = finalists(t);
  if (!f) return null;
  return { year: t.year, champion: f.champion, runnerUp: f.runnerUp, slug: t.slug };
}

export function twentyFirstLatest(): {
  year: number;
  schools: { name: string; prefecture: string | null; slug: string | null }[];
} | null {
  const years = TWENTY_FIRST_CENTURY_BERTHS.map((b) => b.year);
  if (years.length === 0) return null;
  const year = Math.max(...years);
  return {
    year,
    schools: TWENTY_FIRST_CENTURY_BERTHS.filter((b) => b.year === year).map((b) => ({
      name: b.displayName,
      prefecture: b.prefectureText,
      slug: b.schoolSlug,
    })),
  };
}
