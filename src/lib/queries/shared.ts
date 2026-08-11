import type { PostgrestError } from "@supabase/supabase-js";
import type { ImageColumns, PrefectureJoin } from "@/types/database";
import type { ImageRef, PrefectureRef } from "@/types/app";

/**
 * 画像3点セットを ImageRef に変換する。
 * URLが無ければ null を返し、呼び出し側はフォールバック表示に切り替える。
 */
export function toImageRef(row: ImageColumns, alt?: string): ImageRef | null {
  if (!row.image_url) return null;
  return {
    url: row.image_url,
    credit: row.image_credit ?? undefined,
    sourceUrl: row.image_source_url ?? undefined,
    alt,
  };
}

export function toPrefectureRef(join: PrefectureJoin): PrefectureRef | null {
  if (!join) return null;
  return { name: join.name, slug: join.slug };
}

/**
 * Supabase のエラーをそのまま投げる。
 * 握りつぶすと「データが0件」と「取得に失敗」の区別がつかなくなるため、
 * 必ず例外にして Next.js のエラー画面に出す。
 */
export function throwIfError(
  error: PostgrestError | null,
  context: string,
): void {
  if (!error) return;
  throw new Error(`${context}に失敗しました: ${error.message}`);
}
