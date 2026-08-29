/**
 * 学校ページのリード文（自動生成）。
 *
 * ------------------------------------------------------------------
 * ★★**なぜ要るのか**（2026-08-29）
 *
 * 学校ページは2,303枚が index 対象になっているのに、**本文が1文字も無い。**
 * 表とリンクだけで、`school.description` はほとんどの学校で空である。
 * 運営者が挙げた流入経路の1つが**「高校名 野球」という狭いワード**なのに、
 * **その語を含む地の文がページに存在しない**状態だった。
 *
 * ------------------------------------------------------------------
 * ★★★**生成AIに文章を書かせない。**
 *
 * このサイトは校名も戦績も「出典のある事実だけ」で作っている
 * （AGENTS.md「学校名・所在地・設置区分を手で書かない」
 * 「甲子園出場歴・戦績も生成AIに書かせない」）。
 * **リード文も同じ扱いにする** —— ここでやっているのは
 * **持っているデータを日本語の語順に並べ替えるだけ**で、
 * **データに無いことは1文字も書かない。**
 *
 * ------------------------------------------------------------------
 * ★★**生成物にしない**（描画時に組む）。
 *
 * 学校ページは**すでに**自分の県の試合・甲子園の試合・直接対決を読んでいる。
 * そこから組めば**データが増えた瞬間に文も変わる**ので、
 * **生成物も、それをコミットするワークフローも要らない。**
 * ★`src/lib/data/` に新しいファイルを増やすと、
 * 「`TARGETS` に書き足し忘れて凍る」（`regional-progress.ts` で実際に起きた）
 * を繰り返すことになる。**増やさないほうを選んでいる。**
 *
 * ------------------------------------------------------------------
 * ★★**同じ文が2,300枚並ぶと逆効果。**
 *
 * 自動生成の薄いページと見なされると、いちばん避けたい
 * 「サイト全体が薄いと判定される」（`school-index.ts` の趣旨）に逆戻りする。
 * ★**そこで「文を差し込む」のではなく「持っているデータで段落の構成そのものが
 * 変わる」作りにしてある。** 甲子園歴の有無・地方大会の有無・対戦相手の有無・
 * 21世紀枠の有無で、出る段落も語順も変わる。
 *
 * ------------------------------------------------------------------
 * ★**守っている線**
 *
 * - ★★**敗戦数を画面に出さない**（AGENTS.md）。**書くのは勝った数だけ。**
 *   1試合ごとのスコアは既存の戦績表と同じく両側そのまま出す（これは勝敗数ではない）。
 * - ★★**「甲子園に出ていない」と書かない。** DBに無いことは
 *   「世の中に無い」ことではない。**あるときだけ書く。**
 * - ★**選手個人に触れない**（AGENTS.md）。データにも入っていない。
 * - ★**日付の無い試合から年を推測しない。** 日付が1つも無ければその文を出さない。
 */

import type { Championship, SchoolDetail } from "@/types/app";
import { SCHOOL_KINDS, establishmentLabel } from "@/lib/constants";
import { seasonLabel, type RegionalGame } from "@/lib/regional-results";
import { tournamentDisplayName } from "@/lib/regional-tournaments";
import { bestResultBySeason } from "@/lib/koshien";
import type { HeadToHead } from "@/lib/head-to-head";

export type SchoolLeadInput = {
  school: Pick<
    SchoolDetail,
    | "name"
    | "officialName"
    | "slug"
    | "city"
    | "establishment"
    | "schoolKind"
    | "prefecture"
    | "koshienSpringCount"
    | "koshienSummerCount"
    | "lastKoshienYear"
  >;
  /** 甲子園出場歴（DB） */
  championships: Championship[];
  /** ★**この学校の試合だけ**（`regionalGamesOf` を通したもの） */
  regional: readonly RegionalGame[];
  /** その県の大会名。「長野」「西東京」。`RegionalDistrict.district` */
  districtName: string | null;
  /** 直接対決（`headToHead`） */
  rivals: readonly HeadToHead[];
  /** 21世紀枠で選ばれた年 */
  berthYears: readonly number[];
  /** この学校に紐づく公立旋風の件数 */
  phenomenaCount: number;
};

/** 1試合の中で「その学校の側」と「相手の側」を取り出す */
function sides(game: RegionalGame, slug: string) {
  const self = game.teams.find((t) => t.slug === slug);
  const opponent = game.teams.find((t) => t !== self);
  if (!self || !opponent) return null;
  return { self, opponent };
}

/** 「2026年7月26日」 */
function longDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(y)}年${Number(m)}月${Number(d)}日`;
}

/**
 * その試合を指す言い方。
 *
 * ★**大会名があればそれを使う**（`tournamentDisplayName` は出典のページ見出しを
 * 落としたもの。**生成物は直さず表示のときだけ掃除する**という既存の作りに乗る）。
 * ★**無ければ年と季節**。年も分からなければ季節だけ。
 */
function tournamentPhrase(game: RegionalGame): string {
  const name = tournamentDisplayName(game.tournament);
  if (name) return name;
  const year = game.date ? Number(game.date.slice(0, 4)) : null;
  return year ? `${year}年の${seasonLabel(game.season)}` : seasonLabel(game.season);
}

/**
 * リード文を組む。**段落の配列**を返す（空なら出さない）。
 *
 * ★**呼ぶ側で文を足さないこと。** 文の規則はここ1か所に置く。
 */
export function buildSchoolLead(input: SchoolLeadInput): string[] {
  const { school, championships, regional, districtName, rivals, berthYears } = input;

  const paragraphs: string[] = [];

  // ------------------------------------------------------------
  // 第1段落 ── 身元と、このページに何が載っているか
  // ------------------------------------------------------------
  const estab = establishmentLabel(school.establishment, school.prefecture.name);
  const kind = SCHOOL_KINDS[school.schoolKind];
  const place = school.city
    ? `${school.city}（${school.prefecture.name}）`
    : school.prefecture.name;

  const first: string[] = [`${school.officialName}は、${place}の${estab}${kind}です。`];

  const koshienTotal = school.koshienSpringCount + school.koshienSummerCount;
  if (koshienTotal > 0) {
    /*
      ★**春と夏を分けて書く。** 「通算◯回」だけだと、
      選抜と選手権のどちらの学校なのかが分からない。
      ★**0回の季は書かない**（「春0回」は情報ではない）。
    */
    const parts = [
      school.koshienSpringCount > 0 ? `春の選抜${school.koshienSpringCount}回` : "",
      school.koshienSummerCount > 0 ? `夏の選手権${school.koshienSummerCount}回` : "",
    ].filter(Boolean);
    first.push(
      `甲子園への出場は${parts.join("、")}の通算${koshienTotal}回${
        school.lastKoshienYear ? `で、最後の出場は${school.lastKoshienYear}年です。` : "です。"
      }`,
    );
  }

  // ★**日付を持つ試合からしか年を出さない**（推測で埋めない）
  const dated = regional.filter((g) => g.date);
  const years = dated.map((g) => Number(g.date!.slice(0, 4))).sort((a, b) => a - b);
  const span =
    years.length > 0
      ? years[0] === years[years.length - 1]
        ? `${years[0]}年`
        : `${years[0]}年から${years[years.length - 1]}年まで`
      : null;

  if (regional.length > 0) {
    const where = districtName ? `${districtName}大会` : "地方大会";
    first.push(
      span
        ? `このページでは、${span}の${where}${regional.length}試合の結果をまとめています。`
        : `このページでは、${where}${regional.length}試合の結果をまとめています。`,
    );
  }

  paragraphs.push(first.join(""));

  // ------------------------------------------------------------
  // 第2段落 ── 直近の試合と、収録ぶんの勝った数
  // ------------------------------------------------------------
  const second: string[] = [];

  // ★**いちばん新しい試合**。日付の無い試合は順番を決められないので使わない
  const latest = dated.reduce<RegionalGame | null>(
    (best, g) => (!best || g.date! > best.date! ? g : best),
    null,
  );
  if (latest) {
    const s = sides(latest, school.slug);
    if (s) {
      const round = latest.round ? `の${latest.round}` : "";
      const where = `${longDate(latest.date!)}、${tournamentPhrase(latest)}${round}`;
      /*
        ★**1試合しか無い学校に「直近の試合は」と書かない。**
        直近も何も1つしか無く、「まだ他にもある」ように読めてしまう。
      */
      second.push(
        regional.length === 1
          ? `収録している1試合は${where}、${s.opponent.display}戦です（${s.self.score}対${s.opponent.score}）。`
          : `直近の試合は${where}で、${s.opponent.display}と対戦しました（${s.self.score}対${s.opponent.score}）。`,
      );
    }
  }

  /*
    ★★**勝った数だけを書く**（AGENTS.md「敗戦数を画面に出さない」）。
    ★**引き分けは「勝っていない＝負け」ではない**（高校野球には引き分け再試合がある。
    岐阜で踏んだ轍）。数に入れず、あるときだけ別に添える。
  */
  const wins = regional.filter((g) => {
    const s = sides(g, school.slug);
    return s ? s.self.won : false;
  }).length;
  const draws = regional.filter((g) => {
    const s = sides(g, school.slug);
    return s ? !s.self.won && !s.opponent.won && s.self.score === s.opponent.score : false;
  }).length;

  /*
    ★★**勝った数が0のときは、この文ごと出さない。**
    「0試合に勝っています」は**言い換えただけの敗戦数**で、
    AGENTS.md の「敗戦数を画面に出さない」に正面から触れる。
    ★**1試合しか無い学校では書かない**（上の文が同じことを言っている）。
  */
  if (regional.length > 1 && wins > 0) {
    second.push(
      `収録している${regional.length}試合のうち${wins}試合に勝っています${
        draws > 0 ? `（引き分け${draws}試合）` : ""
      }。`,
    );
  }

  if (second.length) paragraphs.push(second.join(""));

  // ------------------------------------------------------------
  // 第3段落 ── よく当たる相手
  // ------------------------------------------------------------
  /*
    ★**対戦数がいちばん多い相手**。`headToHead` は対戦の多い順に返ってくるが、
    **並び順に依存しないよう自分で選ぶ**（並べ替えの規則が変わっても壊れない）。
    ★**1回しか当たっていない相手は書かない** —— 「最も多く対戦している」が
    嘘に近くなるうえ、どの学校にも書けてしまって文が定型化する。
  */
  const topRival = rivals.reduce<HeadToHead | null>(
    (best, r) =>
      !best || r.meetings.length > best.meetings.length ? r : best,
    null,
  );
  if (topRival && topRival.meetings.length >= 3) {
    // ★**ここでも勝った数が0なら書かない**（上と同じ理由。「0勝しています」は敗戦数）
    paragraphs.push(
      topRival.wins > 0
        ? `最も多く対戦しているのは${topRival.name}で、当サイトの記録では${topRival.meetings.length}回顔を合わせ、${school.name}が${topRival.wins}勝しています。`
        : `最も多く対戦しているのは${topRival.name}で、当サイトの記録では${topRival.meetings.length}回顔を合わせています。`,
    );
  }

  // ------------------------------------------------------------
  // 第4段落 ── 甲子園での最高成績・21世紀枠
  // ------------------------------------------------------------
  const fourth: string[] = [];
  if (koshienTotal > 0) {
    const best = bestResultBySeason(championships);
    /*
      ★**春と夏で同じ段階まで行っている学校は、繰り返さずにまとめる。**
      「春は1983年の準優勝、夏は1983年の準優勝です」は同じ語が2回出て読みにくい。
    */
    if (best.spring && best.summer && best.spring.result === best.summer.result) {
      fourth.push(
        best.spring.year === best.summer.year
          ? `甲子園での最高成績は、春夏ともに${best.spring.year}年の${best.spring.result}です。`
          : `甲子園での最高成績は春夏ともに${best.spring.result}で、春は${best.spring.year}年、夏は${best.summer.year}年です。`,
      );
    } else {
      const parts = [
        best.spring ? `春は${best.spring.year}年の${best.spring.result}` : "",
        best.summer ? `夏は${best.summer.year}年の${best.summer.result}` : "",
      ].filter(Boolean);
      // ★**成績が分からない出場しか無い季は書かない**（`bestResultBySeason` が null を返す）
      if (parts.length) fourth.push(`甲子園での最高成績は、${parts.join("、")}です。`);
    }
  }
  if (berthYears.length) {
    /*
      ★**21世紀枠は回数ではなく年をそのまま出す**（学校ページのバッジと同じ扱い。
      数が少なく特別な選出なので、「1回」では何も伝わらない）。
    */
    fourth.push(
      `${[...berthYears].sort((a, b) => a - b).join("年、")}年には21世紀枠で選抜に出場しています。`,
    );
  }
  if (fourth.length) paragraphs.push(fourth.join(""));

  return paragraphs;
}
