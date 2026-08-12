import { createSupabaseServerClient } from "@/lib/supabase/server";
import { escapeLikePattern, throwIfError, toImageRef, toPrefectureRef } from "@/lib/queries/shared";
import { PREFECTURE_BY_SLUG } from "@/lib/constants";
import type {
  ChampionshipRow,
  SchoolCountRow,
  SchoolDetailRow,
  SchoolRecordRow,
  SchoolRow,
} from "@/types/database";
import type {
  Championship,
  SchoolDetail,
  SchoolRecord,
  SchoolSummary,
} from "@/types/app";

const SCHOOL_SUMMARY_SELECT = `
  id, slug, name, official_name, city, establishment, school_kind,
  catchcopy, koshien_spring_count, koshien_summer_count, last_koshien_year,
  cheer_count,
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
    cheerCount: row.cheer_count ?? 0,
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

/** 詳細ページ用。一覧の列に、詳細でだけ使う列を足す。 */
const SCHOOL_DETAIL_SELECT = `
  ${SCHOOL_SUMMARY_SELECT},
  description, website_url, founded_year, name_aliases
`;

/** slug から学校1件を取得する。見つからなければ null（呼び出し側で404にする）。 */
export async function getSchoolBySlug(
  slug: string,
): Promise<SchoolDetail | null> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("schools")
    .select(SCHOOL_DETAIL_SELECT)
    .eq("slug", slug)
    .maybeSingle();

  throwIfError(error, "学校情報の取得");
  if (!data) return null;

  const row = data as unknown as SchoolDetailRow;
  return {
    ...toSchoolSummary(row),
    description: row.description,
    websiteUrl: row.website_url,
    foundedYear: row.founded_year,
    nameAliases: row.name_aliases ?? [],
  };
}

/**
 * 甲子園出場歴。新しい年が上。同じ年なら夏 → 春の順。
 *
 * season は列挙型 `('spring', 'summer', 'autumn')` で、Postgres は
 * 列挙型を**定義順**で比較する。降順にすると autumn → summer → spring に
 * なるので、これで夏が春より上に来る。
 */
export async function getSchoolChampionships(
  schoolId: string,
): Promise<Championship[]> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("school_championships")
    .select("id, year, season, result, wins, losses, note")
    .eq("school_id", schoolId)
    .order("year", { ascending: false })
    .order("season", { ascending: false });

  throwIfError(error, "甲子園出場歴の取得");

  return ((data ?? []) as unknown as ChampionshipRow[]).map((row) => ({
    id: row.id,
    year: row.year,
    season: row.season,
    result: row.result,
    wins: row.wins,
    losses: row.losses,
    note: row.note,
  }));
}

/** 最近の戦績。新しい年が上。 */
export async function getSchoolRecords(
  schoolId: string,
  limit = 12,
): Promise<SchoolRecord[]> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("school_records")
    .select("id, year, tournament_name, result, note")
    .eq("school_id", schoolId)
    .order("year", { ascending: false })
    .limit(limit);

  throwIfError(error, "戦績の取得");

  return ((data ?? []) as unknown as SchoolRecordRow[]).map((row) => ({
    id: row.id,
    year: row.year,
    tournamentName: row.tournament_name,
    result: row.result,
    note: row.note,
  }));
}

/** 同じ都道府県の他の学校。回遊導線に使う（要件23）。 */
export async function getRelatedSchools(
  prefectureSlug: string,
  excludeSchoolId: string,
  limit = 4,
): Promise<SchoolSummary[]> {
  const prefecture = PREFECTURE_BY_SLUG.get(prefectureSlug);
  if (!prefecture) return [];

  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("schools")
    .select(SCHOOL_SUMMARY_SELECT)
    .eq("prefecture_id", prefecture.id)
    .neq("id", excludeSchoolId)
    .order("name", { ascending: true })
    .limit(limit);

  throwIfError(error, "同じ都道府県の学校の取得");

  return ((data ?? []) as unknown as SchoolRow[]).map(toSchoolSummary);
}

/**
 * あるニュースに関連づけられた学校。
 * 記事から学校ページへの回遊導線に使う（要件34）。
 */
export async function getSchoolsByNews(
  newsId: string,
  limit = 6,
): Promise<SchoolSummary[]> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("schools")
    .select(`${SCHOOL_SUMMARY_SELECT}, news_schools!inner ( news_id )`)
    .eq("news_schools.news_id", newsId)
    .limit(limit);

  throwIfError(error, "関連する学校の取得");

  return ((data ?? []) as unknown as SchoolRow[]).map(toSchoolSummary);
}

/** ある公立旋風に登場する学校 */
export async function getSchoolsByPhenomenon(
  phenomenonId: string,
  limit = 6,
): Promise<SchoolSummary[]> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("schools")
    .select(`${SCHOOL_SUMMARY_SELECT}, phenomenon_schools!inner ( phenomenon_id )`)
    .eq("phenomenon_schools.phenomenon_id", phenomenonId)
    .limit(limit);

  throwIfError(error, "登場する学校の取得");

  return ((data ?? []) as unknown as SchoolRow[]).map(toSchoolSummary);
}

/** generateStaticParams 用。公開済みの学校slugを全部返す。 */
/** PostgREST が1回に返す上限 */
const SLUG_PAGE_SIZE = 1000;

/**
 * 全学校の slug。sitemap と generateStaticParams が使う。
 *
 * **必ずページングすること。** PostgREST は1回に1,000行しか返さないので、
 * 素の `select("slug")` だと3,505校のうち1,000校しか返らない。
 * それに気づかないまま公開すると、**sitemap から2,500校が丸ごと抜ける。**
 * （2026-08-12 に実際にこの状態だった）
 *
 * `slug` は unique なので、これで並べればページの境目で重複・欠落が起きない。
 */
export async function getAllSchoolSlugs(): Promise<string[]> {
  return fetchSchoolSlugs({ koshienOnly: false });
}

/**
 * sitemap に載せる学校の slug。
 *
 * **甲子園出場歴のある学校だけ。** 出場歴の無い約2,827校のページは
 * `noindex` にしているので（`app/schools/[slug]/page.tsx` の isIndexable）、
 * sitemap に載せると「載せているのに入れるなと言う」矛盾した指示になる。
 * 中身が入れば自動的に両方に現れる。
 */
export async function getIndexableSchoolSlugs(): Promise<string[]> {
  return fetchSchoolSlugs({ koshienOnly: true });
}

async function fetchSchoolSlugs({
  koshienOnly,
}: {
  koshienOnly: boolean;
}): Promise<string[]> {
  const supabase = createSupabaseServerClient();
  const slugs: string[] = [];

  for (let from = 0; ; from += SLUG_PAGE_SIZE) {
    let query = supabase
      .from("schools")
      .select("slug")
      .order("slug", { ascending: true })
      .range(from, from + SLUG_PAGE_SIZE - 1);

    if (koshienOnly) {
      query = query.or(
        "koshien_spring_count.gt.0,koshien_summer_count.gt.0",
      );
    }

    const { data, error } = await query;

    throwIfError(error, "学校slugの取得");

    const page = (data ?? []) as { slug: string }[];
    slugs.push(...page.map((row) => row.slug));
    if (page.length < SLUG_PAGE_SIZE) break;
  }

  return slugs;
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
