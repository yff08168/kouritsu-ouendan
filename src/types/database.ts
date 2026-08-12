import type { Establishment, NewsCategory, SchoolKind } from "@/lib/constants";
import type { FeatureCategory, PhenomenonLevel, Season } from "@/types/app";

/**
 * Supabase から返ってくる行の形。
 *
 * Supabase CLI での自動生成（supabase gen types）は使わず手書きしている。
 * ローカルに追加のツールを入れない方針のため。
 *
 * ★ supabase/migrations/ を変更したら、必ずこのファイルも合わせること。★
 * ずれていても TypeScript は気づけない（実行時に undefined になる）。
 * scripts/check-supabase.mjs で実データを見て確認できる。
 */

/** 画像3点セット。全テーブル共通のカラム名にしてある。 */
export type ImageColumns = {
  image_url: string | null;
  image_credit: string | null;
  image_source_url: string | null;
};

/** prefectures を join したときの形。多対一なのでオブジェクトか null。 */
export type PrefectureJoin = { name: string; slug: string } | null;

export type NewsRow = ImageColumns & {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: NewsCategory;
  published_at: string | null;
  source_name: string | null;
  prefecture: PrefectureJoin;
};

export type SchoolRow = ImageColumns & {
  id: string;
  slug: string;
  name: string;
  official_name: string;
  city: string | null;
  establishment: Establishment;
  school_kind: SchoolKind;
  catchcopy: string | null;
  koshien_spring_count: number;
  koshien_summer_count: number;
  last_koshien_year: number | null;
  /** 0005。応援ボタンの押下数（school_cheers からトリガで非正規化） */
  cheer_count: number;
  prefecture: PrefectureJoin;
};

export type NewsDetailRow = NewsRow & {
  body: string | null;
  source_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
};

export type SchoolDetailRow = SchoolRow & {
  description: string | null;
  website_url: string | null;
  founded_year: number | null;
  name_aliases: string[] | null;
};

export type ChampionshipRow = {
  id: string;
  year: number;
  season: Season;
  result: string | null;
  wins: number | null;
  losses: number | null;
  note: string | null;
};

export type SchoolRecordRow = {
  id: string;
  year: number;
  tournament_name: string;
  result: string | null;
  note: string | null;
};

export type PhenomenonRow = ImageColumns & {
  id: string;
  slug: string;
  title: string;
  year: number;
  season: Season;
  level: PhenomenonLevel;
  badge: string | null;
  prefecture: PrefectureJoin;
  /** 中間テーブル経由の関連校。多対多なので配列で返る。 */
  phenomenon_schools:
    | { role: string; schools: { name: string } | null }[]
    | null;
};

export type PhenomenonDetailRow = PhenomenonRow & {
  summary: string | null;
  body: string | null;
};

export type FeatureRow = ImageColumns & {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  category: FeatureCategory;
};

export type FeatureDetailRow = FeatureRow & {
  body: string | null;
  published_at: string | null;
  seo_title: string | null;
  seo_description: string | null;
};

/** 0003 で作ったビュー */
export type SchoolCountRow = {
  prefecture_slug: string;
  school_count: number;
};

// ------------------------------------------------------------
// 0005 コミュニティ機能
//
// school_cheers / poll_votes には select ポリシーが無い（書けるが読めない）。
// 表示に使う数は schools.cheer_count と poll_options.vote_count にある。
// ------------------------------------------------------------

export type PollRow = {
  id: string;
  slug: string;
  question: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  prefecture: PrefectureJoin;
  poll_options: PollOptionRow[] | null;
};

export type PollOptionRow = {
  id: string;
  label: string;
  sort_order: number;
  vote_count: number;
  /** 学校を選ぶ設問のとき。学校ページへ辿れるようにする。 */
  schools: { slug: string; name: string } | null;
};

export type CheerTopicRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
};

export type CheerMessageRow = {
  id: string;
  body: string;
  display_name: string | null;
  published_at: string | null;
  prefecture: PrefectureJoin;
  cheer_topics: { slug: string; title: string } | null;
};
