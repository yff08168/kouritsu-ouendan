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
  prefecture: PrefectureJoin;
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

export type FeatureRow = ImageColumns & {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  category: FeatureCategory;
};

/** 0003 で作ったビュー */
export type SchoolCountRow = {
  prefecture_slug: string;
  school_count: number;
};
