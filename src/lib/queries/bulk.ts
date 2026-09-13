import type { PostgrestError } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

import { throwIfError } from "@/lib/queries/shared";

/**
 * ★★★**学校ページ1枚ごとに問い合わせない。表ごとに1回だけ読む**（2026-09-10）。
 *
 * ------------------------------------------------------------------
 * ★★ なぜ要るか（**Supabase が転送量の上限で止められた**）
 *
 * **学校ページは約3,500枚**あり、1枚を作るのに**7回**問い合わせていた
 * （学校本体・甲子園出場歴・戦績・ニュース・公立旋風・近隣校・応援メッセージ）。
 * ★**1回のビルドで約24,500回。** 訪問者がほとんどいなくても、
 * **作り直すたびにこれだけ読む。**
 *
 * ★★**同じ手当てが 2026-09-04 に一度入っている**（`fetchSchoolNameRows` と
 * `relatedRows`）。**あれと同じ形をほかの表にも広げたもの。**
 *
 * ------------------------------------------------------------------
 * ★★★**憶えておく時間は「1回のビルドをまたげれば足りる」。**
 *
 * ビルドは20分ほどなので、**5分持つだけで3,500回が4回になる。**
 * **長くするほど良いわけではない** —— 応援メッセージのように
 * **承認したらすぐ出したいものは短く**しておく。
 *
 * ★**失敗は持ち越さない**（次の呼び出しでもう一度取りに行く）。
 */

/** ★**PostgREST は1回に1,000行しか返さない。** 必ずページングすること */
export const BULK_PAGE_SIZE = 1000;

type Page = {
  data: unknown[] | null;
  error: PostgrestError | null;
};

/**
 * 表を丸ごと読む（ページング）。
 *
 * ★★**並び順を一意に決めてから取ること** —— 並びが不定だと
 * **ページの境目で行が重複したり抜けたりする**（AGENTS の「出場歴はページングで取る」）。
 * 呼ぶ側が `.order()` を必ず付ける。
 */
export async function fetchAllRows<Row>(
  label: string,
  page: (from: number, to: number) => PromiseLike<Page>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += BULK_PAGE_SIZE) {
    const { data, error } = await page(from, from + BULK_PAGE_SIZE - 1);
    throwIfError(error, label);
    const got = (data ?? []) as Row[];
    rows.push(...got);
    if (got.length < BULK_PAGE_SIZE) break;
  }
  return rows;
}

/**
 * モジュールに1つだけ持つ憶え書き。
 *
 * ★**`unstable_cache` と二重に持つのはわざと** ——
 * あちらは Next のデータキャッシュ（**これが無いと、開かれてから作るページが
 * 丸ごとキャッシュされなくなる**）、こちらは**同じ実行の中で何度も呼ばれたとき**用。
 *
 * ------------------------------------------------------------------
 * ★★★**`load` は JSON にできる値だけを返すこと**（2026-09-13。**本番で500が出た**）。
 *
 * **Next はデータキャッシュに `JSON.stringify` した文字列で持つ**
 * （`next/dist/server/web/spec-extension/unstable-cache.js` の `cacheNewResult`）。
 * ★**`Map` は `{}` になって戻ってくる** —— `(intermediate value).get is not a function`。
 * ★★**最初の1回は取ってきた値そのものが返るので、動いてしまう。**
 * **壊れるのは「キャッシュから読んだとき」だけ**（別のインスタンス・憶え書きの期限切れ）で、
 * **手元で1回開いただけでは気づけない**（学校ページと対戦成績ページが一部だけ500になった）。
 * ★**だから `load` は行の配列を返し、`Map` に組むのは `shape`（キャッシュの外）でやる。**
 *
 * ★★**1件が2MBを超えるとデータキャッシュに載らない**（Next が警告を出して保存をやめる。
 * `next/dist/server/lib/incremental-cache/index.js`）。
 * **載らないとインスタンスが替わるたびに表を丸ごと読み直す**ので、**大きい表はここに通さない**
 * （学校本体は3,505行で2.2MBあるので、slug ごとに引いている）。
 */
export function bulkLoader<Raw, T = Raw>(
  name: string,
  ttlMs: number,
  load: () => Promise<Raw>,
  shape: (raw: Raw) => T = (raw) => raw as unknown as T,
): () => Promise<T> {
  // ★**鍵に "rows" を足してある** —— `{}` を書き込んだ前の版のキャッシュを読まないため
  const cached = unstable_cache(load, [name, "rows"], {
    revalidate: Math.round(ttlMs / 1000),
    tags: [name],
  });
  let memo: { at: number; value: Promise<T> } | null = null;
  return () => {
    const now = Date.now();
    if (!memo || now - memo.at > ttlMs) {
      // ★**失敗を持ち越さない**（次に呼ばれたらもう一度取りに行く）
      memo = {
        at: now,
        value: cached()
          .then(shape)
          .catch((e) => {
            memo = null;
            throw e;
          }),
      };
    }
    return memo.value;
  };
}

/** 学校ごとにまとめる。★**行の並びは呼ぶ側が決めた順のまま**（安定） */
export function groupBySchool<Row>(
  rows: readonly Row[],
  schoolIdOf: (row: Row) => string | null | undefined,
): Map<string, Row[]> {
  const out = new Map<string, Row[]>();
  for (const row of rows) {
    const id = schoolIdOf(row);
    if (!id) continue;
    const list = out.get(id);
    if (list) list.push(row);
    else out.set(id, [row]);
  }
  return out;
}

/** ★**学校マスタのように滅多に変わらないもの**（文科省の一覧から作り直すときだけ） */
export const MASTER_TTL_MS = 60 * 60 * 1000;
/** ★**人が編集するもの**。1回のビルドをまたげれば足りるので短くてよい */
export const EDITORIAL_TTL_MS = 5 * 60 * 1000;
