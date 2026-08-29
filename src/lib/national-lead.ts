/**
 * 全国大会のページ（`/koshien/<年-季節>`・`/jingu/<年>`）のリード文（自動生成）。
 *
 * ------------------------------------------------------------------
 * ★★**なぜ要るか**（2026-08-29 その3）
 *
 * 全国大会のページ214枚も**地の文が1文字も無かった**。
 * 優勝校・出場校数・公立の一覧という**部品はそろっているのに、
 * それを日本語で言い直した文が1つも無い**状態だった。
 *
 * ★**学校ページ・県ページ・地方大会のリード文と同じ規則**
 * （`school-lead.ts` を読むこと）。とくにここで効くのは次の2つ:
 *   - ★★**「成績不明」を勝ち上がりとして書かない**
 *     （`publicEntrants` は負けた試合が読めていない学校に「成績不明」を入れる。
 *     **並びの先頭に来ても「いちばん勝ち進んだ」とは言えない**）
 *   - ★★**出場校数は参照表（`reference`）から来る。検算には使わない**
 *     （AGENTS.md。199大会のうち43件で「出場校数 − 1 ≠ 試合数」になっている）
 */

import type {
  NationalTournament,
  PublicEntrant,
} from "@/lib/national-tournaments";

export type NationalLeadInput = {
  tournament: NationalTournament;
  /** `publicEntrants` の結果。**勝ち上がった順** */
  entrants: PublicEntrant[];
  /** `finalists` の結果 */
  finalists: { champion: string; runnerUp: string } | null;
  /** 優勝校が公立か */
  championIsPublic: boolean;
  /** トーナメント表が組めたか */
  hasBracket: boolean;
};

/**
 * 1文目。
 *
 * ★★**神宮は大会名に年も「明治神宮野球大会 高校の部」も入っている**ので、
 * 甲子園と同じ形にすると
 * 「2025年 明治神宮野球大会 高校の部は、2025年の明治神宮大会（高校の部）です」
 * という**同語反復**になる。**大会の性格を書くほうに替える。**
 * ★**この説明は `/koshien` にすでに書いてあるものと同じ文言にそろえてある**
 * （2か所で言うことを変えない）。
 */
function opening(t: NationalTournament): string {
  if (t.kind === "jingu") {
    return `明治神宮大会（高校の部）は、秋の地区大会を勝ち抜いた学校が集まる大会です。`;
  }
  const season = t.season === "spring" ? "春の選抜" : "夏の選手権";
  return `${t.name}は、${t.year}年の${season}です。`;
}

export function buildNationalLead(input: NationalLeadInput): string[] {
  const { tournament: t, entrants, finalists: f, championIsPublic, hasBracket } =
    input;

  const paragraphs: string[] = [];

  // ------------------------------------------------------------
  // 第1段落 ── どの大会で、どれだけ収録しているか
  // ------------------------------------------------------------
  const first = [opening(t)];
  if (t.kind === "jingu") {
    first.push(`${t.year}年の大会から${t.games.length}試合を収録しています。`);
  } else if (t.reference?.schoolCount) {
    /*
      ★**出場校数は参照表から来る**ので、収録している試合数と並べて書く。
      ★**「◯校が出場し、◯試合が行われました」と書かないこと** ——
      行われた試合の数は分からない（読めている試合の数しか持っていない）。
    */
    first.push(
      `${t.reference.schoolCount}校が出場し、このページには${t.games.length}試合を収録しています。`,
    );
  } else {
    first.push(`このページには${t.games.length}試合を収録しています。`);
  }
  paragraphs.push(first.join(""));

  // ------------------------------------------------------------
  // 第2段落 ── 優勝校
  // ------------------------------------------------------------
  /*
    ★**決勝が読めていない大会は名乗らせない**（`finalists` が null を返す）。
    ★**公立が優勝した大会はそう書く。** このサイトがいちばん見せたいもの。
  */
  if (f) {
    paragraphs.push(
      championIsPublic
        ? `優勝したのは公立の${f.champion}で、準優勝は${f.runnerUp}でした。`
        : `優勝したのは${f.champion}、準優勝は${f.runnerUp}でした。`,
    );
  }

  // ------------------------------------------------------------
  // 第3段落 ── 公立の出場校
  // ------------------------------------------------------------
  if (entrants.length > 0) {
    const third = [`この大会には公立高校が${entrants.length}校出場しています。`];
    /*
      ★★**先頭が「成績不明」なら、勝ち上がりの文を出さない。**
      `publicEntrants` は**負けた試合が読めていない学校**に「成績不明」を入れる。
      **並びの先頭に来ることがあり、そのまま書くと「いちばん勝ち進んだのは
      ◯◯（成績不明）」という意味の通らない文になる。**
    */
    const best = entrants[0];
    if (best && best.result !== "成績不明") {
      third.push(
        best.result === "優勝"
          ? `${best.name}が優勝しました。`
          : `もっとも勝ち進んだのは${best.name}で、${best.result}でした。`,
      );
    }
    paragraphs.push(third.join(""));
  }

  // ------------------------------------------------------------
  // 第4段落 ── このページで何が見られるか
  // ------------------------------------------------------------
  paragraphs.push(
    hasBracket
      ? "全試合の結果と、勝ち上がりのトーナメント表が見られます。校名を押すと、その学校のページへ進めます。"
      : "全試合の結果を回戦ごとに並べています。校名を押すと、その学校のページへ進めます。",
  );

  return paragraphs;
}
