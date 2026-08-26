/**
 * 直接対決・通算成績。
 *
 * ------------------------------------------------------------------
 * ★★ なぜ作れるようになったか（2026-08-26）
 *
 *   甲子園6,013試合・明治神宮216試合・地方大会23,991試合が手元にある。
 *   **どれも「誰と誰が何点で戦ったか」を持っている**ので、
 *   **同じ顔合わせを集めるだけで通算成績になる。**
 *   ★**新しい出典は要らない。持っているものの見せ方の話。**
 *
 * ------------------------------------------------------------------
 * ★★ 敗戦数を画面に出さない（AGENTS.md の決めごと）との関係
 *
 *   ★**両側の「勝った数」で書く。**「◯勝◯敗」とは書かない。
 *   直接対決は**相手の勝ち数がそのまま自分の負け数**になるが、
 *   **画面に出す数字はどちらも「勝利数」**であって、
 *   公立の敗戦を数え上げた列を作らない、という線は守れる。
 *
 * ------------------------------------------------------------------
 * ★ 引き分けは「負け」ではない
 *
 *   高校野球には引き分け再試合がある（甲子園でも1969年夏・2006年夏の決勝）。
 *   **勝者のいない試合は引き分けとして別に数える。**
 */

import { KOSHIEN_GAMES, koshienGamesOf, normalizeKoshienName } from "@/lib/koshien-games";
import { JINGU_GAMES, jinguGamesOf, normalizeJinguName } from "@/lib/jingu-games";
import type { RegionalGame } from "@/lib/regional-results";

/** どの大会で当たったか */
export type MeetingStage = "koshien" | "jingu" | "regional";

export type Meeting = {
  stage: MeetingStage;
  /** 「第100回全国高等学校野球選手権記念大会」「第108回全国高等学校野球選手権長野大会」 */
  tournament: string | null;
  round: string | null;
  date: string | null;
  /** 見ている側の得点 */
  score: number;
  /** 相手の得点 */
  opponentScore: number;
  /** 見ている側が勝ったか。引き分けは両方 false */
  won: boolean;
  drawn: boolean;
};

export type HeadToHead = {
  /** 相手の表記（出典のまま） */
  display: string;
  /** 相手が学校マスタにいれば slug。私立・連合チームは null */
  slug: string | null;
  /** 学校マスタの校名。無ければ display と同じ */
  name: string;
  meetings: Meeting[];
  /** 見ている側の勝った数 */
  wins: number;
  /** 相手が勝った数。★**「負け」ではなく相手の勝利数として出す** */
  opponentWins: number;
  draws: number;
  /** いちばん新しい対戦の日付。日付を持たない出典があるので null がある */
  lastDate: string | null;
  /** 大会の種類ごとの対戦数 */
  byStage: Record<MeetingStage, number>;
};

/**
 * その学校の直接対決をまとめる。
 *
 * @param names   その学校として認めてよい表記（全国大会の照合に使う）
 * @param slug    学校マスタの slug（地方大会の照合に使う）
 * @param regional その県の全試合。**渡さなければ全国大会だけ**
 *
 * ★**全国大会は完全一致でしか結び付けない**（学校ページと同じ規則）。
 * ★**地方大会は slug で結び付ける**（生成物が slug を持っている）。
 */
export function headToHead({
  names,
  slug,
  pref,
  regional = [],
}: {
  names: readonly string[];
  slug: string;
  /** その学校の都道府県。**同名の別校に当てないために渡す**（省略可） */
  pref?: string;
  regional?: readonly RegionalGame[];
}): HeadToHead[] {
  const byOpponent = new Map<string, HeadToHead>();

  const push = (
    key: string,
    opponent: { display: string; name: string; slug: string | null },
    meeting: Meeting,
  ) => {
    let entry = byOpponent.get(key);
    if (!entry) {
      entry = {
        display: opponent.display,
        slug: opponent.slug,
        name: opponent.name,
        meetings: [],
        wins: 0,
        opponentWins: 0,
        draws: 0,
        lastDate: null,
        byStage: { koshien: 0, jingu: 0, regional: 0 },
      };
      byOpponent.set(key, entry);
    }
    entry.meetings.push(meeting);
    entry.byStage[meeting.stage] += 1;
    if (meeting.drawn) entry.draws += 1;
    else if (meeting.won) entry.wins += 1;
    else entry.opponentWins += 1;
    if (meeting.date && (!entry.lastDate || meeting.date > entry.lastDate)) {
      entry.lastDate = meeting.date;
    }
  };

  // ---- 甲子園 ----
  const want = new Set(names.map(normalizeKoshienName).filter(Boolean));
  for (const g of koshienGamesOf(KOSHIEN_GAMES, names, pref)) {
    const me = g.teams.find((t) => want.has(normalizeKoshienName(t.display)));
    const other = g.teams.find((t) => t !== me);
    if (!me || !other) continue;
    const drawn = me.score === other.score;
    push(
      `n:${normalizeKoshienName(other.display)}`,
      { display: other.display, name: other.display, slug: null },
      {
        stage: "koshien",
        tournament: g.tournament,
        round: g.round,
        date: g.date,
        score: me.score,
        opponentScore: other.score,
        won: me.won,
        drawn,
      },
    );
  }

  // ---- 明治神宮 ----
  const wantJingu = new Set(names.map(normalizeJinguName).filter(Boolean));
  for (const g of jinguGamesOf(JINGU_GAMES, names, pref)) {
    const me = g.teams.find((t) => wantJingu.has(normalizeJinguName(t.display)));
    const other = g.teams.find((t) => t !== me);
    if (!me || !other) continue;
    const drawn = me.score === other.score;
    push(
      `n:${normalizeKoshienName(other.display)}`,
      { display: other.display, name: other.display, slug: null },
      {
        stage: "jingu",
        tournament: g.tournament,
        round: g.round,
        date: g.date,
        score: me.score,
        opponentScore: other.score,
        won: me.won,
        drawn,
      },
    );
  }

  // ---- 地方大会 ----
  for (const g of regional) {
    const me = g.teams.find((t) => t.slug === slug);
    const other = g.teams.find((t) => t !== me);
    if (!me || !other) continue;
    /*
      ★**連合チームは相手として数えない**（どの学校の記録にするか決められない）。
      地方大会の生成物と同じ扱い。
    */
    if (other.combined) continue;
    const drawn = me.score === other.score;
    push(
      other.slug ? `s:${other.slug}` : `n:${normalizeKoshienName(other.display)}`,
      { display: other.display, name: other.name, slug: other.slug },
      {
        stage: "regional",
        tournament: g.tournament,
        round: g.round,
        date: g.date,
        score: me.score,
        opponentScore: other.score,
        won: me.won,
        drawn,
      },
    );
  }

  /*
    ★**並びは「対戦の多い順 → 新しい順」。**
    **勝率で並べないこと** —— 1勝0敗の相手が、10戦6勝の相手より上に来る。
  */
  return [...byOpponent.values()]
    .map((h) => ({
      ...h,
      meetings: h.meetings.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
    }))
    .sort(
      (a, b) =>
        b.meetings.length - a.meetings.length ||
        (b.lastDate ?? "").localeCompare(a.lastDate ?? "") ||
        a.name.localeCompare(b.name, "ja"),
    );
}

/** 2校ぶんの slug を、URLで使う並び（辞書順）にそろえる */
export function vsPath(a: string, b: string): string {
  const [x, y] = [a, b].sort();
  return `/vs/${x}/${y}`;
}
