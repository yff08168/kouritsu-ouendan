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
  /** 応援ボタンの押下数 */
  cheerCount: number;
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

// ------------------------------------------------------------
// コミュニティ機能（0005）
// ------------------------------------------------------------

export type PollOption = {
  id: string;
  label: string;
  voteCount: number;
  /** 学校を選ぶ設問のとき。学校ページへ辿れるようにする */
  school: { slug: string; name: string } | null;
};

export type Poll = {
  id: string;
  slug: string;
  question: string;
  description: string | null;
  prefecture: PrefectureRef | null;
  endsAt: string | null;
  options: PollOption[];
  /** 全選択肢の合計。割合の表示に使う */
  totalVotes: number;
};

export type CheerTopic = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
};

export type CheerMessage = {
  id: string;
  body: string;
  /** 未入力なら「名無しの応援団」を出す。個人が特定できる情報は求めない */
  displayName: string | null;
  publishedAt: string | null;
  prefecture: PrefectureRef | null;
  topicTitle: string | null;
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

// ------------------------------------------------------------
// ランキング（/rankings）
//
// 甲子園出場歴を学校単位・都道府県単位・年単位に集計したもの。
// **収録範囲は公立・国立・高専だけ**なので、私立を含む全国順位ではない。
// 画面では必ずその旨を添える。
// ------------------------------------------------------------

/** 最高成績。「出場したが成績不明」と「初戦敗退」を混同しないよう、不明は null で表す。 */
export type KoshienBest = {
  result: string;
  year: number;
  season: Season;
};

/** 学校1校ぶんの甲子園成績 */
export type SchoolKoshienStats = {
  slug: string;
  name: string;
  prefecture: PrefectureRef;
  establishment: Establishment;
  schoolKind: SchoolKind;
  /** 春（選抜）の出場回数 */
  spring: number;
  /** 夏（選手権）の出場回数 */
  summer: number;
  /** 春夏の合計 */
  total: number;
  wins: number;
  losses: number;
  /** 勝率。1試合も記録が無い（成績不明の出場しかない）学校は null */
  winRate: number | null;
  firstYear: number | null;
  lastYear: number | null;
  bestSpring: KoshienBest | null;
  bestSummer: KoshienBest | null;
  /** 春夏を通した最高成績 */
  best: KoshienBest | null;
  /** 優勝回数 */
  titles: number;
  /** 準優勝回数 */
  runnerUps: number;
  /** ベスト4以上に入った回数 */
  finalFours: number;
  /** 21世紀枠で出場した年。無ければ空 */
  twentyFirstCenturyYears: number[];
};

/** 都道府県（甲子園の大会区分49件）ごとの集計 */
export type PrefectureKoshienStats = {
  name: string;
  slug: string;
  region: string;
  /** 出場したことのある学校数 */
  schools: number;
  /** 出場延べ回数 */
  appearances: number;
  spring: number;
  summer: number;
  wins: number;
  titles: number;
  best: KoshienBest | null;
  lastYear: number | null;
};

/** 1大会ぶんの「公立が何校出たか」 */
export type KoshienYearStat = {
  year: number;
  season: Season;
  /** このサイトが収録している公立・国立・高専の出場校数 */
  publicSchools: number;
  /** 私立を含む全出場校数。大会別記事から取れなかった年は null */
  totalSchools: number | null;
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
