import { createSupabaseServerClient } from "@/lib/supabase/server";
import { REGIONAL_ONLY_DISTRICTS } from "@/lib/constants";
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
  /*
    ★★**地方大会だけの地区（北海道・東京）はDBに行が無い**（2026-09-05 その2）。
    **学校もニュースも投票も紐づかない**ので、行を足す必要が無い。
    ★**定義は `REGIONAL_ONLY_DISTRICTS`**（`constants.ts` の説明を読むこと）。
  */
  if (!data) {
    const only = REGIONAL_ONLY_DISTRICTS.find((p) => p.slug === slug);
    return only ? { ...only, description: null } : null;
  }

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
