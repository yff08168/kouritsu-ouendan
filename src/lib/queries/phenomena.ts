import { createSupabaseServerClient } from "@/lib/supabase/server";
import { throwIfError, toImageRef, toPrefectureRef } from "@/lib/queries/shared";
import type { PhenomenonRow } from "@/types/database";
import type { PhenomenonSummary } from "@/types/app";

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
