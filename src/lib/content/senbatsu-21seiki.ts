/**
 * 選抜の21世紀枠の特設ページ（`/koshien/21seiki/<年>`）に載せる、**手で書く部分**。
 *
 * ------------------------------------------------------------------
 * ★★ 何が手書きで、何が自動か
 *
 *   ・**都府県の推薦校一覧**（46〜47行）は**描くときに日本高野連のページから取る**
 *     （`src/lib/senbatsu-21seiki.ts`。発表のたびに行が増えるため）。ここには書かない。
 *   ・**日程と昨年の流れ**は年に1度しか動かない**日本高野連の一次資料**。ここに書く。
 *   ・**歴代の選出校**は `src/lib/data/twenty-first-century.ts`（生成物）。ここでは持たない。
 *
 * ★★ **年が変わったら（来年の秋）**
 *   ① `SENBATSU_21SEIKI` に新しい年を足す（日程は日本高野連の「第N回大会」のトップから）
 *   ② `node scripts/snapshot-21seiki.mjs` で控えを足す
 *   ③ 前の年の `candidates` / `selected` は**そのまま残す**（次の年の「昨年の流れ」になる）
 *
 * ★★ **日程は「未発表」と書く。当て推量で埋めない**
 *   9地区の候補校の発表日は、高野連が**発表してから**決まる（第98回は12月12日）。
 *   **前年の日付を今年の日付として書かない。**「例年12月中旬」は事実（過去の発表日）の言い換え。
 *
 * ★ **文章は取らない**（各連盟の推薦理由・ニュースの文章）。校名・成績・日付という事実だけ。
 * ★ **選手個人は載せない。**
 */

const JHBF = "https://www.jhbf.or.jp";

export type NineAreaCandidate = {
  /** 「東北」「関東・東京」 */
  area: string;
  /** 学校の呼び名（「名取北」）。学校マスタを引くときの鍵 */
  school: string;
  /** 都道府県（「宮城」）。北海道は「北海道」 */
  prefecture: string;
  /** 選考委員会で選ばれた */
  selected: boolean;
};

export type Senbatsu21seiki = {
  /** 開催年（選抜の春） */
  year: number;
  /** 第N回 */
  edition: number;
  /** 日程（日本高野連の「第N回大会」のトップ。令和9年＝2027年） */
  schedule: {
    /** 選考委員会 */
    committee: string;
    /** 組み合わせ抽選会 */
    draw: string;
    /** 会期 */
    period: string;
  };
  /** 日本高野連の「第N回大会」のトップ */
  topUrl: string;
};

export type Senbatsu21seikiPrevious = {
  year: number;
  edition: number;
  /** 9地区の候補校の発表日 */
  candidatesDate: string;
  /** その発表のお知らせ */
  noticeUrl: string;
  /** 都府県の推薦校一覧のURL */
  recommendedUrl: string;
  candidates: NineAreaCandidate[];
};

export const SENBATSU_21SEIKI: Record<number, Senbatsu21seiki> = {
  2027: {
    year: 2027,
    edition: 99,
    schedule: {
      committee: "2027年（令和9年）1月29日（金）",
      draw: "2027年3月5日（金）",
      period: "2027年3月19日（金）から13日間",
    },
    topUrl: `${JHBF}/senbatsu/2027/`,
  },
};

/**
 * 昨年（第98回）の絞られ方。**出典は日本高野連のお知らせ**
 * 「第98回選抜高校野球大会 9地区推薦21世紀枠候補校」（2025年12月12日）。
 * 選出の2校は大会の出場校（`twenty-first-century.ts` の2026年）と一致する。
 */
export const SENBATSU_21SEIKI_PREVIOUS: Record<number, Senbatsu21seikiPrevious> = {
  2027: {
    year: 2026,
    edition: 98,
    candidatesDate: "2025年12月12日",
    noticeUrl: `${JHBF}/topics/detail/556`,
    recommendedUrl: `${JHBF}/senbatsu/2026/21century/`,
    candidates: [
      { area: "北海道", school: "士別翔雲", prefecture: "北海道", selected: false },
      { area: "東北", school: "名取北", prefecture: "宮城", selected: false },
      { area: "関東・東京", school: "上尾", prefecture: "埼玉", selected: false },
      { area: "東海", school: "四日市", prefecture: "三重", selected: false },
      { area: "北信越", school: "若狭", prefecture: "福井", selected: false },
      { area: "近畿", school: "郡山", prefecture: "奈良", selected: false },
      { area: "中国", school: "鴻城", prefecture: "山口", selected: false },
      { area: "四国", school: "高知農", prefecture: "高知", selected: true },
      { area: "九州", school: "長崎西", prefecture: "長崎", selected: true },
    ],
  },
};

/**
 * 都府県の推薦校の名前を、学校マスタの学校に結ぶための**手書きの対応**。
 *
 * ★**出典の呼び名が「キャンパスつき」で、学校マスタが1校にまとめている学校だけ。**
 *   「香川高専高松」は香川高等専門学校の高松キャンパス（マスタの `kagawa`＝国立・高専）。
 *   ★**公立かどうかを校名から推測しない** —— 結ぶ先はマスタに行がある学校だけで、
 *   足すときは**マスタの行を確かめてから**（`slug` が `schools` にあること）。
 */
export const RECOMMENDED_SCHOOL_OVERRIDES: Record<string, { slug: string }> = {
  香川高専高松: { slug: "kagawa" },
};

/**
 * トップなどで特設ページへの案内を出す年。**出さないときは null。**
 *
 * ★**日付だけで決める**（日本高野連のページは取りに行かない。トップは10分ごとに作り直しており、
 *   ここに fetch の期限を持ち込むと作り直しが短くなる。`jinguFeatureYear` と同じ理由）。
 * ★**窓は10月20日〜1月31日。** 推薦校の発表が始まる10月下旬から、選考委員会（1月下旬）まで。
 *   選考のあとは**結果を手で書き足すまで案内を出さない**（古い「推薦校の一覧」を前面に出さない）。
 *   窓の外でもページ自体は開く（フッターのリンク・検索・サイトマップは残る）。
 */
export function senbatsu21seikiFeatureYear(now: Date = new Date()): number | null {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const month = jst.getUTCMonth() + 1;
  const day = jst.getUTCDate();
  const inWindow = (month === 10 && day >= 20) || month >= 11 || month === 1;
  if (!inWindow) return null;
  const year = month >= 10 ? jst.getUTCFullYear() + 1 : jst.getUTCFullYear();
  return SENBATSU_21SEIKI[year] ? year : null;
}
