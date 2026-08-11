import type {
  Establishment,
  NewsCategory,
  SchoolKind,
} from "@/lib/constants";

/**
 * 画像は必ずクレジットとセットで持つ（設計判断⑪）。
 * Wikimedia Commons の CC BY-SA 画像などは帰属表示が法的義務のため、
 * URLだけを保存する構造にしない。
 */
export type ImageRef = {
  url: string;
  /** 例: "©︎ 撮影者名 / CC BY-SA 4.0" */
  credit?: string;
  sourceUrl?: string;
  alt?: string;
};

export type PrefectureRef = {
  name: string;
  slug: string;
};

/** 一覧・カードで使う学校の情報 */
export type SchoolSummary = {
  id: string;
  slug: string;
  name: string;
  officialName: string;
  prefecture: PrefectureRef;
  city: string | null;
  establishment: Establishment;
  schoolKind: SchoolKind;
  /** 学校ページの見出しに使う一言 */
  catchcopy: string | null;
  image: ImageRef | null;
  koshienSpringCount: number;
  koshienSummerCount: number;
  lastKoshienYear: number | null;
};

/** 一覧で使うニュースの情報 */
export type NewsSummary = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: NewsCategory;
  publishedAt: string;
  prefecture: PrefectureRef | null;
  image: ImageRef | null;
  /** 引用元の媒体名。全文転載はせず、必ず出典を表示する */
  sourceName: string | null;
};

/**
 * ニュース詳細。
 * body には引用元の全文を入れない運用（見出し＋自作の要約＋出典リンクまで）。
 */
export type NewsDetail = NewsSummary & {
  /** Markdown。生HTMLは描画しない */
  body: string | null;
  /** 元記事へのリンク */
  sourceUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

/** 学校詳細ページで使う。一覧の情報に、詳細でだけ必要な項目を足したもの。 */
export type SchoolDetail = SchoolSummary & {
  description: string | null;
  websiteUrl: string | null;
  foundedYear: number | null;
  /** 「県岐商」のような通称。検索と、詳細ページでの表記ゆれ案内に使う */
  nameAliases: string[];
};

export type PhenomenonLevel = "koshien" | "prefectural" | "regional";
export type Season = "spring" | "summer" | "autumn";

/** 甲子園出場歴の1行 */
export type Championship = {
  id: string;
  year: number;
  season: Season;
  result: string | null;
  wins: number | null;
  losses: number | null;
  note: string | null;
};

/** 最近の戦績の1行 */
export type SchoolRecord = {
  id: string;
  year: number;
  tournamentName: string;
  result: string | null;
  note: string | null;
};

/** 公立旋風。トップの注目枠で使う */
export type PhenomenonSummary = {
  id: string;
  slug: string;
  title: string;
  year: number;
  season: Season;
  level: PhenomenonLevel;
  /** 旋風を起こした代表校。関連校が未設定なら null */
  schoolName: string | null;
  prefecture: PrefectureRef | null;
  /** 「甲子園出場決定」「ベスト8進出」などの短いラベル */
  badge: string | null;
  image: ImageRef | null;
};

/** 公立旋風の詳細 */
export type PhenomenonDetail = PhenomenonSummary & {
  summary: string | null;
  /** Markdown。生HTMLは描画しない */
  body: string | null;
};

export type FeatureCategory =
  | "guide"
  | "history"
  | "school_intro"
  | "stadium"
  | "goods";

export type FeatureSummary = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  category: FeatureCategory;
  image: ImageRef | null;
};

export type FeatureDetail = FeatureSummary & {
  /** Markdown。生HTMLは描画しない */
  body: string | null;
  publishedAt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};
