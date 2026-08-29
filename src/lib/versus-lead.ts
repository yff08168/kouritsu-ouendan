/**
 * 直接対決のページ（`/vs/<A>/<B>`）のリード文（自動生成）。
 *
 * ------------------------------------------------------------------
 * ★★**なぜ要るか**（2026-08-29 その3）
 *
 * 対戦ページも**地の文が1文字も無かった**（数字の並びと試合の一覧だけ）。
 * ★**ISR なのでビルドは太らない**（`generateStaticParams` を置いていない）。
 *
 * ★**学校ページ・県ページ・大会ページのリード文と同じ規則**
 * （`school-lead.ts` を読むこと）。ここでとくに効くのは:
 *   - ★★**「◯勝◯敗」と書かない。両側の勝った数で書く**
 *   - ★★**引き分けを「負け」に混ぜない**（引き分け再試合があるため）
 *   - ★**収録している範囲での回数だと断る**（県ごとに遡れる年が違う）
 */

import type { HeadToHead } from "@/lib/head-to-head";

export type VersusLeadInput = {
  /** 画面の見出しに使っている校名（同名校がぶつかったときは正式名） */
  labelA: string;
  labelB: string;
  /** 甲子園の大会区分名 */
  prefA: string;
  prefB: string;
  /** `headToHead` の結果。**`wins` は A 側、`opponentWins` は B 側** */
  record: HeadToHead;
};

const STAGE_LABEL: Record<"koshien" | "jingu" | "regional", string> = {
  koshien: "甲子園",
  jingu: "明治神宮大会",
  regional: "地方大会",
};

/** 「2026年7月18日」 */
function longDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(y)}年${Number(m)}月${Number(d)}日`;
}

export function buildVersusLead(input: VersusLeadInput): string[] {
  const { labelA, labelB, prefA, prefB, record } = input;
  const total = record.meetings.length;
  if (total === 0) return [];

  const paragraphs: string[] = [];

  // ------------------------------------------------------------
  // 第1段落 ── 何と何の対戦で、何回当たっているか
  // ------------------------------------------------------------
  /*
    ★**同じ県の2校なら県名を1度だけ書く**（「（栃木）と（栃木）」は読みにくい）。
  */
  const where = prefA === prefB ? `${prefA}の` : "";
  const names =
    prefA === prefB
      ? `${labelA}と${labelB}`
      : `${labelA}（${prefA}）と${labelB}（${prefB}）`;

  const first = [
    `${where}${names}の直接対決をまとめたページです。`,
    `当サイトが収録している試合では、これまでに${total}回対戦しています。`,
  ];

  /*
    ★★**両側の勝った数で書く。** 片方が0のときはその側を書かない
    （「0勝」は言い換えただけの敗戦数。学校ページのリード文と同じ線）。
  */
  const wins = [
    record.wins > 0 ? `${labelA}が${record.wins}勝` : "",
    record.opponentWins > 0 ? `${labelB}が${record.opponentWins}勝` : "",
  ].filter(Boolean);
  if (wins.length > 0) {
    first.push(
      `${wins.join("、")}${record.draws > 0 ? `、引き分けが${record.draws}試合` : ""}です。`,
    );
  } else if (record.draws > 0) {
    // ★引き分けしかない組（引き分け再試合の前で止まっている大会など）
    first.push(`${record.draws}試合とも引き分けです。`);
  }
  paragraphs.push(first.join(""));

  // ------------------------------------------------------------
  // 第2段落 ── いちばん新しい対戦
  // ------------------------------------------------------------
  /*
    ★**日付を持たない出典がある**ので、**日付のある対戦からしか選ばない。**
    ★**無ければこの段落ごと出さない**（順番を決められないものを「直近」と呼ばない）。
  */
  const dated = record.meetings.filter((m) => m.date);
  const latest = dated.reduce<(typeof dated)[number] | null>(
    (best, m) => (!best || m.date! > best.date! ? m : best),
    null,
  );
  if (latest) {
    const stage = STAGE_LABEL[latest.stage];
    const at = latest.tournament ? `${latest.tournament}の` : `${stage}の`;
    const round = latest.round ? `${latest.round}` : "";
    paragraphs.push(
      `いちばん新しい対戦は${longDate(latest.date!)}、${at}${round}で、` +
        `${labelA}${latest.score}対${labelB}${latest.opponentScore}` +
        `${latest.drawn ? "の引き分けでした。" : "でした。"}`,
    );
  }

  // ------------------------------------------------------------
  // 第3段落 ── 大会の種類の内訳と、数の但し書き
  // ------------------------------------------------------------
  const stages = (["koshien", "jingu", "regional"] as const)
    .filter((s) => record.byStage[s] > 0)
    .map((s) => `${STAGE_LABEL[s]}${record.byStage[s]}戦`);
  paragraphs.push(
    `内訳は${stages.join("・")}です。` +
      `収録できている大会の中での回数なので、実際の対戦回数とは異なります。`,
  );

  return paragraphs;
}
