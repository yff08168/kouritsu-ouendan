/**
 * 47都道府県高野連サイトの**規約調査**。
 *
 *   node scripts/survey-federations.mjs <連盟一覧HTML> <出力JSON> <出力レポート>
 *
 * 連盟一覧HTML は https://www.jhbf.or.jp/summary/federation_list/ を保存したもの。
 * 直近の結果は `data/federation-sites.json`、まとめは README の
 * 「都道府県高野連サイトの規約調査」。**サイトは作り替えられるので、
 * 出典を増やすときは README の結論を鵜呑みにせず、この調査を回し直すこと。**
 *
 * 見るのは AGENTS.md の2点だけ。
 *   ① 自動取得の禁止   ② 営利目的での利用の禁止
 * 加えて robots.txt と、結果ページがどんな形（HTML表 / PDF / 画像）かの当たりを付ける。
 *
 * **取得は1件ずつ・1.5秒あける。** 相手は学校の中に事務局がある小さなサイトで、
 * こちらの都合で負荷をかけてよい相手ではない。
 *
 * 文字コードは Shift_JIS / EUC-JP が混ざるので、ヘッダと meta から判定して decode する。
 * UTF-8 決め打ちで読むと文字化けし、規約の語が引っかからず「規約なし」と誤判定する。
 */
import { readFileSync, writeFileSync } from "node:fs";

const UA = { "User-Agent": "kouritsu-ouendan/1.0 (+https://kouritsu-ouendan.com)" };
const [, , listPath, jsonPath, reportPath] = process.argv;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** ヘッダ→metaの順で文字コードを見て decode する */
function decode(buf, contentType) {
  const head = new TextDecoder("latin1").decode(buf.slice(0, 4096));
  const charset =
    /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1] ??
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ??
    "utf-8";
  const normalized = charset.toLowerCase().replace(/^x-/, "");
  try {
    return { text: new TextDecoder(normalized).decode(buf), charset: normalized };
  } catch {
    return { text: new TextDecoder("utf-8").decode(buf), charset: `${normalized}(不明→utf-8)` };
  }
}

async function get(url, { timeout = 20000 } = {}) {
  try {
    const res = await fetch(url, {
      headers: UA,
      redirect: "follow",
      signal: AbortSignal.timeout(timeout),
    });
    const buf = new Uint8Array(await res.arrayBuffer());
    const { text, charset } = decode(buf, res.headers.get("content-type"));
    return { ok: res.ok, status: res.status, url: res.url, text, charset };
  } catch (e) {
    return { ok: false, status: 0, url, text: "", charset: null, error: String(e.message ?? e) };
  }
}

const plain = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** 規約で見るべき語。①自動取得 ②営利目的 の2点＋転載まわり */
const RULES = [
  { key: "営利・商用の禁止", re: /(営利|商用|商業)[^。]{0,40}(禁止|不可|お断り|できません|認めません)/ },
  { key: "自動取得の禁止", re: /(自動(的)?(に|な)?(取得|収集|抽出)|ロボット|クローラ|クローリング|スクレイピング|プログラム[^。]{0,10}(取得|収集))[^。]{0,40}(禁止|不可|お断り|できません|認めません)/ },
  { key: "無断転載の禁止", re: /(無断|許可なく|承諾なく)[^。]{0,20}(転載|複製|転用|使用|利用)[^。]{0,30}(禁止|不可|お断り|できません|認めません)/ },
  { key: "著作権の記載", re: /(著作権|Copyright|©)/i },
  { key: "リンクの制限", re: /(リンク)[^。]{0,30}(許可|申請|連絡|ご一報)/ },
];

/** 規約ページらしいリンクを拾う */
const TERMS_WORDS = /(利用規約|ご利用にあたって|ご利用について|サイトポリシー|サイトのご利用|免責|著作権|プライバシー|リンクについて|当サイトについて)/;

/** 結果ページらしいリンクを拾う（フォーマットの当たりを付けるため） */
const RESULT_WORDS = /(大会|結果|速報|日程|組合せ|組み合わせ|トーナメント|選手権|秋季|春季|新人)/;

function absolute(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

// ---- 一覧から47連盟を取り出す ----
const listHtml = readFileSync(listPath, "utf8");
const feds = [];
for (const row of listHtml.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
  const name = plain(row).match(/[^\s]*?(北海道|[都道府県])?高等学校野球連盟/)?.[0];
  const link = /href="(https?:\/\/[^"]+)"/.exec(row)?.[1];
  if (!name || !link || link.includes("jhbf.or.jp")) continue;
  if (name.includes("日本高等学校野球連盟")) continue;
  feds.push({ name: name.replace(/^（[^）]*）/, ""), site: link });
}
console.log(`連盟: ${feds.length} 件`);

// ---- 1件ずつ調べる ----
const results = [];
for (const [i, fed] of feds.entries()) {
  const origin = new URL(fed.site).origin;
  const row = { ...fed, origin, robots: null, terms: [], findings: [], resultLinks: [], note: [] };
  console.log(`\n[${i + 1}/${feds.length}] ${fed.name} ${fed.site}`);

  // robots.txt
  const robots = await get(`${origin}/robots.txt`);
  await sleep(1500);
  if (robots.ok && /user-agent/i.test(robots.text)) {
    row.robots = robots.text.slice(0, 600).replace(/\s+/g, " ").trim();
    console.log(`   robots.txt: ${row.robots.slice(0, 120)}`);
  } else {
    row.robots = robots.status === 0 ? `取得できず(${robots.error})` : `なし(HTTP ${robots.status})`;
    console.log(`   robots.txt: ${row.robots}`);
  }

  // トップページ
  const top = await get(fed.site);
  await sleep(1500);
  if (!top.ok) {
    row.note.push(`トップページ取得できず: ${top.error ?? `HTTP ${top.status}`}`);
    console.log(`   ⚠️ トップ取得できず: ${row.note.at(-1)}`);
    results.push(row);
    continue;
  }
  row.charset = top.charset;
  row.finalUrl = top.url;
  console.log(`   文字コード: ${top.charset}`);

  // フレーム構成の古いサイトはトップに中身が無い
  const frames = [...top.text.matchAll(/<(?:frame|iframe)[^>]+src=["']([^"']+)["']/gi)].map((m) =>
    absolute(m[1], top.url),
  );
  let pages = [{ url: top.url, text: top.text }];
  for (const f of frames.slice(0, 3)) {
    if (!f) continue;
    const fr = await get(f);
    await sleep(1500);
    if (fr.ok) pages.push({ url: f, text: fr.text });
  }
  if (frames.length) {
    row.note.push(`フレーム構成（${frames.length}件）`);
    console.log(`   フレーム構成: ${frames.length} 件`);
  }

  // 規約ページ・結果ページのリンクを集める
  const termsLinks = new Map();
  const resultLinks = new Map();
  for (const page of pages) {
    for (const m of page.text.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const label = plain(m[2]).slice(0, 40);
      const href = absolute(m[1], page.url);
      if (!href || !/^https?:/.test(href)) continue;
      if (TERMS_WORDS.test(label)) termsLinks.set(href, label);
      else if (RESULT_WORDS.test(label)) resultLinks.set(href, label);
    }
  }
  row.resultLinks = [...resultLinks].slice(0, 8).map(([url, label]) => ({ label, url }));

  // トップ自体＋規約ページを検査する
  const targets = [
    ...pages.map((p) => ({ url: p.url, label: "(トップ)", text: p.text })),
  ];
  for (const [url, label] of [...termsLinks].slice(0, 4)) {
    const res = await get(url);
    await sleep(1500);
    if (res.ok) targets.push({ url, label, text: res.text });
    row.terms.push({ label, url, ok: res.ok });
  }

  for (const t of targets) {
    const text = plain(t.text);
    for (const rule of RULES) {
      const hit = rule.re.exec(text);
      if (!hit) continue;
      const at = Math.max(0, hit.index - 30);
      row.findings.push({
        rule: rule.key,
        page: t.label,
        url: t.url,
        snippet: text.slice(at, hit.index + hit[0].length + 40),
      });
    }
  }
  // 同じ規則の重複は落とす
  const seen = new Set();
  row.findings = row.findings.filter((f) => {
    const k = `${f.rule}\t${f.snippet}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  for (const f of row.findings) console.log(`   ▶ ${f.rule}: ${f.snippet.slice(0, 90)}`);
  if (!row.findings.length) console.log("   ▶ 該当する記載は見つからず");

  results.push(row);
}

writeFileSync(jsonPath, JSON.stringify(results, null, 2), "utf8");

// ---- レポート ----
const lines = ["# 47都道府県高野連サイト 規約調査", ""];
lines.push(`調査対象: ${results.length} 連盟`, "");
lines.push("| 連盟 | サイト | robots.txt | 営利禁止 | 自動取得禁止 | 無断転載禁止 | 規約ページ |");
lines.push("|---|---|---|---|---|---|---|");
for (const r of results) {
  const has = (k) => (r.findings.some((f) => f.rule === k) ? "**あり**" : "—");
  const robots = /^なし|取得できず/.test(r.robots ?? "") ? "なし" : "あり";
  lines.push(
    `| ${r.name} | ${r.site} | ${robots} | ${has("営利・商用の禁止")} | ${has("自動取得の禁止")} | ${has("無断転載の禁止")} | ${r.terms.length ? r.terms.map((t) => t.label).join("・") : "見つからず"} |`,
  );
}
lines.push("", "## 引っかかった記載", "");
for (const r of results) {
  if (!r.findings.length && !r.note.length) continue;
  lines.push(`### ${r.name}`, "");
  for (const n of r.note) lines.push(`- ⚠️ ${n}`);
  for (const f of r.findings) {
    lines.push(`- **${f.rule}**（${f.page}）: ${f.snippet}`);
    lines.push(`  - ${f.url}`);
  }
  lines.push("");
}
lines.push("## 結果ページらしきリンク", "");
for (const r of results) {
  if (!r.resultLinks.length) continue;
  lines.push(`### ${r.name}`, "");
  for (const l of r.resultLinks) lines.push(`- ${l.label} — ${l.url}`);
  lines.push("");
}
writeFileSync(reportPath, lines.join("\n"), "utf8");
console.log(`\n書き出した: ${jsonPath} / ${reportPath}`);
