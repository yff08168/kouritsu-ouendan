/**
 * 大会ページ（`/prefectures/<県>/<年-季節>`）のリード文（自動生成）。
 *
 * ------------------------------------------------------------------
 * ★★**なぜ要るか**（2026-08-29 その3）
 *
 * 602枚ある大会ページにも**本文が1文字も無かった**
 * （見出しの下は「全171試合（公立が絡む試合 138件）」の1行だけ）。
 * ★**メタ情報は 2026-08-29 に動的にしたが、画面のほうは手つかずだった。**
 *
 * ★**学校ページ・県ページのリード文と同じ規則**（`school-lead.ts` を読むこと）:
 *   - 生成AIに1文字も書かせない
 *   - 敗戦数を画面に出さない
 *   - 無いものを書かない（読めていない優勝校を名乗らせない）
 *   - 持っているデータで段落の構成そのものが変わる
 */

import {
  seasonLabel,
  type RegionalDistrict,
  type RegionalGame,
} from "@/lib/regional-results";
import {
  summarizeTournament,
  type TournamentEntry,
} from "@/lib/regional-tournaments";

export type TournamentLeadInput = {
  district: RegionalDistrict;
  entry: TournamentEntry;
  /** 画面の見出しに使っている大会名 */
  title: string;
  /** トーナメント表が組めたか */
  hasBracket: boolean;
};

/** 「7月7日」。★**年は上の文で言っているので繰り返さない** */
function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}月${Number(d)}日`;
}

/** その大会に出た公立校の数（連合チームは数えない） */
function publicTeamCount(games: readonly RegionalGame[]): number {
  const slugs = new Set<string>();
  for (const g of games) {
    for (const t of g.teams) {
      if (t.slug && !t.combined) slugs.add(t.slug);
    }
  }
  return slugs.size;
}

export function buildTournamentLead(input: TournamentLeadInput): string[] {
  const { district, entry, title, hasBracket } = input;
  const summary = summarizeTournament(entry);

  const paragraphs: string[] = [];

  // ------------------------------------------------------------
  // 第1段落 ── どの大会で、どれだけ収録しているか
  // ------------------------------------------------------------
  const when = entry.year != null ? `${entry.year}年の` : "";
  const first = [
    `${title}は、${district.district}で行われた${when}${seasonLabel(entry.season)}です。`,
    `このページには${summary.teams}チームによる${summary.games}試合を収録しています。`,
  ];

  const publics = publicTeamCount(entry.games);
  if (publics > 0) {
    first.push(`うち公立高校は${publics}校が出場しました。`);
  }
  paragraphs.push(first.join(""));

  // ------------------------------------------------------------
  // 第2段落 ── 日程と優勝校
  // ------------------------------------------------------------
  const second: string[] = [];

  /*
    ★**日付を1つも持たない出典がある**（三重・大阪ほか）。
    ★**そのときは日程の文を出さない。推測で埋めない。**
  */
  const dates = entry.games
    .map((g) => g.date)
    .filter((d): d is string => Boolean(d))
    .sort();
  if (dates.length > 0) {
    const from = dates[0];
    const to = dates[dates.length - 1];
    second.push(
      from === to
        ? `試合が行われたのは${shortDate(from)}です。`
        : `試合が行われたのは${shortDate(from)}から${shortDate(to)}までです。`,
    );
  }

  /*
    ★★**優勝校は `summarizeTournament` からしか取らない** ——
    「決勝がちょうど1試合のときだけ」という規則がそこにある。
    ブロックごとに「決勝」がある大会で1つ選ぶと嘘になる。
    ★**引き分けのまま終わっている大会も名乗らせない**（同じ関数が弾く）。
  */
  if (summary.champion) {
    second.push(
      // ★**公立が優勝した大会は、そう書く。** それがこのサイトの見どころ
      summary.championSlug
        ? `優勝したのは公立の${summary.champion}`
        : `優勝したのは${summary.champion}`,
    );
    second.push(
      summary.runnerUp ? `で、準優勝は${summary.runnerUp}でした。` : `です。`,
    );
  }

  if (second.length) paragraphs.push(second.join(""));

  // ------------------------------------------------------------
  // 第3段落 ── このページで何が見られるか
  // ------------------------------------------------------------
  /*
    ★**「トーナメント表があります」と書けるのは組めた大会だけ。**
    組めない大会に書くと、画面（「組めていません」の断り書き）と食い違う。
  */
  paragraphs.push(
    hasBracket
      ? "全試合の結果と、勝ち上がりのトーナメント表が見られます。校名を押すと、その学校のページへ進めます。"
      : "全試合の結果を回戦ごとに並べています。校名を押すと、その学校のページへ進めます。",
  );

  return paragraphs;
}
