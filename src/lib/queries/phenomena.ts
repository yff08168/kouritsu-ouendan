import { createSupabaseServerClient } from "@/lib/supabase/server";
import { throwIfError, toImageRef, toPrefectureRef } from "@/lib/queries/shared";
import { PREFECTURE_BY_SLUG } from "@/lib/constants";
import type { PhenomenonDetailRow, PhenomenonRow } from "@/types/database";
import type {
  PhenomenonDetail,
  PhenomenonLevel,
  PhenomenonSummary,
} from "@/types/app";

const PHENOMENON_SUMMARY_SELECT = `
  id, slug, title, year, season, level, badge,
  image_url, image_credit, image_source_url,
  prefecture:prefectures ( name, slug ),
  phenomenon_schools ( role, schools ( name ) )
`;

/** 関連校のうち、主役（role = 'main'）の校名を1つ取り出す */
function pickMainSchoolName(row: PhenomenonRow): string | null {
  const links = row.phenomenon_schools ?? [];
  const main = links.find((link) => link.role === "main") ?? links[0];
  return main?.schools?.name ?? null;
}

function toPhenomenonSummary(row: PhenomenonRow): PhenomenonSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    year: row.year,
    season: row.season,
    level: row.level,
    schoolName: pickMainSchoolName(row),
    prefecture: toPrefectureRef(row.prefecture),
    badge: row.badge,
    image: toImageRef(row, row.title),
  };
}

const PHENOMENON_DETAIL_SELECT = `
  ${PHENOMENON_SUMMARY_SELECT},
  summary, body
`;

export type PhenomenonListParams = {
  year?: number;
  level?: PhenomenonLevel;
  page?: number;
  perPage?: number;
};

export type PhenomenonListResult = {
  phenomena: PhenomenonSummary[];
  total: number;
  page: number;
  totalPages: number;
};

/** 一覧。年・規模で絞り込める。 */
export async function getPhenomenaList({
  year,
  level,
  page = 1,
  perPage = 20,
}: PhenomenonListParams): Promise<PhenomenonListResult> {
  const supabase = createSupabaseServerClient();
  const currentPage = Math.max(1, Math.floor(page));
  const from = (currentPage - 1) * perPage;

  let query = supabase
    .from("phenomena")
    .select(PHENOMENON_SUMMARY_SELECT, { count: "exact" });

  if (year) query = query.eq("year", year);
  if (level) query = query.eq("level", level);

  const { data, error, count } = await query
    .order("year", { ascending: false })
    .order("season", { ascending: false })
    .range(from, from + perPage - 1);

  throwIfError(error, "公立旋風一覧の取得");

  const total = count ?? 0;
  return {
    phenomena: ((data ?? []) as unknown as PhenomenonRow[]).map(
      toPhenomenonSummary,
    ),
    total,
    page: currentPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

/** 年別タブに出す年の一覧（新しい順） */
export async function getPhenomenonYears(): Promise<number[]> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("phenomena")
    .select("year")
    .order("year", { ascending: false });

  throwIfError(error, "公立旋風の年の取得");

  const years = ((data ?? []) as { year: number }[]).map((row) => row.year);
  return [...new Set(years)];
}

/** slug から1件。見つからなければ null。 */
export async function getPhenomenonBySlug(
  slug: string,
): Promise<PhenomenonDetail | null> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("phenomena")
    .select(PHENOMENON_DETAIL_SELECT)
    .eq("slug", slug)
    .maybeSingle();

  throwIfError(error, "公立旋風の取得");
  if (!data) return null;

  const row = data as unknown as PhenomenonDetailRow;
  return {
    ...toPhenomenonSummary(row),
    summary: row.summary,
    body: row.body,
  };
}

/** generateStaticParams 用 */
export async function getAllPhenomenonSlugs(): Promise<string[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("phenomena").select("slug");
  throwIfError(error, "公立旋風slugの取得");
  return ((data ?? []) as { slug: string }[]).map((row) => row.slug);
}

/**
 * ある学校が関わった公立旋風。
 *
 * !inner + eq で中間テーブルを絞ると、埋め込みで返る phenomenon_schools も
 * その学校の行だけになる。結果として schoolName はその学校の名前になる。
 */
export async function getPhenomenaBySchool(
  schoolId: string,
  limit = 6,
): Promise<PhenomenonSummary[]> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("phenomena")
    .select(
      `
      id, slug, title, year, season, level, badge,
      image_url, image_credit, image_source_url,
      prefecture:prefectures ( name, slug ),
      phenomenon_schools!inner ( role, school_id, schools ( name ) )
    `,
    )
    .eq("phenomenon_schools.school_id", schoolId)
    .order("year", { ascending: false })
    .limit(limit);

  throwIfError(error, "関連する公立旋風の取得");

  return ((data ?? []) as unknown as PhenomenonRow[]).map(toPhenomenonSummary);
}

/** ある都道府県の公立旋風 */
export async function getPhenomenaByPrefecture(
  prefectureSlug: string,
  limit = 6,
): Promise<PhenomenonSummary[]> {
  const prefecture = PREFECTURE_BY_SLUG.get(prefectureSlug);
  if (!prefecture) return [];

  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("phenomena")
    .select(PHENOMENON_SUMMARY_SELECT)
    .eq("prefecture_id", prefecture.id)
    .order("year", { ascending: false })
    .limit(limit);

  throwIfError(error, "都道府県の公立旋風の取得");

  return ((data ?? []) as unknown as PhenomenonRow[]).map(toPhenomenonSummary);
}

/**
 * トップページの注目枠。
 * highlight_rank が入っているものだけを、その順で返す。
 */
export async function getHighlightedPhenomena(
  limit = 3,
): Promise<PhenomenonSummary[]> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("phenomena")
    .select(PHENOMENON_SUMMARY_SELECT)
    .not("highlight_rank", "is", null)
    .order("highlight_rank", { ascending: true })
    .limit(limit);

  throwIfError(error, "公立旋風の取得");

  return ((data ?? []) as unknown as PhenomenonRow[]).map(toPhenomenonSummary);
}
