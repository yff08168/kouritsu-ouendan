/**
 * 開催中の甲子園の試合結果を **日本高野連の公式サイト** から取り、
 * src/lib/data/live-results.ts を作る。
 *
 *   node --env-file=.env.local scripts/build-live-results.mjs
 *   node --env-file=.env.local scripts/build-live-results.mjs --dry   … 書き出さずに報告だけ
 *   node --env-file=.env.local scripts/build-live-results.mjs --year 2026
 *
 * GitHub Actions から定期実行し、差分があればコミットする想定
 * （.github/workflows/update-results.yml）。
 *
 * ------------------------------------------------------------------
 * なぜ Wikipedia から高野連に変えたのか（2026-08-13）
 *
 *   1. **一次情報**になる（Wikipediaは誰でも編集できる二次情報）
 *   2. **次戦の日付・第何試合・開始時刻が出せる**
 *      Wikipediaのブラケットは未実施カードが「月日（）」のままで、
 *      日付も時刻も入っていない（記事全体に時刻の記述が0件だった）
 *   3. **都道府県が併記**されているので学校マスタとの照合が確実
 *   4. 全試合のイニングスコアがある（Wikipediaは決勝しか持たない）
 *
 *   利用規約・サイトポリシーとも無く、robots.txt も404（2026-08-13 確認）。
 *   一球速報.com とバーチャル高校野球は規約で使えない（README参照）。
 *
 * ------------------------------------------------------------------
 * ページの構造
 *
 *   一覧 /sensyuken/<年>/schedule/          … schedule_YYYYMMDD.html へのリンク
 *   代表校 /sensyuken/<年>/team/            … 「地区名」「略称」「出場回数」
 *   日別 /sensyuken/<年>/schedule/schedule_YYYYMMDD.html
 *
 *     <h4>8月9日(日) ＜大会5日目＞</h4>
 *     <h5>第3試合(1回戦)  16:20</h5>
 *     <p class="p-tournament-result__score">鳴門渦潮 (徳島) 2 - 1 八王子実践 (西東京)</p>
 *     <table class="p-tournament-result__table"> … イニングスコア … </table>
 *
 *   **未実施の試合はスコアの数字が無く、表も無い。** 見出しと対戦カードだけが
 *   先に載る。ここから次戦の日付・試合番号・開始時刻が取れる。
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "src", "lib", "data", "live-results.ts");
const ORIGIN = "https://www.jhbf.or.jp";
const UA = { "User-Agent": "kouritsu-ouendan/1.0 (https://kouritsu-ouendan.com)" };

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const yearIdx = args.indexOf("--year");
const YEAR = yearIdx >= 0 ? Number(args[yearIdx + 1]) : new Date().getFullYear();

/**
 * 大会の回数。**「年 − 第1回の年 + 1」では出せない。**
 * 戦争で中止になった年があるため。夏は `年 - 1918`（README参照）。
 */
const TOURNAMENT_NO = YEAR - 1918;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(3000 * attempt);
    const res = await fetch(url, { headers: UA });
    if (res.ok) {
      await sleep(1200); // 相手のサーバーに負担をかけない
      return res.text();
    }
    if (res.status === 404) return null;
    if (res.status !== 429 && res.status < 500) {
      throw new Error(`${url} → HTTP ${res.status}`);
    }
  }
  throw new Error(`${url} → 取得できません`);
}

/** タグを落として素のテキストにする */
function plain(html) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// ------------------------------------------------------------------
// 代表校（地区名 → 略称）
// ------------------------------------------------------------------

/**
 * 代表校の表を読む。行は「地区名／略称／出場回数」の3セル。
 * 返すのは [{ district, display }]。
 */
function parseTeams(html) {
  const teams = [];
  for (const row of html.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) =>
      plain(m[1]),
    );
    if (cells.length < 3) continue;
    const [district, display] = cells;
    // 見出し行（「地方大会」「代表校」）を弾く
    if (!district || !display || district === "地方大会") continue;
    teams.push({ district, display });
  }
  return teams;
}

// ------------------------------------------------------------------
// 日別ページ
// ------------------------------------------------------------------

/** 「8月9日(日) ＜大会5日目＞」→「8月9日」 */
function parseDate(html) {
  const m = html.match(/<h4[^>]*>([\s\S]*?)<\/h4>/);
  const text = m ? plain(m[1]) : "";
  return text.match(/\d+月\d+日/)?.[0] ?? null;
}

/**
 * 1日ぶんの試合を取り出す。
 *
 * 見出し `第N試合(回戦) 時刻` の直後にスコア行が来る。表があれば実施済み。
 * **未実施の判定はスコアの数字の有無で行う。** 表の有無で判定すると、
 * 試合中（表が途中まで出ている）の扱いを間違える。
 */
function parseDay(html, date) {
  const games = [];
  // 見出しとスコア行とテーブルを、出てくる順に拾う
  const re =
    /<h5[^>]*>([\s\S]*?)<\/h5>|<p class="p-tournament-result__score">([\s\S]*?)<\/p>|<table[^>]*p-tournament-result__table[\s\S]*?<\/table>/g;

  let heading = null;
  let pending = null;

  const flush = () => {
    if (pending) games.push(pending);
    pending = null;
  };

  for (const m of html.matchAll(re)) {
    if (m[1] !== undefined) {
      const text = plain(m[1]);
      const h = text.match(/第(\d+)試合\s*[(（]([^)）]+)[)）]\s*(\d{1,2}:\d{2})?/);
      // 「朝の部」「午後の部」は試合の見出しではない
      if (h) heading = { order: h[1], round: h[2], startTime: h[3] ?? null };
      continue;
    }

    if (m[2] !== undefined) {
      flush();
      const text = plain(m[2]);
      // 「鳴門渦潮 (徳島) 2 - 1 八王子実践 (西東京)」／未実施はスコアが無い
      const s = text.match(
        /^(.+?)\s*[(（](.+?)[)）]\s*(\d+)?\s*[-−]\s*(\d+)?\s*(.+?)\s*[(（](.+?)[)）]$/,
      );
      if (!s || !heading) continue;
      const [, nameA, prefA, scoreA, scoreB, nameB, prefB] = s;
      pending = {
        round: heading.round,
        date,
        order: heading.order,
        startTime: heading.startTime,
        walkOff: false,
        played: scoreA !== undefined && scoreB !== undefined,
        teams: [
          { display: nameA.trim(), district: prefA.trim(), score: scoreA ? Number(scoreA) : null },
          { display: nameB.trim(), district: prefB.trim(), score: scoreB ? Number(scoreB) : null },
        ],
      };
      continue;
    }

    // イニングスコアの表。**先攻が上の行、後攻が下の行。**
    if (pending && pending.played) {
      const rows = [...m[0].matchAll(/<tr(?![^>]*class="inning")[^>]*>([\s\S]*?)<\/tr>/g)];
      const parsed = rows
        .map((r) => {
          const name = plain(r[1].match(/<th[^>]*>([\s\S]*?)<\/th>/)?.[1] ?? "");
          const cells = [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) =>
            plain(c[1]),
          );
          return { name, cells };
        })
        .filter((r) => r.name && r.cells.length > 1);

      /*
        **サヨナラは出典が明示している。** イニングのセルが「1X」のように
        大文字Xで終わる。イニングスコアから推測で導く必要はない。

        （Wikipedia は合計スコア側に小文字 `x` を付けていた。高野連は
        イニングのセルに大文字 `X`。同じ意味だが場所も字も違う。
        `Number("1X")` は NaN になるので、数値化する前に見ること。）
      */
      if (parsed.some((r) => r.cells.some((c) => /^\d+X$/i.test(c)))) {
        pending.walkOff = true;
      }
    }
  }
  flush();
  return games;
}

// ------------------------------------------------------------------
// 学校マスタとの照合
// ------------------------------------------------------------------

/**
 * 略称の候補。`src/lib/school-name.ts` と同じ規則。
 *
 * **スクリプトは .mjs なので TS を import できない。** 規則を変えるときは
 * 両方直すこと。ここでしか使わない照合用なので、ずれても表示は壊れない
 * （照合できなくなるだけで、その旨が報告に出る）。
 */
function labelCandidates(name, aliases) {
  const set = new Set([name, ...(aliases ?? [])]);
  const short = name.replace(/高校$/, "");
  set.add(short);
  set.add(short.replace(/商業$/, "商").replace(/工業$/, "工").replace(/農業$/, "農"));
  return [...set].filter(Boolean);
}

/** 学校マスタを全件取る（公立・国立・高専のみ。私立は入っていない） */
async function fetchSchools(supabase) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("schools")
      .select("slug, name, name_aliases, prefecture:prefectures ( name )")
      .order("slug", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error("学校マスタの取得: " + error.message);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return rows;
}

/**
 * 「地区名＋略称」→ 学校。
 *
 * **1件に決まらなければ結び付けない。** 同じ地区に略称が同じ学校が
 * 2つあるとき（岐阜商業＝県立と市立）に取り違えるより、
 * 照合できなかったものとして報告するほうがよい。
 */
function buildIndex(schools) {
  /** 「地区名\t略称」→ slug の配列 */
  const index = new Map();
  for (const s of schools) {
    const district = s.prefecture?.name;
    if (!district) continue;
    for (const label of labelCandidates(s.name, s.name_aliases)) {
      const key = `${district}\t${label}`;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(s);
    }
  }
  return index;
}

// ------------------------------------------------------------------

async function main() {
  console.log(`第${TOURNAMENT_NO}回全国高等学校野球選手権大会（${YEAR}年）`);

  const scheduleIndexUrl = `${ORIGIN}/sensyuken/${YEAR}/schedule/`;
  const indexHtml = await fetchText(scheduleIndexUrl);

  /*
    **その年の日程ページはまだ無いのが普通。** 夏の大会ページが立つのは
    毎年6〜7月ごろで、年が明けてから数か月は404になる。
    ここで例外を投げると、CIが3時間おきに失敗し続ける。

    生成物は**書き換えずに終わる。** 空で上書きすると、まだ画面に出したい
    直近の大会の結果まで消えてしまう。
  */
  if (!indexHtml) {
    console.log(`${YEAR}年の日程ページはまだありません（${scheduleIndexUrl}）。`);
    console.log("生成物はそのままにして終了します。");
    return;
  }

  const dates = [
    ...new Set([...indexHtml.matchAll(/schedule_(\d{8})\.html/g)].map((m) => m[1])),
  ].sort();
  console.log(`日別ページ: ${dates.length} 日ぶん（${dates[0]} 〜 ${dates.at(-1)}）`);

  // ---- 代表校 ----
  const teamHtml = await fetchText(`${ORIGIN}/sensyuken/${YEAR}/team/`);
  const teams = teamHtml ? parseTeams(teamHtml) : [];
  console.log(`代表校: ${teams.length} 校`);

  // ---- 学校マスタと突き合わせ ----
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const index = buildIndex(await fetchSchools(supabase));

  /** 「地区名\t略称」→ { slug, name, prefecture } */
  const publicTeams = new Map();
  const ambiguous = [];
  for (const t of teams) {
    const hits = index.get(`${t.district}\t${t.display}`) ?? [];
    if (hits.length === 1) {
      publicTeams.set(`${t.district}\t${t.display}`, {
        slug: hits[0].slug,
        name: hits[0].name,
        // 画面では高野連の略称を出す。学校マスタの「大分商業高校」だと
        // 相手校（略称）と並んだときに公立だけ長くなって不揃いに見える
        display: t.display,
        prefecture: t.district,
      });
    } else if (hits.length > 1) {
      ambiguous.push(`${t.district} ${t.display} → ${hits.map((h) => h.slug).join(" / ")}`);
    }
  }
  console.log(`公立の代表校: ${publicTeams.size} 校`);
  if (ambiguous.length) {
    console.log("⚠️ 1件に決まらず結び付けなかったもの:");
    for (const a of ambiguous) console.log("   " + a);
  }

  // ---- 日別ページ ----
  const allGames = [];
  for (const d of dates) {
    const html = await fetchText(
      `${ORIGIN}/sensyuken/${YEAR}/schedule/schedule_${d}.html`,
    );
    if (!html) continue;
    const date = parseDate(html) ?? `${Number(d.slice(4, 6))}月${Number(d.slice(6, 8))}日`;
    allGames.push(...parseDay(html, date));
  }
  console.log(`試合: ${allGames.length} 件（うち実施済み ${allGames.filter((g) => g.played).length} 件）`);

  const decorate = (t) => {
    const hit = publicTeams.get(`${t.district}\t${t.display}`);
    return {
      display: t.display,
      name: hit?.name ?? t.display,
      slug: hit?.slug ?? null,
      prefecture: hit?.prefecture ?? null,
      score: t.score ?? 0,
      won: false,
    };
  };

  // ---- 公立が絡む実施済みの試合 ----
  const games = [];
  for (const g of allGames) {
    if (!g.played) continue;
    const teamsOut = g.teams.map(decorate);
    if (!teamsOut.some((t) => t.slug)) continue;
    const [a, b] = teamsOut;
    a.won = a.score > b.score;
    b.won = b.score > a.score;
    games.push({
      round: g.round,
      date: g.date,
      order: g.order,
      startTime: g.startTime,
      // サヨナラ勝ちした側（後攻）だけに印を付けたいので、勝者と一致するか見る
      walkOff: g.walkOff,
      teams: teamsOut,
    });
  }
  console.log(`公立が絡む試合: ${games.length} 件`);

  // ---- 勝ち残り ----
  /** 負けた学校 */
  const lost = new Set();
  const winsBySlug = new Map();
  for (const g of games) {
    for (const t of g.teams) {
      if (!t.slug) continue;
      if (t.won) winsBySlug.set(t.slug, (winsBySlug.get(t.slug) ?? 0) + 1);
      else lost.add(t.slug);
    }
  }

  /**
   * 次戦。**未実施の試合から引く。** ここが高野連に変えた最大の効き目で、
   * 日付・第何試合・開始時刻がそろう。
   */
  const nextBySlug = new Map();
  for (const g of allGames) {
    if (g.played) continue;
    const teamsOut = g.teams.map(decorate);
    for (const [i, t] of teamsOut.entries()) {
      if (!t.slug || nextBySlug.has(t.slug)) continue;
      nextBySlug.set(t.slug, {
        round: g.round,
        date: g.date,
        order: g.order,
        startTime: g.startTime,
        opponent: teamsOut[1 - i].display,
      });
    }
  }

  const alive = [...publicTeams.values()]
    .filter((t) => !lost.has(t.slug))
    .map((t) => ({
      slug: t.slug,
      display: t.display,
      name: t.name,
      prefecture: t.prefecture,
      wins: winsBySlug.get(t.slug) ?? 0,
      next: nextBySlug.get(t.slug) ?? null,
    }))
    .sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name, "ja"));

  console.log(
    `勝ち残り: ${alive.length} 校 — ` +
      alive.map((s) => `${s.display}(${s.wins}勝)`).join("、"),
  );
  for (const s of alive) {
    if (s.next) {
      console.log(
        `   ${s.display} 次戦: ${s.next.date} 第${s.next.order}試合 ${s.next.startTime ?? "時刻未定"} ${s.next.round} vs ${s.next.opponent}`,
      );
    }
  }

  const results = {
    tournamentTitle: `第${TOURNAMENT_NO}回全国高等学校野球選手権大会`,
    season: "summer",
    year: YEAR,
    sourceUrl: scheduleIndexUrl,
    games,
    alive,
  };

  if (DRY) {
    console.log("\n--dry のため書き出しません。");
    return;
  }

  /*
    **生成物にタイムスタンプを入れない。** 入れるとCIが3時間おきに
    中身の同じコミットを積み続ける（入力が同じなら出力も同じにする）。
  */
  const file =
    `// このファイルは scripts/build-live-results.mjs が生成する。直接編集しない。\n` +
    `// 出典: 公益財団法人日本高等学校野球連盟（一次情報）\n` +
    `//   ${scheduleIndexUrl}\n\n` +
    `import type { LiveResults } from "@/lib/live-results";\n\n` +
    `export const LIVE_RESULTS: LiveResults = ${JSON.stringify(results, null, 2)};\n`;

  writeFileSync(OUT, file, "utf8");
  console.log(`\n書き出した: ${path.relative(ROOT, OUT)}`);
}

await main();
