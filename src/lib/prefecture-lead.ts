/**
 * 県のページのリード文（自動生成）。
 *
 * ------------------------------------------------------------------
 * ★★**なぜ要るか**（2026-08-29 その3）
 *
 * 県のページ49枚にも**本文が1文字も無かった**（`prefectures.description` は空）。
 * 見出しは「神奈川県の公立高校野球」＝**運営者が挙げた流入経路②**
 * （`神奈川 公立 高校野球` のような県＋野球）そのものなのに、
 * **その語を支える地の文がページに存在しない**状態だった。
 *
 * ★**学校ページのリード文（`school-lead.ts`）と同じ考え方。**
 * 規則もそちらに合わせてある:
 *   - **生成AIに1文字も書かせない**（持っているデータの並べ替えだけ）
 *   - **敗戦数を画面に出さない**
 *   - **無いものを書かない**（甲子園に出ていない、とは書かない）
 *   - **持っているデータで段落の構成そのものが変わる**（定型文にしない）
 *
 * ★**生成物にしない。描画時に組む**（理由は `school-lead.ts` に書いてある）。
 */

import type { Prefecture } from "@/lib/queries/prefectures";
import type { PrefectureKoshienSummary } from "@/lib/queries/schools";
import { seasonLabel, type RegionalDistrict } from "@/lib/regional-results";
import {
  summarizeTournament,
  type TournamentEntry,
} from "@/lib/regional-tournaments";

export type PrefectureLeadInput = {
  prefecture: Prefecture;
  /** その地区に掲載している学校数 */
  schoolCount: number;
  /** その県の地方大会。対応していない地区は null */
  district: RegionalDistrict | null;
  /** `listTournaments` の結果。**新しい順** */
  tournaments: TournamentEntry[];
  koshien: PrefectureKoshienSummary;
  /** この地区の公立旋風の件数 */
  phenomenaCount: number;
};

export function buildPrefectureLead(input: PrefectureLeadInput): string[] {
  const { prefecture, schoolCount, district, tournaments, koshien } = input;

  const paragraphs: string[] = [];

  // ------------------------------------------------------------
  // 第1段落 ── 何のページで、何校載っているか
  // ------------------------------------------------------------
  /*
    ★**`fullName` は「神奈川県」、`name` は「神奈川」**（甲子園の大会区分）。
    ★**分割している4地区では `fullName` も「北北海道」「西東京」**になる。
    **「◯◯県」と決め打ちしないこと。**
  */
  paragraphs.push(
    `${prefecture.fullName}の公立高校野球をまとめたページです。` +
      `県立・市立・町村立に加え、国立と高専もあわせた${schoolCount}校を掲載しています。`,
  );

  // ------------------------------------------------------------
  // 第2段落 ── 地方大会
  // ------------------------------------------------------------
  if (district && tournaments.length > 0) {
    const games = district.games.length;
    const years = tournaments
      .map((t) => t.year)
      .filter((y): y is number => y !== null);
    const span =
      years.length > 0
        ? Math.min(...years) === Math.max(...years)
          ? `${years[0]}年`
          : `${Math.min(...years)}年から${Math.max(...years)}年まで`
        : null;

    const second: string[] = [
      span
        ? `地方大会の結果は、${span}の${tournaments.length}大会${games.toLocaleString()}試合を収録しています。`
        : `地方大会の結果は${tournaments.length}大会${games.toLocaleString()}試合を収録しています。`,
    ];

    /*
      ★**いちばん新しい大会とその優勝校。**
      ★★**優勝校は `summarizeTournament` からしか取らない** ——
      「決勝がちょうど1試合のときだけ」という規則がそこにある。
      ブロックごとに決勝がある大会で1つ選ぶと嘘になる。
    */
    const newest = tournaments[0];
    if (newest) {
      const summary = summarizeTournament(newest);
      const label =
        newest.displayName ??
        `${newest.year ?? ""}年の${seasonLabel(newest.season)}`;
      second.push(
        summary.champion
          ? `いちばん新しいのは${label}で、優勝したのは${summary.champion}です。`
          : `いちばん新しいのは${label}です。`,
      );
    }

    second.push(
      `大会ごとのページでは、全試合の結果とトーナメント表が見られます。`,
    );
    paragraphs.push(second.join(""));
  } else {
    /*
      ★★**地方大会を持たない8地区**（北北海道・南北海道・青森・宮城・秋田・
      東東京・西東京・鳥取）。**規約で塞がれている6県**ぶんである。
      ★**「まだ対応していません」と書かない** —— 事実は「作業が追いついていない」
      ではなく「出典の利用条件を確認したうえで見送っている」。
      ★**連盟を非難する書き方にしないこと。** 事実だけを短く書く。
    */
    paragraphs.push(
      `この地区の地方大会の結果は、出典の利用条件を確認したうえで掲載を見送っています。` +
        `甲子園の試合結果は、出場した学校のページから見られます。`,
    );
  }

  // ------------------------------------------------------------
  // 第3段落 ── 甲子園
  // ------------------------------------------------------------
  /*
    ★**出場歴があるときだけ書く。** 0校のときに「1校もありません」と
    書かない（DBに無いことは世の中に無いことではない）。
  */
  if (koshien.schools > 0) {
    const third = [
      `甲子園には、${prefecture.fullName}の公立勢から${koshien.schools}校が` +
        `延べ${koshien.appearances}回出場しています。`,
    ];
    if (koshien.latest) {
      third.push(
        `いちばん最近に出たのは${koshien.latest.year}年の${koshien.latest.name}です。`,
      );
    }
    paragraphs.push(third.join(""));
  }

  return paragraphs;
}
