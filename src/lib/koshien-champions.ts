/**
 * 甲子園の歴代優勝校（`/koshien/champions`）を組み立てる。
 *
 * ------------------------------------------------------------------
 * ★★ なぜ要るか（2026-09-21。運営者の指示）
 *
 *   キーワードプランナーの実測で「甲子園 歴代優勝校」が月平均6,600・8月49,500。
 *   優勝校・準優勝校・決勝のスコアは大会ページ（`finalists`）にすでにあるが、
 *   **1枚に並べた入口が無く、都道府県別の回数も出していなかった。**
 *
 * ★★ データは2つの出典を重ねている
 *   - **校名とスコアは大会記事から読んだ試合**（`koshien-games.json` → `finalists`）。
 *     大会ページ・年別ページと同じもので、**ここで別の規則を持たない。**
 *   - **都道府県は歴代優勝校の一覧**（`koshien-champions.ts`。`npm run koshien-champions`）。
 *     大会記事の代表校の表は古い大会だと「東海」「四国」のような地区名で、
 *     優勝校8大会・準優勝校6大会の県が取れなかった。一覧の記事は全大会に県が付いている。
 *   ★生成時に**202大会すべてで優勝校・準優勝校・スコアが一致する**ことを確かめてある
 *   （出典の違う2つの表の突き合わせ。1件でも違えば書き出さない）。
 *
 * ★ 都道府県で数えるときは `prefectureKey` で寄せる
 *   北北海道・南北海道 → 北海道、東東京・西東京 → 東京、記念大会の 北大阪・東神奈川 → 大阪・神奈川。
 *   **外地（満州・台湾）の代表校は準優勝にだけある**ので、優勝回数の表には出てこない。
 *
 * ★ 学校ごとの優勝回数は出さない
 *   校名が時代で変わる（中京商 → 中京 → 中京大中京）ので、記事の表記のまま数えると
 *   同じ学校が別々に数えられる。**寄せる表を手で書かない**（校名を手で書かない決めごと）。
 *   公立高校だけは学校マスタで1つに寄せられるので `/koshien/public/champions` にある。
 *
 * ★ リード文は持っているデータの並べ替えだけ（AGENTS.md「自動で出す文章」）。
 */

import {
  KOSHIEN_CHAMPIONS,
  type KoshienChampion,
} from "@/lib/data/koshien-champions";
import {
  finalists,
  listKoshienTournaments,
  type NationalTournament,
} from "@/lib/national-tournaments";
import { prefectureKey } from "@/lib/koshien-games";
import { PREFECTURES, REGIONAL_ONLY_DISTRICTS } from "@/lib/constants";
import type { Resolve } from "@/lib/koshien-public";

export type ChampionSchool = {
  /** 画面に出す校名（大会記事の表記。大会が読めていなければ一覧の表記） */
  name: string;
  /** 一覧の記事の県（「西東京」「北大阪」のように大会の区分で書かれている年がある） */
  pref: string;
  /** 学校マスタに当たった（＝公立）ときだけ */
  school: { slug: string; name: string } | null;
};

export type ChampionRow = {
  entry: KoshienChampion;
  /** 大会ページ。読めていない大会は null */
  tournament: NationalTournament | null;
  champion: ChampionSchool;
  runnerUp: ChampionSchool;
};

export type PrefectureTitles = {
  /** `prefectureKey` で寄せた県名（「北海道」「東京」） */
  name: string;
  /** 県ページの slug。無ければ null */
  slug: string | null;
  total: number;
  summer: number;
  spring: number;
  /** いちばん新しい優勝 */
  latest: ChampionRow;
};

export type KoshienChampionsData = {
  /** 新しい順（同じ年は夏 → 春） */
  rows: ChampionRow[];
  summer: ChampionRow[];
  spring: ChampionRow[];
  /** 優勝回数の多い順 → 夏の多い順 → 北から */
  byPrefecture: PrefectureTitles[];
  /** まだ優勝の無い都道府県。北から */
  noTitle: { name: string; slug: string | null }[];
  /** 公立高校が優勝した大会の数（校名索引が取れなかったときは 0） */
  publicChampionCount: number;
};

/** 47都道府県（甲子園の区分49件から分割ぶんを外し、北海道・東京を足す）。JIS順 */
const PREFECTURE_MASTER = [...REGIONAL_ONLY_DISTRICTS, ...PREFECTURES]
  .filter((p) => p.id <= 47)
  .map((p) => ({ id: p.id, name: p.name, slug: p.slug }))
  .sort((a, b) => a.id - b.id);
const SLUG_BY_NAME = new Map(PREFECTURE_MASTER.map((p) => [p.name, p.slug]));

const seasonOrder = (s: "spring" | "summer") => (s === "summer" ? 0 : 1);

export function listKoshienChampions(resolve: Resolve | null): KoshienChampionsData {
  const tournaments = new Map(listKoshienTournaments().map((t) => [`${t.year}-${t.season}`, t]));

  const rows: ChampionRow[] = KOSHIEN_CHAMPIONS.map((entry) => {
    const t = tournaments.get(`${entry.year}-${entry.season}`) ?? null;
    const f = t ? finalists(t) : null;
    const pick = (listName: string, gameName: string | undefined, pref: string): ChampionSchool => {
      const name = gameName ?? listName;
      const school =
        resolve?.(name, pref) ?? (gameName && gameName !== listName ? resolve?.(listName, pref) : null) ?? null;
      return { name, pref, school };
    };
    return {
      entry,
      tournament: t,
      champion: pick(entry.champion.name, f?.champion, entry.champion.prefecture),
      runnerUp: pick(entry.runnerUp.name, f?.runnerUp, entry.runnerUp.prefecture),
    };
  });
  rows.sort(
    (a, b) => b.entry.year - a.entry.year || seasonOrder(a.entry.season) - seasonOrder(b.entry.season),
  );

  const summer = rows.filter((r) => r.entry.season === "summer");
  const spring = rows.filter((r) => r.entry.season === "spring");

  // ---- 都道府県別 ----
  const byKey = new Map<string, PrefectureTitles>();
  for (const r of rows) {
    const name = prefectureKey(r.entry.champion.prefecture);
    const cur = byKey.get(name) ?? {
      name,
      slug: SLUG_BY_NAME.get(name) ?? null,
      total: 0,
      summer: 0,
      spring: 0,
      latest: r, // rows は新しい順なので最初に触った行がいちばん新しい
    };
    cur.total += 1;
    if (r.entry.season === "summer") cur.summer += 1;
    else cur.spring += 1;
    byKey.set(name, cur);
  }
  const jis = (name: string) => PREFECTURE_MASTER.find((p) => p.name === name)?.id ?? 99;
  const byPrefecture = [...byKey.values()].sort(
    (a, b) => b.total - a.total || b.summer - a.summer || jis(a.name) - jis(b.name),
  );
  const noTitle = PREFECTURE_MASTER.filter((p) => !byKey.has(p.name)).map((p) => ({
    name: p.name,
    slug: p.slug,
  }));

  return {
    rows,
    summer,
    spring,
    byPrefecture,
    noTitle,
    publicChampionCount: rows.filter((r) => r.champion.school).length,
  };
}

export const seasonName = (s: "spring" | "summer") => (s === "spring" ? "春の選抜" : "夏の選手権");
const seasonShort = (s: "spring" | "summer") => (s === "spring" ? "春" : "夏");

/** リード文。**持っているデータの並べ替えだけ。** */
export function buildKoshienChampionsLead(data: KoshienChampionsData): string[] {
  const paragraphs: string[] = [];
  const span = (rows: ChampionRow[]) => {
    const ys = rows.map((r) => r.entry.year);
    return `${rows.length}大会（${Math.min(...ys)}年〜${Math.max(...ys)}年）`;
  };
  const parts: string[] = [];
  if (data.summer.length) parts.push(`夏の選手権は${span(data.summer)}`);
  if (data.spring.length) parts.push(`春の選抜は${span(data.spring)}`);
  paragraphs.push(
    `春の選抜と夏の選手権の歴代優勝校を、決勝のスコア・準優勝校と一緒に並べています。${parts.join("、")}です。`,
  );

  const top = data.byPrefecture[0];
  if (top) {
    const ties = data.byPrefecture.filter((p) => p.total === top.total);
    const detail = (p: PrefectureTitles) => `${p.name}の${p.total}回（夏${p.summer}回・春${p.spring}回）`;
    paragraphs.push(
      ties.length === 1
        ? `都道府県別に数えると、優勝回数がもっとも多いのは${detail(top)}です。`
        : `都道府県別に数えると、優勝回数がもっとも多いのは${ties.map(detail).join("と")}で並んでいます。`,
    );
  }

  const latestOf = (rows: ChampionRow[]) => rows[0];
  const ls = latestOf(data.summer);
  const lp = latestOf(data.spring);
  const latest: string[] = [];
  if (ls) latest.push(`夏が${ls.entry.year}年の${ls.champion.name}（${ls.champion.pref}）`);
  if (lp) latest.push(`春が${lp.entry.year}年の${lp.champion.name}（${lp.champion.pref}）`);
  if (latest.length) paragraphs.push(`いちばん新しい優勝校は、${latest.join("、")}です。`);

  if (data.publicChampionCount > 0) {
    paragraphs.push(`このうち公立高校が優勝したのは${data.publicChampionCount}大会です。`);
  }
  paragraphs.push(
    "大会名を押すとその大会の全試合へ、オレンジの校名を押すとその学校のページへ進めます。",
  );
  return paragraphs;
}

/** 「2026年夏」のような短い呼び方 */
export function shortLabel(r: ChampionRow): string {
  return `${r.entry.year}年${seasonShort(r.entry.season)}`;
}
