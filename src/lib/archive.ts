/**
 * 年別アーカイブ（`/archive` と `/archive/<年>`）の数え上げ。
 *
 * ------------------------------------------------------------------
 * ★★**なぜ要るか**（2026-08-29）
 *
 * 大会ページは602件あるのに、**年という軸の入口がどこにも無かった。**
 * 県のページは「その県の大会」、`/koshien` は「甲子園だけ」で、
 * **「2019年に何があったか」を横に見る場所が無い。**
 *
 * 狙いは2つ:
 *   1. **年つきの検索**（`2019 高校野球 公立`）。大会ページの title には
 *      西暦を入れてあるが、**年そのものを主語にしたページが無い。**
 *   2. ★★**602件の大会ページへ内部リンクを配るハブ。**
 *      いまは県のページからしか辿れず、しかも8件で畳んである。
 *
 * ------------------------------------------------------------------
 * ★★★**新しい生成物を作らなかった理由**（大事）
 *
 * `/regional` の進捗地図は生成物（`regional-progress.ts`）を読む。
 * 同じ形にすることも考えたが、**やめた。**
 *
 *   ★**大会スラッグの連番の規則が `listTournaments`（TS）の中にある。**
 *     スクリプト（.mjs）からは import できないので、**規則をもう1つ写す**ことになる。
 *     ★引き継ぎメモに「部品側でスラッグを組み立てないこと ── 連番の規則が
 *     2か所に散る」と書いてある。**同じ轍を踏まない。**
 *   ★**年の出し方（`yearOfTournament`）も同じ**で、すでに2か所にある。3つ目を作らない。
 *
 * ★**そのかわり全県を読む。** これは sitemap がすでにやっていることで、
 * `getRegionalDistrict` は県ごとに1回しか読まない（`districtCache`）。
 * `listTournaments` も県ごとに `WeakMap` で覚えているので、
 * **26枚の年ページで41県を数え直すことにはならない。**
 *
 * ★★**さらにこのモジュール自身が「1回だけ組む」**（`indexPromise`）。
 * ★**ページごとに組み直さないこと** —— Vercel のビルドは2コア・ワーカー1つで
 * 全ページを1つのヒープで作る（`regional-results.ts` の `districtCache` の説明）。
 */

import { PREFECTURES } from "@/lib/constants";
import {
  getRegionalDistrict,
  seasonLabel,
  type RegionalSeason,
} from "@/lib/regional-results";
import { listTournaments } from "@/lib/regional-tournaments";
import {
  listKoshienTournaments,
  listJinguTournaments,
  type NationalSeason,
  type NationalTournament,
} from "@/lib/national-tournaments";

/** 年ページに出す大会1件 */
export type ArchiveTournament = {
  /** 画面に出す大会名。名前を持たない大会があるので、無ければ季節から作る */
  label: string;
  href: string;
  season: RegionalSeason;
  games: number;
};

/** 年ページに出す都道府県1件 */
export type ArchiveDistrict = {
  slug: string;
  /** 「神奈川」。甲子園の大会区分名 */
  name: string;
  games: number;
  tournaments: ArchiveTournament[];
};

export type ArchiveYear = {
  year: number;
  /** その年に収録している地方大会の試合数 */
  games: number;
  districts: ArchiveDistrict[];
};

/** `/archive` の一覧に出す1行 */
export type ArchiveYearSummary = {
  year: number;
  games: number;
  districts: number;
  tournaments: number;
  /** その年の甲子園（春・夏）。0〜2件 */
  koshien: { slug: string; name: string; season: "spring" | "summer" }[];
};

// ------------------------------------------------------------
// 索引の組み立て（プロセスで1回だけ）
// ------------------------------------------------------------

let indexPromise: Promise<Map<number, ArchiveYear>> | null = null;

async function buildIndex(): Promise<Map<number, ArchiveYear>> {
  const byYear = new Map<number, ArchiveYear>();

  for (const pref of PREFECTURES) {
    const district = await getRegionalDistrict(pref.slug);
    if (!district) continue;

    for (const entry of listTournaments(district)) {
      /*
        ★★**年の分からない大会は出さない。**
        年で並べるページなので、置き場所が決められない。
        ★**「たぶんこの年」で置かないこと**（このリポジトリが繰り返し避けてきたこと）。
      */
      if (entry.year === null) continue;

      let year = byYear.get(entry.year);
      if (!year) {
        year = { year: entry.year, games: 0, districts: [] };
        byYear.set(entry.year, year);
      }

      let d = year.districts.find((x) => x.slug === district.slug);
      if (!d) {
        d = {
          slug: district.slug,
          name: district.district,
          games: 0,
          tournaments: [],
        };
        year.districts.push(d);
      }

      d.tournaments.push({
        // ★**大会名を持たない大会がある。** そのときは年と季節で呼ぶ
        //   （大会ページの見出しと同じ作り方にそろえてある）
        label: entry.displayName ?? `${entry.year}年${seasonLabel(entry.season)}`,
        href: `/prefectures/${district.slug}/${entry.slug}`,
        season: entry.season,
        games: entry.games.length,
      });
      d.games += entry.games.length;
      year.games += entry.games.length;
    }
  }

  // 県は地区マスタの順（北から南）。大会は春→夏→秋
  const order: Record<RegionalSeason, number> = { spring: 0, summer: 1, autumn: 2 };
  const rank = new Map(PREFECTURES.map((p, i) => [p.slug, i]));
  for (const year of byYear.values()) {
    year.districts.sort(
      (a, b) => (rank.get(a.slug) ?? 0) - (rank.get(b.slug) ?? 0),
    );
    for (const d of year.districts) {
      d.tournaments.sort(
        (a, b) => order[a.season] - order[b.season] || a.label.localeCompare(b.label, "ja"),
      );
    }
  }

  return byYear;
}

function archiveIndex(): Promise<Map<number, ArchiveYear>> {
  if (!indexPromise) indexPromise = buildIndex();
  return indexPromise;
}

// ------------------------------------------------------------
// 画面から呼ぶもの
// ------------------------------------------------------------

/**
 * 春 → 夏 → 秋。**行われた順。**
 * ★**「春なら -1」で比べないこと** —— 2件のときは動くが比較関数として
 * 一貫しておらず、要素が増えると並びが決まらない。
 */
function heldOrder(season: NationalSeason): number {
  return season === "spring" ? 0 : season === "summer" ? 1 : 2;
}

/** その年の地方大会。無ければ null */
export async function getArchiveYear(year: number): Promise<ArchiveYear | null> {
  return (await archiveIndex()).get(year) ?? null;
}

/**
 * ページを作る年の一覧。**新しい順。**
 *
 * ★★**甲子園だけの年は作らない。** 甲子園は1915年から収録しているので、
 * 入れると**地方大会が1件も無い年ページが80枚以上**できる。
 * それは `school-index.ts` が避けている「同じ形の空ページが何千枚」と同じ問題で、
 * **`/koshien/<年-季節>` がすでにある**のだから作る意味も無い。
 */
export async function listArchiveYears(): Promise<ArchiveYearSummary[]> {
  const index = await archiveIndex();
  const koshien = listKoshienTournaments();

  return [...index.values()]
    .map((y) => ({
      year: y.year,
      games: y.games,
      districts: y.districts.length,
      tournaments: y.districts.reduce((n, d) => n + d.tournaments.length, 0),
      koshien: koshien
        .filter((t) => t.year === y.year && t.season !== "autumn")
        .map((t) => ({
          slug: t.slug,
          name: t.name,
          season: t.season as "spring" | "summer",
        }))
        // 春 → 夏（行われた順）
        .sort((p, q) => heldOrder(p.season) - heldOrder(q.season)),
    }))
    .sort((a, b) => b.year - a.year);
}

/** その年の甲子園（春・夏）。行われた順 */
export function koshienOfYear(year: number): NationalTournament[] {
  return listKoshienTournaments()
    .filter((t) => t.year === year)
    .sort((p, q) => heldOrder(p.season) - heldOrder(q.season));
}

/** その年の明治神宮大会（高校の部）。無ければ null */
export function jinguOfYear(year: number): NationalTournament | null {
  return listJinguTournaments().find((t) => t.year === year) ?? null;
}
