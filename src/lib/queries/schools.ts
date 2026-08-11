import { createSupabaseServerClient } from "@/lib/supabase/server";
import { throwIfError, toImageRef, toPrefectureRef } from "@/lib/queries/shared";
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
