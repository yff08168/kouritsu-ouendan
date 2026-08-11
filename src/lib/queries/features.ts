import { createSupabaseServerClient } from "@/lib/supabase/server";
import { throwIfError, toImageRef } from "@/lib/queries/shared";
import type { FeatureRow } from "@/types/database";
import type { FeatureSummary } from "@/types/app";

const FEATURE_SUMMARY_SELECT = `
  id, slug, title, subtitle, category,
  image_url, image_credit, image_source_url
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
