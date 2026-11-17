/**
 * 甲子園の大会記事の校名を、学校マスタの学校に結び付ける「別名表」を作る。
 *
 *   node scripts/build-koshien-school-aliases.mjs          … 書き出す
 *   node scripts/build-koshien-school-aliases.mjs --dry    … 書き出さずに報告だけ
 *
 * 出力は src/lib/data/koshien-school-aliases.json（**生成物。直接編集しない**）。
 * 使うのは src/lib/school-name-index.ts（`getSchoolNameIndex` の中身）。
 *
 * ------------------------------------------------------------------
 * ★★ なぜ要るか（2026-11-04）
 *
 *   `getSchoolNameIndex` は大会記事の校名を**学校マスタの校名に完全一致**で結び付けている。
 *   マスタは**現存校だけ**なので、次の学校が引けず、大会ページで「公立」と数えられなかった。
 *
 *     ・閉校・統合・改称した学校  観音寺中央(1995春優勝)・鳴門工(2002春準優勝)・愛知一中・和歌山中…
 *     ・同名の県立と市立がマスタに2校ある学校  広島商・広島工・前橋・岐阜商・長野
 *     ・記事の略し方がマスタと合わない学校  県岐阜商・市船橋・市和歌山商・取手二・印旛…
 *
 *   試したら、1,328校名のうち **767が引けず**、うち**250が公立**（旧制中学名・改称・「市◯◯」略称）だった。
 *
 * ------------------------------------------------------------------
 * ★★ どう結び付けるか（**DB の出場歴を作ったのと同じ規則**）
 *
 *   Wikipedia の大会記事の代表校の表は、校名に**学校記事へのリンク**を付けている
 *   （`data/koshien-appearances.json` の `article`）。そのリンク先の記事名を
 *   `match-koshien.mjs` の `candidates()` で学校マスタの正式名称（`official_name`）に突き合わせる。
 *   統廃合した学校は、人が確認した `data/school-successor.json`（`confirmed: true`）だけ使う。
 *
 *   ★**公立かどうかは校名から推測していない。** 「学校マスタに行がある」（＝文科省の一覧で
 *   私立以外）ことだけが根拠。愛知の弥富（愛知黎明＝私立）のような学校は、リンク先が
 *   マスタに無いので別名にならない。
 *   ★**DB（`school_championships`）が同じ学校に付けている出場歴と必ず一致する**
 *   ── 下の検算で、別名が指す学校に、その年・季節の出場歴の行が**必ずある**ことを確かめる。
 *   ★だから「学校ページには出場歴があるのに大会ページでは別の学校」といった食い違いが起きない。
 *
 * ------------------------------------------------------------------
 * ★ 別名にしないもの（理由を報告に出す）
 *
 *   ・もうマスタの校名で引けているもの
 *   ・その校名の出場のうち、**1つでも**リンク先がマスタに結び付かないもの（私立と混ざる。
 *     「城東」＝徳島の公立・高知の私立 のような名前を丸ごと別名にしない）
 *   ・リンク先が2つ以上の学校に分かれるもの
 *   ・DB の出場歴に行が無いもの（学校ページに載らない出場を、大会ページだけ結び付けない）
 *   ・同じ大会で、別々の校名が同じ学校に当たるもの（`publicEntrants` が1校に潰す）→ エラー
 *
 * ★ 記事にリンクが無い校名（日高中津・芦別工など）と、マスタに行が無い閉校校（市川・大宮工など）は
 *   ここでは扱えない。人が Wikipedia の学校の記事を読んで確かめた
 *   `src/lib/content/koshien-unlinked-schools.ts` に分けてある。
 *
 * ★ **この表を作り直すのは、次のどれかを変えたあと。**
 *   koshien-games.json / data/koshien-appearances.json / data/school-successor.json / 学校マスタ
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { candidates, loadSchools, loadSuccessors } from "./match-koshien.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "src", "lib", "data", "koshien-school-aliases.json");
const DRY = process.argv.includes("--dry");

const readJson = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));

// ------------------------------------------------------------------
// 校名のそろえ方。**src/lib/koshien-games.ts の normalizeKoshienName / prefectureKey と同じ**
// （サイト側の TypeScript は import しない。変えるときは両方直すこと）。
// ------------------------------------------------------------------
const OLD_KANJI = {
  應: "応", 廣: "広", 濱: "浜", 澤: "沢", 齋: "斎", 邊: "辺", 穗: "穂",
  舘: "館", 國: "国", 學: "学", 榮: "栄", 德: "徳", 淸: "清", 眞: "真",
  靑: "青", 藝: "芸", 圓: "円", 惠: "恵",
};
const normalize = (s) =>
  s
    .normalize("NFKC")
    .replace(/ニ/g, "二")
    .replace(/[ヶケ]/g, "ケ")
    .replace(/\s+/g, "")
    .replace(/高等学校$|高校$|高$/, "")
    .replace(/[應廣濱澤齋邊穗舘國學榮德淸眞靑藝圓惠]/g, (c) => OLD_KANJI[c] ?? c)
    .replace(/商業$/, "商")
    .replace(/工業$/, "工")
    .replace(/農業$/, "農")
    .trim();

const prefectureKey = (s) =>
  s
    .replace(/^(北|南)北海道$/, "北海道")
    .replace(/^(東|西)東京$/, "東京")
    .replace(/^[東西南北](神奈川|大阪|愛知|埼玉|千葉|福岡|兵庫)$/, "$1");

/** src/lib/school-name.ts の shortSchoolName と同じ */
const SHORT_NAME_OVERRIDES = {
  gifushogyo: "県立岐阜商業",
  "gifu-gifushogyo": "市立岐阜商業",
  "wakayama-wakayama": "市立和歌山",
};
const shortSchoolName = (name, slug) => SHORT_NAME_OVERRIDES[slug] ?? name.replace(/高校$/, "");

// ------------------------------------------------------------------
// 入力
// ------------------------------------------------------------------
const games = [
  ...readJson("src/lib/data/koshien-games.json"),
  ...readJson("src/lib/data/koshien-supplements.json"),
];
const appearanceTournaments = readJson("data/koshien-appearances.json").tournaments;

/** 学校マスタ（supabase/schools_*.sql。DB と同じ正本）。都道府県名は seed.sql から引く */
const prefNameBySlug = new Map();
{
  // ★prefectures の insert 文の中だけ見る（ほかの表の行を拾わない）
  const seed = readFileSync(path.join(ROOT, "supabase", "seed.sql"), "utf8");
  const start = seed.indexOf("insert into public.prefectures");
  const block = seed.slice(start, seed.indexOf(";", start));
  for (const m of block.matchAll(/\(\s*\d+,\s*'([^']+)',\s*'[^']+',\s*'[^']+',\s*'([^']+)'/g)) {
    prefNameBySlug.set(m[2], m[1]);
  }
  if (prefNameBySlug.size < 49) throw new Error(`都道府県が ${prefNameBySlug.size} 件しか読めていない（49件のはず）`);
}
const masterRows = loadSchools().map((s) => ({
  slug: s.slug,
  name: s.name,
  officialName: s.officialName,
  pref: prefNameBySlug.get(s.prefSlug) ?? "",
}));
const masterBySlug = new Map(masterRows.map((s) => [s.slug, s]));
const successors = loadSuccessors();

/** DB の出場歴: `slug|年|季節`（supabase/koshien.sql） */
const dbAppearances = new Set();
{
  const sql = readFileSync(path.join(ROOT, "supabase", "koshien.sql"), "utf8");
  for (const m of sql.matchAll(/where slug = '([^']+)'\), (\d{4}), '(spring|summer)'/g)) {
    dbAppearances.add(`${m[1]}|${m[2]}|${m[3]}`);
  }
}

// ------------------------------------------------------------------
// 今の索引（src/lib/school-name-index.ts のマスタだけで作る部分と同じ）
// ------------------------------------------------------------------
const byName = new Map(); // 校名 -> ref | null（2校に当たる鍵は null）
const byNameAndPref = new Map();
/** 校名の鍵 -> その鍵を持つ学校の slug の集合（県を問わない） */
const slugsByKey = new Map();
for (const row of masterRows) {
  const ref = { slug: row.slug, pref: row.pref };
  const keys = new Set(
    [row.name, row.officialName ?? "", shortSchoolName(row.name, row.slug)].map(normalize).filter(Boolean),
  );
  for (const key of keys) {
    const found = byName.get(key);
    if (found === undefined) byName.set(key, ref);
    else if (found && found.slug !== row.slug) byName.set(key, null);

    if (!slugsByKey.has(key)) slugsByKey.set(key, new Set());
    slugsByKey.get(key).add(row.slug);

    if (!ref.pref) continue;
    const withPref = `${key}\t${prefectureKey(ref.pref)}`;
    const inPref = byNameAndPref.get(withPref);
    if (inPref === undefined) byNameAndPref.set(withPref, ref);
    else if (inPref && inPref.slug !== row.slug) byNameAndPref.set(withPref, null);
  }
}
function findNow(display, pref) {
  const key = normalize(display);
  if (!key) return null;
  if (pref) {
    const hit = byNameAndPref.get(`${key}\t${prefectureKey(pref)}`);
    return hit !== undefined ? hit : null;
  }
  return byName.get(key) ?? null;
}

// ------------------------------------------------------------------
// 試合に出てくるチーム（校名＋県）。県は `teamPrefecture` と同じに決める
// ------------------------------------------------------------------
/** 同じ校名が1つの県にしか出てこないなら、県の書かれていない試合にもその県を借りる */
const prefByName = (() => {
  const found = new Map();
  for (const g of games) {
    for (const t of g.teams) {
      if (!t.pref) continue;
      const key = normalize(t.display);
      if (!found.has(key)) found.set(key, new Set());
      found.get(key).add(prefectureKey(t.pref));
    }
  }
  const out = new Map();
  for (const [key, set] of found) if (set.size === 1) out.set(key, [...set][0]);
  return out;
})();
const teamPref = (t) => t.pref ?? prefByName.get(normalize(t.display));

/** 本物の都道府県名（地区名「奥羽」「南四国」と見分ける） */
const KNOWN_PREFS = new Set();
for (const g of games) for (const t of g.teams) if (t.pref) KNOWN_PREFS.add(prefectureKey(t.pref));

const teams = new Map();
for (const g of games) {
  for (const t of g.teams) {
    const pref = teamPref(t) ?? "";
    const norm = normalize(t.display);
    const k = `${norm}\t${prefectureKey(pref)}`;
    let e = teams.get(k);
    if (!e) {
      e = { display: t.display, norm, pref, occ: new Map(), tournaments: new Map() };
      teams.set(k, e);
    }
    e.occ.set(`${g.year}|${g.season}`, { year: g.year, season: g.season });
    // 同じ大会で、この校名が何という表記で出てきたか（重複の検算に使う）
    e.tournaments.set(`${g.year}|${g.season}`, t.display);
  }
}

// ------------------------------------------------------------------
// Wikipedia の出場校の表（記事名つき）
// ------------------------------------------------------------------
/** 出場校の表が持つ「本物の県」。地区名しか無ければ空 */
const realPrefsOf = (s) => (s.prefs ?? []).filter((p) => KNOWN_PREFS.has(prefectureKey(p)));

const appearanceBy = new Map(); // `${year}|${season}|${校名}` -> entry[]
/**
 * 表が持っている大会。**1924春・1925春・1929春は表に無い**（表を作った 2026-08-12 には、これらの
 * 大会記事のキャッシュが別の回の中身で保存されていた。試合のほうは 2026-08-26 に直っている）。
 * ★表に無い大会の出場は「リンクが無い」のではなく「判断材料が無い」。**証拠としては数えず**、
 * 表のある大会の出場がすべて同じ学校に結び付くときだけ、同じ学校とみなす。
 */
const tournamentsInTable = new Set(appearanceTournaments.map((t) => `${t.year}|${t.season}`));
for (const t of appearanceTournaments) {
  for (const s of t.schools) {
    /*
      ★**同名の別校がいる大会は、試合のほうが県で書き分けている**（`徳島海南`・`和歌山海南`・`海星（長崎）`）。
      表は校名（`海南`）と県を別の欄に持つので、**その表の県を前に付けた形・括弧で付けた形**でも引けるようにする。
      ★付けるのは**その学校自身の県だけ**（`和歌山海南` が徳島の行に当たらない）。
      1964年春の優勝校・徳島海南（徳島県立海南高校）がこれで引けていなかった。
    */
    const names = new Set([normalize(s.short)]);
    for (const p of realPrefsOf(s)) {
      names.add(normalize(`${p}${s.short}`));
      names.add(normalize(`${s.short}（${p}）`));
    }
    for (const name of names) {
      const k = `${t.year}|${t.season}|${name}`;
      if (!appearanceBy.has(k)) appearanceBy.set(k, []);
      appearanceBy.get(k).push(s);
    }
  }
}

/** 記事名 → 学校マスタの学校（DB の出場歴を作ったのと同じ照合） */
const masterByOfficial = new Map();
for (const s of masterRows) if (!masterByOfficial.has(s.officialName)) masterByOfficial.set(s.officialName, s);
function articleToSchool(article) {
  const a = successors.get(article) ?? article;
  for (const c of candidates(a)) {
    const hit = masterByOfficial.get(c);
    if (hit) return { school: hit, viaSuccessor: successors.has(article) };
  }
  return null;
}

// ------------------------------------------------------------------
// 別名の候補を作る
// ------------------------------------------------------------------
const excluded = []; // { reason, label }
const aliases = [];
/** 出場校の表に無い大会の出場を、ほかの出場と同じ学校とみなしたもの（報告に出す） */
const noEvidenceNotes = [];
/** チームの鍵（`teams` の鍵）-> 別名が指す slug。重複の検算に使う */
const slugByTeamKey = new Map();
let alreadyResolved = 0;

for (const [teamKey, e] of teams) {
  if (findNow(e.display, e.pref)) {
    alreadyResolved += 1;
    continue;
  }
  const label = `${e.display}(${e.pref || "県不明"})`;
  const articles = new Map(); // 記事名 -> 学校
  let uncovered = 0;
  let unmapped = false;
  const slugs = new Set();
  const prefsFromTable = new Set();
  /** 出場校の表そのものに無い大会の出場（判断材料が無い。DB の出場歴も無い） */
  const noEvidence = [];
  /** その校名で出場した、表のある大会の出場（DB の出場歴と突き合わせるのはここだけ） */
  const evidenced = [];

  for (const occ of e.occ.values()) {
    if (!tournamentsInTable.has(`${occ.year}|${occ.season}`)) {
      noEvidence.push(occ);
      continue;
    }
    evidenced.push(occ);
    const entries = (appearanceBy.get(`${occ.year}|${occ.season}|${e.norm}`) ?? []).filter((s) => {
      if (!e.pref) return true;
      const real = realPrefsOf(s);
      return real.length === 0 || real.some((p) => prefectureKey(p) === prefectureKey(e.pref));
    });
    if (entries.length === 0 || entries.every((s) => !s.article)) {
      uncovered += 1;
      continue;
    }
    for (const s of entries) {
      if (!s.article) {
        unmapped = true;
        continue;
      }
      const hit = articleToSchool(s.article);
      if (!hit) {
        unmapped = true;
        continue;
      }
      articles.set(s.article, hit.school);
      slugs.add(hit.school.slug);
      for (const p of realPrefsOf(s)) prefsFromTable.add(prefectureKey(p));
    }
  }

  if (slugs.size === 0) continue; // 私立・外地・マスタに無い学校。ここでは何もしない
  if (uncovered > 0) {
    excluded.push({ reason: "出場校の表にリンクが無い出場がある", label });
    continue;
  }
  if (unmapped) {
    excluded.push({ reason: "リンク先がマスタに結び付かない出場が混ざる（私立など）", label });
    continue;
  }
  if (slugs.size > 1) {
    excluded.push({ reason: "リンク先が2校以上に分かれる", label: `${label} → ${[...slugs].join("/")}` });
    continue;
  }
  const slug = [...slugs][0];
  const school = masterBySlug.get(slug);

  // 県: 試合に県が書かれていればそれ。無ければ出場校の表から（本物の県が1つに決まるとき）。
  // 表が地区名しか持っていなければ、結び付けた学校自身の県（文科省の一覧）を使う。
  let pref = e.pref;
  const prefless = !e.pref;
  if (prefless) {
    if (prefsFromTable.size > 1) {
      excluded.push({ reason: "県の分からない試合の県が2つ以上に分かれる", label });
      continue;
    }
    pref = prefsFromTable.size === 1 ? [...prefsFromTable][0] : school.pref;
    if (!pref) {
      excluded.push({ reason: "県が決まらない", label });
      continue;
    }
  }
  // 県が食い違うものは結び付けない（別の県の同名校を取り違えない）
  if (school.pref && prefectureKey(school.pref) !== prefectureKey(pref)) {
    excluded.push({ reason: `県が食い違う（試合 ${pref}／マスタ ${school.pref}）`, label });
    continue;
  }

  // もうマスタの校名で引ける（その学校自身の名前）なら要らない。
  // ただし**同じ鍵に別の学校もいる**（県立と市立の同名など）ときは、どちらかを指すために要る。
  const own = new Set(
    [school.name, school.officialName ?? "", shortSchoolName(school.name, school.slug)].map(normalize),
  );
  const shared = (slugsByKey.get(e.norm)?.size ?? 0) > 1;
  if (own.has(e.norm) && !shared) {
    excluded.push({ reason: "マスタの校名ですでに引ける", label });
    continue;
  }

  // DB の出場歴と食い違わないこと（別名が指す学校に、その年・季節の行が必ずある）。
  // ★表に無い大会（DB の出場歴を作った元）の出場は突き合わせようが無いので、ここでは見ない。
  const missing = evidenced.filter((o) => !dbAppearances.has(`${slug}|${o.year}|${o.season}`));
  if (missing.length > 0) {
    excluded.push({
      reason: "DBの出場歴に行が無い（学校ページに載らない出場は結び付けない）",
      label: `${label} → ${slug} ${missing.map((o) => `${o.year}${o.season === "spring" ? "春" : "夏"}`).join("/")}`,
    });
    continue;
  }

  slugByTeamKey.set(teamKey, slug);
  if (noEvidence.length > 0) {
    noEvidenceNotes.push(
      `${label} → ${slug}: ${noEvidence.map((o) => `${o.year}${o.season === "spring" ? "春" : "夏"}`).join("/")}` +
        `（ほかの ${evidenced.length} 大会はすべて同じ学校）`,
    );
  }
  aliases.push({
    display: e.display,
    pref,
    prefless,
    slug,
    articles: [...articles.keys()].sort(),
  });
}

// ------------------------------------------------------------------
// 検算: 同じ大会で、別々の校名が同じ学校に当たってはいけない（publicEntrants が1校に潰す）
// ------------------------------------------------------------------
const bySlugTournament = new Map();
let conflicts = 0;
for (const [teamKey, e] of teams) {
  const slug = slugByTeamKey.get(teamKey) ?? findNow(e.display, e.pref)?.slug;
  if (!slug) continue;
  for (const [t, display] of e.tournaments) {
    const key = `${t}|${slug}`;
    const prev = bySlugTournament.get(key);
    if (prev && prev !== display) {
      conflicts += 1;
      console.error(`✗ 同じ大会で別々の校名が同じ学校に当たる: ${t} ${slug} 「${prev}」と「${display}」`);
    }
    bySlugTournament.set(key, display);
  }
}
if (conflicts > 0) {
  console.error(`\n${conflicts} 件の衝突があるので書き出さない。`);
  process.exit(1);
}

// ------------------------------------------------------------------
// 報告と書き出し
// ------------------------------------------------------------------
aliases.sort(
  (a, b) =>
    prefectureKey(a.pref).localeCompare(prefectureKey(b.pref), "ja") ||
    normalize(a.display).localeCompare(normalize(b.display), "ja"),
);

const reasons = new Map();
for (const x of excluded) reasons.set(x.reason, (reasons.get(x.reason) ?? 0) + 1);
console.log(`校名＋県のチーム          : ${teams.size}`);
console.log(`マスタの校名で引けている  : ${alreadyResolved}`);
console.log(`別名にした                : ${aliases.length}（うち県の書かれていない試合用 ${aliases.filter((a) => a.prefless).length}）`);
console.log(`別名にしなかった（公立らしい／マスタに行がある学校のぶん）: ${excluded.length}`);
for (const [reason, n] of reasons) console.log(`  ${String(n).padStart(3)}  ${reason}`);
for (const x of excluded.filter((y) => !y.reason.startsWith("マスタの校名ですでに"))) {
  console.log(`      - ${x.label}  ［${x.reason}］`);
}
if (noEvidenceNotes.length > 0) {
  console.log(`\n出場校の表に無い大会の出場を、ほかの出場と同じ学校とみなした別名: ${noEvidenceNotes.length}`);
  for (const n of noEvidenceNotes) console.log(`      - ${n}`);
}

const out = {
  _comment:
    "甲子園の大会記事の校名を学校マスタの学校に結び付ける別名表。scripts/build-koshien-school-aliases.mjs が作る。直接編集しない。",
  _根拠:
    "Wikipedia の大会記事の代表校の表のリンク先（data/koshien-appearances.json）を、DB の出場歴と同じ規則（match-koshien.mjs）で学校マスタに突き合わせた。公立かどうかは校名からは決めていない。",
  generatedOn: new Date().toISOString().slice(0, 10),
  aliases,
};

/** 1件1行で書く（差分が読みやすく、サイトに入るサイズも小さい） */
const serialize = (o) =>
  `{\n${Object.entries(o)
    .map(([k, v]) =>
      k === "aliases"
        ? ` ${JSON.stringify(k)}: [\n${v.map((a) => `  ${JSON.stringify(a)}`).join(",\n")}\n ]`
        : ` ${JSON.stringify(k)}: ${JSON.stringify(v)}`,
    )
    .join(",\n")}\n}\n`;

if (DRY) {
  console.log("\n--dry なので書き出さない。");
} else {
  const next = serialize(out);
  // 日付だけが違うときは書き換えない（毎回差分が出ないように）
  if (existsSync(OUT)) {
    const prev = JSON.parse(readFileSync(OUT, "utf8"));
    if (JSON.stringify(prev.aliases) === JSON.stringify(aliases)) {
      console.log("\n別名表に変更は無い。書き換えない。");
      process.exit(0);
    }
  }
  writeFileSync(OUT, next, "utf8");
  console.log(`\n書き出した: ${path.relative(ROOT, OUT)}（${aliases.length}件）`);
}
