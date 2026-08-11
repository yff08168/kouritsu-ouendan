/**
 * サイト全体で共有する定数。
 * DBに入れるほどではない / 変わらない値だけをここに置く。
 */

export const SITE = {
  name: "公立応援団",
  fullName: "公立高校野球応援サイト「公立応援団」",
  catchphrase: "公立高校野球が、もっと面白くなる。",
  description:
    "全国の公立高校野球を応援する人のためのサイト。ニュース、学校情報、戦績、歴史、そして公立旋風まで。公立高校野球の“今”を、ここに。",
  // 本番ドメイン決定後に NEXT_PUBLIC_SITE_URL で上書きする
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  locale: "ja_JP",
  xHandle: "@kouritsu_ouendan",
  xUrl: "https://x.com/kouritsu_ouendan",
} as const;

/** ヘッダー / フッターの主要ナビゲーション */
export const NAV = [
  { href: "/news", label: "ニュース" },
  { href: "/schools", label: "公立高校" },
  { href: "/phenomenon", label: "公立旋風" },
  { href: "/features", label: "特集" },
  { href: "/prefectures", label: "都道府県" },
] as const;

/** 設置区分。国立・高専も応援対象に含める（私立のみ収録対象外） */
export const ESTABLISHMENTS = {
  prefectural: "県立",
  municipal: "市立",
  town_village: "町村立",
  combined: "組合立",
  national: "国立",
  private: "私立",
} as const;

export type Establishment = keyof typeof ESTABLISHMENTS;

/**
 * 設置区分の表示ラベル。
 * 都道府県立は「県立」で一律にせず、北海道は道立、東京は都立、
 * 大阪・京都は府立と表記する（実際の校名表記に合わせるため）。
 */
export function establishmentLabel(
  establishment: Establishment,
  prefectureName: string,
): string {
  if (establishment !== "prefectural") return ESTABLISHMENTS[establishment];
  if (prefectureName === "北海道") return "道立";
  if (prefectureName === "東京") return "都立";
  if (prefectureName === "大阪" || prefectureName === "京都") return "府立";
  return "県立";
}

/** サイトの収録対象（私立は対戦相手データとしてのみ保持する） */
export const TARGET_ESTABLISHMENTS: Establishment[] = [
  "prefectural",
  "municipal",
  "town_village",
  "combined",
  "national",
];

/** 学校種別。国立を含めたことで高専・中等教育学校が入るため区別する */
export const SCHOOL_KINDS = {
  high_school: "高等学校",
  kosen: "高等専門学校",
  secondary: "中等教育学校",
} as const;

export type SchoolKind = keyof typeof SCHOOL_KINDS;

/** ニュースのカテゴリ */
export const NEWS_CATEGORIES = {
  result: "大会・結果",
  news: "ニュース",
  topic: "トピックス",
  column: "コラム",
  preview: "展望",
} as const;

export type NewsCategory = keyof typeof NEWS_CATEGORIES;

/** 公立旋風の規模 */
export const PHENOMENON_LEVELS = {
  koshien: "甲子園",
  prefectural: "県大会",
  regional: "地区大会",
} as const;

/** 特集のカテゴリ */
export const FEATURE_CATEGORIES = {
  guide: "観戦ガイド",
  history: "歴史",
  school_intro: "チーム紹介",
  stadium: "球場情報",
  goods: "観戦グッズ",
} as const;

export const SEASONS = {
  spring: "春",
  summer: "夏",
  autumn: "秋",
} as const;

/** 地方区分。都道府県一覧のグルーピングに使う */
export const REGIONS = [
  "北海道",
  "東北",
  "関東",
  "中部",
  "近畿",
  "中国",
  "四国",
  "九州・沖縄",
] as const;

export type Region = (typeof REGIONS)[number];

export type PrefectureMaster = {
  /** JIS都道府県コード（1〜47）。DBの主キーと一致させる */
  id: number;
  name: string;
  slug: string;
  region: Region;
  /**
   * タイル地図での配置（列, 行）。1始まり。
   *
   * 実際の県境SVGを使わずマス目に並べているのは、
   * (1) 小さい県（香川・大阪など）もタップしやすい大きさを保てる
   * (2) 地図データの配布ライセンスと帰属表示の問題が発生しない
   * (3) ただのリンクの集まりなのでキーボード操作と読み上げがそのまま効く
   * ため。正確な地図ではなく、位置関係が伝わればよいという割り切り。
   */
  mapCol: number;
  mapRow: number;
};

/** タイル地図の列数・行数。CSSグリッドの定義に使う */
export const MAP_COLUMNS = 12;
export const MAP_ROWS = 14;

/**
 * 47都道府県マスタ。JISコード順。
 * slug をローマ字にしているのは、日本語URLがエンコードされて
 * 共有時に読めなくなるのを避けるため（設計判断⑨）。
 */
export const PREFECTURES: PrefectureMaster[] = [
  { id: 1, name: "北海道", slug: "hokkaido", region: "北海道", mapCol: 12, mapRow: 1 },
  { id: 2, name: "青森", slug: "aomori", region: "東北", mapCol: 11, mapRow: 2 },
  { id: 3, name: "岩手", slug: "iwate", region: "東北", mapCol: 11, mapRow: 3 },
  { id: 4, name: "宮城", slug: "miyagi", region: "東北", mapCol: 11, mapRow: 4 },
  { id: 5, name: "秋田", slug: "akita", region: "東北", mapCol: 10, mapRow: 3 },
  { id: 6, name: "山形", slug: "yamagata", region: "東北", mapCol: 10, mapRow: 4 },
  { id: 7, name: "福島", slug: "fukushima", region: "東北", mapCol: 11, mapRow: 5 },
  { id: 8, name: "茨城", slug: "ibaraki", region: "関東", mapCol: 12, mapRow: 6 },
  { id: 9, name: "栃木", slug: "tochigi", region: "関東", mapCol: 11, mapRow: 6 },
  { id: 10, name: "群馬", slug: "gunma", region: "関東", mapCol: 10, mapRow: 6 },
  { id: 11, name: "埼玉", slug: "saitama", region: "関東", mapCol: 10, mapRow: 7 },
  { id: 12, name: "千葉", slug: "chiba", region: "関東", mapCol: 12, mapRow: 7 },
  { id: 13, name: "東京", slug: "tokyo", region: "関東", mapCol: 11, mapRow: 7 },
  { id: 14, name: "神奈川", slug: "kanagawa", region: "関東", mapCol: 10, mapRow: 8 },
  { id: 15, name: "新潟", slug: "niigata", region: "中部", mapCol: 10, mapRow: 5 },
  { id: 16, name: "富山", slug: "toyama", region: "中部", mapCol: 9, mapRow: 6 },
  { id: 17, name: "石川", slug: "ishikawa", region: "中部", mapCol: 8, mapRow: 6 },
  { id: 18, name: "福井", slug: "fukui", region: "中部", mapCol: 7, mapRow: 7 },
  { id: 19, name: "山梨", slug: "yamanashi", region: "中部", mapCol: 9, mapRow: 8 },
  { id: 20, name: "長野", slug: "nagano", region: "中部", mapCol: 9, mapRow: 7 },
  { id: 21, name: "岐阜", slug: "gifu", region: "中部", mapCol: 8, mapRow: 7 },
  { id: 22, name: "静岡", slug: "shizuoka", region: "中部", mapCol: 9, mapRow: 9 },
  { id: 23, name: "愛知", slug: "aichi", region: "中部", mapCol: 8, mapRow: 8 },
  { id: 24, name: "三重", slug: "mie", region: "近畿", mapCol: 8, mapRow: 9 },
  { id: 25, name: "滋賀", slug: "shiga", region: "近畿", mapCol: 7, mapRow: 8 },
  { id: 26, name: "京都", slug: "kyoto", region: "近畿", mapCol: 6, mapRow: 8 },
  { id: 27, name: "大阪", slug: "osaka", region: "近畿", mapCol: 6, mapRow: 9 },
  { id: 28, name: "兵庫", slug: "hyogo", region: "近畿", mapCol: 5, mapRow: 8 },
  { id: 29, name: "奈良", slug: "nara", region: "近畿", mapCol: 7, mapRow: 9 },
  { id: 30, name: "和歌山", slug: "wakayama", region: "近畿", mapCol: 6, mapRow: 10 },
  { id: 31, name: "鳥取", slug: "tottori", region: "中国", mapCol: 4, mapRow: 8 },
  { id: 32, name: "島根", slug: "shimane", region: "中国", mapCol: 3, mapRow: 8 },
  { id: 33, name: "岡山", slug: "okayama", region: "中国", mapCol: 4, mapRow: 9 },
  { id: 34, name: "広島", slug: "hiroshima", region: "中国", mapCol: 3, mapRow: 9 },
  { id: 35, name: "山口", slug: "yamaguchi", region: "中国", mapCol: 2, mapRow: 9 },
  { id: 36, name: "徳島", slug: "tokushima", region: "四国", mapCol: 5, mapRow: 10 },
  { id: 37, name: "香川", slug: "kagawa", region: "四国", mapCol: 5, mapRow: 9 },
  { id: 38, name: "愛媛", slug: "ehime", region: "四国", mapCol: 4, mapRow: 10 },
  { id: 39, name: "高知", slug: "kochi", region: "四国", mapCol: 4, mapRow: 11 },
  { id: 40, name: "福岡", slug: "fukuoka", region: "九州・沖縄", mapCol: 2, mapRow: 10 },
  { id: 41, name: "佐賀", slug: "saga", region: "九州・沖縄", mapCol: 1, mapRow: 11 },
  { id: 42, name: "長崎", slug: "nagasaki", region: "九州・沖縄", mapCol: 1, mapRow: 12 },
  { id: 43, name: "熊本", slug: "kumamoto", region: "九州・沖縄", mapCol: 2, mapRow: 12 },
  { id: 44, name: "大分", slug: "oita", region: "九州・沖縄", mapCol: 3, mapRow: 11 },
  { id: 45, name: "宮崎", slug: "miyazaki", region: "九州・沖縄", mapCol: 3, mapRow: 12 },
  { id: 46, name: "鹿児島", slug: "kagoshima", region: "九州・沖縄", mapCol: 2, mapRow: 13 },
  { id: 47, name: "沖縄", slug: "okinawa", region: "九州・沖縄", mapCol: 1, mapRow: 14 },
];

export const PREFECTURE_BY_SLUG = new Map(PREFECTURES.map((p) => [p.slug, p]));
export const PREFECTURE_BY_ID = new Map(PREFECTURES.map((p) => [p.id, p]));
