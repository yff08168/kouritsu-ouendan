/**
 * 公立旋風の記事づくりに使う共通部品（事実の取り出し）。
 *
 * ------------------------------------------------------------------
 * ★ なぜ要るか（2026-11-04）
 *
 *   公立旋風の記事は、これまで1本ずつ「SQL＋勝ち上がりの手書きTS」で作っていた
 *   （`supabase/senpu_seed*.sql` と `src/lib/content/tournament-runs.ts`）。
 *   数十本に増やすと、**スコアを手で写すところで必ず誤る**
 *   （README「スコアは必ず一次資料で裏を取ること」に実例がある）。
 *
 *   ここは**サイトがすでに持っている生成物から、勝ち上がりを機械的に取り出す**。
 *   写さないので、写し間違いが起きない。
 *
 *     甲子園   … `src/lib/data/koshien-games.json`（ja.wikipedia の大会記事の wikitext）
 *     地方大会 … `src/lib/data/regional/<地区>.json`
 *
 * ★ **文章は書かない。** 数字と校名を取り出すだけ。文章は人が書き、
 *   `verify-senpu.mjs` が「文章の中の数字が取り出した事実と合っているか」を検算する。
 *
 * ★ **ここは Node の素の ESM。** サイトの TypeScript（`@/lib/...`）は import しない。
 *   必要な規則（校名のそろえ方）はこのファイルの中に写してあり、
 *   **`src/lib/koshien-games.ts` の `normalizeKoshienName` と同じものにそろえること。**
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const cache = new Map();
function cached(key, load) {
  if (!cache.has(key)) cache.set(key, load());
  return cache.get(key);
}

export const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));

export const koshienGames = () =>
  cached("koshien", () => [
    ...readJson("src/lib/data/koshien-games.json"),
    ...readJson("src/lib/data/koshien-supplements.json"),
  ]);

/** 大会ごとの出場校（Wikipedia の「N年ぶりN回目」「N勝N敗」「ベスト4」まで持っている） */
export const koshienAppearances = () =>
  cached("appearances", () => readJson("data/koshien-appearances.json").tournaments);

export const district = (slug) => cached(`district:${slug}`, () => readJson(`src/lib/data/regional/${slug}.json`));

// ------------------------------------------------------------------
// 校名のそろえ方（src/lib/koshien-games.ts の normalizeKoshienName と同じ）
// ------------------------------------------------------------------
const OLD_KANJI = {
  應: "応", 廣: "広", 濱: "浜", 澤: "沢", 齋: "斎", 邊: "辺", 穗: "穂",
  舘: "館", 國: "国", 學: "学", 榮: "栄", 德: "徳", 淸: "清", 眞: "真",
  靑: "青", 藝: "芸", 圓: "円", 惠: "恵",
};
export function normalizeName(s) {
  return s
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
}

/** 北北海道・南北海道 → 北海道／東東京・西東京 → 東京 にそろえる（koshien-games.ts の prefectureKey） */
export function prefectureKey(s) {
  return s
    .replace(/^(北|南)北海道$/, "北海道")
    .replace(/^(東|西)東京$/, "東京")
    .replace(/^[東西南北](神奈川|大阪|愛知|埼玉|千葉|福岡|兵庫)$/, "$1");
}

// ------------------------------------------------------------------
// 学校マスタ（公開済みの行だけ。anon キー・読み取り専用）
// ------------------------------------------------------------------
/**
 * 指定した slug の学校だけ読む（3,500校を丸ごと読まない。転送量の上限に当たった経緯がある）。
 * @returns {Promise<Map<string, object>>}
 */
export async function fetchSchools(slugs) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("環境変数がありません。`node --env-file=.env.local` で実行してください");
  const out = new Map();
  const list = [...new Set(slugs)];
  for (let i = 0; i < list.length; i += 60) {
    const part = list.slice(i, i + 60);
    const q =
      `${url}/rest/v1/schools?select=slug,name,official_name,city,establishment,school_kind,` +
      `koshien_spring_count,koshien_summer_count,last_koshien_year,prefecture:prefectures(name,slug)` +
      `&slug=in.(${part.map((s) => `"${s}"`).join(",")})`;
    const res = await fetch(q, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`schools ${res.status}`);
    for (const r of await res.json()) out.set(r.slug, r);
  }
  for (const s of list) if (!out.has(s)) throw new Error(`学校マスタに無い slug: ${s}`);
  return out;
}

/** 「岐阜県立岐阜商業高等学校」→「岐阜県立岐阜商業高校」 */
export const officialShort = (official) => official.replace(/高等学校$/, "高校");

/** 設置区分の呼び方（正式名称に入っているものをそのまま使う） */
export function establishmentWord(official) {
  const m = official.match(/(道立|都立|府立|県立|市立|町立|村立|組合立|国立)/);
  return m ? m[1] : null;
}

// ------------------------------------------------------------------
// 表示用の整形
// ------------------------------------------------------------------
/** 「2002-08-09」→「8月9日」 */
export function jaDate(iso) {
  if (!iso) return undefined;
  const m = iso.match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  return `${Number(m[1])}月${Number(m[2])}日`;
}

export const SEASON_JA = { spring: "春", summer: "夏", autumn: "秋" };

const ROUND_DEPTH = [
  "1回戦", "2回戦", "3回戦", "4回戦", "5回戦", "6回戦", "7回戦",
  "代表決定戦", "準々決勝", "準決勝", "決勝",
];
export const roundDepth = (r) => ROUND_DEPTH.indexOf(r ?? "");

// ------------------------------------------------------------------
// 甲子園
// ------------------------------------------------------------------
/** 大会記事の題（Wikipedia の記事名） */
export function koshienArticleTitle(game) {
  return game.tournament;
}

/**
 * その学校（大会記事の表記＋県）の、その大会での試合。
 * ★**校名は完全一致**（部分一致は別の学校に当たる）。県が分かるときは県も合わせる。
 */
export function koshienRunGames({ year, season, display, pref }) {
  const want = normalizeName(display);
  const games = koshienGames().filter((g) => g.year === year && g.season === season);
  const mine = games.filter((g) =>
    g.teams.some(
      (t) =>
        normalizeName(t.display) === want &&
        (!pref || !t.pref || prefectureKey(t.pref) === prefectureKey(pref)),
    ),
  );
  return { all: games, mine, want };
}

/**
 * 決勝の回数（大会記事の {{Linescore}} から）。
 * ★**生成物（koshien-games.json）は決勝の「延長」を note に持っていない**（1996年夏の松山商-熊本工は
 *   11回までかかったが note は空。2016年春の高松商-智弁学園も11回）。
 *   試合表の note は延長を持つので、欠けるのは Linescore から読んだ決勝だけ。
 *   なので決勝にだけ、wikitext を直接読んで回数を補う（要約モデルを通さない）。
 *   1990年以降で9回でない決勝は 2010春・2016春・1996夏・2006夏（引き分け）・2024夏 の5つ。
 */
const lineCache = new Map();
function linescoresOf(year, season) {
  const key = `${year}:${season}`;
  if (lineCache.has(key)) return lineCache.get(key);
  const base = season === "spring" ? 1928 : 1918;
  const file = path.join(ROOT, "data", "wikipedia-cache", `${season}-${String(year - base).padStart(3, "0")}.json`);
  const out = [];
  if (fs.existsSync(file)) {
    const text = JSON.parse(fs.readFileSync(file, "utf8")).wikitext;
    const plain = (v) => (v ?? "").replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").trim();
    for (const m of text.matchAll(/\{\{Linescore([\s\S]*?)\n\}\}/g)) {
      const b = m[1];
      const idx = [];
      for (const x of b.matchAll(/\|[RH](\d+)=([^|\n]*)/g)) if (x[2].trim() !== "") idx.push(Number(x[1]));
      out.push({
        innings: Math.max(0, ...idx),
        road: normalizeName(plain(b.match(/\|Road=([^|\n]*)/)?.[1])),
        home: normalizeName(plain(b.match(/\|Home=([^|\n]*)/)?.[1])),
        rr: Number(b.match(/\|RR=(\d+)/)?.[1]),
        hr: Number(b.match(/\|HR=(\d+)/)?.[1]),
      });
    }
  }
  lineCache.set(key, out);
  return out;
}
export function finalInningsOf(g) {
  const [a, b] = g.teams;
  const hit = linescoresOf(g.year, g.season).find(
    (l) =>
      ((l.rr === a.score && l.hr === b.score) || (l.rr === b.score && l.hr === a.score)) &&
      [l.road, l.home].includes(normalizeName(a.display)) &&
      [l.road, l.home].includes(normalizeName(b.display)),
  );
  return hit ? hit.innings : null;
}

/** 甲子園の1試合を RunGame（勝ち上がりの1行）に直す */
export function toRunGame(g, selfIs) {
  const self = g.teams.find(selfIs);
  const other = g.teams.find((t) => t !== self);
  const outcome = self.score === other.score && !self.won && !other.won ? "draw" : self.won ? "win" : "loss";
  const row = {
    round: g.round ?? "（回戦不明）",
    ...(jaDate(g.date) ? { date: jaDate(g.date) } : {}),
    opponent: other.display,
    ...(other.pref ? { opponentPrefecture: other.pref } : {}),
    scoreFor: self.score,
    scoreAgainst: other.score,
    outcome,
  };
  if (self.walkOff && self.won) row.walkOff = true;
  // 注記は「延長10回」「再試合」などの試合の形式だけ。所要時間（1時間48分）は載せない
  const note = (g.note ?? "").trim();
  if (note && !/^\d+時間|^\d+分/.test(note)) row.note = note;
  // 決勝の延長は生成物の note に入っていない（下の finalInningsOf）。Linescore から補う
  if (g.round === "決勝" && !/延長/.test(row.note ?? "")) {
    const n = finalInningsOf(g);
    if (n && n > 9) row.note = row.note ? `${row.note}（延長${n}回）` : `延長${n}回`;
  }
  return row;
}

/** 日付→回戦の深さの順に並べる */
export function sortRun(games) {
  return [...games].sort((a, b) => {
    const da = a.__date ?? "";
    const db = b.__date ?? "";
    if (da !== db) return da.localeCompare(db);
    return roundDepth(a.round) - roundDepth(b.round);
  });
}

/** その大会の決勝（決着したもの）から優勝校・準優勝校 */
export function koshienFinal(year, season) {
  const finals = koshienGames().filter((g) => g.year === year && g.season === season && g.round === "決勝");
  const g = finals.find((x) => x.teams.some((t) => t.won)) ?? finals[0];
  if (!g) return null;
  const champion = g.teams.find((t) => t.won);
  const runnerUp = g.teams.find((t) => !t.won);
  if (!champion || !runnerUp) return null;
  return { game: g, champion, runnerUp };
}

/** 成績（その学校の最後の試合から）。優勝／準優勝／「N回戦敗退」 */
export function resultOf(runGames, isChampion) {
  if (isChampion) return "優勝";
  const lastLoss = [...runGames].reverse().find((g) => g.outcome === "loss");
  if (!lastLoss) return "成績不明";
  return lastLoss.round === "決勝" ? "準優勝" : `${lastLoss.round}敗退`;
}

export const winsOf = (runGames) => runGames.filter((g) => g.outcome === "win").length;

// ------------------------------------------------------------------
// 地方大会
// ------------------------------------------------------------------
/**
 * その学校（slug）の、その大会での試合。
 * @param tournament 大会名（生成物の `tournament` と完全一致）
 */
/*
  ★★ 地方大会の生成物の校名には**シードの表記が付く**ことがある（神奈川2023夏: 「第3シード 横浜商業」と「第2シード 横浜商業」）。
  **同じ学校が別の名前に見える**ので、学校を数えるときも画面に出すときも先に外す。
  括弧つきの「（栃木1位）」（関東大会の出場校）も外す。
*/
export const cleanTeamName = (s) =>
  s.replace(/^第\d+シード\s*/, "").replace(/\s*[（(][^）)]*位[）)]$/, "").trim();

/**
 * 大会の試合から勝ち抜き戦の木を組み直す（神奈川・愛知の準決勝を取り出すため）。
 *
 * ★ 決勝 = **負けのない学校（優勝校）の最後の試合**。準決勝 = 決勝の2校それぞれの直前の試合。
 *   木の深さは「決勝からさかのぼって、勝った学校の直前の試合」で決める。
 * ★ 無敗の学校が複数いる（記録に穴がある）ときは、最後の試合がいちばん遅い学校を優勝校とする。
 *   **同じ日に並ぶときは決めない（null）。**
 * ★ 返す値の意味:
 *   complete    … 決勝から全試合に辿れ、試合数＝学校数−1、無敗はちょうど1校。**全試合が揃っている**。
 *   topExact    … 深さ0・1・2の試合が1・2・4。**準々決勝以降は穴が無い**（穴が下の回戦にあっても上は確か）。
 *   structureOk … complete で、深さごとの試合数が標準の勝ち抜き戦（深さdは2^d、最深は学校数−2^D）。
 *                 回戦が書いていない大会で、**深さから「N回戦」と名付けてよい**条件。
 */
export function tournamentBracket(all) {
  const games = all.filter((g) => g.teams.length === 2 && g.teams[0].score !== g.teams[1].score && g.round !== "3位決定戦" && g.date);
  if (games.length < 15) return null;
  const order = games.map((g, i) => ({ g, i })).sort((a, b) => a.g.date.localeCompare(b.g.date) || a.i - b.i).map((x) => x.g);
  const played = new Map();
  const losses = new Map();
  for (const g of order) {
    for (const t of g.teams) {
      const k = cleanTeamName(t.display);
      if (!played.has(k)) played.set(k, []);
      played.get(k).push(g);
      if (!t.won) losses.set(k, (losses.get(k) ?? 0) + 1);
    }
  }
  const unbeaten = [...played.keys()].filter((k) => !losses.get(k));
  if (!unbeaten.length) return null;
  const lastDate = (k) => played.get(k).at(-1).date;
  const sorted = [...unbeaten].sort((a, b) => lastDate(b).localeCompare(lastDate(a)));
  if (sorted.length > 1 && lastDate(sorted[0]) === lastDate(sorted[1])) return null;
  const champ = sorted[0];
  const final = played.get(champ).at(-1);
  const depth = new Map();
  const stack = [[final, 0]];
  while (stack.length) {
    const [g, d] = stack.pop();
    if (depth.has(g) && depth.get(g) <= d) continue;
    depth.set(g, d);
    for (const t of g.teams) {
      const k = cleanTeamName(t.display);
      const list = played.get(k);
      const prev = list[list.indexOf(g) - 1];
      if (!prev) continue;
      if (!prev.teams.find((x) => cleanTeamName(x.display) === k).won) return null; // 負けた後に試合がある
      stack.push([prev, d + 1]);
    }
  }
  const nTeams = played.size;
  const unreachable = games.filter((g) => !depth.has(g)).length;
  const complete = unbeaten.length === 1 && unreachable === 0 && games.length === nTeams - 1;
  const count = {};
  for (const d of depth.values()) count[d] = (count[d] ?? 0) + 1;
  const topExact = count[0] === 1 && count[1] === 2 && count[2] === 4;
  let structureOk = false;
  const D = Math.ceil(Math.log2(nTeams)) - 1;
  if (complete) {
    structureOk = true;
    for (let d = 0; d < D; d++) if (count[d] !== 2 ** d) structureOk = false;
    if (count[D] !== nTeams - 2 ** D) structureOk = false;
  }
  const labelOf = (g) => {
    if (g.round) return g.round;
    const d = depth.get(g);
    if (d === undefined) return null;
    if (d === 0) return "決勝";
    if (!topExact && !structureOk) return null;
    if (d === 1) return "準決勝";
    if (d === 2) return "準々決勝";
    return structureOk ? `${D - d + 1}回戦` : null;
  };
  return { games, played, depth, champ, final, nTeams, complete, topExact, structureOk, labelOf, unbeaten };
}

/*
  ★★**シード表記の付いた校名には slug が付かない**（神奈川2023夏の「第3シード 横浜商業」。生成物が校名で学校マスタを引くため）。
  なので **slug だけで「その学校の試合」を探すと、シード校の試合が抜ける**。校名（シード表記を外したもの）でも探す。
*/
export const isSelfTeam = (t, schoolSlug, team) => t.slug === schoolSlug || (team && cleanTeamName(t.display) === team);

export function regionalRunGames({ districtSlug, tournament, schoolSlug, year, team }) {
  const d = district(districtSlug);
  const all = d.games.filter((g) => g.tournament === tournament && (!year || (g.date ?? "").startsWith(String(year))));
  const mine = all.filter((g) => g.teams.some((t) => isSelfTeam(t, schoolSlug, team)));
  return { all, mine, source: { name: d.sourceName, url: d.sourceUrl }, district: d, bracket: tournamentBracket(all) };
}

export function toRegionalRunGame(g, schoolSlug, label, team) {
  const self = g.teams.find((t) => isSelfTeam(t, schoolSlug, team));
  const other = g.teams.find((t) => t !== self);
  const outcome = self.score === other.score && !self.won && !other.won ? "draw" : self.won ? "win" : "loss";
  const row = {
    round: label ?? g.round ?? "（回戦不明）",
    ...(jaDate(g.date) ? { date: jaDate(g.date) } : {}),
    opponent: cleanTeamName(other.display),
    scoreFor: self.score,
    scoreAgainst: other.score,
    outcome,
  };
  if (g.note) row.note = g.note;
  return row;
}

// ------------------------------------------------------------------
// 校名 → 公立校（任意）。**事実の確認用で、記事には出さない。**
// ------------------------------------------------------------------
/*
  学校マスタを丸ごと読む（3,505行・約2MB）。転送量の上限に当たった経緯があるので、
  **既定では呼ばない。** 環境変数 SENPU_SCHOOLS_CACHE に控え（JSON）を指すと、それを読む。
  無ければ `--public-flags` を付けたときだけ取りに行く。
*/
const SHORT_NAME_OVERRIDES = {
  gifushogyo: "県立岐阜商業",
  "gifu-gifushogyo": "市立岐阜商業",
  "wakayama-wakayama": "市立和歌山",
};

export async function loadAllSchools() {
  // 3,500行・約2MBを毎回取らない。既定は一時フォルダに控える（24時間で取り直す）。
  // 学校マスタを入れ替えた直後は、控えを消してから走らせること。
  const file = process.env.SENPU_SCHOOLS_CACHE ?? path.join(os.tmpdir(), "kouritsu-schools-cache.json");
  if (fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < 24 * 3600 * 1000) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("環境変数がありません");
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(
      `${url}/rest/v1/schools?select=slug,name,official_name,city,establishment,school_kind,prefecture:prefectures(name,slug)&order=slug.asc`,
      { headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + 999}`, "Range-Unit": "items" } },
    );
    if (!res.ok) throw new Error(`schools ${res.status}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) break;
  }
  fs.writeFileSync(file, JSON.stringify(rows));
  return rows;
}

/** [大会記事の校名, 県, 説明, 設置区分]。公立と分かっているのに学校マスタで引けない学校 */
const DEFUNCT_PUBLIC = [
  ["観音寺中央", "香川", "香川県立観音寺中央高校（2017年に三豊工業と統合→観音寺総合 kanonjisogo）", "prefectural"],
  ["市川", "山梨", "山梨県立市川高校（2020年に峡南・増穂商と統合→青洲 seishu。市川は2022年に廃校。DBに市川の記録は無い）", "prefectural"],
  ["鳴門工", "徳島", "鳴門市立鳴門工業高校（2012年に鳴門第一と統合→鳴門渦潮 narutozushio）", "municipal"],
  // マスタに県立と市立の同名校が2校あり、鍵が捨てられているもの（どちらも公立）
  ["広島商", "広島", "広島県立広島商業高校", "prefectural"],
  ["広島工", "広島", "広島県立広島工業高校", "prefectural"],
  ["前橋", "群馬", "群馬県立前橋高校", "prefectural"],
  // 大会記事の略し方がマスタの校名と合わないもの
  ["県和歌山商", "和歌山", "和歌山県立和歌山商業高校", "prefectural"],
  ["市和歌山商", "和歌山", "和歌山市立和歌山商業高校（のち市立和歌山）", "municipal"],
];

/** `getSchoolNameIndex("koshien").find` と同じ規則（src/lib/queries/schools.ts）。県岐阜商などの別名だけ補う */
export function makeResolve(rows) {
  const byName = new Map();
  const byNameAndPref = new Map();
  for (const row of rows) {
    const prefName = Array.isArray(row.prefecture) ? row.prefecture[0]?.name : row.prefecture?.name;
    const ref = { slug: row.slug, name: row.name, pref: prefName ?? "", establishment: row.establishment };
    const short = SHORT_NAME_OVERRIDES[row.slug] ?? row.name.replace(/高校$/, "");
    const keys = [row.name, row.official_name ?? "", short].map(normalizeName).filter(Boolean);
    for (const k of new Set(keys)) {
      const found = byName.get(k);
      if (found === undefined) byName.set(k, ref);
      else if (found && found.slug !== row.slug) byName.set(k, null);
      if (!ref.pref) continue;
      const withPref = `${k}\t${prefectureKey(ref.pref)}`;
      const inPref = byNameAndPref.get(withPref);
      if (inPref === undefined) byNameAndPref.set(withPref, ref);
      else if (inPref && inPref.slug !== row.slug) byNameAndPref.set(withPref, null);
    }
  }
  // 大会記事は県立岐阜商を「県岐阜商」、市立岐阜商を「市岐阜商」と書く
  const alias = new Map([
    [`県岐阜商\t岐阜`, "gifushogyo"],
    [`市岐阜商\t岐阜`, "gifu-gifushogyo"],
    [`市和歌山\t和歌山`, "wakayama-wakayama"],
  ]);
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  /*
    ★★**校名では引けない公立校**（2026-11-04 に1990年以降のベスト4を全部見て見つけた）。
    ★★★**閉校校は「学校マスタに無い」のではなかった** ── 運営者の指摘「統合した可能性もある」で確かめると、
    **承継先がマスタにいて、DB の出場歴（`school_championships`）も引き継いである**
    （旧校名は note に「…として出場」）:
      観音寺中央（1995春優勝）→ 観音寺総合 `kanonjisogo`（2017/4 に三豊工業と統合）
      鳴門工・鳴門第一・鳴門商 → 鳴門渦潮 `narutozushio`（2012年に統合）
    ★ただし **`getSchoolNameIndex` は校名の完全一致しか見ない**ので、サイト本体は承継先に結び付けられず、
    **公立の優勝・準優勝が数えられていない**（`/koshien/public/champions` に観音寺中央が出ない）。
    ★★**市川（山梨県立・1991春ベスト4）だけは、統合先の青洲 `seishu` に記録が無い**（DB 側の欠落）。
    ★**現存校なのに表記が違って引けない公立校も多い**（広島商・広島工・前橋・弘前実・盛岡三…）。
    1985年以降で49校・91行 ── `scripts/senpu/find-successors.mjs` で出せる。
    ★**ここは「1990年以降のベスト4と、記事に出す対戦相手」を目で確かめて足した表。**
    出場校の全体を網羅してはいない（なので「公立校はN校出場」とは書かない）。
  */
  const defunct = new Map(
    DEFUNCT_PUBLIC.map(([d, p, name, est]) => [
      `${normalizeName(d)}	${prefectureKey(p)}`,
      { slug: `defunct:${d}:${p}`, name, pref: p, establishment: est, defunct: true },
    ]),
  );
  /*
    ★★**大会記事は市立校を「市◯◯」と書くことがある**（市船橋・市習志野・市尼崎・市西宮・市呉・市沼津・市柏・市銚子）。
    学校マスタの校名は「船橋高校」「習志野高校」なので、**直接は当たらない。**
    サイト本体の `getSchoolNameIndex` もここを拾えておらず、**市立船橋や市立習志野が
    「公立」に数えられていない**（2026-11-04 に見つけた。README「甲子園の公立判定の穴」）。
    ★**この関数では「市」を外した残りが、同じ県の市立（municipal）にちょうど1校あるとき」だけ当てる。**
    県立の同名校（船橋高校＝県立）には当てない。
  */
  const municipal = (display, pref) => {
    const m = display.match(/^市(.+)$/);
    if (!m) return null;
    const rest = normalizeName(m[1]);
    const hits = rows.filter(
      (r) =>
        r.establishment === "municipal" &&
        normalizeName(r.name) === rest &&
        (!pref || prefectureKey(r.prefecture?.name ?? "") === prefectureKey(pref)),
    );
    if (hits.length !== 1) return null;
    const r = hits[0];
    return { slug: r.slug, name: r.name, pref: r.prefecture?.name ?? "", establishment: r.establishment };
  };
  return (display, pref) => {
    const key = normalizeName(display);
    if (!key) return null;
    if (pref) {
      const k = `${key}\t${prefectureKey(pref)}`;
      const hit = byNameAndPref.get(k);
      if (hit) return hit;
      if (defunct.has(k)) return defunct.get(k);
      if (hit === null) return null;
      const a = alias.get(k);
      if (a) {
        const r = bySlug.get(a);
        return r ? { slug: r.slug, name: r.name, pref: r.prefecture?.name ?? "", establishment: r.establishment } : null;
      }
      return municipal(display, pref);
    }
    return byName.get(key) ?? municipal(display, pref);
  };
}
