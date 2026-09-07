/**
 * 地方大会の試合に「各回の得点」を足す（2026-09-06。運営者の指示）。
 *
 *   node --env-file=.env.local scripts/build-regional-innings.mjs
 *   node --env-file=.env.local scripts/build-regional-innings.mjs --pref yamanashi --dry
 *
 * ==================================================================
 * ★★★ なぜ別のスクリプトなのか
 *
 * **`build-regional-results.mjs` は1日2回のCIで走る。** こちらは
 * **1試合につき1リクエスト**かかるので、同じ流れに入れると
 * **毎回1〜2時間の取得**になり、相手のサーバーに対して重すぎる。
 * ★**取り込みは「まだ各回を持っていない試合」だけ**なので、
 * **初回だけ重く、2回目以降は当日ぶんで済む。**
 *
 * ==================================================================
 * ★★★ どこから取るか
 *
 * **HSB flash の大会ページ（`<県>.hsbflash.jp/tournament`）に、
 * その大会の全試合ぶんの `/flash/<token>` が並んでいる。**
 * ★**47都道府県すべてにある**ので、**連盟が合計しか出していない県でも各回が取れる。**
 *
 *     /tournament          … トーナメント表。全試合への /flash/<token> を含む
 *     /flash/<token>       … 1試合の箱スコア（各回・合計・球場・開始/終了時刻）
 *
 * ★★**トークンを自分で組み立てないこと**（`build-regional-results.mjs` の
 * hsbAdapter に同じ決めごとがある）。**必ず大会ページから辿る。**
 * ★**日付ごとの盤（`/pastgame/<token>`）は使わない** —— **1日前までしか辿れず、**
 * 遡るにはトークンを作ることになる。
 *
 * ==================================================================
 * ★★★ 出所が変わることを画面に出す
 *
 * **スコアは連盟から、各回は速報から**という試合ができる。
 * ★**このサイトは「転記した経路が本当の出所」**という線を守っているので、
 * **元の出典と違うときだけ `inningsSource` を付ける**（試合ページが両方を出す）。
 *
 * ==================================================================
 * ★★★ 結び付けは「取り違えるくらいなら入れない」
 *
 * 突き合わせるのは **日付・両校名・両校の得点**。
 * ★**1件に決まらなければ入れない。** 校名の書き方は出典どうしで違う
 *   （連盟「広島商」／HSB「広島商業」）ので、**部分一致まで許して**、
 *   **それでも2件以上に当たったらその試合は飛ばす。**
 * ★**得点は完全一致を求める**（そこを緩めると別の試合に入る）。
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const OUT_DIR = path.join(ROOT, "src", "lib", "data", "regional");

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] ?? null) : null;
};
const ONLY = flag("--pref");
/** 1県あたりに開く試合ページの上限。**試すとき用**（既定は上限なし） */
const LIMIT = Number(flag("--limit") ?? 0) || Infinity;
/**
 * ★★**空振りが続いたら、その県は切り上げる**（2026-09-07）。
 *
 * **控えが効くのは「取り込めた試合」だけ**で、**まだ行われていない試合は毎回開き直す**
 * ことになる（終わったかどうかは開かないと分からない）。
 * 大会の紙は**回戦の浅い順にトークンが並ぶ**ので、
 * **まだの試合は後ろにかたまる。** 空振りが続いたらそこから先もまだ、とみて切り上げる。
 *
 * ★**取りこぼしても次の回で拾える**（毎晩走らせる前提）。
 * ★**0 を渡すと切り上げない**（`--misses 0`）。
 */
const MAX_MISSES = Number(flag("--misses") ?? 25);

const UA = { "User-Agent": "kouritsu-ouendan/1.0 (+https://kouritsu-ouendan.com)" };
/** ★**相手のサーバーへの間隔。** 1試合1リクエストなので短くしないこと */
const POLITENESS_MS = 2000;

const SOURCE = { name: "HSB flash", url: "https://hsbflash.jp/" };

/**
 * ★★★**一度取れた試合を二度と開かないための控え**（2026-09-07）。
 *
 * **初回は1〜2時間かかる**（47県 × その大会の全試合ぶんのページ）。
 * ★**それを毎回やると自動更新に載せられない。**
 *
 * ★**トークンは base64 の JSON**（`{"sel":25,"tno":4,"exp":…}`）で、
 * **`sel`＝大会・`tno`＝その大会の何試合目**。**`exp` は毎回変わるが `sel:tno` は変わらない**ので、
 * **取れた試合を `sel:tno` で控えておけば、次からは開かずに飛ばせる。**
 *
 * ★★**読むだけで、作らない。** `build-regional-results.mjs` の hsbAdapter に
 * 「トークンを自分で組み立てないこと」という決めごとがあるが、
 * **これは大会ページに書いてあるトークンを読んでいるだけ**で、その線は越えていない。
 * ★**読めなければ控えを使わず、今までどおり開く**（形が変わっても壊れない）。
 *
 * ★★**控えるのは「取り込めた試合」だけ。**
 * **まだ試合前のもの・結び付かなかったものは控えない** ——
 * 前者は後で終わるし、後者はこちらのデータが増えれば結び付くかもしれない。
 */
const CACHE_FILE = path.join(ROOT, "data", "innings-captured.json");

function loadCache() {
  try {
    return JSON.parse(readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

/** トークンから `大会:試合番号` を出す。★**読めなければ null**（そのときは開く） */
function tokenId(token) {
  try {
    const json = JSON.parse(
      Buffer.from(token.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    );
    const [sel, tno] = [json.sel, json.tno];
    return Number.isFinite(sel) && Number.isFinite(tno) ? `${sel}:${tno}` : null;
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 地区の slug から HSB flash のホストを出す。
 * ★**分割している4地区は県ひとまとめ**（`<県>.hsbflash.jp` は47件しかない）。
 * ★**夏だけ北北海道／南北海道・東東京／西東京に分かれる**が、
 * このスクリプトは**大会ページを丸ごと読む**ので、どちらの試合も同じページから取れる。
 */
function hostOf(slug) {
  if (slug === "kita-hokkaido" || slug === "minami-hokkaido" || slug === "hokkaido") {
    return "hokkaido";
  }
  if (slug === "higashi-tokyo" || slug === "nishi-tokyo" || slug === "tokyo") return "tokyo";
  return slug;
}

async function get(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(3000 * attempt);
    let res;
    try {
      res = await fetch(url, {
        headers: UA,
        redirect: "follow",
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      continue;
    }
    if (res.ok) {
      const text = await res.text();
      await sleep(POLITENESS_MS);
      return text;
    }
    // ★**404 は「その県に大会ページが無い」**（大会の谷間）。例外にしない
    if (res.status === 404) return null;
    if (res.status !== 429 && res.status < 500) return null;
  }
  return null;
}

const plain = (html) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** 照合用に寄せる。★**画面に出す校名は触らない** */
const norm = (s) =>
  String(s ?? "")
    .normalize("NFKC")
    .replace(/[\s　]/g, "")
    .replace(/高等学校$|高校$/, "");

/**
 * 1試合の箱スコアを読む。
 * ★**`inning_score total` は合計**（クラスが増える）。
 * **完全一致で拾うと合計が取れず、15回目の得点を合計と取り違える**
 * （`src/lib/live/hsb.ts` に同じ注意がある）。
 * ★**まだ来ていない回は空**（`&nbsp;`）。**0 にしないこと。**
 */
function parseBoxScore(html) {
  const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map((m) =>
      [...m[1].matchAll(/<td class="inning_score( total)?">([\s\S]*?)<\/td>/g)].map((s) => ({
        total: Boolean(s[1]),
        text: plain(s[2]),
      })),
    )
    .filter((cells) => cells.length > 1);
  if (rows.length < 2) return null;

  const names = [
    plain(/<td class="team_name_1">([\s\S]*?)<\/td>/.exec(html)?.[1] ?? ""),
    plain(/<td class="team_name_2">([\s\S]*?)<\/td>/.exec(html)?.[1] ?? ""),
  ];
  if (!names[0] || !names[1]) return null;

  const num = (v) => (/^\d+$/.test(v) ? Number(v) : null);
  const teams = rows.slice(0, 2).map((cells, i) => ({
    name: names[i],
    /*
      ★**空の回で打ち切る。** 途中に空が挟まることは無いが、
      **後ろに空が並ぶ**（15回ぶんの枠があるため）。
      ★**打ち切ったぶんを 0 で埋めないこと。**
    */
    innings: (() => {
      const out = [];
      for (const c of cells.filter((x) => !x.total)) {
        const v = num(c.text);
        if (v === null) break;
        out.push(v);
      }
      return out;
    })(),
    total: num(cells.find((c) => c.total)?.text ?? ""),
  }));

  const state = plain(/<p class="geme_state[^"]*">([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "");
  const date = plain(/<p class="play_date">([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "");
  const md = date.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);

  return {
    state,
    md: md ? [Number(md[1]), Number(md[2])] : null,
    teams,
  };
}

/**
 * 箱スコアを、その県の試合に結び付ける。
 * ★**1件に決まらなければ null**（取り違えるくらいなら入れない）。
 */
function matchGame(games, box, newestYear) {
  const [x, y] = box.teams;
  if (x.total === null || y.total === null) return null;

  const sameName = (a, b) => {
    const [p, q] = [norm(a), norm(b)];
    if (!p || !q) return false;
    return p === q || p.includes(q) || q.includes(p);
  };

  const hits = games.filter((g) => {
    if (g.teams.length !== 2) return false;
    /*
      ★**日付は「月日」だけ照らす**（箱スコアに年が無い）。
      ★**こちらが日付を持たない試合もある**ので、そのときは日付を見ない
      （その代わり校名と得点の一致だけで決める）。
    */
    if (g.date && box.md) {
      const [y, m, d] = g.date.split("-").map(Number);
      if (m !== box.md[0] || d !== box.md[1]) return false;
      /*
        ★★**箱スコアに年が無い**（`9月 5日(土)`）。月日だけで見ると
        **前の年の同じ日の試合に当たりうる**ので、**その県で最も新しい年**に限る。
        （大会ページから辿れるのは開催中／直近の大会だけなので、この制限で落ちない）
      */
      if (newestYear && y !== newestYear) return false;
    }
    // ★**並びは出典によって逆**。両方の組み合わせを見る
    const straight =
      sameName(g.teams[0].display, x.name) &&
      sameName(g.teams[1].display, y.name) &&
      g.teams[0].score === x.total &&
      g.teams[1].score === y.total;
    const swapped =
      sameName(g.teams[0].display, y.name) &&
      sameName(g.teams[1].display, x.name) &&
      g.teams[0].score === y.total &&
      g.teams[1].score === x.total;
    return straight || swapped;
  });

  if (hits.length !== 1) return null;
  const game = hits[0];
  // ★**どちらの行がどちらのチームか**を決め直す（並びが逆のことがある）
  const first = sameName(game.teams[0].display, x.name) ? x : y;
  const second = first === x ? y : x;
  return { game, rows: [first, second] };
}

async function harvest(slug) {
  const file = path.join(OUT_DIR, `${slug}.json`);
  if (!existsSync(file)) return;
  const district = JSON.parse(readFileSync(file, "utf8"));

  /*
    ★★**対象は「各回をまだ持っていない試合」だけ。**
    ★**いちばん新しい季節に絞る** —— 大会ページに出ているのは開催中／直近の大会で、
    **それより古い大会の試合は、そのページからは辿れない。**
  */
  /*
    ★★★**「直近の大会」を日付から決めないこと**（2026-09-06 に踏んだ）。

    **日付を持たない出典がある** —— 福岡の2026年秋季は紙に日付が刷られておらず、
    **いちばん新しい「日付のある」試合は7月25日（夏の決勝）**になる。
    そこから大会を決めると、**秋の箱スコアを夏の試合に突き合わせる**ことになり
    1件も結び付かない（実際にそうなった）。

    ★**対象は「各回をまだ持っていない試合」すべて。** 大会ページから辿れるのは
    開催中／直近の大会だけなので、**開くページ数は結局その大会ぶんで収まる。**
    ★★**代わりに、結び付けのほうを厳しくする**（下の `matchGame`）——
    日付を持つ試合は**その年の月日まで**一致することを求める。
  */
  const dated = district.games.filter((g) => g.date).map((g) => g.date).sort();
  const newestYear = dated.at(-1) ? Number(dated.at(-1).slice(0, 4)) : null;
  const wanted = district.games.filter(
    (g) =>
      g.teams.length === 2 &&
      !g.teams.every((t) => Array.isArray(t.innings) && t.innings.length),
  );
  if (!wanted.length) {
    console.log(`  ${district.district}: 足すものはありません`);
    return;
  }

  const host = hostOf(slug);
  const base = `https://${host}.hsbflash.jp`;
  const page = await get(`${base}/tournament`);
  if (!page) {
    console.log(`  ⚠️ ${district.district}: 大会ページが取れない（${base}/tournament）`);
    return;
  }
  /*
    ★**トークンは大会ページに書いてあるものだけを使う**（自分で作らない）。
    ★**重複を落とす** —— 同じ試合へのリンクが2か所にあることがある。
  */
  const tokens = [
    ...new Set([...page.matchAll(/href="\/flash\/([A-Za-z0-9_-]+)"/g)].map((m) => m[1])),
  ];
  if (!tokens.length) {
    console.log(`  ⚠️ ${district.district}: 大会ページに試合へのリンクが無い`);
    return;
  }

  let added = 0;
  let opened = 0;
  let skipped = 0;
  const done = new Set(cache[slug] ?? []);
  const knownBefore = done.size;
  let misses = 0;
  let stoppedEarly = false;
  const left = new Set(wanted);
  for (const token of tokens) {
    // ★**足すものが無くなったら、そこで開くのをやめる**（相手に無駄を掛けない）
    if (!left.size || opened >= LIMIT) break;
    /*
      ★★**前に取り込めた試合は開かない**（`tokenId` の説明）。
      **これが無いと毎回1〜2時間かかり、自動更新に載せられない。**
      ★**読めないトークンは控えを使わず開く**（形が変わっても止まらない）。
    */
    const id = tokenId(token);
    if (id && done.has(id)) {
      skipped += 1;
      /*
        ★**控えに当たったら空振りを数え直す。**
        **控えにあるということは、そこは行われた試合が並んでいるところ**なので、
        まだ先に取れるものがある。ここで数え続けると、
        **取り終わった前半だけで切り上げてしまう。**
      */
      misses = 0;
      continue;
    }
    // ★**空振りが続いたら切り上げる**（上の `MAX_MISSES` の説明）
    if (MAX_MISSES > 0 && misses >= MAX_MISSES) {
      stoppedEarly = true;
      break;
    }
    opened += 1;
    // ★**まず空振りとして数え、結び付いたら下で 0 に戻す**
    misses += 1;
    const html = await get(`${base}/flash/${token}`);
    if (!html) continue;
    const box = parseBoxScore(html);
    // ★詰まったら `INNINGS_DEBUG=1`（開いたページが何だったかを全部出す）
    if (process.env.INNINGS_DEBUG) {
      console.log(
        `    [debug] ${box ? `${box.state || "状態なし"} ${box.md?.join("/") ?? "日付なし"} ` +
          box.teams.map((t) => `${t.name} ${t.total} [${t.innings.join(",")}]`).join(" - ")
          : "読めない"}`,
      );
    }
    // ★**終わった試合だけ**（途中の試合は各回が埋まっていない）
    if (!box || !box.state.includes("試合終了")) continue;
    if (box.teams.some((t) => !t.innings.length)) continue;

    /*
      ★★★**照合は「まだ持っていない試合」ではなく、その県の全試合に対して行う**（2026-09-07）。

      **すでに各回を持っている試合と結び付いたときも、控えに入れたい。**
      持っていないものだけを相手にすると、**取り終わった大会のページを毎回開き直す**
      ことになり、控えがいつまでも育たない（＝自動更新に載せられない）。
      ★**厳しさは変わらない** —— 1件に決まらなければ入れないのは同じ。
    */
    const hit = matchGame(district.games, box, newestYear);
    if (!hit) {
      if (process.env.INNINGS_DEBUG) console.log(`    [debug]   → 結び付かない`);
      continue;
    }
    // ★**もう持っている試合。** 開かずに済むよう控えるだけにして、書き換えない
    if (hit.game.teams.every((t) => Array.isArray(t.innings) && t.innings.length)) {
      if (id) done.add(id);
      misses = 0;
      continue;
    }
    /*
      ★★**和が合計と一致することを必ず確かめる**（このリポジトリの箱スコアの検算）。
      **合わないものは入れない。**
    */
    const ok = hit.rows.every(
      (r, i) =>
        r.innings.reduce((a, b) => a + b, 0) === r.total &&
        r.total === hit.game.teams[i].score,
    );
    if (!ok) continue;

    hit.game.teams.forEach((t, i) => {
      t.innings = hit.rows[i].innings;
    });
    /*
      ★**出所が違うときだけ書く。** 県の出典がもともと HSB flash なら、
      県の `sourceName` で足りるので付けない。
    */
    if (district.sourceName !== SOURCE.name && hit.game.source?.name !== SOURCE.name) {
      hit.game.inningsSource = SOURCE;
    }
    left.delete(hit.game);
    // ★**取り込めたものだけ控える**（試合前・結び付かなかったものは控えない）
    if (id) done.add(id);
    misses = 0;
    added += 1;
  }

  console.log(
    `  ${district.district}: ${added} 試合に各回を入れた` +
      `（対象 ${wanted.length} 件・開いた ${opened} ページ` +
      `${skipped ? `・控えで飛ばした ${skipped} ページ` : ""}` +
      `${stoppedEarly ? `・空振りが ${MAX_MISSES} 続いたので切り上げ` : ""}）`,
  );
  if (added && !DRY) {
    writeFileSync(file, `${JSON.stringify(district, null, 2)}\n`, "utf8");
    console.log(`    書き出した: ${path.relative(ROOT, file)}`);
  }
  /*
    ★**控えは県ごとに書き出す** —— 途中で落ちても、そこまでの取り込みが無駄にならない。
    ★**並びを固定する**（実行のたびに順番が変わると、中身が同じでも差分が出る）。
    ★★**`added` が0でも書く** —— **すでに持っている試合を控えたときも増えている。**
    そこを書かないと、取り終わった大会のページを毎回開き直すことになる。
  */
  if (done.size !== knownBefore && !DRY) {
    cache[slug] = [...done].sort();
    writeFileSync(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  }
}

/** ★**取り込めた試合の控え**（`slug` → `大会:試合番号` の配列）。上の `CACHE_FILE` を読むこと */
const cache = loadCache();

async function main() {
  const slugs = readdirSync(OUT_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .filter((s) => !ONLY || s === ONLY);

  console.log(`各回の得点を取り込みます（${slugs.length} 地区）`);
  for (const slug of slugs) {
    try {
      await harvest(slug);
    } catch (e) {
      // ★**1県で落ちても続ける**（取れたぶんはその県のファイルに書けている）
      console.log(`  ⚠️ ${slug}: ${e.message}`);
    }
  }
}

await main();
