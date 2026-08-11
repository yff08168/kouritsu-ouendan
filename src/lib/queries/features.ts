import { createSupabaseServerClient } from "@/lib/supabase/server";
import { throwIfError, toImageRef } from "@/lib/queries/shared";
import { FEATURE_CATEGORIES } from "@/lib/constants";
import type { FeatureDetailRow, FeatureRow } from "@/types/database";
import type { FeatureCategory, FeatureDetail, FeatureSummary } from "@/types/app";

const FEATURE_SUMMARY_SELECT = `
  id, slug, title, subtitle, category,
  image_url, image_credit, image_source_url
`;

const FEATURE_DETAIL_SELECT = `
  ${FEATURE_SUMMARY_SELECT},
  body, published_at, seo_title, seo_description
`;

function toFeatureSummary(row: FeatureRow): FeatureSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    category: row.category,
    image: toImageRef(row, row.title),
  };
}

/** トップページの特集枠。sort_order で並び順を編集できる。 */
export async function getLatestFeatures(limit = 4): Promise<FeatureSummary[]> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("features")
    .select(FEATURE_SUMMARY_SELECT)
    .order("sort_order", { ascending: true })
    .limit(limit);

  throwIfError(error, "特集の取得");

  return ((data ?? []) as unknown as FeatureRow[]).map(toFeatureSummary);
}

/** 特集一覧。カテゴリで絞り込める。 */
export async function getFeaturesList(
  category?: FeatureCategory,
): Promise<FeatureSummary[]> {
  const supabase = createSupabaseServerClient();

  let query = supabase.from("features").select(FEATURE_SUMMARY_SELECT);
  if (category) query = query.eq("category", category);

  const { data, error } = await query.order("sort_order", { ascending: true });

  throwIfError(error, "特集一覧の取得");

  return ((data ?? []) as unknown as FeatureRow[]).map(toFeatureSummary);
}

export async function getFeatureBySlug(
  slug: string,
): Promise<FeatureDetail | null> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("features")
    .select(FEATURE_DETAIL_SELECT)
    .eq("slug", slug)
    .maybeSingle();

  throwIfError(error, "特集の取得");
  if (!data) return null;

  const row = data as unknown as FeatureDetailRow;
  return {
    ...toFeatureSummary(row),
    body: row.body,
    publishedAt: row.published_at,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
  };
}

/** 同じカテゴリの他の特集 */
export async function getRelatedFeatures(
  currentSlug: string,
  category: FeatureCategory,
  limit = 3,
): Promise<FeatureSummary[]> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("features")
    .select(FEATURE_SUMMARY_SELECT)
    .eq("category", category)
    .neq("slug", currentSlug)
    .order("sort_order", { ascending: true })
    .limit(limit);

  throwIfError(error, "関連する特集の取得");

  return ((data ?? []) as unknown as FeatureRow[]).map(toFeatureSummary);
}

/** generateStaticParams 用 */
export async function getAllFeatureSlugs(): Promise<string[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("features").select("slug");
  throwIfError(error, "特集slugの取得");
  return ((data ?? []) as { slug: string }[]).map((row) => row.slug);
}

/** カテゴリごとの件数。一覧のタブに出す。 */
export async function getFeatureCountByCategory(): Promise<
  Record<FeatureCategory, number>
> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase.from("features").select("category");

  throwIfError(error, "特集カテゴリの集計");

  const counts = Object.fromEntries(
    (Object.keys(FEATURE_CATEGORIES) as FeatureCategory[]).map((key) => [
      key,
      0,
    ]),
  ) as Record<FeatureCategory, number>;

  for (const row of (data ?? []) as { category: FeatureCategory }[]) {
    counts[row.category] += 1;
  }
  return counts;
}
