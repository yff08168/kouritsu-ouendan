/**
 * 公立旋風の新しい記事から、**Supabase に流す SQL** と **勝ち上がりの JSON** を作る。
 *
 *   node --env-file=.env.local scripts/build-senpu.mjs
 *
 * 入力   data/senpu/*.mjs（骨組み）＋ data/senpu/text/*.mjs（文章）
 * 出力   supabase/senpu_seed_koshien_add.sql   … 甲子園の記事（level = 'koshien'）
 *        supabase/senpu_seed_chihou_add.sql    … 地方大会の記事（level = 'prefectural'）
 *        src/lib/data/senpu-runs.json          … 勝ち上がり（getTournamentRun が読む）
 *
 * ★ このリポジトリは service_role キーを持たない。**SQL は人が SQL Editor に貼って流す**
 *   （`senpu_seed.sql` と同じ運用）。スクリプトが本番DBに書くことはない。
 * ★ 何度流しても安全（slug で重ね書き）。本文まで上書きするので、
 *   **正本はこのリポジトリの `data/senpu/`**。DB で手直ししたぶんは次に流すと消える。
 * ★ 勝ち上がりは DB ではなくコードに持つ（`tournament-runs.ts` と同じ理由）。
 *   生成した JSON は `getTournamentRun` が手書きの勝ち上がりのあとに引く。
 * ★ 流す前に必ず `node --env-file=.env.local scripts/verify-senpu.mjs` を通すこと。
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./senpu/lib.mjs";
import { buildKoshienRun, buildRegionalRun, fetchSchools, loadDefinitions } from "./senpu/model.mjs";

const defs = await loadDefinitions();

const missing = defs.filter((d) => !d.__hasText || !d.title || !d.summary || !d.body);
if (missing.length && !process.argv.includes("--allow-missing")) {
  console.error(`文章が無い記事が${missing.length}件あります（--allow-missing で飛ばして作る）:`);
  for (const d of missing) console.error(`  ${d.slug}`);
  process.exit(1);
}
const ready = defs.filter((d) => d.__hasText && d.title && d.summary && d.body);

const schools = await fetchSchools(ready.flatMap((d) => [d.school, ...(d.extraSchools ?? [])]));

// ------------------------------------------------------------------
// 勝ち上がり
// ------------------------------------------------------------------
const runs = [];
for (const d of ready) {
  if (!d.run || !["koshien", "regional"].includes(d.run.kind)) continue; // 表・大会の記事は勝ち上がりを持たない
  const school = schools.get(d.school);
  const built = d.run.kind === "koshien" ? buildKoshienRun(d, school) : buildRegionalRun(d, school);
  runs.push(built.run);
}
runs.sort((a, b) => a.phenomenonSlug.localeCompare(b.phenomenonSlug));
const runsFile = path.join(ROOT, "src", "lib", "data", "senpu-runs.json");
fs.writeFileSync(runsFile, JSON.stringify(runs, null, 2) + "\n");

// ------------------------------------------------------------------
// SQL
// ------------------------------------------------------------------
/** Postgres の E'…' 文字列にする */
const sqlText = (s) =>
  "E'" + s.replace(/\\/g, "\\\\").replace(/'/g, "''").replace(/\r?\n/g, "\\n") + "'";
const sqlPlain = (s) => "'" + s.replace(/'/g, "''") + "'";

const FILES = {
  koshien: {
    file: "senpu_seed_koshien_add.sql",
    heading: "公立旋風（甲子園）の追加分",
    note: "甲子園でベスト4以上に進んだ公立校（1990年以降）。",
  },
  prefectural: {
    file: "senpu_seed_chihou_add.sql",
    heading: "公立旋風（地方大会）の追加分",
    note: "神奈川・東京・大阪・愛知などの激戦区を中心にした、都道府県大会での公立校の記録。",
  },
};

for (const [level, meta] of Object.entries(FILES)) {
  const list = ready
    .filter((d) => d.level === level)
    .sort((a, b) => b.year - a.year || (a.season === b.season ? 0 : a.season === "summer" ? -1 : 1) || a.slug.localeCompare(b.slug));
  if (!list.length) continue;

  const values = list
    .map((d) => {
      // prefecture: null … 複数の県にまたがる記事（大会そのものを主題にしたもの）は県を付けない
      const prefSlug = d.prefecture === undefined ? schools.get(d.school).prefecture?.slug : d.prefecture;
      if (prefSlug === undefined) throw new Error(`${d.slug}: 都道府県が決まりません`);
      const prefSql = prefSlug === null ? "null" : `(select id from public.prefectures where slug = ${sqlPlain(prefSlug)})`;
      return (
        `  (${sqlPlain(d.slug)},\n` +
        `   ${sqlPlain(d.title)},\n` +
        `   ${d.year}, ${sqlPlain(d.season)}, ${sqlPlain(d.level)},\n` +
        `   ${prefSql}, ${sqlPlain(d.badge)},\n` +
        `   ${sqlPlain(d.summary)},\n` +
        `   ${sqlText(d.body)},\n` +
        `   null, 'published', now())`
      );
    })
    .join(",\n\n");

  const links = list
    .flatMap((d) => [d.school, ...(d.extraSchools ?? [])].map((s) => `  (${sqlPlain(d.slug)}, ${sqlPlain(s)})`))
    .join(",\n");

  const slugs = list.map((d) => sqlPlain(d.slug)).join(", ");

  const sql = `-- ============================================================
-- ${meta.heading}（${list.length}件）
--
-- ${meta.note}
-- **このファイルは scripts/build-senpu.mjs が作る生成物。直接編集しない。**
-- 正本は data/senpu/（骨組み）と data/senpu/text/（文章）。直すならそちらを直して作り直す。
--
-- 勝ち上がり（1回戦〜決勝のスコア）はDBではなくコードに持っている。
--   src/lib/data/senpu-runs.json（同じスクリプトが作る）
--
-- 何度流しても安全（slug で重ね書き）。本文まで上書きするので、
-- DB の管理画面で手直ししたぶんは次に流すと消える。
-- **タイトルに年・季節を入れていない**（一覧カードも詳細ページも年と季節を別に前置きするため）。
-- highlight_rank は入れない（null）。トップの注目枠を押しのけない。
--
-- Supabase の SQL Editor に貼って実行する。
-- ============================================================

begin;

insert into public.phenomena
  (slug, title, year, season, level, prefecture_id, badge, summary, body,
   highlight_rank, status, published_at)
values
${values}
on conflict (slug) do update set
  title   = excluded.title,
  summary = excluded.summary,
  body    = excluded.body,
  badge   = excluded.badge;

-- ------------------------------------------------------------
-- 記録 ⇄ 学校のひもづけ（role = 'main' だけ）
--
-- 対戦相手（role='opponent'）は入れない。私学を「破られた相手」として
-- 一覧に並べるのは、このサイトの立ち位置として避けたいため。
-- 学校が未登録なら何も入らない（エラーにはしない）。
-- ------------------------------------------------------------
insert into public.phenomenon_schools (phenomenon_id, school_id, role)
select p.id, s.id, 'main'
from (values
${links}
) as v (phenomenon_slug, school_slug)
join public.phenomena p on p.slug = v.phenomenon_slug
join public.schools    s on s.slug = v.school_slug
on conflict (phenomenon_id, school_id) do nothing;

commit;


-- 確認用。${list.length}行が返り、ひもづけ学校数がどれも1以上なら成功。
select ph.slug,
       ph.year,
       ph.badge,
       count(ps.school_id) as linked_schools
from public.phenomena ph
left join public.phenomenon_schools ps on ps.phenomenon_id = ph.id
where ph.slug in (${slugs})
group by ph.slug, ph.year, ph.badge
order by ph.year desc, ph.slug;
`;
  fs.writeFileSync(path.join(ROOT, "supabase", meta.file), sql);
  console.log(`${meta.file}: ${list.length}件`);
}

console.log(`senpu-runs.json: ${runs.length}件（勝ち上がり）`);
console.log(`記事 ${ready.length}件 / 文章待ち ${missing.length}件`);
