/**
 * 明治神宮野球大会（高校の部）の歴代優勝校（`/jingu/champions`）を組み立てる。
 *
 * ------------------------------------------------------------------
 * ★★ なぜ要るか（2026-11-20。運営者の「神宮大会の歴代の結果ページを新たに作成する」）
 *
 *   `/jingu/<年>` は**全試合を持っている24大会（1999〜2025年）**しか作れず、
 *   **高校の部が始まった第4回（1973年）からの優勝校一覧と、地区別・都道府県別の優勝回数が無かった。**
 *   甲子園側には `/koshien/champions` があるので、その神宮版を作る。
 *
 * ★★ データは1つの表（ja.wikipedia「明治神宮野球大会」の歴代結果）だけ
 *   `src/lib/data/jingu-champions.ts`（`npm run jingu-champions`）。
 *   **校名・県・スコアはすべてその表のもの**で、大会ごとの試合データ（`jingu-games.json`）は混ぜない
 *   （24大会ぶんしか無く、**校名の書き方も違う** —— 主催者の表は `九州国際大高`、記事は `九州国際大付`。
 *   混ぜると同じ表の中で表記が揺れる）。**生成時に24大会で一致を確かめてある**（検算②）。
 *   ★甲子園の歴代優勝校（`koshien-champions.ts`）は大会記事のほうを画面に出して一覧を補いに使っているが、
 *   **神宮は逆**（一覧が全大会を持ち、大会記事は24大会しかない）。
 *
 * ★★ 公立の判定は **`getSchoolNameIndex("koshien")`** で引くこと（2026-11-20 に両方を実測した）
 *   記事の校名は**略称**（高松商・福井商・四日市工）。学校マスタは正式名（高松商業高校）なので、
 *   **「商業→商」「工業→工」を寄せる甲子園の規則でないと当たらない。**
 *   神宮の規則（`normalizeJinguName`）では **51大会の優勝・準優勝のうち、公立15校ぶんが9しか引けず**、
 *   福井商・徳島商・高知商・四日市工・高松商が落ちた（`/jingu/<年>` は主催者の表記が `高松商業高` のように
 *   正式名に近いので神宮の規則でも当たる）。
 *   ★**県を必ず渡す**（`愛知` は県なしだと滋賀の愛知高校に当たる）。
 *
 * ★ 学校ごとの優勝回数は出さない
 *   校名が時代で変わる（1981年の `明徳` ＝ 2017年の `明徳義塾`）ので、記事の表記のまま数えると
 *   同じ学校が別々に数えられる。**寄せる表を手で書かない**（校名を手で書かない決めごと）。
 *
 * ★ 地区は出典の表記のまま
 *   `北海道` `東北` `関東` `東京` `北信越` `東海` `近畿` `中国` `四国` `九州`（古い年の準優勝校だけ `中部`）。
 *   **東京と北海道は地区の欄が無く、地区も県も同じ語**で入っている。
 *
 * ★ リード文は持っているデータの並べ替えだけ（AGENTS.md「自動で出す文章」）
 *   0を並べない／「出場していない」と書かない／敗戦数・選手の名前を書かない。
 */

import {
  JINGU_CHAMPIONS,
  JINGU_CHAMPIONS_CANCELLED,
  type JinguChampion,
} from "@/lib/data/jingu-champions";
import { listJinguTournaments, type NationalTournament } from "@/lib/national-tournaments";
import { prefectureKey } from "@/lib/koshien-games";
import { PREFECTURE_MASTER } from "@/lib/koshien-champions";
import type { Resolve } from "@/lib/koshien-public";

export type ChampionSchool = {
  /** 画面に出す校名（記事の表記） */
  name: string;
  /** 出典の地区。東京・北海道は都道府県と同じ語 */
  region: string;
  prefecture: string;
  /**
   * 学校マスタに当たった（＝公立）ときだけ。
   * ★**`slug` が null なら学校ページが無い公立校**（閉校して DB に承継先が無い）。
   * 公立としては数えるが、**リンクは `slug` があるときだけ作ること。**
   */
  school: { slug: string | null; name: string } | null;
};

export type HeldRow = {
  kind: "held";
  entry: JinguChampion;
  /** 全試合のページ（`/jingu/<年>`）。**全試合を持っている年だけ**。無ければ null */
  tournament: NationalTournament | null;
  champion: ChampionSchool;
  runnerUp: ChampionSchool;
};

export type CancelledRow = { kind: "cancelled"; no: number; year: number };

export type TimelineRow = HeldRow | CancelledRow;

export type RegionTitles = {
  /** 出典の地区名 */
  region: string;
  total: number;
  /** 地区の中の県ごとの優勝回数。多い順 → 北から。**0回の県は入れない** */
  prefectures: { name: string; count: number }[];
  latest: HeldRow;
};

export type PrefectureTitles = {
  /** `prefectureKey` で寄せた県名（「北海道」「東京」） */
  name: string;
  /** 県ページの slug。無ければ null */
  slug: string | null;
  total: number;
  /** 優勝した年。新しい順 */
  years: number[];
  /** いちばん新しい優勝 */
  latest: HeldRow;
};

export type JinguChampionsData = {
  /** 新しい順。**中止の年も入る**（表の並びが飛ばないように） */
  timeline: TimelineRow[];
  /** 開催した大会だけ。新しい順 */
  rows: HeldRow[];
  cancelled: { no: number; year: number }[];
  /** 優勝回数の多い順 → 出典の地区の並び */
  byRegion: RegionTitles[];
  /** 優勝がまだ無い地区（いまの地区名のうち）。出典の並び */
  noTitleRegions: string[];
  /** 優勝回数の多い順 → 北から */
  byPrefecture: PrefectureTitles[];
  /** まだ優勝の無い都道府県。北から */
  noTitle: { name: string; slug: string | null }[];
  /** 公立高校が優勝または準優勝した大会（校名索引が取れなかったときは空） */
  publicRows: HeldRow[];
  publicChampionCount: number;
  publicRunnerUpCount: number;
};

/**
 * いまの地区名（出典の表記）。**表示の並び**と「優勝がまだ無い地区」に使う。
 * ★古い年にだけ出てくる `中部` は入れない（現在の地区ではない）。
 */
const REGION_ORDER = ["北海道", "東北", "関東", "東京", "北信越", "東海", "近畿", "中国", "四国", "九州"];
const regionRank = (r: string) => {
  const i = REGION_ORDER.indexOf(r);
  return i < 0 ? REGION_ORDER.length : i;
};

const yearOf = (r: TimelineRow) => (r.kind === "held" ? r.entry.year : r.year);

const SLUG_BY_NAME = new Map(PREFECTURE_MASTER.map((p) => [p.name, p.slug]));
const jis =(name: string) => PREFECTURE_MASTER.find((p) => p.name === name)?.id ?? 99;

export function listJinguChampions(resolve: Resolve | null): JinguChampionsData {
  const tournaments = new Map(listJinguTournaments().map((t) => [t.year, t]));

  const school = (t: { name: string; region: string; prefecture: string }): ChampionSchool => ({
    name: t.name,
    region: t.region,
    prefecture: t.prefecture,
    // ★**県を必ず渡す**（県なしだと同名の別校に当たる）。当たらなければ私立・旧制の学校で null
    school: resolve?.(t.name, t.prefecture) ?? null,
  });

  const rows: HeldRow[] = JINGU_CHAMPIONS.map((entry) => ({
    kind: "held" as const,
    entry,
    tournament: tournaments.get(entry.year) ?? null,
    champion: school(entry.champion),
    runnerUp: school(entry.runnerUp),
  })).sort((a, b) => b.entry.year - a.entry.year);

  const cancelled = [...JINGU_CHAMPIONS_CANCELLED].sort((a, b) => b.year - a.year);
  const timeline: TimelineRow[] = [
    ...rows,
    ...cancelled.map((c) => ({ kind: "cancelled" as const, no: c.no, year: c.year })),
  ].sort((a, b) => yearOf(b) - yearOf(a));

  // ---- 地区別 ----
  const byRegionMap = new Map<string, RegionTitles>();
  const regionPrefs = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const region = r.entry.champion.region;
    const cur = byRegionMap.get(region) ?? {
      region,
      total: 0,
      prefectures: [],
      latest: r, // rows は新しい順なので最初に触った行がいちばん新しい
    };
    cur.total += 1;
    byRegionMap.set(region, cur);
    const prefs = regionPrefs.get(region) ?? new Map<string, number>();
    const pref = prefectureKey(r.entry.champion.prefecture);
    prefs.set(pref, (prefs.get(pref) ?? 0) + 1);
    regionPrefs.set(region, prefs);
  }
  for (const [region, prefs] of regionPrefs) {
    byRegionMap.get(region)!.prefectures = [...prefs]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || jis(a.name) - jis(b.name));
  }
  const byRegion = [...byRegionMap.values()].sort(
    (a, b) => b.total - a.total || regionRank(a.region) - regionRank(b.region),
  );
  const noTitleRegions = REGION_ORDER.filter((r) => !byRegionMap.has(r));

  // ---- 都道府県別 ----
  const byKey = new Map<string, PrefectureTitles>();
  for (const r of rows) {
    const name = prefectureKey(r.entry.champion.prefecture);
    const cur = byKey.get(name) ?? {
      name,
      slug: SLUG_BY_NAME.get(name) ?? null,
      total: 0,
      years: [],
      latest: r,
    };
    cur.total += 1;
    cur.years.push(r.entry.year);
    byKey.set(name, cur);
  }
  const byPrefecture = [...byKey.values()].sort(
    (a, b) => b.total - a.total || b.latest.entry.year - a.latest.entry.year || jis(a.name) - jis(b.name),
  );
  const noTitle = PREFECTURE_MASTER.filter((p) => !byKey.has(p.name)).map((p) => ({
    name: p.name,
    slug: p.slug,
  }));

  const publicRows = rows.filter((r) => r.champion.school || r.runnerUp.school);
  return {
    timeline,
    rows,
    cancelled,
    byRegion,
    noTitleRegions,
    byPrefecture,
    noTitle,
    publicRows,
    publicChampionCount: rows.filter((r) => r.champion.school).length,
    publicRunnerUpCount: rows.filter((r) => r.runnerUp.school).length,
  };
}

/** 同じ回数のものを1組にして、回数の多い順に並べる（同数は並べて書く） */
function groupsByTotal<T extends { total: number }>(items: T[]): T[][] {
  const out: T[][] = [];
  for (const item of items) {
    const last = out.at(-1);
    if (last && last[0].total === item.total) last.push(item);
    else out.push([item]);
  }
  return out;
}

/** 「A」「A・B」。**回数を付けて並べる文のための名前の連結** */
const joinNames = (names: string[]) => names.join("・");

/** リード文。**持っているデータの並べ替えだけ。** */
export function buildJinguChampionsLead(data: JinguChampionsData): string[] {
  const paragraphs: string[] = [];
  const oldest = data.rows.at(-1);
  const newest = data.rows[0];
  if (!oldest || !newest) return paragraphs;

  const cancelledText = data.cancelled.length
    ? `${data.cancelled
        .map((c) => c.year)
        .sort((a, b) => a - b)
        .map((y) => `${y}年`)
        .join("と")}は開催が中止されました。`
    : "";
  paragraphs.push(
    `明治神宮野球大会（高校の部）の歴代の優勝校を、決勝のスコア・準優勝校と一緒に並べています。` +
      `高校の部は第${oldest.entry.no}回大会（${oldest.entry.year}年）からで、` +
      `${data.rows.length}大会（${oldest.entry.year}年〜${newest.entry.year}年）を収録しています。${cancelledText}`,
  );

  // 都道府県別（回数の多い2段まで。同数は並べて書く）
  const prefGroups = groupsByTotal(data.byPrefecture);
  if (prefGroups[0]) {
    const [first, second] = prefGroups;
    const tops = `${joinNames(first.map((p) => p.name))}の${first[0].total}回`;
    paragraphs.push(
      second
        ? `都道府県別に数えると、優勝回数がもっとも多いのは${tops}で、${joinNames(second.map((p) => p.name))}の${second[0].total}回が続きます。`
        : `都道府県別に数えると、優勝回数がもっとも多いのは${tops}です。`,
    );
  }
  // 地区別。★**出典の表記のまま**（東京・北海道は地区として独立している）
  const regionGroups = groupsByTotal(data.byRegion);
  if (regionGroups[0]) {
    const [first, second] = regionGroups;
    const tops = `${joinNames(first.map((r) => r.region))}の${first[0].total}回`;
    paragraphs.push(
      second
        ? `地区別では${tops}がもっとも多く、${joinNames(second.map((r) => r.region))}の${second[0].total}回が続きます。`
        : `地区別では${tops}がもっとも多くなっています。`,
    );
  }

  paragraphs.push(
    `いちばん新しい優勝校は、${newest.entry.year}年の${newest.champion.name}（${newest.champion.prefecture}）です。`,
  );

  // 公立。**0のときはその文ごと出さない**
  const n = data.publicChampionCount;
  const m = data.publicRunnerUpCount;
  if (n > 0 || m > 0) {
    const champions = data.rows.filter((r) => r.champion.school);
    const names =
      n > 0 && n <= 6
        ? `（${[...champions].reverse().map((r) => `${r.entry.year}年の${r.champion.name}`).join("、")}）`
        : "";
    const parts: string[] = [];
    if (n > 0) parts.push(`優勝が${n}大会${names}`);
    if (m > 0) parts.push(`準優勝が${m}大会`);
    paragraphs.push(`公立高校の決勝進出は、${parts.join("、")}です。`);
  }

  paragraphs.push(
    "全試合を収録している大会は、年を押すとその大会のページへ進めます。オレンジの校名は公立高校で、押すとその学校のページへ進めます。",
  );
  return paragraphs;
}
