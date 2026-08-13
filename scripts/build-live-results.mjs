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
 *   組み合わせ /sensyuken/<年>/tournament/  … ブラケット（次戦の第2の出典）
 *   日別 /sensyuken/<年>/schedule/schedule_YYYYMMDD.html
 *
 *     <h4>8月9日(日) ＜大会5日目＞</h4>
 *     <h5>第3試合(1回戦)  16:20</h5>
 *     <p class="p-tournament-result__score">鳴門渦潮 (徳島) 2 - 1 八王子実践 (西東京)</p>
 *     <table class="p-tournament-result__table"> … イニングスコア … </table>
 *
 *   **未実施の試合はスコアの数字が無く、表も無い。** 見出しと対戦カードだけが
 *   先に載る。ここから次戦の日付・試合番号・開始時刻が取れる。
 *
 * ------------------------------------------------------------------
 * 次戦の出典は2つある（2026-08-13 追加）
 *
 *   日別ページは**日程が発表された日ぶんしか無い**（2〜3日先まで）。
 *   勝った直後の学校は、対戦相手が抽選で決まっているのにページが無くて
 *   次戦が空になる。そこを組み合わせ表 `/sensyuken/<年>/tournament/` で
 *   補う。詳しくは下の「組み合わせ表」の節。
 *
 *   **日別ページ由来を優先する。** 組み合わせ表には開始時刻が無く、
 *   日付も「第N日」からの換算なので、日程が出ていればそちらが正しい。
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

/**
 * 「8月9日(日) ＜大会5日目＞」→ { date: "8月9日", dayNo: 5 }
 *
 * **大会何日目かも取る。** 組み合わせ表の試合は「第10日 第2試合」としか
 * 書かれていないので、日付に直すのにこの対応表が要る。
 */
function parseDate(html) {
  const m = html.match(/<h4[^>]*>([\s\S]*?)<\/h4>/);
  const text = m ? plain(m[1]) : "";
  return {
    date: text.match(/\d+月\d+日/)?.[0] ?? null,
    dayNo: Number(text.match(/大会\s*(\d+)\s*日目/)?.[1]) || null,
  };
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
// 組み合わせ表（次戦を日程発表より先に出すための第2の出典）
// ------------------------------------------------------------------

/*
 * なぜ日別ページだけでは足りないのか（2026-08-13 に追加）
 *
 *   高野連は**日程が発表された日ぶんのページしか作らない。** 2026-08-13
 *   の時点で日別ページは 8/5〜8/13 の9日ぶんしか無く、8/14 の第10日
 *   第2試合（鳴門渦潮 対 霞ケ浦）は日別ページのどこにも出てこない。
 *   一方その対戦は**8月1日の抽選で決まっている**（3回戦までは大会前に
 *   抽選し、準々決勝以降だけ勝ちチーム主将がくじを引く）。
 *
 *   その決まっているぶんが載っているのが `/sensyuken/<年>/tournament/`。
 *   ここから**トーナメントの形**だけを取り、勝敗は日別ページで解決する。
 *
 * ------------------------------------------------------------------
 * ページの構造
 *
 *   罫線をGIF画像で描いた古い作りの table が13個並んでいる。
 *   意味を持つセルは2種類しかない。
 *
 *     <td class="teamName">鳴門渦潮 (徳島)</td>
 *     <td colspan="3" class="gameDay">第5日 第3試合</td>
 *
 *   **1つの table が、そのままブラケットの部分木の中置表記になっている。**
 *   セルの左からの位置（colspan を数えた列番号）が回戦の深さで、
 *   列番号が大きいほど後の回戦＝木の上のほう。だから
 *   「いちばん列番号の大きい試合で左右に割る」を再帰すれば木になる。
 *
 *     [東筑 G1 神村学園] G3 [聖隷 G1 佐野日大]  ← G3 が 2回戦、G1 が 1回戦
 *
 *   **チームが1つも無い table（8〜12番目）は読まない。** 準々決勝以降は
 *   くじ引きなので、線がつながっていても対戦相手は決まっていない。
 *   つまり**各 table の根は必ず3回戦**で、そこから下だけが確定している。
 */

/** 「第5日 第3試合」→ { dayNo: 5, order: "3" }。決勝など試合番号が無ければ order は null */
function parseGameLabel(text) {
  const day = text.match(/第(\d+)日/);
  if (!day) return null;
  const order = text.match(/第(\d+)試合/);
  return { dayNo: Number(day[1]), order: order ? order[1] : null };
}

/** table 1つを、中置表記のまま [{kind:"team"|"game", ...}] にほどく */
function parseBracketTable(tableHtml) {
  const items = [];
  for (const row of tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []) {
    let col = 0;
    for (const cell of row.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)) {
      const [, attrs, inner] = cell;
      const text = plain(inner);
      if (text) {
        if (/class="[^"]*teamName/.test(attrs)) {
          // 「鳴門渦潮 (徳島)」。日別ページと同じ「略称＋地区名」の形
          const m = text.match(/^(.+?)\s*[(（](.+?)[)）]$/);
          if (m) items.push({ kind: "team", display: m[1].trim(), district: m[2].trim() });
        } else if (/class="[^"]*gameDay/.test(attrs)) {
          const label = parseGameLabel(text);
          if (label) items.push({ kind: "game", col, ...label });
        }
        // それ以外の文字のあるセルはスコア。勝敗は日別ページで解決するので読まない
      }
      col += Number(/colspan="(\d+)"/.exec(attrs)?.[1] ?? 1);
    }
  }
  return items;
}

/** 中置表記を木にする。列番号のいちばん大きい試合で割るのを繰り返す */
function buildBracketTree(items) {
  if (items.length === 0) return null;
  if (items.length === 1) return items[0].kind === "team" ? items[0] : null;

  let at = -1;
  for (const [i, item] of items.entries()) {
    if (item.kind === "game" && (at < 0 || item.col > items[at].col)) at = i;
  }
  if (at < 0) return null;

  const left = buildBracketTree(items.slice(0, at));
  const right = buildBracketTree(items.slice(at + 1));
  if (!left || !right) return null;
  return { kind: "game", dayNo: items[at].dayNo, order: items[at].order, left, right };
}

/**
 * 組み合わせ表を木の配列にする。**チームを含む table だけ**を返す。
 * 木ごとに、根から数えた深さで回戦名を振る（根＝3回戦）。
 */
const BRACKET_ROUNDS = ["3回戦", "2回戦", "1回戦"];

function parseBracket(html) {
  const trees = [];
  for (const m of html.matchAll(/<table class="tournamentTable">([\s\S]*?)<\/table>/g)) {
    const items = parseBracketTable(m[1]);
    if (!items.some((i) => i.kind === "team")) continue; // 準々決勝以降は未確定
    const tree = buildBracketTree(items);
    if (tree && tree.kind === "game") trees.push(tree);
  }

  const label = (node, depth) => {
    if (node.kind !== "game") return;
    node.round = BRACKET_ROUNDS[depth] ?? null;
    label(node.left, depth + 1);
    label(node.right, depth + 1);
  };
  for (const t of trees) label(t, 0);
  return trees;
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
  /** 大会何日目か → 「8月13日」。組み合わせ表の「第10日」を日付に直すのに使う */
  const dayNoToDate = new Map();
  for (const d of dates) {
    const html = await fetchText(
      `${ORIGIN}/sensyuken/${YEAR}/schedule/schedule_${d}.html`,
    );
    if (!html) continue;
    const head = parseDate(html);
    const date = head.date ?? `${Number(d.slice(4, 6))}月${Number(d.slice(6, 8))}日`;
    if (head.dayNo) dayNoToDate.set(head.dayNo, date);
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
  const dateToDayNo = new Map([...dayNoToDate].map(([no, date]) => [date, no]));
  const nextBySlug = new Map();
  for (const g of allGames) {
    if (g.played) continue;
    const teamsOut = g.teams.map(decorate);
    for (const [i, t] of teamsOut.entries()) {
      if (!t.slug || nextBySlug.has(t.slug)) continue;
      nextBySlug.set(t.slug, {
        round: g.round,
        date: g.date,
        dayNo: dateToDayNo.get(g.date) ?? null,
        order: g.order,
        startTime: g.startTime,
        opponent: teamsOut[1 - i].display,
        provisional: false,
      });
    }
  }

  /*
    **日程がまだ発表されていないぶんを組み合わせ表から補う。**

    上の nextBySlug は日別ページ由来なので、開始時刻まで分かるかわりに
    「その日のページが出ていること」が前提になる。高野連は2〜3日先の
    ぶんしか出さないので、勝った直後の学校は次戦が空のままになる。
    抽選は3回戦まで済んでいるのだから、そこは埋められる。

    **日別ページ由来を必ず優先する。** 組み合わせ表には開始時刻が無く、
    日付も「第N日」からの換算なので、実際の日程が出ていればそちらが正しい。
  */
  const nextFromBracket = new Map();
  const bracketUrl = `${ORIGIN}/sensyuken/${YEAR}/tournament/`;
  const bracketHtml = await fetchText(bracketUrl);
  const brackets = bracketHtml ? parseBracket(bracketHtml) : [];

  if (!brackets.length) {
    console.log(`⚠️ 組み合わせ表を読めませんでした（${bracketUrl}）。次戦は日別ページのぶんだけになります。`);
  } else {
    /** 「8月13日\t2」→ 実施済みの試合 */
    const playedByKey = new Map();
    for (const g of allGames) {
      if (g.played) playedByKey.set(`${g.date}\t${g.order}`, g);
    }

    /**
     * 「第N日」を日付に直す。
     *
     * 日別ページが出ていればそこから引く。出ていない先の日は
     * **1日ずつ進むと仮定して外挿する**が、次の条件を満たすときだけ。
     *
     *   1. 分かっている日がすべて第1日から1日ずつ並んでいること
     *      （雨天順延が起きるとここが崩れる。崩れたら外挿しない）
     *   2. 分かっている最後の日から3日以内であること
     *
     * **休養日は考えなくてよい。** 休養日は「3回戦2日目・準々決勝・
     * 準決勝の各翌日」で、ここで扱うのは3回戦までなので必ず連続の区間に入る。
     */
    const known = [...dayNoToDate.entries()].sort((a, b) => a[0] - b[0]);
    const toDate = (s) => {
      const m = s.match(/(\d+)月(\d+)日/);
      return m ? new Date(YEAR, Number(m[1]) - 1, Number(m[2])) : null;
    };
    const format = (d) => `${d.getMonth() + 1}月${d.getDate()}日`;
    const DAY_MS = 86400000;
    const base = known.length ? { no: known[0][0], at: toDate(known[0][1]) } : null;
    const consecutive =
      base?.at != null &&
      known.every(([no, date]) => {
        const at = toDate(date);
        return at && at.getTime() - base.at.getTime() === (no - base.no) * DAY_MS;
      });
    const lastKnownNo = known.length ? known.at(-1)[0] : 0;
    if (!consecutive) {
      console.log("⚠️ 大会日と日付が1日ずつ並んでいません（順延？）。未発表の日は日付を出しません。");
    }

    const dateOfDay = (dayNo) => {
      const hit = dayNoToDate.get(dayNo);
      if (hit) return hit;
      if (!consecutive || dayNo <= lastKnownNo || dayNo > lastKnownNo + 3) return null;
      return format(new Date(base.at.getTime() + (dayNo - base.no) * DAY_MS));
    };

    /** その試合の勝者。まだなら null。葉はその学校自身 */
    const winnerOf = (node) => {
      if (node.kind === "team") return node;
      const date = dayNoToDate.get(node.dayNo);
      if (!date) return null;
      const g = playedByKey.get(`${date}\t${node.order}`);
      if (!g) return null;
      const [a, b] = g.teams;
      if (a.score === b.score) return null; // 引き分け再試合
      const w = a.score > b.score ? a : b;
      return { display: w.display, district: w.district };
    };

    /*
      **回戦名の付け方が正しいか、実施済みの試合で検算する。**
      組み合わせ表には回戦名が書かれておらず「根が3回戦」という前提で
      深さから振っている。ページの組み方が変わればこの前提が崩れるので、
      1件でも食い違ったら組み合わせ表由来の次戦は出さない
      （間違った回戦名を出すより、次戦が出ないほうがよい）。
    */
    const mismatched = [];
    const parents = new Map();
    const leafByKey = new Map();
    for (const tree of brackets) {
      const visit = (node, parent) => {
        if (parent) parents.set(node, parent);
        if (node.kind === "team") {
          leafByKey.set(`${node.district}\t${node.display}`, node);
          return;
        }
        const date = dayNoToDate.get(node.dayNo);
        const g = date ? playedByKey.get(`${date}\t${node.order}`) : null;
        if (g && node.round && g.round !== node.round) {
          mismatched.push(`第${node.dayNo}日 第${node.order}試合: 組み合わせ表=${node.round} / 日別=${g.round}`);
        }
        visit(node.left, node);
        visit(node.right, node);
      };
      visit(tree, null);
    }

    if (mismatched.length) {
      console.log("⚠️ 組み合わせ表の回戦名が日別ページと食い違います。組み合わせ表は使いません:");
      for (const m of mismatched.slice(0, 5)) console.log("   " + m);
    } else {
      for (const [key, t] of publicTeams) {
        if (nextBySlug.has(t.slug)) continue;
        let node = leafByKey.get(key);
        while (node) {
          const parent = parents.get(node);
          // 根まで来た＝3回戦まで勝った。準々決勝以降はくじ引きなので未確定
          if (!parent) break;
          if (winnerOf(parent) === null) {
            const sibling = parent.left === node ? parent.right : parent.left;
            nextFromBracket.set(t.slug, {
              round: parent.round,
              date: dateOfDay(parent.dayNo),
              dayNo: parent.dayNo,
              order: parent.order,
              startTime: null,
              opponent: winnerOf(sibling)?.display ?? null,
              provisional: true,
            });
            break;
          }
          node = parent;
        }
      }
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
      next: nextBySlug.get(t.slug) ?? nextFromBracket.get(t.slug) ?? null,
    }))
    .sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name, "ja"));

  console.log(
    `勝ち残り: ${alive.length} 校 — ` +
      alive.map((s) => `${s.display}(${s.wins}勝)`).join("、"),
  );
  for (const s of alive) {
    if (!s.next) {
      console.log(`   ${s.display} 次戦: 未確定`);
      continue;
    }
    const n = s.next;
    const when = n.date ?? `第${n.dayNo}日`;
    console.log(
      `   ${s.display} 次戦: ${when} 第${n.order}試合 ${n.startTime ?? "時刻未定"} ` +
        `${n.round} vs ${n.opponent ?? "未定"}` +
        (n.provisional ? "（組み合わせ表・日程未発表）" : ""),
    );
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
