/**
 * 秋季地区大会の本大会（北信越大会・近畿大会・東海大会・九州大会 など）の試合（生成物）。
 * `scripts/build-area-results.mjs` が `regional-area.json` に書く。**直接編集しない。**
 *
 * ------------------------------------------------------------------
 * ★★ 鍵は「開催県の slug」。**その年の地区大会を開いた県の連盟が公開した結果**から読んでいる
 *   （北信越＝新潟・東海＝三重・近畿＝京都・九州＝熊本。2026年秋）。
 *   ★**開催県は毎年替わる**ので、別の年は別の県の slug に入る。
 *
 * ★★ **県のファイル（`regional/<県>.json`）の `games` には入れていない。**
 *   県を単位にした集計（最新の大会・進捗・記録・勝ち上がり・直接対決）に**他県の学校が混ざる**ため。
 *   `regional/<県>.json` の `areaGames`（神奈川の出典が載せていた関東大会）と**同じ形**で、
 *   読むのは `/regional/autumn/<年>`（`src/lib/autumn-summary.ts`）だけ。
 *
 * ★ `RegionalGame` と同じ形。**チーム名の「（京都1位）」は都道府県大会での順位**（北信越の出典には無い）。
 *   学校マスタには結び付けていない（`slug` は null）。
 */
import type { RegionalGame } from "@/lib/regional-results";
import table from "./regional-area.json";

export type RegionalAreaEntry = {
  /** 「北信越」 */
  area: string;
  /** 出典（開催県の連盟）の名前。「新潟県高等学校野球連盟」 */
  sourceName: string;
  sourceUrl: string;
  games: RegionalGame[];
};

export const REGIONAL_AREA = table as unknown as Record<string, RegionalAreaEntry>;
