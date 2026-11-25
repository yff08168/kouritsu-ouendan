/**
 * 公立高校（国立・高専を含む私立以外）の出身で、プロ野球（NPB）に入った選手。
 *
 * 生成物は `src/lib/data/pro-alumni/`（`scripts/build-pro-alumni.mjs`）。
 * **ここには組み立てと表示用の整形だけを置く。事実は何も書かない。**
 *
 * ------------------------------------------------------------------
 * ★★ 「選手個人のページ・個人成績は作らない」方針との関係（2026-11-25。運営者の指示）
 *
 *   プロに入った選手は成人で、進路は公表された事実。**個人のページは作らず**、
 *   一覧ページ（`/pro-players`）と各学校ページの卒業生欄にだけ載せる。
 *   ★**載せるのは 氏名・進路（高校→大学/社会人→球団）・入団年・ドラフト順位だけ。**
 *     **成績・写真・生年月日は載せない**（取り込みの時点で保存もしていない）。
 *   ★**ドラフトで指名された高校3年生は、指名の時点から載せる**（運営者の判断）。
 *     未成年の個人名が載るので、**事実（指名された球団と順位）以外は書かない。**
 *
 * ★★ 数え方を「公立の選手の数」で終わらせない
 *   対象は **Wikipedia に記事のある選手だけ**で、**プロ野球選手の全員ではない**。
 *   「公立出身の選手は◯人」と言い切らず、**「記事のある選手のうち◯人」と書く**。
 *   ★「いない」と書かない（DBに無いことは世の中に無いことではない）。**あるときだけ書く。**
 *
 * ★ 地区は学校マスタの `prefecture`（甲子園の区分49）。**県ごとのファイルを動的 import で読む**
 *   （全国ぶんを1か所に入れない。`regional/loaders.ts` と同じ作り）。
 */
import { PRO_ALUMNI_INDEX, PRO_ALUMNI_LOADERS, PRO_DRAFT } from "@/lib/data/pro-alumni/loaders";
import { PREFECTURES, REGIONAL_ONLY_DISTRICTS, REGIONS, districtOrder, type Region } from "@/lib/constants";

export interface ProPlayer {
  /** 氏名（記事名から「 (野球)」などの曖昧さ回避を落としたもの） */
  name: string;
  /**
   * 当時の校名。**改称・移管・統合した学校だけ**（大阪市立桜宮 → 大阪府立桜宮 など）。
   * 学校ページには現在の学校へ結び、この校名を添える（甲子園出場歴の note と同じ扱い）。
   */
  formerName?: string;
  /**
   * 高校より前（中学校・少年野球・リトル・シニアなど）。**Wikipedia の経歴欄に書かれている選手だけ**
   * （書かれているのは 0.2%）。**無い選手に「不明」とは書かない。**
   */
  early?: { label: string; kind: "junior" | "youth" }[];
  /** 高校のあと、最初のプロ球団までに通った大学・社会人など（高校から直接ならカラ） */
  route: { label: string; kind: "university" | "other" }[];
  /** NPB の球団を在籍した順に。年は経歴欄の表記（「2019–」「2011–2014, 2018–2020」） */
  teams: { team: string; years: string | null; /** NPB でない球団（独立リーグ・海外）は false */ npb?: false }[];
  /** ドラフトで指名された年と順位。ドラフトを経ていなければ null */
  draft: { year: number; rank: string | null } | null;
  entryYear: number | null;
}

export interface ProSchool {
  /** 学校マスタの slug。閉校して学校ページが無い公立校は null */
  slug: string | null;
  officialName: string;
  players: ProPlayer[];
}

export interface ProPrefFile {
  pref: string;
  schools: ProSchool[];
}

export interface ProAlumniIndex {
  generatedAt: string;
  firstYear: number;
  total: number;
  prefs: Record<string, { schools: number; players: number }>;
}

/** ドラフトで指名された高校生（入団前）。指名の時点から載せる（運営者の判断） */
export interface ProDraftPick {
  team: string;
  /** 「1位」「育成2位」。出典の表記 */
  rank: string;
  /** 指名の種別（支配下／育成） */
  kind: "regular" | "development";
  name: string;
  school: { slug: string; officialName: string; prefSlug: string };
}

export interface ProDraft {
  /** 指名のあった年。ドラフトの記事が無ければ null */
  year: number | null;
  picks: ProDraftPick[];
}

/** いちばん新しいドラフトで指名された公立高校の高校生 */
export function getProDraft(): ProDraft {
  return PRO_DRAFT as ProDraft;
}

/** その学校から指名された高校生（学校ページ用） */
export function getProDraftOfSchool(schoolSlug: string): ProDraftPick[] {
  return getProDraft().picks.filter((p) => p.school.slug === schoolSlug);
}

export async function getProAlumniIndex(): Promise<ProAlumniIndex> {
  return PRO_ALUMNI_INDEX as ProAlumniIndex;
}

async function loadPref(pref: string): Promise<ProPrefFile | null> {
  const loader = PRO_ALUMNI_LOADERS[pref];
  return loader ? loader() : null;
}

/** その学校の卒業生のプロ野球選手（学校ページ用）。**その地区のファイルだけ読む。** */
export async function getProAlumniOfSchool(prefSlug: string, schoolSlug: string): Promise<ProPlayer[]> {
  const file = await loadPref(prefSlug);
  return file?.schools.find((s) => s.slug === schoolSlug)?.players ?? [];
}

export interface ProAlumniListing {
  /** 地区ごと。人数の多い地区が先 */
  prefs: { pref: string; schools: ProSchool[]; players: number }[];
  totalPlayers: number;
  totalSchools: number;
}

/**
 * 一覧ページ用。**全地区を読む**（トップの集計用。**1ページに全員を並べない** —— HTML が
 * Googlebot の読み込み上限（約2MB）を超えるので、選手の一覧は地区ごとのページに分けた）。
 */
export async function listProAlumni(only?: string[]): Promise<ProAlumniListing> {
  const index = await getProAlumniIndex();
  const slugs = Object.keys(index.prefs).filter((p) => !only || only.includes(p));
  const files = await Promise.all(slugs.map((p) => loadPref(p)));
  const prefs = files
    .filter((f): f is ProPrefFile => f !== null)
    .map((f) => ({ pref: f.pref, schools: f.schools, players: f.schools.reduce((n, s) => n + s.players.length, 0) }))
    .sort((a, b) => b.players - a.players || a.pref.localeCompare(b.pref));
  return {
    prefs,
    totalPlayers: prefs.reduce((n, p) => n + p.players, 0),
    totalSchools: prefs.reduce((n, p) => n + p.schools.length, 0),
  };
}

// ------------------------------------------------------------------
// 表示用の整形（事実を足さない。持っている項目を並べるだけ）
// ------------------------------------------------------------------

/** 学校の短い呼び名（経歴の列用）。「広島県立広島商業高等学校」→「広島商業高」 */
export function shortSchool(officialName: string): string {
  return officialName
    .replace(/^.*?[都道府県市区町村]立/, "")
    .replace(/^組合立/, "")
    .replace(/(中学校・)?高等学校$/, "高")
    .replace(/高等専門学校$/, "高専");
}

/** 「関西学院大学 → 大阪ガス」。高校から直接入った選手は「高校から直接」 */
export function routeText(p: ProPlayer): string {
  return p.route.length === 0 ? "高校から直接" : p.route.map((r) => r.label).join(" → ");
}

/** 「2018年ドラフト1位」「1998年入団」 */
export function entryText(p: ProPlayer): string {
  if (p.draft) return `${p.draft.year}年${p.draft.rank ?? "ドラフト"}`;
  return p.entryYear ? `${p.entryYear}年入団` : "";
}

/** 入団した最初の球団（経歴欄の最初の NPB 球団。独立リーグ・海外は数えない） */
export function firstTeam(p: ProPlayer): string {
  return p.teams.find((t) => t.npb !== false)?.team ?? "";
}

/** 「阪神（2019–）」「巨人（2001–2005）→ ヤクルト（2006–2010）」 */
export function teamsText(p: ProPlayer): string {
  return p.teams.map((t) => (t.years ? `${t.team}（${t.years}）` : t.team)).join(" → ");
}

// ------------------------------------------------------------------
// リード文。**持っているデータの並べ替えだけ。** 生成AIに書かせない。
// ------------------------------------------------------------------
export function buildProAlumniLead(listing: ProAlumniListing, firstYear: number): string[] {
  if (listing.totalPlayers === 0) return [];

  const teamCount = new Map<string, number>();
  const schoolCount: { name: string; n: number }[] = [];
  for (const p of listing.prefs) {
    for (const s of p.schools) {
      schoolCount.push({ name: s.officialName, n: s.players.length });
      for (const pl of s.players) {
        const t = firstTeam(pl);
        if (t) teamCount.set(t, (teamCount.get(t) ?? 0) + 1);
      }
    }
  }
  const topTeams = [...teamCount].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const topSchools = schoolCount.sort((a, b) => b.n - a.n).slice(0, 3);

  const out: string[] = [
    `${firstYear}年のドラフト開始以降にプロ野球に入った選手のうち、公立（国立・高専を含む）の高校の出身と読み取れた選手を ${listing.totalSchools}校・${listing.totalPlayers}人 載せています。` +
      `高校から直接入った選手も、大学や社会人野球を経て入った選手も含みます。`,
  ];
  if (topSchools.length > 0 && topSchools[0].n >= 2) {
    out.push(
      `選手が多い高校は ${topSchools.map((s) => `${s.name}（${s.n}人）`).join("、")} です。` +
        (topTeams.length > 0
          ? `入団した球団では ${topTeams.map(([t, n]) => `${t}（${n}人）`).join("、")} が多くなっています。`
          : ""),
    );
  }
  return out;
}

// ------------------------------------------------------------------
// 地方区分（北海道・東北・関東・中部・近畿・中国・四国・九州沖縄）。一覧は地区ごとのページに分ける
// ------------------------------------------------------------------

/** URL の slug（ローマ字。日本語のURLは使わない） */
export const PRO_REGION_SLUGS: Record<Region, string> = {
  北海道: "hokkaido",
  東北: "tohoku",
  関東: "kanto",
  中部: "chubu",
  近畿: "kinki",
  中国: "chugoku",
  四国: "shikoku",
  "九州・沖縄": "kyushu-okinawa",
};

export function regionFromSlug(slug: string): Region | null {
  return REGIONS.find((r) => PRO_REGION_SLUGS[r] === slug) ?? null;
}

/** 地方区分に属する地区（甲子園の区分）の slug。北から南の順 */
export function prefSlugsOfRegion(region: Region): string[] {
  return [...PREFECTURES, ...REGIONAL_ONLY_DISTRICTS]
    .filter((p) => p.region === region)
    .map((p) => p.slug)
    .sort((a, b) => districtOrder(a) - districtOrder(b));
}

/** 地区の slug → 地区名（「北北海道」「東東京」を含む） */
export const PRO_PREF_NAME = new Map<string, string>(
  [...PREFECTURES, ...REGIONAL_ONLY_DISTRICTS].map((p) => [p.slug, p.name]),
);

/** 地方区分ごとの人数。**ファイルを読まない**（index.json だけ。トップの地区カード用） */
export async function proRegionCounts(): Promise<{ region: Region; slug: string; schools: number; players: number }[]> {
  const index = await getProAlumniIndex();
  return REGIONS.map((region) => {
    const prefs = prefSlugsOfRegion(region).map((p) => index.prefs[p]).filter(Boolean);
    return {
      region,
      slug: PRO_REGION_SLUGS[region],
      schools: prefs.reduce((n, p) => n + p.schools, 0),
      players: prefs.reduce((n, p) => n + p.players, 0),
    };
  });
}

/** 学校の人数の多い順に上位 n 校（トップの「選手が多い高校」） */
export function topSchools(listing: ProAlumniListing, n: number): (ProSchool & { pref: string })[] {
  return listing.prefs
    .flatMap((p) => p.schools.map((s) => ({ ...s, pref: p.pref })))
    .sort((a, b) => b.players.length - a.players.length || a.officialName.localeCompare(b.officialName, "ja"))
    .slice(0, n);
}

/** 入団した最初の球団ごとの人数（多い順） */
export function countByFirstTeam(listing: ProAlumniListing): [string, number][] {
  const m = new Map<string, number>();
  for (const p of listing.prefs) {
    for (const s of p.schools) for (const pl of s.players) {
      const t = firstTeam(pl);
      if (t) m.set(t, (m.get(t) ?? 0) + 1);
    }
  }
  return [...m].sort((a, b) => b[1] - a[1]);
}
