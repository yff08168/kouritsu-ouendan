/**
 * 「甲子園に出場した公立高校」を**年ごと**に数え上げる
 * （`/koshien/public` と `/koshien/public/<年>`）。
 *
 * ------------------------------------------------------------------
 * ★★ なぜ要るか（2026-09-21）
 *
 *   運営者がくれたキーワードプランナーの実測で、
 *   **「公立高校 甲子園」が8月に33,100**（月平均3,600）検索されていた。
 *   **このサイトの主題そのもの**なのに、その語を題に持つページが1枚も無かった。
 *   中身（その大会に出た公立校の一覧と成績）は `/koshien/<年-季節>` の
 *   `publicEntrants` がすでに持っている。**足りないのは年で束ねた入口だけ。**
 *
 * ------------------------------------------------------------------
 * ★ 数え上げは `national-tournaments.ts` の関数をそのまま使う
 *
 *   公立かどうかの判定（`resolve`）も成績の出し方（`publicEntrants`）も
 *   大会ページと同じもの。**ここで別の規則を持たない** ——
 *   ずらすと「大会ページには出るのに年のページには出ない」が起きる。
 *
 * ★ 「甲子園」と書けるのは 1925年から
 *   夏の第1〜9回（1915〜1923年）は豊中・鳴尾、春の第1回（1924年）は名古屋。
 *   **出典に球場は入っていない**ので、それより前の年は「全国大会」と書く
 *   （AGENTS.md「球場を補わない」。大会ページが「甲子園」を足さないのと同じ線）。
 *
 * ★ リード文は持っているデータの並べ替えだけ（AGENTS.md「自動で出す文章」）
 *   - 「成績不明」を勝ち上がりとして書かない
 *   - 勝った数が0なら、その文ごと出さない（敗戦数の言い換えになる）
 *   - 出ていない季節のことは書かない（無いことは書かない）
 *
 * ★ 公立が1校も結び付かない年はページを作らない
 *   旧制中学の校名は学校マスタに当たらないことが多く、そういう年のページは
 *   見出しだけの薄いページになる。**一覧にも載せない**（sitemap も同じ）。
 */

import {
  finalists,
  listKoshienTournaments,
  publicEntrants,
  type NationalTournament,
  type PublicEntrant,
} from "@/lib/national-tournaments";
import { teamPrefecture } from "@/lib/koshien-games";
import { TWENTY_FIRST_CENTURY_BERTHS } from "@/lib/data/twenty-first-century";

/** 校名 → 学校マスタ。`getSchoolNameIndex("koshien").find` をそのまま渡す */
export type Resolve = (
  display: string,
  pref?: string,
) => { slug: string; name: string; pref?: string } | null;

export type PublicTournamentSummary = {
  tournament: NationalTournament;
  /** 勝ち上がった順 */
  entrants: PublicEntrant[];
  finalists: { champion: string; championPref?: string; runnerUp: string } | null;
  championIsPublic: boolean;
  /** 21世紀枠で出た学校の slug。**春の選抜だけ**（夏には無い） */
  twentyFirst: ReadonlySet<string>;
};

export type PublicYear = {
  year: number;
  /** 夏 → 春の順（`listKoshienTournaments` の並びのまま） */
  tournaments: PublicTournamentSummary[];
  /** 公立の出場校数（のべ。春と夏の両方に出た学校は2と数える） */
  entrantCount: number;
  /** 公立が勝った試合の数（のべ） */
  wins: number;
  /** 公立が優勝した大会の数 */
  publicChampions: number;
};

/** この年から春・夏とも甲子園で行われている */
export const KOSHIEN_VENUE_FROM = 1925;

export function venueLabel(year: number): "甲子園" | "全国大会" {
  return year >= KOSHIEN_VENUE_FROM ? "甲子園" : "全国大会";
}

export const seasonLabel = (t: NationalTournament) =>
  t.season === "spring" ? "春の選抜" : "夏の選手権";

function summarize(t: NationalTournament, resolve: Resolve): PublicTournamentSummary {
  const entrants = publicEntrants(t, resolve);
  const f = finalists(t);
  const championIsPublic = f ? Boolean(resolve(f.champion, f.championPref)) : false;
  const twentyFirst = new Set<string>();
  if (t.season === "spring") {
    for (const b of TWENTY_FIRST_CENTURY_BERTHS) {
      if (b.year === t.year && b.schoolSlug) twentyFirst.add(b.schoolSlug);
    }
  }
  return { tournament: t, entrants, finalists: f, championIsPublic, twentyFirst };
}

/**
 * 全部の年。**新しい順**。
 * ★公立が1校も無い年も返す（呼び出し側が `entrantCount > 0` で絞る）。
 */
export function listPublicYears(resolve: Resolve): PublicYear[] {
  const byYear = new Map<number, PublicTournamentSummary[]>();
  for (const t of listKoshienTournaments()) {
    const s = summarize(t, resolve);
    const list = byYear.get(t.year);
    if (list) list.push(s);
    else byYear.set(t.year, [s]);
  }
  return [...byYear.entries()]
    .map(([year, tournaments]) => ({
      year,
      tournaments,
      entrantCount: tournaments.reduce((n, s) => n + s.entrants.length, 0),
      wins: tournaments.reduce(
        (n, s) => n + s.entrants.reduce((w, e) => w + e.wins, 0),
        0,
      ),
      publicChampions: tournaments.filter((s) => s.championIsPublic).length,
    }))
    .sort((a, b) => b.year - a.year);
}

/** ページにする年だけ（公立が1校以上結び付いた年）。**新しい順** */
export function listPublicYearsWithEntrants(resolve: Resolve): PublicYear[] {
  return listPublicYears(resolve).filter((y) => y.entrantCount > 0);
}

/** 決勝で公立高校が勝った／負けた大会 */
export type PublicFinalEntry = {
  tournament: NationalTournament;
  champion: string;
  runnerUp: string;
  /** 「4-3」。決勝の得点。読めていなければ null */
  score: string | null;
  /** 公立の側の学校（優勝の一覧なら優勝校、準優勝の一覧なら準優勝校） */
  school: { slug: string; name: string };
};

export type PublicChampions = {
  /** 公立が優勝した大会。新しい順 */
  champions: PublicFinalEntry[];
  /** 公立が準優勝した大会。新しい順 */
  runnersUp: PublicFinalEntry[];
  /** 学校ごとの優勝回数。多い順 → 新しい順 */
  bySchool: { slug: string; name: string; count: number; entries: PublicFinalEntry[] }[];
};

/**
 * 甲子園で優勝・準優勝した公立高校（`/koshien/public/champions`）。
 * ★**決勝が読めている大会だけ**（`finalists` が null を返す大会は数えない）。
 * ★**公立かどうかは大会ページと同じ `resolve`**（県まで渡す。同名の別校に当てない）。
 */
export function listPublicChampions(resolve: Resolve): PublicChampions {
  const champions: PublicFinalEntry[] = [];
  const runnersUp: PublicFinalEntry[] = [];
  for (const t of listKoshienTournaments()) {
    const f = finalists(t);
    if (!f || !t.final) continue;
    const winner = t.final.teams.find((x) => x.won);
    const loser = t.final.teams.find((x) => !x.won);
    const score = winner && loser ? `${winner.score}-${loser.score}` : null;
    const champ = resolve(f.champion, f.championPref);
    if (champ) {
      champions.push({ tournament: t, champion: f.champion, runnerUp: f.runnerUp, score, school: champ });
    }
    const runnerPref = loser
      ? teamPrefecture(loser as { display: string; pref?: string; score: number; won: boolean })
      : undefined;
    const runner = resolve(f.runnerUp, runnerPref);
    if (runner) {
      runnersUp.push({ tournament: t, champion: f.champion, runnerUp: f.runnerUp, score, school: runner });
    }
  }
  const bySchoolMap = new Map<string, PublicChampions["bySchool"][number]>();
  for (const e of champions) {
    const cur = bySchoolMap.get(e.school.slug) ?? { slug: e.school.slug, name: e.school.name, count: 0, entries: [] };
    cur.count += 1;
    cur.entries.push(e);
    bySchoolMap.set(e.school.slug, cur);
  }
  const bySchool = [...bySchoolMap.values()].sort(
    (a, b) => b.count - a.count || b.entries[0].tournament.year - a.entries[0].tournament.year,
  );
  return { champions, runnersUp, bySchool };
}

/**
 * 優勝した公立高校の一覧のリード文。**持っているデータの並べ替えだけ。**
 */
export function buildPublicChampionsLead(data: PublicChampions): string[] {
  const paragraphs: string[] = [];
  const n = data.champions.length;
  if (n === 0) return ["決勝が読めている大会の中に、公立高校が優勝した大会はありません。"];
  const years = data.champions.map((e) => e.tournament.year);
  const spring = data.champions.filter((e) => e.tournament.season === "spring").length;
  const summer = n - spring;
  const parts: string[] = [];
  if (summer > 0) parts.push(`夏の選手権で${summer}大会`);
  if (spring > 0) parts.push(`春の選抜で${spring}大会`);
  paragraphs.push(
    `このサイトが決勝の記録を持っている大会のうち、公立高校が優勝したのは${n}大会です（${parts.join("、")}）。いちばん古いのは${Math.min(...years)}年、いちばん新しいのは${Math.max(...years)}年です。`,
  );
  const top = data.bySchool[0];
  if (top && top.count > 1) {
    const ties = data.bySchool.filter((s) => s.count === top.count);
    paragraphs.push(
      ties.length === 1
        ? `優勝回数がもっとも多いのは${top.name}の${top.count}回です。`
        : `優勝回数がもっとも多いのは${ties.map((s) => s.name).join("と")}で、それぞれ${top.count}回です。`,
    );
  }
  paragraphs.push(
    "大会名を押すとその大会の全試合へ、校名を押すとその学校のページへ進めます。このサイトは私立を収録していないので、ここでの回数は全国での順位ではありません。",
  );
  return paragraphs;
}

/**
 * 年のページのリード文。**持っているデータの並べ替えだけ。**
 */
export function buildPublicYearLead(y: PublicYear): string[] {
  const venue = venueLabel(y.year);
  const paragraphs: string[] = [];

  // ------------------------------------------------------------
  // 第1段落 ── 何校出たか。出ていない季節のことは書かない
  // ------------------------------------------------------------
  const counts = y.tournaments
    .filter((s) => s.entrants.length > 0)
    .map((s) => `${seasonLabel(s.tournament)}に${s.entrants.length}校`);
  if (counts.length > 0) {
    paragraphs.push(
      `${y.year}年の${venue}には、公立高校が${counts.join("、")}出場しています。`,
    );
  }

  // ------------------------------------------------------------
  // 第2段落 ── 優勝校。決勝が読めていない大会は名乗らせない
  // ------------------------------------------------------------
  const champions = y.tournaments
    .filter((s) => s.finalists)
    .map((s) =>
      s.championIsPublic
        ? `${seasonLabel(s.tournament)}は公立の${s.finalists!.champion}が優勝しました。`
        : `${seasonLabel(s.tournament)}の優勝は${s.finalists!.champion}でした。`,
    );
  if (champions.length > 0) paragraphs.push(champions.join(""));

  // ------------------------------------------------------------
  // 第3段落 ── 公立でもっとも勝ち進んだ学校と、勝った試合の数
  // ------------------------------------------------------------
  const third: string[] = [];
  for (const s of y.tournaments) {
    const best = s.entrants[0];
    /*
      ★★**先頭が「成績不明」なら書かない**（`national-lead.ts` と同じ理由）。
      ★**優勝は第2段落で言っているので繰り返さない。**
    */
    /*
      ★★**1勝もしていない学校を「もっとも勝ち進んだ」と書かない** ——
      1回戦敗退しか無い年は「もっとも勝ち進んだのは◯◯で、1回戦敗退でした」になる
      （1915年のページで実際に出た）。**勝った数が0の文は出さない**（AGENTS.md）。
    */
    if (!best || best.wins === 0 || best.result === "成績不明" || best.result === "優勝") {
      continue;
    }
    third.push(
      `${seasonLabel(s.tournament)}で公立高校のうちもっとも勝ち進んだのは${best.name}で、${best.result}でした。`,
    );
  }
  // ★**0勝は書かない**（敗戦数の言い換えになる。AGENTS.md）
  if (y.wins > 0) {
    third.push(`公立高校が勝った試合は、この年の${venue}で合わせて${y.wins}試合です。`);
  }
  if (third.length > 0) paragraphs.push(third.join(""));

  // ------------------------------------------------------------
  // 第4段落 ── このページで何が見られるか
  // ------------------------------------------------------------
  paragraphs.push(
    "各校の成績は、勝った試合の数と、敗退した回戦の名前で並べています。校名を押すと、その学校のページへ進めます。",
  );

  return paragraphs;
}

/**
 * 年別一覧（`/koshien/public`）のリード文。
 */
export function buildPublicIndexLead(years: PublicYear[]): string[] {
  if (years.length === 0) return [];
  const ys = years.map((y) => y.year);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const entrants = years.reduce((n, y) => n + y.entrantCount, 0);
  const champions = years.reduce((n, y) => n + y.publicChampions, 0);

  const paragraphs = [
    `春の選抜と夏の選手権に出場した公立高校を、年ごとにまとめています。${min}年から${max}年までの${years.length}年ぶんで、公立高校の出場はのべ${entrants}校です。`,
  ];
  if (champions > 0) {
    paragraphs.push(`公立高校が優勝した大会は${champions}大会あります。`);
  }
  paragraphs.push(
    "年を選ぶと、その年に出場した公立高校の一覧と成績が見られます。成績は、勝った試合の数と、敗退した回戦の名前で並べています。",
  );
  return paragraphs;
}
