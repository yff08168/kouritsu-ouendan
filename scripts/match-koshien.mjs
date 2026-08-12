/**
 * data/koshien-appearances.json の出場校を学校マスタに突き合わせ、
 * supabase/koshien.sql（school_championships のINSERT文）を作る。
 *
 *   node scripts/match-koshien.mjs              … 照合結果の報告だけ
 *   node scripts/match-koshien.mjs --write      … SQLも書き出す
 *   node scripts/match-koshien.mjs --pref chiba … 特定の地区だけ（パイロット用）
 *
 * 学校マスタは supabase/schools_*.sql から読む。あれが文科省データから作った
 * 正本で、DBに入っているものと同じだから。DBには anon キーでしか触れないので
 * SQLファイルを正とする。
 *
 * ------------------------------------------------------------------
 * 照合の考え方
 *
 * Wikipedia の代表校はウィキリンクで、リンク先が学校記事の正式名称になっている。
 * これを schools.official_name と突き合わせる。表示名（「銚子商」）ではなく
 * 正式名称（「千葉県立銚子商業高等学校」）で照合するので取り違えが起きにくい。
 *
 * 一致しないときに補うのは次の2つだけ。**推測で結び付けない。**
 *   1. 中高一貫校の記事名  「千葉県立千葉中学校・高等学校」→「千葉県立千葉高等学校」
 *   2. 高専の記事名        「阿南工業高等専門学校」はそのまま一致する
 *
 * 私立は学校マスタに無いので一致しなくて当然。これを「照合失敗」として
 * 報告すると本当の失敗が埋もれるため、**校名に設置者が入っているかどうかで
 * 公立らしさを見て、公立らしいのに一致しなかったものだけを問題として挙げる。**
 * AGENTS.md の「照合できなかったものは両方向とも報告する」に従い、
 * 逆向き（マスタにあるが出場歴が1件も無い学校）は数だけ出す。
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SUPABASE_DIR = path.join(ROOT, "supabase");
const IN = path.join(ROOT, "data", "koshien-appearances.json");
const SUCCESSOR = path.join(ROOT, "data", "school-successor.json");
const OUT = path.join(SUPABASE_DIR, "koshien.sql");

/**
 * 統廃合・改称で学校マスタに無くなった校名 → 現存校。
 * scripts/resolve-defunct-schools.mjs が Wikipedia から作る。
 * **confirmed: true のものだけ使う。** 候補が割れているものは人の確認待ち。
 */
export function loadSuccessors() {
  if (!existsSync(SUCCESSOR)) return new Map();
  const data = JSON.parse(readFileSync(SUCCESSOR, "utf8"));
  const map = new Map();
  for (const e of data.schools ?? []) {
    if (e.confirmed && e.to) map.set(e.from, e.to);
  }
  return map;
}

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const prefIdx = args.indexOf("--pref");
const ONLY_PREF = prefIdx >= 0 ? args[prefIdx + 1] : null;
const dumpIdx = args.indexOf("--dump-unmatched");
const DUMP = dumpIdx >= 0 ? args[dumpIdx + 1] : null;

/**
 * 公立らしさ。これが真なのに照合できなければ、こちらの取りこぼしを疑う。
 * **「大学附属」を入れてはいけない。** 龍谷大学付属平安・東海大学付属相模など
 * 私立の常連校がすべて「公立らしい」と誤判定され、本当の取りこぼしが埋もれる。
 */
const PUBLIC_MARKERS = /(県立|府立|都立|道立|市立|町立|村立|組合立|高等専門学校)/;

/** 学校マスタを supabase/schools_*.sql から読む */
export function loadSchools() {
  const rows = [];
  for (const f of readdirSync(SUPABASE_DIR)) {
    if (!f.startsWith("schools_") || !f.endsWith(".sql")) continue;
    const text = readFileSync(path.join(SUPABASE_DIR, f), "utf8");
    // ('slug', 'name', 'official_name', (select ... where slug = 'pref'), 'city', ...
    const re =
      /^\s*\('([^']+)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*\(select id from public\.prefectures where slug = '([^']+)'\)/gm;
    let m;
    while ((m = re.exec(text)) !== null) {
      rows.push({
        slug: m[1],
        name: m[2].replace(/''/g, "'"),
        officialName: m[3].replace(/''/g, "'"),
        prefSlug: m[4],
      });
    }
  }
  return rows;
}

/** 記事名から、学校マスタの official_name になり得る形を列挙する */
export function candidates(article) {
  const set = new Set();
  const a = article.trim();
  set.add(a);

  // 中高一貫「○○中学校・高等学校」→「○○高等学校」
  set.add(a.replace(/中学校・高等学校$/, "高等学校"));
  // 「○○高等学校・○○中学校」の並び違い
  set.add(a.replace(/高等学校・[^・]*中学校$/, "高等学校"));
  // 「○○中学校・○○高等学校」（校名が繰り返される形）
  const m = a.match(/^(.*?)中学校・(.*高等学校)$/);
  if (m) set.add(m[2]);
  // 曖昧さ回避の括弧「中京高等学校 (岐阜県)」
  set.add(a.replace(/\s*[（(][^）)]*[）)]\s*$/, ""));

  // 設置者名の有無の揺れ。文科省データは「高知商業高等学校」だが
  // Wikipedia は「高知市立高知商業高等学校」。市町村立で起きる。
  // 残りが完全一致したときだけ採るので、外す方向でも取り違えは起きにくい。
  for (const c of [...set]) {
    const m = c.match(/^.+?[市区町村]立(.+高等学校)$/);
    if (m) set.add(m[1]);
  }

  // 「鹿児島市立鹿児島玉龍中学校・鹿児島玉龍高等学校」のように
  // 中学校名と高校名が並ぶ形。高等学校の側だけを取る。
  for (const c of [...set]) {
    const m = c.match(/中学校・(.+高等学校)$/);
    if (m) set.add(m[1]);
  }

  // 併設中学校のぶんを落とすと設置者名まで落ちてしまう形。
  //   鹿児島市立鹿児島玉龍中学校・鹿児島玉龍高等学校 → 鹿児島市立鹿児島玉龍高等学校
  //   佐賀県立香楠中学校・鳥栖高等学校               → 佐賀県立鳥栖高等学校
  //   埼玉県立伊奈学園中学校・伊奈学園総合高等学校   → 埼玉県立伊奈学園総合高等学校
  for (const c of [...set]) {
    const m = c.match(/^(.*?[都道府県市区町村]立)(?:.+?)中学校・(.+高等学校)$/);
    if (m) set.add(m[1] + m[2]);
  }

  // 「沼津市立沼津高等学校・中等部」のように後ろに併設校が付く形
  for (const c of [...set]) {
    set.add(c.replace(/(高等学校)・(?:中等部|初等部|中学校|附属中学校).*$/, "$1"));
  }

  return [...set].filter(Boolean);
}

function main() {
  const data = JSON.parse(readFileSync(IN, "utf8"));
  const schools = loadSchools();
  const successors = loadSuccessors();

  const byOfficial = new Map();
  for (const s of schools) {
    if (!byOfficial.has(s.officialName)) byOfficial.set(s.officialName, s);
  }

  /** slug → 出場歴の配列 */
  const appearances = new Map();
  /** 記事名 → 出てきた回数（照合できなかったもの） */
  const missed = new Map();

  let totalEntries = 0;

  for (const t of data.tournaments) {
    if (!t.year) continue;
    for (const sc of t.schools) {
      totalEntries++;
      if (!sc.article) {
        const key = `（リンク無し）${sc.short}`;
        missed.set(key, (missed.get(key) ?? 0) + 1);
        continue;
      }
      // 統廃合で消えた校名は現存校に読み替える（出場歴は現存校に引き継ぐ方針）
      const article = successors.get(sc.article) ?? sc.article;
      let hit = null;
      for (const c of candidates(article)) {
        if (byOfficial.has(c)) {
          hit = byOfficial.get(c);
          break;
        }
      }
      if (!hit) {
        missed.set(sc.article, (missed.get(sc.article) ?? 0) + 1);
        continue;
      }
      if (ONLY_PREF && hit.prefSlug !== ONLY_PREF) continue;
      if (!appearances.has(hit.slug)) appearances.set(hit.slug, []);
      appearances.get(hit.slug).push({
        year: t.year,
        season: t.season,
        result: sc.result,
        wins: sc.wins,
        losses: sc.losses,
        appearanceText: sc.appearanceText,
        // 統廃合前の校名で出場した記録は、どの校名で出たのかを残す
        formerName: article !== sc.article ? sc.article : null,
        school: hit,
      });
    }
  }

  // ---- 報告 ----
  const rows = [...appearances.values()].flat();
  console.log(`大会数            : ${data.tournaments.length}`);
  console.log(`出場（延べ・全体）: ${totalEntries}`);
  console.log(`照合できた学校    : ${appearances.size} 校`);
  console.log(`出場歴レコード    : ${rows.length} 件${ONLY_PREF ? `（${ONLY_PREF} のみ）` : ""}`);

  // 照合できなかったもののうち、公立らしいものだけを問題として挙げる
  const suspicious = [...missed.entries()]
    .filter(([name]) => PUBLIC_MARKERS.test(name))
    .sort((a, b) => b[1] - a[1]);
  const privateLike = missed.size - suspicious.length;

  console.log("");
  console.log(`照合できなかった記事名: ${missed.size}（うち私立とみられる ${privateLike}）`);
  if (suspicious.length > 0) {
    console.log("");
    console.log(`--- 公立らしいのに照合できなかった ${suspicious.length} 件（要確認）---`);
    for (const [name, count] of suspicious.slice(0, 60)) {
      console.log(`  ${count}回  ${name}`);
    }
    if (suspicious.length > 60) console.log(`  … 他 ${suspicious.length - 60} 件`);
  }

  if (DUMP) {
    writeFileSync(
      DUMP,
      JSON.stringify(suspicious.map(([name, count]) => ({ name, count })), null, 1),
      "utf8",
    );
    console.log(`未照合（公立らしいもの）を書き出した: ${DUMP}`);
  }

  // 逆向き：マスタにあるが出場歴が無い学校
  const target = ONLY_PREF ? schools.filter((s) => s.prefSlug === ONLY_PREF) : schools;
  const without = target.filter((s) => !appearances.has(s.slug)).length;
  console.log("");
  console.log(
    `逆向きの確認: 学校マスタ ${target.length} 校のうち、出場歴が1件も無いのは ${without} 校`,
  );

  // 出場回数テキストとの突き合わせ（Wikipedia自身が書いている「N回目」と数が合うか）
  let mismatch = 0;
  const mismatchSamples = [];
  for (const list of appearances.values()) {
    for (const season of ["summer", "spring"]) {
      const ofSeason = list.filter((r) => r.season === season).sort((a, b) => a.year - b.year);
      if (ofSeason.length === 0) continue;
      const last = ofSeason[ofSeason.length - 1];
      const m = last.appearanceText?.match(/(\d+)回目/);
      if (!m) continue;
      const stated = Number(m[1]);
      if (stated !== ofSeason.length) {
        mismatch++;
        if (mismatchSamples.length < 15) {
          mismatchSamples.push(
            `  ${last.school.officialName}（${season === "summer" ? "夏" : "春"}）: ` +
              `記事は「${last.appearanceText}」だが数えたのは ${ofSeason.length} 回`,
          );
        }
      }
    }
  }
  console.log("");
  console.log(`自己検証1（記事の「N回目」と数えた回数の不一致）: ${mismatch} 件`);
  if (mismatchSamples.length > 0) console.log(mismatchSamples.join("\n"));

  // 自己検証2: 勝ち抜き戦なので、優勝校以外の敗戦は必ず1。
  // 0 なら負け試合を取りこぼしている。2以上なら二重に数えている。
  //
  // ただし次の3つは、そうならないのが正しい。除かないと本当の異常が埋もれる。
  //   ・1922年までの大会には敗者復活戦があり、1度負けても勝ち上がれた
  //     （1917年夏の愛知一中は1敗しながら優勝している）
  //   ・出場辞退は試合をしていないので敗戦が付かない
  //   ・開催中の大会はまだ負けていないだけ（result が null のまま）
  const REPECHAGE_ERA = 1922;
  let badLosses = 0;
  const badSamples = [];
  for (const list of appearances.values()) {
    for (const r of list) {
      if (r.losses == null) continue; // 成績不明はここでは見ない
      if (r.result == null) continue; // 開催中・不明
      if (r.result === "出場辞退") continue;
      if (r.year <= REPECHAGE_ERA) continue;
      const expected = r.result === "優勝" ? 0 : 1;
      if (r.losses !== expected) {
        badLosses++;
        if (badSamples.length < 10) {
          badSamples.push(
            `  ${r.school.officialName} ${r.year}年${r.season === "summer" ? "夏" : "春"}: ` +
              `${r.result} なのに ${r.wins}勝${r.losses}敗（敗戦は${expected}のはず）`,
          );
        }
      }
    }
  }
  console.log("");
  console.log(`自己検証2（優勝校以外の敗戦数が1でない）: ${badLosses} 件 / ${rows.length} 件中`);
  if (badSamples.length > 0) console.log(badSamples.join("\n"));

  if (!WRITE) {
    console.log("");
    console.log("SQLを書き出すには --write を付けて実行する。");
    return;
  }

  // ---- SQL ----
  const values = [];
  for (const [slug, list] of [...appearances.entries()].sort()) {
    for (const r of list.sort((a, b) => a.year - b.year || a.season.localeCompare(b.season))) {
      const q = (v) => (v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
      const note = r.formerName ? `${r.formerName}として出場` : null;
      values.push(
        `  ((select id from public.schools where slug = '${slug}'), ` +
          `${r.year}, '${r.season}'::public.season, ${q(r.result)}, ` +
          `${r.wins ?? "null"}, ${r.losses ?? "null"}, ${q(note)})`,
      );
    }
  }

  const sql = `-- ============================================================
-- 甲子園出場歴（school_championships）${ONLY_PREF ? `　※ ${ONLY_PREF} のみ` : ""}
--
-- 出典: ja.wikipedia.org の大会別記事（CC BY-SA 4.0）。事実データのみ抽出。
-- このファイルは scripts/match-koshien.mjs が生成する。直接編集しない。
--
-- 収録は公立・国立・高専のみ（学校マスタに無い私立は自然に落ちる）。
-- 統廃合・改称した学校の出場歴は現存校に付く（Wikipediaのリンク先が
-- 現存校の記事になっているため）。
--
-- 適用後に必ず実行すること:
--   select public.recalc_school_koshien_counts();
-- ============================================================

insert into public.school_championships
  (school_id, year, season, result, wins, losses, note)
values
${values.join(",\n")}
on conflict (school_id, year, season) do update set
  result = excluded.result,
  wins   = excluded.wins,
  losses = excluded.losses,
  note   = excluded.note;

select public.recalc_school_koshien_counts();
`;

  writeFileSync(OUT, sql, "utf8");
  console.log("");
  console.log(`書き出し: ${path.relative(ROOT, OUT)}（${values.length} 件）`);
}

// 直接実行されたときだけ動かす。build-koshien-fixups.mjs が
// 照合の部品（loadSchools / loadSuccessors / candidates）を読み込むため。
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  main();
}
