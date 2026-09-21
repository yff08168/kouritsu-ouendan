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
import { KOSHIEN_GAMES } from "@/lib/koshien-games";
import { finalists, listJinguTournaments } from "@/lib/national-tournaments";
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
