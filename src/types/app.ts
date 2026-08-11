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
  city: string;
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

export type PhenomenonLevel = "koshien" | "prefectural" | "regional";
export type Season = "spring" | "summer" | "autumn";

/** 公立旋風。トップの注目枠で使う */
export type PhenomenonSummary = {
  id: string;
  slug: string;
  title: string;
  year: number;
  season: Season;
  level: PhenomenonLevel;
  /** 旋風を起こした代表校 */
  schoolName: string;
  prefecture: PrefectureRef;
  /** 「甲子園出場決定」「ベスト8進出」などの短いラベル */
  badge: string | null;
  image: ImageRef | null;
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
  subtitle: string;
  category: FeatureCategory;
  image: ImageRef | null;
};
