import { createSupabaseServerClient } from "@/lib/supabase/server";
import { escapeLikePattern, throwIfError, toImageRef, toPrefectureRef } from "@/lib/queries/shared";
import { PREFECTURE_BY_SLUG } from "@/lib/constants";
import type { SchoolCountRow, SchoolRow } from "@/types/database";
import type { SchoolSummary } from "@/types/app";

const SCHOOL_SUMMARY_SELECT = `
  id, slug, name, official_name, city, establishment, school_kind,
  catchcopy, koshien_spring_count, koshien_summer_count, last_koshien_year,
  image_url, image_credit, image_source_url,
  prefecture:prefectures ( name, slug )
`;

/** 都道府県が引けなかった行を落とすためのフォールバック */
const UNKNOWN_PREFECTURE = { name: "－", slug: "" };

function toSchoolSummary(row: SchoolRow): SchoolSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    officialName: row.official_name,
    prefecture: toPrefectureRef(row.prefecture) ?? UNKNOWN_PREFECTURE,
    city: row.city,
    establishment: row.establishment,
    schoolKind: row.school_kind,
    catchcopy: row.catchcopy,
    image: toImageRef(row, `${row.name}の外観`),
    koshienSpringCount: row.koshien_spring_count,
    koshienSummerCount: row.koshien_summer_count,
    lastKoshienYear: row.last_koshien_year,
  };
}

/**
 * トップページの「注目の公立高校」枠。
 * いまは甲子園出場回数が多い順。将来は編集部が選んだ順に変える余地がある。
 */
export async function getFeaturedSchools(limit = 3): Promise<SchoolSummary[]> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("schools")
    .select(SCHOOL_SUMMARY_SELECT)
    .order("last_koshien_year", { ascending: false, nullsFirst: false })
    .order("koshien_summer_count", { ascending: false })
    .limit(limit);

  throwIfError(error, "注目校の取得");

  return ((data ?? []) as unknown as SchoolRow[]).map(toSchoolSummary);
}

export type SchoolSearchParams = {
  /** 学校名・正式名称・別名・市区町村を横断する部分一致 */
  q?: string;
  /** 都道府県slug（例: shimane） */
  prefectureSlug?: string;
  /** 1始まり */
  page?: number;
  perPage?: number;
};

export type SchoolSearchResult = {
  schools: SchoolSummary[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
};

/**
 * 学校の一覧・検索。
 *
 * 検索対象は schools.search_text（名称・正式名称・別名・市区町村を結合した列）。
 * トリガで維持され、pg_trgm の GIN インデックスが張ってある。
 * 日本語は形態素解析なしだと標準の全文検索が効かないため、部分一致を使っている。
 */
export async function searchSchools({
  q = "",
  prefectureSlug,
  page = 1,
  perPage = 24,
}: SchoolSearchParams): Promise<SchoolSearchResult> {
  const supabase = createSupabaseServerClient();
  const currentPage = Math.max(1, Math.floor(page));
  const from = (currentPage - 1) * perPage;

  let query = supabase
    .from("schools")
    .select(SCHOOL_SUMMARY_SELECT, { count: "exact" });

  if (q) {
    query = query.ilike("search_text", `%${escapeLikePattern(q)}%`);
  }

  if (prefectureSlug) {
    const prefecture = PREFECTURE_BY_SLUG.get(prefectureSlug);
    // 存在しないslugが来たら0件にする（不正なIDでの全件取得を防ぐ）
    query = query.eq("prefecture_id", prefecture?.id ?? -1);
  }

  const { data, error, count } = await query
    .order("prefecture_id", { ascending: true })
    .order("name", { ascending: true })
    .range(from, from + perPage - 1);

  throwIfError(error, "学校の検索");

  const total = count ?? 0;
  return {
    schools: ((data ?? []) as unknown as SchoolRow[]).map(toSchoolSummary),
    total,
    page: currentPage,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

/**
 * 都道府県ごとの収録校数。
 * 全学校を取得して数えると全国データ投入後に重くなるため、
 * DB側のビュー（0003）で集計している。
 */
export async function getSchoolCountByPrefecture(): Promise<
  Record<string, number>
> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("school_counts_by_prefecture")
    .select("prefecture_slug, school_count");

  throwIfError(error, "都道府県別の学校数の取得");

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as unknown as SchoolCountRow[]) {
    counts[row.prefecture_slug] = Number(row.school_count);
  }
  return counts;
}
