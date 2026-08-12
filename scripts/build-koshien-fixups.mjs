/**
 * school_championships に残っている「成績不明（result が null）」の行を洗い出し、
 * 解析し直した data/koshien-appearances.json の値で埋める UPDATE 文を作る。
 *
 *   node --env-file=.env.local scripts/build-koshien-fixups.mjs
 *   node --env-file=.env.local scripts/build-koshien-fixups.mjs --write
 *
 * **このプロジェクトには service_role キーが無い。** 書き込みはできないので、
 * ここではSQLを書き出すだけにして、実行は人が Supabase の SQL Editor で行う。
 * 読み取りは anon キー。RLS で**公開済みの学校の行だけ**が見える。
 * サイトに出るのはその範囲なので埋めたい対象とは一致するが、
 * **SQL Editor で数えた件数とは合わない**（未公開の学校の行が見えないため）。
 * 総数がずれていても異常ではない。合わせるべきは「成績が入っていない行」の数。
 *
 * 埋める値の出どころは koshien.sql と同じ（Wikipedia の大会別記事）。
 * 突き合わせの手順も match-koshien.mjs と同じものを使い回している。
 *
 * ------------------------------------------------------------------
 * 開催中の大会は触らない
 *
 * まだ終わっていない大会は「まだ決まっていない」だけであって、欠損ではない。
 * ここで初戦敗退などと書くと事実に反する。**開催中の大会は除外する。**
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadSchools, loadSuccessors, candidates } from "./match-koshien.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const IN = path.join(ROOT, "data", "koshien-appearances.json");
const OUT = path.join(ROOT, "supabase", "koshien_fixups.sql");

const WRITE = process.argv.includes("--write");

/**
 * 触らない大会。開催中で成績が確定していない。
 * 終わったら消して作り直すこと。
 */
const IN_PROGRESS = [{ year: 2026, season: "summer" }];
const isInProgress = (year, season) =>
  IN_PROGRESS.some((t) => t.year === year && t.season === season);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("環境変数が読めていません。--env-file=.env.local を付けて実行してください。");
  process.exit(1);
}
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * PostgREST は1回に1,000行しか返さない。
 * **並び順を一意に決めてからページングすること。** 順序が曖昧なままだと
 * ページの境目で行が重複したり抜けたりする。
 */
async function fetchAllChampionships() {
  const rows = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase
      .from("school_championships")
      .select("year, season, result, wins, losses, note, schools!inner(slug, name, official_name)")
      .order("school_id", { ascending: true })
      .order("year", { ascending: true })
      .order("season", { ascending: true })
      .range(from, from + size - 1);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < size) break;
  }
  return rows;
}

/** 解析し直した出場歴を slug|year|season で引けるようにする */
function buildParsedIndex() {
  const data = JSON.parse(readFileSync(IN, "utf8"));
  const schools = loadSchools();
  const successors = loadSuccessors();

  const byOfficial = new Map();
  for (const s of schools) {
    if (!byOfficial.has(s.officialName)) byOfficial.set(s.officialName, s);
  }

  const index = new Map();
  for (const t of data.tournaments) {
    if (!t.year) continue;
    for (const sc of t.schools) {
      if (!sc.article) continue;
      const article = successors.get(sc.article) ?? sc.article;
      let hit = null;
      for (const c of candidates(article)) {
        if (byOfficial.has(c)) {
          hit = byOfficial.get(c);
          break;
        }
      }
      if (!hit) continue;
      index.set(`${hit.slug}|${t.year}|${t.season}`, {
        result: sc.result,
        wins: sc.wins,
        losses: sc.losses,
        // 統廃合前の校名で出場した記録は、どの校名で出たのかを残す
        note: article !== sc.article ? `${sc.article}として出場` : null,
      });
    }
  }
  return index;
}

// VALUES の列は型が推論できないと coalesce や比較で落ちる。null には型を付ける。
const q = (v) => (v == null ? "null::text" : `'${String(v).replace(/'/g, "''")}'`);
const n = (v) => (v == null ? "null::smallint" : String(v));
const seasonLabel = (s) => (s === "summer" ? "夏" : "春");

async function main() {
  const parsed = buildParsedIndex();
  const all = await fetchAllChampionships();
  const missing = all.filter((r) => r.result === null);

  console.log(`出場歴の総数        : ${all.length}`);
  console.log(`うち成績が入っていない: ${missing.length}`);

  const fillable = [];
  const skippedInProgress = [];
  const unresolved = [];

  for (const r of missing) {
    if (isInProgress(r.year, r.season)) {
      skippedInProgress.push(r);
      continue;
    }
    const got = parsed.get(`${r.schools.slug}|${r.year}|${r.season}`);
    if (!got || got.result === null) {
      unresolved.push(r);
      continue;
    }
    fillable.push({ ...r, ...got });
  }

  console.log("");
  console.log(`埋められる          : ${fillable.length}`);
  console.log(`開催中のため触らない: ${skippedInProgress.length}`);
  console.log(`まだ埋められない    : ${unresolved.length}`);

  if (skippedInProgress.length > 0) {
    console.log("");
    console.log("--- 開催中のため触らない ---");
    for (const r of skippedInProgress) {
      console.log(`  ${r.year}年${seasonLabel(r.season)} ${r.schools.name}`);
    }
  }
  if (unresolved.length > 0) {
    console.log("");
    console.log("--- まだ埋められない（解析でも成績が決まらなかった）---");
    for (const r of unresolved) {
      console.log(`  ${r.year}年${seasonLabel(r.season)} ${r.schools.name}（${r.schools.official_name}）`);
    }
  }

  // 数えた勝敗と到達段階の食い違いを最後にもう一度見る。
  // 優勝校以外の敗戦は1（初期の敗者復活戦と出場辞退を除く）。
  const suspicious = fillable.filter((r) => {
    if (r.result === "出場辞退") return false;
    if (r.year <= 1922) return false; // 敗者復活戦のあった時期
    const expected = r.result === "優勝" ? 0 : 1;
    return r.losses !== expected;
  });
  console.log("");
  console.log(`自己検証（勝敗が到達段階と合わない）: ${suspicious.length} 件`);
  for (const r of suspicious) {
    console.log(`  ${r.year}年${seasonLabel(r.season)} ${r.schools.name}: ${r.result} なのに ${r.wins}勝${r.losses}敗`);
  }

  if (!WRITE) {
    console.log("");
    console.log("SQLを書き出すには --write を付けて実行する。");
    return;
  }

  const sorted = fillable.sort(
    (a, b) =>
      a.year - b.year ||
      a.season.localeCompare(b.season) ||
      a.schools.slug.localeCompare(b.schools.slug),
  );

  // 学校名は行末の -- コメントで添える。**カンマは -- より前に置くこと。**
  // 後ろに回すとカンマごとコメントになり、SQLが壊れる。
  const lines = sorted.map((r, i) => {
    const tuple =
      `  ('${r.schools.slug}', ${r.year}, '${r.season}', ` +
      `${q(r.result)}, ${n(r.wins)}, ${n(r.losses)}, ${q(r.note)})`;
    const comma = i < sorted.length - 1 ? "," : "";
    return `${tuple}${comma}  -- ${r.schools.name} ${r.year}年${seasonLabel(r.season)}`;
  });

  const sql = `-- ============================================================
-- 甲子園出場歴の成績を埋める（school_championships.result が null の行）
--
-- このファイルは scripts/build-koshien-fixups.mjs が生成する。直接編集しない。
-- 生成日: ${new Date().toISOString().slice(0, 10)}
--
-- 出典: ja.wikipedia.org の大会別記事（CC BY-SA 4.0）。事実データのみ抽出。
--
-- なぜ null が残っていたか（取り込みスクリプト側は修正済み）:
--   ・1972年春（第44回選抜）は得点の区切りが全角ハイフン「－」で、
--     半角ハイフンしか見ていなかったため、この大会の試合を1件も読めて
--     いなかった（出場25校が丸ごと成績不明。うち公立17校がこの表にある）。
--   ・1915〜1922年の大会は「日付 校名 得点 - 得点 校名」と日付が行頭に付き、
--     また敗者復活戦があって1校が2敗することがあった。
--   ・1969年夏の決勝は延長18回0-0の引き分け再試合。引き分けのほうだけを見て
--     決勝が取れず、三沢・松山商とも成績不明になっていた。
--   ・{{Efn}} や複数行の <ref> が「|」を含み、トーナメント表の列がずれていた。
--   ・同じ大会に同名校（1964年春の和歌山海南・徳島海南）がいると取り違えていた。
--
-- 「出場辞退」は、出場は記録されているが試合をしていない（または
-- 途中で辞退した）もの。Wikipediaの記事に明記されているものだけを入れている。
--
-- 実行後に必ず走らせること:
--   select public.recalc_school_koshien_counts();
-- ============================================================

update public.school_championships as c
set
  result = v.result,
  wins   = v.wins,
  losses = v.losses,
  note   = coalesce(v.note, c.note)
from (values
${lines.join("\n")}
) as v(slug, year, season, result, wins, losses, note)
join public.schools s on s.slug = v.slug
where c.school_id = s.id
  and c.year      = v.year
  and c.season    = v.season::public.season
  -- **すでに入っている成績は上書きしない。** 埋めるのは空欄だけ。
  and c.result is null;

select public.recalc_school_koshien_counts();
`;

  writeFileSync(OUT, sql, "utf8");
  console.log("");
  console.log(`書き出し: ${path.relative(ROOT, OUT)}（${lines.length} 件）`);
}

await main();
