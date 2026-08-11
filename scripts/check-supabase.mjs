/**
 * Supabase への接続とRLSの効きを確認する。
 *
 *   node --env-file=.env.local scripts/check-supabase.mjs
 *
 * anonキーで叩くので、ここで見える範囲＝サイト訪問者に見える範囲。
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("環境変数が読めていません。--env-file=.env.local を付けて実行してください。");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failed = 0;

/** 件数を数えて期待値と比べる */
async function expectCount(label, table, expected) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) {
    failed += 1;
    console.log(`❌ ${label}: ${error.message}`);
    return;
  }
  const ok = count === expected;
  if (!ok) failed += 1;
  console.log(`${ok ? "✅" : "❌"} ${label}: ${count} 件（期待 ${expected}）`);
}

/** anonキーでは読めないはずのものを確認する */
async function expectBlocked(label, table) {
  const { data, error } = await supabase.from(table).select("*").limit(1);
  const blocked = error !== null || (data?.length ?? 0) === 0;
  if (!blocked) failed += 1;
  console.log(`${blocked ? "✅" : "❌"} ${label}: 読み取れない（期待どおり）`);
}

console.log(`接続先: ${url}\n`);

console.log("--- 公開データが読めるか ---");
await expectCount("都道府県", "prefectures", 47);
await expectCount("学校", "schools", 10);
await expectCount("公立旋風", "phenomena", 4);
await expectCount("特集", "features", 4);
await expectCount("甲子園出場歴", "school_championships", 18);

console.log("\n--- RLSが効いているか ---");
// seed には7件入れたが、1件は draft。anonキーでは6件しか見えないはず。
await expectCount("ニュース（下書き1件が除外される）", "news", 6);
await expectBlocked("news_sources（運用情報）", "news_sources");

console.log("\n--- 書き込みが拒否されるか ---");
const { error: insertError } = await supabase
  .from("features")
  .insert({ slug: "should-fail", title: "書き込めてはいけない", category: "guide" });
if (insertError) {
  console.log(`✅ 書き込み拒否: ${insertError.message}`);
} else {
  failed += 1;
  console.log("❌ 書き込めてしまった。RLSを見直すこと。");
}

console.log("\n--- 実データのサンプル ---");
const { data: schools } = await supabase
  .from("schools")
  .select("name, establishment, school_kind, koshien_spring_count, koshien_summer_count, last_koshien_year")
  .order("koshien_summer_count", { ascending: false })
  .limit(4);
console.table(schools);

process.exit(failed > 0 ? 1 : 0);
