import { createSupabaseServerClient } from "@/lib/supabase/server";
import { throwIfError } from "@/lib/queries/shared";

export type Prefecture = {
  id: number;
  name: string;
  fullName: string;
  nameKana: string;
  slug: string;
  region: string;
  description: string | null;
};

type PrefectureRow = {
  id: number;
  name: string;
  full_name: string;
  name_kana: string;
  slug: string;
  region: string;
  description: string | null;
};

const SELECT = "id, name, full_name, name_kana, slug, region, description";

/**
 * 都道府県1件。
 *
 * 定数（lib/constants.ts）にも47件のマスタがあるが、
 * こちらはDBから引く。正式名称や説明文はDBで編集できるようにしてあるため。
 * 定数側はURLの組み立てとタイル地図の配置にだけ使う。
 */
export async function getPrefectureBySlug(
  slug: string,
): Promise<Prefecture | null> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("prefectures")
    .select(SELECT)
    .eq("slug", slug)
    .maybeSingle();

  throwIfError(error, "都道府県の取得");
  if (!data) return null;

  const row = data as unknown as PrefectureRow;
  return {
    id: row.id,
    name: row.name,
    fullName: row.full_name,
    nameKana: row.name_kana,
    slug: row.slug,
    region: row.region,
    description: row.description,
  };
}
