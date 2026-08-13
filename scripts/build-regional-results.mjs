/**
 * 地方大会（秋季・春季・選手権の県大会）の結果を、各都道府県高野連のサイトから取り、
 * src/lib/data/regional-results.ts を作る。
 *
 *   node --env-file=.env.local scripts/build-regional-results.mjs --dry
 *   node --env-file=.env.local scripts/build-regional-results.mjs --pref nagano
 *   node --env-file=.env.local scripts/build-regional-results.mjs --json out.json
 *
 * ------------------------------------------------------------------
 * ★ なぜ甲子園（build-live-results.mjs）と別のスクリプトなのか
 *
 *   甲子園は出典が1つ（日本高野連）で、全国で1つの大会。地方大会は
 *   **出典が県ごとに違い、大会も県ごとに独立している。** 同じスクリプトに
 *   入れると、1県のサイト変更で全国の生成が止まる。分けておけば、
 *   落ちた県だけを飛ばして残りを更新できる。
 *
 * ------------------------------------------------------------------
 * ★ 県ごとの「アダプタ」を足していく形にしてある
 *
 *   47連盟のサイトは**構造に共通点が無い**。ナビゲーションの言葉も階層も
 *   バラバラで、機械的に結果ページを見つける試みは失敗した（18連盟を
 *   2階層まで辿って12連盟で見つけられなかった）。**URLの特定は人がやる。**
 *   一度特定してしまえば取得は自動化できるので、県ごとに
 *   「どのURLを、どう読むか」だけを ADAPTERS に書き足していく。
 *
 * ------------------------------------------------------------------
 * ★ 規約で使えない連盟は**ここに書かない**
 *
 *   2026-08-13 の調査で、12連盟が転載・複製を制限していた。
 *   北海道・青森・秋田・東京・鳥取（「データ」を名指し）、埼玉・福島
 *   （「内容」「コンテンツ」を名指し）、大分（営利目的の複製を禁止）、
 *   岩手・宮城・島根・栃木（写真・記事の無断転載を禁止）。
 *   北海道は robots.txt でもスコアPDFを拒否。
 *   **これらを ADAPTERS に足さないこと。** 詳細はREADMEの
 *   「都道府県高野連サイトの規約調査」。
 *
 *   岩手・宮城・島根・栃木は制限が「著作権について」の章にあり、列挙も
 *   画像・レイアウト・記事・ドキュメントで「データ」が無い。事実である
 *   スコアには及ばないと読めるが、**岩手・宮城・島根は「リンクはトップページへ」と
 *   書いている**ので、出典リンクは深いURLではなくトップに向けること。
 *
 *   ★**`data/federation-sites.json` の分類を鵜呑みにしない。** 福島・栃木は
 *   Copyright表記と同じ行に書かれていたため「著作権の記載」に吸収され、
 *   最初の集計（10連盟）から漏れていた。**足す前に自分でページを開いて
 *   「転載・無断・複製・営利」を検索すること。**
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(import.meta.dirname, "..");
/** 県ごとのファイルを置くところ。1県あたり約120KB */
const OUT_DIR = path.join(ROOT, "src", "lib", "data", "regional");
/** トップ用の抜粋。ここだけはトップページが読むので小さく保つ */
const OUT_PICKUP = path.join(ROOT, "src", "lib", "data", "regional-pickup.ts");
const UA = { "User-Agent": "kouritsu-ouendan/1.0 (+https://kouritsu-ouendan.com)" };

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
/**
 * **`indexOf` の -1 をそのまま使わないこと。** `args[-1 + 1]` は先頭の引数を
 * 拾ってしまい、指定していない `--pref` に別のフラグが入る（実際に起きた）。
 */
const flagValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] ?? null) : null;
};
const onlyPref = flagValue("--pref");
const jsonPath = flagValue("--json");
/** 過去ぶんも全部残す。工数見積もりや検算のとき用 */
const KEEP_ALL = args.includes("--all");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 一覧をどこまで辿るか。**上限を必ず置くこと。**
 * ページャの作りによっては最後のページの次が同じ内容を返し続けるので、
 * 「試合が増えなくなったら終わり」だけに頼ると止まらない可能性がある。
 * 1ページ10行・1大会80試合として、20ページあれば足りる。
 */
const MAX_PAGES = 20;

/**
 * 生成物に残す範囲。**いちばん新しい試合から遡った日数**で切る。
 *
 * 一覧を最後まで辿ると過去4年ぶんが取れる（長野で924試合・約350KB）。
 * 47県ぶんだと16MBになり、リポジトリに置く生成物としては大きすぎる。
 * **速報として出したいのは開催中の大会だけ**なので、そこだけ残す。
 *
 * ★**「今日から何日前」で切らないこと。** 日付で切ると、試合が増えていなくても
 * 毎日うしろの試合が落ちて差分が出る。3時間おきのCIが中身の無いコミットを
 * 積み続けることになる（生成物にタイムスタンプを入れないのと同じ理由）。
 * **その季節のいちばん新しい試合を基点にすれば、新しい大会が始まったときだけ窓が動く。**
 *
 * 120日にしているのは、いちばん長い春（4月の支部予選〜6月の県大会＝約70日）に
 * 余裕を持たせたもの。秋は約60日、夏は約20日。
 *
 * 過去の戦績はDBの `school_championships` 側の役目で、ここでは持たない。
 */
const KEEP_DAYS = 120;

/**
 * 日別ページを1季節あたり何枚まで見るか。
 * **神奈川・埼玉は日別ページを1枚ずつ取りに行く**ので、上限が無いと
 * 1回の実行で何十リクエストにもなる。個人の共有サーバーが相手なので必ず抑える。
 * 県大会の日程は1大会30日を超えない。
 */
const MAX_DAILY_PAGES = 30;

/**
 * どの年度を取りに行くか。**`--year` で明示できる。**
 * 既定は今年。秋季大会は前年の秋が「今年度」なので、
 * 秋が取れないときは `--year` で前年を指定する。
 */
const TARGET_YEAR = Number(flagValue("--year") ?? new Date().getFullYear());

/**
 * トップ用の抜粋の大きさ。**トップページが読むのはこのファイルだけ。**
 * 1県から取りすぎると全国を見ている感じが出ないので、県ごとにも上限を置く。
 * 47県 × 4 = 188件だが、全体でも 80 件で切る（約30KB）。
 */
const PICKUP_PER_DISTRICT = 4;
const PICKUP_TOTAL = 80;

/**
 * 勝ち上がっている公立校を何校まで出すか。
 * トップの右カラムに収まる数。47県ぶんだと大会の序盤は数百校が
 * 「まだ負けていない」に該当するので、必ず上限を置く。
 */
const SPOTLIGHT_LIMIT = 8;

/**
 * 取得。**1件ずつ・間隔をあける。** 相手は学校の中に事務局がある小さなサイトで、
 * こちらの都合で負荷をかけてよい相手ではない。
 */
async function fetchHtml(url, politenessMs = 1500) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(3000 * attempt);
    let res;
    try {
      res = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(30000) });
    } catch (e) {
      if (attempt === 2) throw new Error(`${url} → ${e.message}`);
      continue;
    }
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      await sleep(politenessMs);
      return decode(buf, res.headers.get("content-type"));
    }
    if (res.status === 404) return null;
    if (res.status !== 429 && res.status < 500) throw new Error(`${url} → HTTP ${res.status}`);
  }
  throw new Error(`${url} → 取得できません`);
}

/**
 * 文字コードを見て decode する。
 * **UTF-8 決め打ちにしない。** 47連盟のうち Shift_JIS が6件・EUC-JP が1件あり、
 * 決め打ちだと校名が化けて学校マスタと照合できなくなる。
 */
function decode(buf, contentType) {
  const head = buf.slice(0, 4096).toString("latin1");
  const charset =
    /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1] ??
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ??
    "utf-8";
  const normalized = charset.toLowerCase().replace(/^x-/, "");
  try {
    return new TextDecoder(normalized).decode(buf);
  } catch {
    return buf.toString("utf8");
  }
}

const plain = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/**
 * 全角の数字・記号を半角に寄せる。スコアの表記が県によって違うため。
 *
 * ★**ハイフンに見える文字は1種類ではない。** 出典ごとに別の文字を使っている。
 *   長野 `-`(002D) ／ 神奈川 `-` ／ 徳島は同じページの中で `―`(2015) と `‐`(2010) が混在する。
 * ここに載っていない文字が来ると「5 ― 4」がスコアとして読めず、その試合が
 * まるごと落ちる（神奈川で13試合が落ちていたのと同じ壊れ方をする）。
 */
const normalize = (s) =>
  s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    /*
      ★**長音符（ー）を一律にハイフンへ寄せないこと。**
      「ルーテル学院」「リブワーク藤崎台球場」「信州グリーンローズスタジアム」が
      **「ル-テル学院」になって画面に出ていた**（4県で86か所）。
      「ドーム」も潰れるので、球場名を拾う正規表現の `ドーム` が効いていなかった。
      **数字に挟まれているときだけ**スコアの区切りとして扱う。
    */
    .replace(/(\d)\s*ー\s*(\d)/g, "$1-$2")
    .replace(/[－−‐‑‒–—―─]/g, "-")
    .replace(/　/g, " ")
    .trim();

/**
 * 校名を照合用にそろえる。**両側（サイト側と学校マスタ側）に同じものをかける。**
 *
 * 長野で60校が結び付いた一方、揺れだけで外れていたものが10件以上あった。
 *
 *   ケ / ヶ    松本蟻ヶ崎 と 松本蟻ケ崎、駒ヶ根工業 と 駒ケ根工業
 *   旧字体      赤穗 と 赤穂、中野立志舘 と 中野立志館
 *   レイアウト用の空白   「飯 山」「長 野」（表の見た目をそろえるために入っている）
 *   半角カナ    日本ｳｪﾙﾈｽ長野
 *
 * **空白は落としてよい。** 日本の校名に空白は入らない。
 */
const normalizeSchoolName = (s) =>
  s
    .normalize("NFKC")
    /*
      **括弧書きを落とす。** 地区大会の一覧では「浦和学院（埼玉 1位）」のように
      県名とシードが付く。校名に括弧は入らないので落として構わない。
    */
    .replace(/[（(][^）)]*[）)]\s*$/, "")
    .replace(/[\s　]/g, "")
    .replace(/ケ/g, "ヶ")
    .replace(/穗/g, "穂")
    .replace(/舘/g, "館")
    .replace(/﨑/g, "崎")
    .replace(/濵/g, "浜")
    .replace(/學/g, "学")
    .trim();

/**
 * 連合チームか。複数校が1チームを組んで出ている。
 *
 *   「坂城・北部・須坂東・高専」「北信連合」「高遠・松川」
 *
 * **1校に結び付けない。** 公立が含まれていても、どの学校の戦績として
 * 数えるかは学校ごとのページの意味を変えてしまう。まずは印を付けて持つだけにする。
 */
const isCombinedTeam = (s0) => {
  /*
    ★**中黒には半角（`･` U+FF65）がある。** 山梨の「農林･塩山」、徳島の
    「阿南高専・城ノ内」のように出典ごとに違う。NFKC で寄せてから見ないと、
    半角のほうが連合チームだと分からず1校に結び付けようとしてしまう。
  */
  const s = s0.normalize("NFKC");
  if (/・|連合/.test(s)) return true;
  /*
    **空白区切りの連合チームがある。** 神奈川は「寒川 藤沢総合 深沢 厚木清南」
    のように中黒を使わず空白で並べる。
    ただし**表示用に1文字ずつ空けた校名**（「横 浜」「慶 応」）と区別が要る。
    区切りの各語が2文字以上なら連合、1文字ずつなら見た目の空白と見なす。
  */
  const parts = s.trim().split(/[\s　]+/);
  return parts.length >= 2 && parts.every((p) => p.length >= 2);
};

// ------------------------------------------------------------------
// 県ごとのアダプタ
// ------------------------------------------------------------------

/**
 * 長野。**1つ目の実装で、他県の手本にしている。**
 *
 * `/tresults_koshiki/r_koshiki/<大会>/` に大会ごとの一覧があり、
 * 表の1行が「日付 ｜ 球場 大会名 回戦」「対戦（1行に複数入ることがある）」の2セル。
 *
 *   2026年07月19日 ｜ セキスイハイム松本スタジアム 第108回…長野大会 準々決勝
 *   | 長野日大 5 - 6 松商学園  東海大学付属諏訪 2 - 9 松本国際
 *
 * **1セルに複数試合が入る。** 「校名 数字 - 数字 校名」を繰り返し拾う必要がある。
 */
const nagano = {
  slug: "nagano",
  district: "長野",
  name: "長野県高等学校野球連盟",
  siteUrl: "https://www.nagano-hbf.jp/",
  seasons: {
    spring: "https://www.nagano-hbf.jp/tresults_koshiki/r_koshiki/spring/",
    summer: "https://www.nagano-hbf.jp/tresults_koshiki/r_koshiki/championship/",
    autumn: "https://www.nagano-hbf.jp/tresults_koshiki/r_koshiki/autumn/",
  },
  /**
   * WordPress のアーカイブで **1ページ10行**。夏は5ページある。
   * 1ページ目だけ読むと直近4日ぶんしか取れない（実際そうなっていた）。
   */
  nextPage: (base, page) => `${base}page/${page}/`,
  /*
    ★**文字列ではなくタグ構造から読む。**

    最初は行のテキストを正規表現でこじ開けていたが、校名に表示用の空白が
    入る（「屋 代」「飯 山」）ため、試合の区切りを取り違えて
    「屋」「代 須坂創成」のように割れた。生HTMLを見たら、必要なものが
    すべて別のタグに入っていた。

      <td>
        <p>2026年07月12日 <span>｜</span> しんきん諏訪湖スタジアム</p>
        <h4>第108回 全国高等学校野球選手権長野大会</h4>
        <i>3回戦</i>
      </td>
      <td>
        <ul><li>高遠</li><li>0</li><li>-</li><li class="win">10</li><li>野沢北</li></ul>
        <ul><li>東京都市大学塩尻</li><li class="win">1</li><li>-</li><li>0</li><li>諏訪清陵</li></ul>
      </td>

    **1試合＝1つの `<ul>`、勝者に `class="win"`。** 区切りを推測する必要がない。
    勝者が明示されているので、引き分けや没収試合もスコアから推測せずに済む。
  */
  parse(html, season) {
    const games = [];
    for (const row of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
      const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => m[1]);
      if (cells.length < 2) continue;

      const head = cells[0];
      const dateText = normalize(plain(/<p[^>]*>([\s\S]*?)<\/p>/.exec(head)?.[1] ?? ""));
      const date = dateText.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
      if (!date) continue;

      const venue = dateText.split("｜")[1]?.trim() || null;
      const tournament = normalize(plain(/<h4[^>]*>([\s\S]*?)<\/h4>/.exec(head)?.[1] ?? "")) || null;
      const round = normalize(plain(/<i[^>]*>([\s\S]*?)<\/i>/.exec(head)?.[1] ?? "")) || null;

      const body = cells.slice(1).find((c) => /<ul/i.test(c) && /\d/.test(c));
      if (!body) continue;

      for (const ul of body.match(/<ul[\s\S]*?<\/ul>/gi) ?? []) {
        const items = [...ul.matchAll(/<li([^>]*)>([\s\S]*?)<\/li>/gi)].map((m) => ({
          win: /class\s*=\s*["'][^"']*\bwin\b/.test(m[1]),
          text: normalize(plain(m[2])),
        }));
        // 「校名・点・-・点・校名」の5つ。空の <ul> は飛ばす
        if (items.length < 5) continue;
        const [home, sa, , sb, away] = items;
        if (!home.text || !away.text) continue;
        const scoreA = Number(sa.text);
        const scoreB = Number(sb.text);
        if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) continue;

        games.push({
          date: `${date[1]}-${String(date[2]).padStart(2, "0")}-${String(date[3]).padStart(2, "0")}`,
          season,
          tournament,
          round,
          venue,
          teams: [
            // **勝敗は class="win" を正とする。** スコアから導かない
            { display: home.text, score: scoreA, won: sa.win },
            { display: away.text, score: scoreB, won: sb.win },
          ],
        });
      }
    }
    return games;
  },
};

// ------------------------------------------------------------------

/**
 * 一覧ページから日別ページへのリンクを拾う。**神奈川と埼玉で共通の形。**
 * ラベルが回戦名（「1回戦」「準々決勝」）になっているので、それも一緒に持つ。
 */
function dailyLinks(html, baseUrl, { hrefPattern, labelPattern }) {
  const seen = new Map();
  const origin = new URL(baseUrl).origin;
  for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let href;
    try {
      href = new URL(m[1], baseUrl).toString();
    } catch {
      continue;
    }
    /*
      ★**外部サイトへのリンクを必ず外すこと。**
      神奈川の秋のページは甲子園の日別ページ（`baseball-station.com/koshien/2025/0816/`）に
      リンクしており、**URLの形が県大会の日別ページと同じ**（`/<年>/<月日>/`）。
      同じサイトかどうかを見ていなかったため、**甲子園の試合が神奈川の
      秋季大会として取り込まれていた**（準々決勝8試合・準決勝4試合・決勝2試合と
      倍になって検算に出た）。
    */
    if (new URL(href).origin !== origin) continue;
    if (!hrefPattern.test(href)) continue;
    const label = normalize(plain(m[2]));
    if (labelPattern && !labelPattern.test(label)) continue;
    if (!seen.has(href)) seen.set(href, label);
  }
  return [...seen].map(([url, label]) => ({ url, label }));
}

/**
 * 「1回戦」「準々決勝」などを1つ取り出す。
 *
 * ★**回戦を漢数字で書く出典がある**（熊本の「一回戦」「三回戦」）。
 * そのままにすると `ROUND_ORDER` に載らず、勝ち上がりの深さが数えられない
 * （「3回戦突破」が出せずに `null` になる）。ここで算用数字に寄せる。
 *
 * ★**「決勝戦」と書く出典がある**（山梨）。`決勝` として拾えれば
 * 「決勝まで終わった大会は勝ち上がり一覧に出さない」の判定に効く。
 * 拾えないと、優勝校が「勝ち上がっている学校」として画面に残る。
 */
const KANJI_DIGIT = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const pickRound = (s) => {
  if (!s) return null;
  const t = normalize(s).replace(
    /([一二三四五六七八九])(回戦|位決定戦)/g,
    (_, k, tail) => `${KANJI_DIGIT[k]}${tail}`,
  );
  const m = t.match(/準々決勝|準決勝|決勝|\d+回戦|代表決定戦|3位決定戦/);
  return m?.[0] ?? null;
};

/**
 * 神奈川高校野球ステーション（`kanagawa-baseball.com`）。
 *
 * **神奈川高野連ではなく、個人が運営している二次情報。**（2002年〜）
 * サイト内に「神奈川高野連とは関係ありません」と明記がある。
 * 速報が早いのでユーザーの希望で出典に加えた。転載を制限する記載は無い
 * （2026-08-13 に トップ・お問い合わせを確認）。
 * **出典表示は「神奈川高校野球ステーション」にすること。** 連盟の名前で出さない。
 *
 * 大会ごとの一覧 → 日別ページ の二段。日別ページは球場ごとに
 * 「時間・一塁側・スコア・三塁側」の表が並ぶ。
 *
 *   ＜表＞ 横浜スタジアム 横浜市中区横浜公園
 *   ＜表＞ 時間 | 一塁側 | スコア | 三塁側
 *          12:00 | 横 浜  | 8-3    | 横浜創学館
 *
 * **校名に表示用の空白が入る**（「横 浜」）。照合前の正規化で落ちる。
 */
const kanagawa = {
  slug: "kanagawa",
  district: "神奈川",
  name: "神奈川高校野球ステーション",
  siteUrl: "https://www.kanagawa-baseball.com/",
  // **個人の共有サーバー。** 連盟より間隔をあける
  politenessMs: 2500,
  seasons: {
    spring: "https://www.kanagawa-baseball.com/spring/",
    summer: "https://www.kanagawa-baseball.com/summer/",
    autumn: "https://www.kanagawa-baseball.com/fall/",
  },
  async collect({ fetchHtml, season, url, year }) {
    const indexUrl = `${url}${year}/`;
    const index = await fetchHtml(indexUrl);
    if (!index) return [];
    /*
      ★**大会名は概要表の「大会名」の行から取る。**
      `<h1>` からは取れず（画像の見出し）、**245試合すべてが大会名なし**になっていた。
      `<title>` も当てにならない — 前年のまま（第108回の大会なのに「第107回」）。
    */
    const tournament =
      /*
        セルの中に「[ 大会掲示板 ]」のようなリンクが同居する。
        **角括弧の中は大会名ではない**ので落とす（秋のページで実際に混ざった）。
      */
      normalize(plain(/大会名<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i.exec(index)?.[1] ?? ""))
        .replace(/[[［][^\]］]*[\]］]/g, "")
        .trim() ||
      normalize(plain(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(index)?.[1] ?? "")) ||
      null;

    /*
      **ラベルで絞らないこと。** 「1回戦」などの回戦名が付いていない日別リンクが
      あり、絞ると試合を取りこぼす。取りこぼすと**その日の敗戦が数えられず、
      負けたはずの学校が「まだ負けていない」に残る**（神奈川の夏は終了済みなのに
      5校が勝ち残り扱いになった）。URLの形だけで拾い、回戦名は取れたら使う。

      ★**URLの形だけで拾うなら、その形が他所と衝突しないか確かめること。**
      `/<年>/<月日>/` は甲子園のページ（別サイト）と同じ形で、
      `dailyLinks` が同一サイトに絞るまで甲子園の試合が混ざっていた。
      ここでも一覧のURLで始まるものだけに限っておく。
    */
    const days = dailyLinks(index, indexUrl, {
      hrefPattern: new RegExp(`^${indexUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\d{4}/?$`),
    });

    const games = [];
    for (const day of days.slice(0, MAX_DAILY_PAGES)) {
      const html = await fetchHtml(day.url);
      if (!html) continue;
      const date = day.url.match(/\/(\d{4})\/(\d{2})(\d{2})\/?$/);
      if (!date) continue;
      const isoDate = `${date[1]}-${date[2]}-${date[3]}`;
      const round = pickRound(day.label);

      /*
        表が球場ごとに「球場名の表 → 試合の表」と交互に並ぶ。
        順に見て、球場名を覚えてから試合の表を読む。
      */
      let venue = null;
      for (const table of html.match(/<table[\s\S]*?<\/table>/gi) ?? []) {
        const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) =>
          [...m[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => normalize(plain(c[1]))),
        );
        if (!rows.length) continue;

        const head = rows[0].join(" ");
        if (/(スタジアム|球場|ドーム|公園|パーク)/.test(head) && rows.length === 1) {
          venue = rows[0][0]?.split(/\s+/)[0] ?? null;
          continue;
        }
        if (!/一塁側/.test(head)) continue;

        for (const cells of rows.slice(1)) {
          if (cells.length < 4) continue;
          const [, home, score, away] = cells;
          /*
            ★**スコアの欄には点数以外も入る。**

              11-4              普通
              5x-4 (延長10回)    サヨナラ＋延長

            点数だけを想定した正規表現で弾いていたため、**サヨナラの試合が
            まるごと落ちていた**（172チーム＝171試合のところ158試合しか
            取れず、負けたはずの学校が「勝ち残り」に残った）。

            このプロジェクトには「サヨナラの表記は出典で違う」という
            既知の落とし穴がある（高野連はイニング欄に大文字 `X`、
            Wikipediaは合計スコアに小文字 `x`）。神奈川は `5x-4` の形。
          */
          const m = score?.match(/(\d{1,2})\s*(x)?\s*[-－]\s*(\d{1,2})\s*(x)?/i);
          if (!m || !home || !away) continue;
          const a = Number(m[1]);
          const b = Number(m[3]);
          games.push({
            date: isoDate,
            season,
            tournament,
            round,
            venue,
            /*
              **勝者の印が無いので点数から決める。** 長野（class="win"）と違い
              このサイトは勝敗を明示していない。引き分け（同点）は
              どちらも won: false になる。
            */
            teams: [
              { display: home, score: a, won: a > b },
              { display: away, score: b, won: b > a },
            ],
          });
        }
      }
    }
    return games;
  },
};

/**
 * 埼玉高校野球情報局（`saitama-baseball.com`）。
 *
 * **埼玉高野連は「当ページの内容・画像などを無断転載・複製・複写することを
 * 一切禁止」としているので、連盟のサイトからは取らない。** こちらは個人運営
 * （2009年〜）で「県高野連や各種団体とは一切関係ありません」と明記があり、
 * 転載を制限する記載も無い（2026-08-13 に トップ・当サイトについて・
 * プライバシーポリシーを確認）。
 * **出典表示は「埼玉高校野球情報局」にすること。**
 *
 * ★このサイトのプライバシーポリシーに「掲載している引用文や画像の著作権・
 * 肖像権等は各権利所有者に帰属」とある。**このサイト自身が他所から引いている
 * 部分がある**ということなので、スコア（事実）以外を持ってこないこと。
 *
 * 大会ごとの一覧 → 日別ページ の二段。日別ページは1試合＝1つのイニング表。
 *
 *   TEAM | 1 | 2 | … | 9 | 計
 *   花咲徳栄 | 0 | 0 | … | 3 | 7
 *   浦和学院 | 0 | 0 | … | 0 | 3
 */
const saitama = {
  slug: "saitama",
  district: "埼玉",
  name: "埼玉高校野球情報局",
  siteUrl: "https://saitama-baseball.com/",
  politenessMs: 2500,
  seasons: {
    spring: "https://saitama-baseball.com/harukentai",
    summer: "https://saitama-baseball.com/natsukentai",
    autumn: "https://saitama-baseball.com/akikentai",
  },
  async collect({ fetchHtml, season, url, year }) {
    const indexUrl = `${url}${year}/`;
    const index = await fetchHtml(indexUrl);
    if (!index) return [];
    const tournament =
      normalize(plain(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(index)?.[1] ?? "")) || null;

    // ラベルで絞らない理由は神奈川のアダプタのコメント参照
    const days = dailyLinks(index, indexUrl, {
      hrefPattern: /\/\d{4}\/\d{2}\/\d{2}\/\d+\/?$/,
    });

    const games = [];
    for (const day of days.slice(0, MAX_DAILY_PAGES)) {
      const html = await fetchHtml(day.url);
      if (!html) continue;
      const date = day.url.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
      if (!date) continue;
      const isoDate = `${date[1]}-${date[2]}-${date[3]}`;
      const round = pickRound(day.label);

      for (const table of html.match(/<table[\s\S]*?<\/table>/gi) ?? []) {
        const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) =>
          [...m[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => normalize(plain(c[1]))),
        );
        // イニング表は見出しが「TEAM … 計」で、続く2行が両校
        if (rows.length < 3) continue;
        const head = rows[0].join(" ");
        if (!/TEAM/i.test(head) || !/計/.test(head)) continue;

        const [homeRow, awayRow] = rows.slice(1, 3);
        const home = homeRow[0];
        const away = awayRow[0];
        const a = Number(homeRow.at(-1));
        const b = Number(awayRow.at(-1));
        if (!home || !away || !Number.isFinite(a) || !Number.isFinite(b)) continue;

        games.push({
          date: isoDate,
          season,
          tournament,
          round,
          venue: null,
          // 勝者の印が無いので点数から決める（神奈川と同じ）
          teams: [
            { display: home, score: a, won: a > b },
            { display: away, score: b, won: b > a },
          ],
        });
      }
    }
    return games;
  },
};

/** 表を「行 × セル」にほどく。セルは normalize 済み。長野以外の県で共通に使う */
const tableRows = (table) =>
  [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) =>
    [...m[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => normalize(plain(c[1]))),
  );

/**
 * 文字列から球場名を1つ拾う。「山日YBS球場　第１試合」→「山日YBS球場」
 *
 * ★**見出しの記号を巻き込まない。** 熊本は `■リブワーク藤崎台球場` と書くので、
 * `\S*` で拾うと **「■」ごと画面に出る**（実際に出ていた）。
 */
const pickVenue = (s) =>
  normalize(s ?? "").match(/[^\s■◆●▲▼□○◇☆★・]*(?:球場|スタジアム|ドーム|パーク)/)?.[0] ?? null;

/**
 * イニング表から両校のスコアを読む。**合計は「いちばん右の数字」。**
 *
 * ★**行の末尾が合計とは限らない。** 山梨は合計の前に空のセルを1つ挟み、
 * 熊本は延長ぶんの空セルが15回まで並ぶ。`at(-1)` を合計と決め打ちすると
 * 空文字を `Number()` して 0 になり、**全試合が 0-0 の引き分けになる。**
 *
 * ★**イニングのセルは数字とは限らない。** サヨナラの回が `x` / `X` / `×` になる。
 * 「右から見て最初に数字として読めるセル」を合計とする。
 */
function inningTotal(cells) {
  for (let i = cells.length - 1; i >= 1; i--) {
    const v = Number(cells[i]);
    if (cells[i] !== "" && Number.isFinite(v)) return v;
  }
  return null;
}

/**
 * 山梨県高等学校野球連盟（`yamanashi-hbf.com`）。
 *
 * **規約に転載の制限は無い**（2026-08-13 に トップ・お問合せ・結果ページを確認）。
 * 「配信を禁止します」とあるのは**球場での動画・画像の配信**の話で、
 * サイトの内容についての記載ではない。
 * ★**ただし「当サイトへのリンクは、必ずトップページから」と明記がある**ので、
 * `siteUrl` はトップにすること（岩手・宮城・島根と同じ扱い）。
 *
 * 大会ごとに1枚のHTML。**日別ページを辿る必要がない**ので取得は1リクエストで済む。
 * URLは `<西暦下2桁><季節>result.html` で、季節は haru / natsu / aki。
 *
 *   <P class="topic_y">大会14日目　2026年07月22日</P>
 *   <p class="score_body">
 *     ＜決勝戦＞<br>山日YBS球場
 *     <TABLE class="score_table"> …イニング表… </TABLE>
 *   </p>
 *
 * ★**`<TITLE>` は前年のまま更新されていない**（本文が第108回でもタイトルは第107回）。
 * 大会名は本文の見出しから取ること。
 */
const yamanashi = {
  slug: "yamanashi",
  district: "山梨",
  name: "山梨県高等学校野球連盟",
  // リンクはトップページへ、と明記されている
  siteUrl: "http://www.yamanashi-hbf.com/",
  seasons: {
    spring: "http://www.yamanashi-hbf.com/{yy}haruresult.html",
    summer: "http://www.yamanashi-hbf.com/{yy}natsuresult.html",
    autumn: "http://www.yamanashi-hbf.com/{yy}akiresult.html",
  },
  async collect({ fetchHtml, season, url, year }) {
    const html = await fetchHtml(url.replace("{yy}", String(year).slice(2)));
    if (!html) return [];

    // 見出しは <font size="+3"> が2つ（大会名・「試合結果」）。大会名のほうを取る
    const tournament =
      [...html.matchAll(/<font[^>]*size="\+3"[^>]*>([\s\S]*?)<\/font>/gi)]
        .map((m) => normalize(plain(m[1])))
        .find((t) => /大会/.test(t)) ?? null;

    const games = [];
    /*
      日付の見出し（topic_y）から次の見出しまでが1日ぶん。
      1日に複数の回戦が入ることがあるので、**回戦は表ごとに直前のものを使う。**
    */
    const days = html.matchAll(
      /<P class="topic_y">([\s\S]*?)<\/P>([\s\S]*?)(?=<P class="topic_y">|<\/body>|$)/gi,
    );
    for (const day of days) {
      const date = normalize(plain(day[1])).match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
      if (!date) continue;
      const isoDate = `${date[1]}-${date[2].padStart(2, "0")}-${date[3].padStart(2, "0")}`;

      const body = day[2];
      let round = null;
      let cursor = 0;
      /*
        「＜準決勝＞」と表を出てきた順に見る。表の直前のテキストに球場名がある。
        位置を追いながら読むので、区切りを推測せずに済む。
      */
      const token = /＜([^＞]*)＞|<TABLE[^>]*class="score_table"[\s\S]*?<\/TABLE>/gi;
      for (const m of body.matchAll(token)) {
        if (m[1] !== undefined) {
          round = pickRound(m[1]);
          cursor = m.index + m[0].length;
          continue;
        }
        /*
          表の直前のテキストに球場名がある（「山日YBS球場　第１試合」）。

          ★**序盤の日には回戦が書かれていない。** ＜準々決勝＞ のような見出しが
          付くのは準々決勝から先だけで、1〜3回戦の日は日付と球場しか無い。
          **推測で回戦を埋めない**（`round: null` のまま持つ）。
          画面はそれを前提に組むこと（`RegionalResultsCard`）。
        */
        const venue = pickVenue(plain(body.slice(cursor, m.index)));
        cursor = m.index + m[0].length;

        const rows = tableRows(m[0]);
        if (rows.length < 3) continue;
        const [homeRow, awayRow] = rows.slice(1, 3);
        const home = homeRow[0];
        const away = awayRow[0];
        /*
          ページの末尾に**空のひな形**（「先攻チーム」「後攻チーム」）が3つ置いてある。
          次の試合を書き足すためのもので、試合ではない。
        */
        if (!home || !away || /^(先攻|後攻)チーム$/.test(home)) continue;
        const a = inningTotal(homeRow);
        const b = inningTotal(awayRow);
        if (a === null || b === null) continue;

        games.push({
          date: isoDate,
          season,
          tournament,
          round,
          venue,
          // 勝者の印が無いので点数から決める（神奈川・埼玉と同じ）
          teams: [
            { display: home, score: a, won: a > b },
            { display: away, score: b, won: b > a },
          ],
        });
      }
    }
    return games;
  },
};

/**
 * 徳島県高等学校野球連盟（`tk2.nmt.ne.jp/~tokushimakoyaren`）。
 *
 * **規約に転載の制限は無い**（2026-08-13 にトップ・結果ページを確認）。
 *
 * ★**URLを組み立てないこと。年度ごとの一覧に載っているリンクだけを辿る。**
 * ファイル名の付け方が年で揺れていて、規則で当てられない。
 *
 *   R8_haru.html ／ R7_haru.html      春はどちらも `_` あり
 *   R8natsu.html ／ R7natsu.html      夏はどちらも `_` なし
 *   R8_shinjinbrokku_nanbu.html ／ R7shinjinbrokku_nanbu.html    秋は年で違う
 *   R7shinjinbrokku tyuo.html         **空白入り**のものまである
 *
 * `R<n>` の n は令和の年（＝西暦 − 2018）で、**年度ではなく暦の年**。
 * R8_haru の初日が 3月20日（金）＝2026年で、令和8年度（4月〜）より前にある。
 *
 * 1つの表に「日付の行」「回戦の行」「試合の行」が混ざって並ぶ。
 *
 *   第1日 7月11日（土） むつみスタジアム        ← 1セル
 *   ▽ 1回戦 JAアグリあなんスタジアム            ← 1セル
 *   9：00 | 阿南高専 | ５ ― ４ | 名西            ← 4セル
 */
const tokushima = {
  slug: "tokushima",
  district: "徳島",
  name: "徳島県高等学校野球連盟",
  siteUrl: "https://www.tk2.nmt.ne.jp/~tokushimakoyaren/",
  /*
    3季節とも同じ一覧から辿るので、URLは同じものを持たせて中で振り分ける。
    一覧は季節ごとに取り直さずに使い回す（`indexCache`）。
  */
  seasons: {
    spring: "https://www.tk2.nmt.ne.jp/~tokushimakoyaren/",
    summer: "https://www.tk2.nmt.ne.jp/~tokushimakoyaren/",
    autumn: "https://www.tk2.nmt.ne.jp/~tokushimakoyaren/",
  },
  indexCache: new Map(),
  /** ファイル名の語 → 季節。**秋は「新人」と呼ばれる**（新人ブロック大会・新人中央大会） */
  seasonOf(file) {
    if (/haru/i.test(file)) return "spring";
    if (/natsu/i.test(file)) return "summer";
    if (/aki|shinjin/i.test(file)) return "autumn";
    // sotai（総体協賛ブロック大会）は春夏秋のどれでもないので取らない
    return null;
  },
  async collect({ fetchHtml, season, url, year }) {
    /*
      その年の一覧。今年ぶんはトップページ、過去ぶんは indexR<n>.html にある。
      **今年の indexR<n>.html は作られていない**（トップがその役目を兼ねている）。

      ★**「無ければ 404」を当てにしないこと。** このサーバー（NMTnet）は
      存在しないページに **HTTP 200 でプロバイダの「404 Not Found」ページ**を返す。
      `fetchHtml` は 404 のときだけ null を返すので、これを「ページがあった」と
      受け取ってしまい、**その年の一覧が空**になる（実際に春夏が0試合になった）。
      中身にその年のリンクがあるかどうかで判断する。
    */
    const n = year - 2018;
    // **相対リンク（`href="R8_haru.html"`）なので先頭の `/` を要求しないこと**
    const yearLink = new RegExp(`href=["'][^"']*R0?${n}[_%20 ]?[a-z][^"']*\\.html`, "i");
    if (!this.indexCache.has(n)) {
      const top = await fetchHtml(url);
      this.indexCache.set(n, top && yearLink.test(top) ? top : await fetchHtml(`${url}indexR${n}.html`));
    }
    const index = this.indexCache.get(n);
    if (!index) return [];

    const pages = dailyLinks(index, url, {
      // R8natsu.html / R8_haru.html / R7shinjinbrokku tyuo.html（空白入り）
      hrefPattern: new RegExp(`/R0?${n}[_%20 ]?[a-z][^/]*\\.html$`, "i"),
    }).filter((p) => this.seasonOf(decodeURIComponent(p.url)) === season);

    const games = [];
    for (const page of pages.slice(0, MAX_DAILY_PAGES)) {
      const html = await fetchHtml(page.url);
      if (!html) continue;

      let tournament = null;
      let date = null;
      let venue = null;
      let round = null;
      /*
        ★**1ページに複数の大会が入ることがある。** 新人ブロック大会の中央地区は
        AブロックとBブロックを1枚で出しており、見出しの大会名はどちらも同じ。
        大会名をそのまま使うと**2つの大会が1つに混ざり、決勝が2試合**になる
        （取りこぼしの検算がここで鳴った）。ブロック名を大会名に足して分ける。
      */
      let block = null;
      const pageGames = [];

      for (const table of html.match(/<table[\s\S]*?<\/table>/gi) ?? []) {
        for (const cells of tableRows(table)) {
          const text = cells.join(" ").trim();
          if (!text) continue;

          // 4セルの行が試合。「9：00 | 校名 | ５ ― ４ | 校名」
          const score = cells.length >= 4 ? cells[2].match(/^(\d{1,2})\s*-\s*(\d{1,2})/) : null;
          if (score && cells[1] && cells[3]) {
            if (!date) continue; // 日付の見出しより前に試合は来ない
            const a = Number(score[1]);
            const b = Number(score[2]);
            pageGames.push({
              date,
              season,
              tournament: block ? `${tournament}（${block}ブロック）` : tournament,
              /*
                ★**回戦が試合の行のほうに書いてあることがある。**
                最終日は見出しが「▽ 決勝・三位決定戦」で2試合ぶんをまとめており、
                どちらがどれかは時刻のセル（「三位決定戦 10：00」「決勝 13：30」）にしか
                書かれていないことがある。見出しだけを見ると**3位決定戦まで決勝として
                数え、決勝が2試合**になる（取りこぼしの検算がここで鳴った）。
              */
              round: pickRound(cells[0]) ?? round,
              venue,
              teams: [
                { display: cells[1], score: a, won: a > b },
                { display: cells[3], score: b, won: b > a },
              ],
            });
            continue;
          }

          // 見出しの行。**大会名 → 日付 → 回戦 の順に上書きしていく**
          if (/日程および試合結果/.test(text)) {
            tournament = text.split(/日程および試合結果/)[0].trim() || tournament;
            venue = pickVenue(text) ?? venue;
            continue;
          }
          const day = text.match(/第\s*(\d+)日\s*(\d{1,2})月(\d{1,2})日/);
          if (day) {
            date = `${year}-${day[2].padStart(2, "0")}-${day[3].padStart(2, "0")}`;
            venue = pickVenue(text) ?? venue;
            continue;
          }
          const r = pickRound(text);
          if (r) {
            round = r;
            // 「▽ 決勝 Ａブロック むつみスタジアム」。**無ければ持ち越さない**
            block = text.normalize("NFKC").match(/([A-Za-z])ブロック/)?.[1] ?? null;
            venue = pickVenue(text) ?? venue;
          }
        }
      }
      games.push(...splitThirdPlace(pageGames));
    }
    return games;
  },
};

/**
 * ★**「決勝・3位決定戦」を1つの見出しにまとめている日がある。**
 *
 * 徳島の新人ブロック大会がそれで、試合の行にも回戦が書かれていないため、
 * 2試合とも「決勝」になる（決勝が2試合＝検算に引っかかる）。並び順で
 * 決めることはできない（同じ県の秋季大会では3位決定戦のほうが先だった）。
 *
 * **推測せずに、取れているデータから決める。** 勝ち抜き戦なので、
 * **決勝に出るのは1度も負けていない2校**。3位決定戦は準決勝で負けた2校の
 * 対戦なので、両校ともその大会ですでに負けている。1試合だけが
 * 「両校とも無敗」になるときだけ入れ替える。決められなければ触らない。
 */
function splitThirdPlace(games) {
  const byKey = new Map();
  for (const g of games) {
    const key = g.tournament ?? "";
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(g);
  }
  for (const list of byKey.values()) {
    const finals = list.filter((g) => g.round === "決勝");
    if (finals.length < 2) continue;
    /** その大会で負けた校（決勝候補より前の試合だけを見る） */
    const lost = new Set();
    for (const g of list) {
      if (finals.includes(g)) continue;
      for (const t of g.teams) if (!t.won) lost.add(normalizeSchoolName(t.display));
    }
    const unbeaten = finals.filter((g) =>
      g.teams.every((t) => !lost.has(normalizeSchoolName(t.display))),
    );
    if (unbeaten.length !== 1) continue;
    for (const g of finals) if (g !== unbeaten[0]) g.round = "3位決定戦";
  }
  return games;
}

/**
 * 熊本県高等学校野球連盟（`kumamoto-kouyaren.com`）。
 *
 * **規約に転載の制限は無い**（2026-08-13 にトップ・大会ページ・結果ページを確認）。
 *
 * 大会ごとの一覧 → 日別ページ の二段（神奈川・埼玉と同じ形）。
 * **日別ページのURLに日付が入っている**（`pastgame/20260724-108th.html`）ので、
 * 一覧には過去10年ぶんが並んでいても年で絞れる。
 *
 *   <h3 class="result_ground">■リブワーク藤崎台球場</h3>
 *   <div class="scoreboard">
 *     <h4>第108回全国高等学校野球選手権熊本大会　決勝</h4>
 *     <table class="t_scoreboard"> …イニング表… </table>
 *     <table class="t_player_score"> …投手・捕手・本塁打… </table>
 *   </div>
 *
 * ★**選手の名前は取らない。** 同じ div に投手・捕手・本塁打の表が並んでいるが、
 * このサイトは選手個人の記録を作らない方針（AGENTS.md）。読むのはイニング表だけ。
 */
const kumamoto = {
  slug: "kumamoto",
  district: "熊本",
  name: "熊本県高等学校野球連盟",
  siteUrl: "http://www.kumamoto-kouyaren.com/",
  seasons: {
    spring: "http://www.kumamoto-kouyaren.com/tournament-spring/",
    summer: "http://www.kumamoto-kouyaren.com/tournament-summer/",
    autumn: "http://www.kumamoto-kouyaren.com/tournament-autumn/",
  },
  async collect({ fetchHtml, season, url, year }) {
    const index = await fetchHtml(url);
    if (!index) return [];

    // 一覧は過去10年ぶんが1ページに並ぶ。**URLの年で絞る**
    const days = dailyLinks(index, url, {
      hrefPattern: new RegExp(`/pastgame/${year}\\d{4}-[^/]+\\.html$`),
    });

    const games = [];
    for (const day of days.slice(0, MAX_DAILY_PAGES)) {
      const html = await fetchHtml(day.url);
      if (!html) continue;
      const date = day.url.match(/\/(\d{4})(\d{2})(\d{2})-/);
      if (!date) continue;
      const isoDate = `${date[1]}-${date[2]}-${date[3]}`;

      /*
        ★**HTMLコメントを先に落とす。** このページは使わない球場の見出しや
        次の試合の枠をコメントにして残してある。落とさないと、
        **その日に使っていない球場**（コメントの中の「佐賀市立野球場」）を
        会場として拾ってしまう。
      */
      const body = html.replace(/<!--[\s\S]*?-->/g, " ");

      let venue = null;
      const token =
        /<h3[^>]*class="result_ground"[^>]*>([\s\S]*?)<\/h3>|<div[^>]*class="scoreboard"[^>]*>([\s\S]*?)<\/div>/gi;
      for (const m of body.matchAll(token)) {
        if (m[1] !== undefined) {
          venue = pickVenue(plain(m[1]));
          continue;
        }
        const block = m[2];
        const head = normalize(plain(/<h4[^>]*>([\s\S]*?)<\/h4>/.exec(block)?.[1] ?? ""));
        const tournament = head.match(/^(.*?大会)/)?.[1] ?? null;
        const round = pickRound(head.slice(tournament?.length ?? 0));

        const table = /<table[^>]*class="t_scoreboard"[\s\S]*?<\/table>/i.exec(block)?.[0];
        if (!table) continue;
        const rows = tableRows(table).filter((r) => r.length > 3);
        if (rows.length < 2) continue;
        const [homeRow, awayRow] = rows.slice(-2);
        const home = homeRow[0];
        const away = awayRow[0];
        /*
          ★**まだ行われていない試合の枠が置いてある。** 校名が「--」や空で、
          スコアだけ前の試合の使い回しが残っていることがある。落とすこと。
        */
        if (!home || !away || /^-+$/.test(home) || /^-+$/.test(away)) continue;
        const a = inningTotal(homeRow);
        const b = inningTotal(awayRow);
        if (a === null || b === null) continue;

        games.push({
          date: isoDate,
          season,
          tournament,
          round,
          venue,
          teams: [
            { display: home, score: a, won: a > b },
            { display: away, score: b, won: b > a },
          ],
        });
      }
    }
    return games;
  },
};

/**
 * ここに県を足していく。
 *
 * ★**規約で制限のある連盟のサイトは足さないこと。**
 * 北海道・青森・秋田・東京・鳥取・埼玉（「データ」「内容」を名指しで転載禁止）、
 * 大分（営利目的の複製を禁止）。北海道は robots.txt でもスコアPDFを拒否している。
 * 埼玉だけは、連盟とは無関係の個人サイトから取っている（上記 `saitama`）。
 *
 * 岩手・宮城・島根は制限が「著作権について」の章にあり、列挙も画像・レイアウト・
 * 記事・ドキュメントで「データ」が無い。事実であるスコアには及ばないと読めるが、
 * **3県とも「リンクはトップページへ」と書いている**ので `siteUrl` はトップにすること。
 *
 * 詳細はREADMEの「都道府県高野連サイトの規約調査」。
 */
const ADAPTERS = [nagano, kanagawa, saitama, yamanashi, tokushima, kumamoto];

// ------------------------------------------------------------------
// 学校マスタとの照合（build-live-results.mjs と同じ考え方）
// ------------------------------------------------------------------

/**
 * 略称の候補。`src/lib/school-name.ts` と同じ規則。
 * **スクリプトは .mjs なので TS を import できない。** 規則を変えるときは両方直す。
 */
function labelCandidates(name, aliases) {
  const set = new Set([name, ...(aliases ?? [])]);
  const short = name.replace(/高校$/, "");
  set.add(short);
  set.add(short.replace(/商業$/, "商").replace(/工業$/, "工").replace(/農業$/, "農"));
  /*
    **高専は「◯◯高専」と書かれる。**
    学校マスタは「阿南工業高専」「長野工業高専」の形なので、出典の「阿南高専」
    「長野高専」とはそのままでは結び付かない（徳島で実際に外れた）。
    「高等専門学校」で持っている場合にも備えて両方たたむ。
  */
  if (/高等専門学校$|高専$/.test(name)) {
    set.add(name.replace(/(工業)?高等専門学校$/, "高専").replace(/工業高専$/, "高専"));
  }
  /*
    **中等教育学校は後半（高校にあたる部分）が大会に出る。**
    出典は「城ノ内」とだけ書く。学校マスタは「城ノ内中等教育学校」。
    ★これは**照合のための別名**で、画面に出す校名ではない。
    一覧の短い校名（`src/lib/school-name.ts`）では「中等教育学校」を落とさない
    （何の学校か分からなくなるため）。
  */
  if (/中等教育学校$/.test(name)) set.add(name.replace(/中等教育学校$/, ""));
  return [...set].filter(Boolean);
}

/**
 * **その県の中でだけ通じる略称。**
 *
 * 出典は自分の県のサイトなので、**校名から県名を省く**ことがある。
 * 徳島の「徳島科学技術」は「科学技術」とだけ書かれる。
 *
 * ★**全国の索引には入れないこと。** 「科学技術」だけの校名は全国に4校あり
 * （福井・兵庫・静岡・東東京）、全国側に入れると同名で引けなくなるどころか、
 * **別の県の学校に結び付く**余地ができる。県内の索引にだけ足す。
 */
function districtOnlyCandidates(name, district) {
  const short = name.replace(/高校$/, "");
  if (!short.startsWith(district)) return [];
  const out = [];
  const rest = short.slice(district.length);
  /*
    **設置区分まで校名に入っている学校がある。**
    「熊本県立第二高校」「熊本県立第一高校」は、そうしないと全国の「第二」
    「第一」と区別が付かないため学校マスタが県立を含めて持っている。
    出典は「第 二」とだけ書くので、県名に続く「県立」「市立」も落とした形を作る。
  */
  const bare = rest.replace(/^[都道府県市町村区]立/, "");
  // 「山梨（県立山梨高校）」のように県名そのものの校名は、削ると何も残らない
  for (const label of [rest, bare]) if (label.length >= 2) out.push(label);
  return out;
}

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
 * ★**規則では拾えない校名の対応表。手で書く。**
 *
 * 「地区名＼出典の表記」→ 学校マスタの校名。**推測で書かないこと。**
 * 出典のページで実際にその表記が使われていることを確かめてから足す。
 *
 * 高専のキャンパスについて:
 *   熊本高専は八代・熊本の2キャンパスがあり、**大会にはキャンパスごとに出る**
 *   （「高専八代」「高専熊本」）。学校マスタは1校なので、両方を同じ学校に
 *   結び付ける。**その結果、片方が勝って片方が負けた日は1校が1勝1敗になる。**
 *   勝ち上がり（1度も負けていない）の判定では出てこなくなるだけで、
 *   嘘にはならない側に倒れる。
 */
const DISTRICT_ALIASES = {
  "熊本\t高専八代": "熊本高専",
  "熊本\t高専熊本": "熊本高専",
};

/**
 * 「地区名＋略称」→ 学校。
 * **1件に決まらなければ結び付けない**（同じ地区に同名の県立と市立がある）。
 */
function buildIndex(schools) {
  /** 「地区名\t正規化した校名」→ 学校の配列 */
  const byDistrict = new Map();
  /**
   * 「正規化した校名」→ 学校の配列（全国）。
   *
   * **県外の相手が出てくる。** 秋春の県大会の先には北信越・関東などの
   * 地区大会があり、他県の学校と対戦する（長野で星稜・富山商業・敦賀気比・
   * 新潟明訓が外れた。富山商業は公立なので取りこぼしになる）。
   * 地区で引けなかったときの受け皿にする。**全国で1件に決まるときだけ使う。**
   */
  const nationwide = new Map();

  const push = (map, key, s) => {
    if (!map.has(key)) map.set(key, []);
    if (!map.get(key).some((h) => h.slug === s.slug)) map.get(key).push(s);
  };

  for (const s of schools) {
    const district = s.prefecture?.name;
    if (!district) continue;
    for (const label of labelCandidates(s.name, s.name_aliases)) {
      // **鍵は正規化した校名。** 揺れ（ケ/ヶ・旧字体・空白）で外れるのを防ぐ
      const norm = normalizeSchoolName(label);
      push(byDistrict, `${district}\t${norm}`, s);
      push(nationwide, norm, s);
    }
    // 県名を省いた略称は県内の索引にだけ入れる（上の districtOnlyCandidates 参照）
    for (const label of districtOnlyCandidates(s.name, district)) {
      push(byDistrict, `${district}\t${normalizeSchoolName(label)}`, s);
    }
  }

  // 手で書いた対応表。**規則で拾える学校を上書きしない**（同じ Map に足すだけ）
  for (const [key, target] of Object.entries(DISTRICT_ALIASES)) {
    const [district, label] = key.split("\t");
    const hit = (byDistrict.get(`${district}\t${normalizeSchoolName(target)}`) ?? [])[0];
    if (!hit) {
      console.log(`  ⚠️ 対応表の「${target}」が学校マスタに見つからない（${key}）`);
      continue;
    }
    push(byDistrict, `${district}\t${normalizeSchoolName(label)}`, hit);
  }
  return { byDistrict, nationwide };
}

// ------------------------------------------------------------------

async function main() {
  const targets = onlyPref ? ADAPTERS.filter((a) => a.slug === onlyPref) : ADAPTERS;
  if (!targets.length) {
    console.log(`対応している県: ${ADAPTERS.map((a) => a.slug).join(", ")}`);
    return;
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const index = buildIndex(await fetchSchools(supabase));

  const districts = [];
  for (const adapter of targets) {
    console.log(`\n=== ${adapter.district} ===`);
    const all = [];
    const unmatched = new Set();

    // 相手のサーバーへの間隔。個人サイトは長めにする
    const get = (url) => fetchHtml(url, adapter.politenessMs ?? 1500);

    for (const [season, url] of Object.entries(adapter.seasons)) {
      const seen = new Set();
      const seasonGames = [];
      /** 重複を落としつつ足す。**同じ試合が別ページに出ることがある** */
      const add = (list) => {
        let added = 0;
        for (const g of list) {
          const key = `${g.date}\t${g.teams[0].display}\t${g.teams[1].display}`;
          if (seen.has(key)) continue;
          seen.add(key);
          seasonGames.push(g);
          added += 1;
        }
        return added;
      };

      try {
        if (adapter.collect) {
          /*
            **サイトによって取得の流れが違う。**
            長野は1枚の一覧をページングして辿るだけだが、神奈川・埼玉は
            「大会の一覧 → 日別ページ」の二段になっている。
            共通化しようとすると、どちらにも合わない形になる。
            流れごとアダプタに持たせて、ここは呼ぶだけにする。
          */
          let got = add(await adapter.collect({ fetchHtml: get, season, url, year: TARGET_YEAR }));
          /*
            **秋は前の年に開かれている。** 秋季大会は「翌春の選抜の選考資料」で、
            年度でいえば今年度でも、暦の上では前年の8〜10月。年でページが
            分かれているサイトでは、今年のページがまだ空になる。
            1件も取れなかったときだけ前年を見に行く。
          */
          if (got === 0 && season === "autumn") {
            got = add(
              await adapter.collect({ fetchHtml: get, season, url, year: TARGET_YEAR - 1 }),
            );
            if (got) console.log(`  （${season} は ${TARGET_YEAR - 1} 年のページから取得）`);
          }
        } else {
          /*
            **1ページ目だけ読まないこと。** 長野は1ページ10行・夏は5ページある。
            1ページ目だけだと直近4日ぶんしか取れず、大会の大半が欠ける。
            止め方は「そのページで1試合も増えなかったら終わり」。
          */
          for (let page = 1; page <= MAX_PAGES; page++) {
            const pageUrl = page === 1 ? url : adapter.nextPage?.(url, page);
            if (!pageUrl) break;
            const html = await get(pageUrl);
            if (!html) break;
            if (add(adapter.parse(html, season)) === 0) break;
          }
        }
      } catch (e) {
        /*
          **1県・1季節の失敗で全体を止めない。** サイトの作り替えは普通に起きる。
          止めると、他県の更新までできなくなる。
        */
        console.log(`  ⚠️ ${season}: ${e.message}`);
      }
      /*
        開催中の大会だけに絞る。基点は**その季節のいちばん新しい試合**。
        「今日」を基点にしないのは、試合が増えていないのに毎日差分が出るのを防ぐため。
      */
      const kept = (() => {
        if (KEEP_ALL || !seasonGames.length) return seasonGames;
        const newest = seasonGames.reduce((a, g) => (g.date > a ? g.date : a), "");
        const limit = new Date(`${newest}T00:00:00Z`);
        limit.setUTCDate(limit.getUTCDate() - KEEP_DAYS);
        const from = limit.toISOString().slice(0, 10);
        return seasonGames.filter((g) => g.date >= from);
      })();

      const dates = kept.map((g) => g.date).sort();
      const dropped = seasonGames.length - kept.length;
      console.log(
        `  ${season}: ${kept.length} 試合` +
          (dates.length ? `（${dates[0]} 〜 ${dates.at(-1)}）` : "") +
          (dropped ? ` ／ 過去分 ${dropped} 件は残さない` : ""),
      );
      all.push(...kept);
    }

    // 公立校に結び付ける
    const decorate = (t0) => {
      if (isCombinedTeam(t0.display)) {
        /*
          連合チームは1校に結び付けない。印だけ付けて持つ。
          ★**空白は残す。** 連合は「寒川 藤沢総合 深沢 厚木清南」と空白で
          学校を区切るので、詰めると1つの校名に見える。
        */
        return { ...t0, name: t0.display, slug: null, combined: true };
      }
      /*
        ★**表示用の空白を落とす。** 出典は表の見た目をそろえるために
        「有 明」「岱 志」「横 浜」と1文字ずつ空ける。そのまま画面に出すと
        校名が割れて見える（実際に「■リブワ-ク藤崎台球場」と一緒に出ていた）。
        **日本の校名に空白は入らない**ので、連合でなければ詰めてよい。
      */
      const t = { ...t0, display: t0.display.replace(/[\s　]+/g, "") };
      const norm = normalizeSchoolName(t.display);
      let hits = index.byDistrict.get(`${adapter.district}\t${norm}`) ?? [];
      // 県内で引けなければ全国で引く（地区大会の県外の相手）
      if (hits.length === 0) hits = index.nationwide.get(norm) ?? [];
      if (hits.length !== 1) {
        unmatched.add(hits.length > 1 ? `${t.display}（同名が${hits.length}件）` : t.display);
        return { ...t, name: t.display, slug: null };
      }
      return { ...t, name: hits[0].name, slug: hits[0].slug };
    };

    const games = all
      /*
        **勝敗はアダプタが出典から取ったものを使う。** スコアから導かない。
        引き分け・没収試合で食い違う。長野は勝者に class="win" が付いている。
      */
      .map((g) => ({ ...g, teams: g.teams.map(decorate) }))
      // **公立が絡む試合だけ残す。** このサイトの切り口はそこにある
      .filter((g) => g.teams.some((t) => t.slug));

    const publicTeams = new Set(
      games.flatMap((g) => g.teams.filter((t) => t.slug).map((t) => t.slug)),
    );
    console.log(`  → 公立が絡む試合 ${games.length} 件 / 公立 ${publicTeams.size} 校`);
    /*
      **結び付かなかった校名は必ず出す。** 大半は私立（学校マスタに無いので当然）
      だが、揺れや旧校名で外れているものが混ざる。黙って落とすと気づけない。
    */
    if (unmatched.size) {
      console.log(`  結び付かなかった校名 ${unmatched.size} 件:`);
      console.log(`    ${[...unmatched].join("、")}`);
    }

    districts.push({
      slug: adapter.slug,
      district: adapter.district,
      sourceName: adapter.name,
      // **リンクはトップページへ。** 深いURLへのリンクを断っている連盟がある
      sourceUrl: adapter.siteUrl,
      games,
      /*
        ★**絞る前の全試合。ベストNを数えるのに要る。**
        `games` は公立が絡む試合だけなので、私立同士の試合が落ちている。
        それで数えると、まだ生き残っている私立が勘定に入らず**ベストNが
        実際よりずっと小さく出る**（神奈川で1勝の学校が「ベスト32」になった）。
        生成物には出さない（下で落とす）。
      */
      allGames: all.map((g) => ({
        season: g.season,
        tournament: g.tournament,
        // 決勝が済んでいるかを見るのに要る（取りこぼしの検算）
        round: g.round,
        teams: g.teams.map((t) => ({ display: t.display, won: t.won })),
      })),
    });
  }

  const results = { districts };

  if (jsonPath) {
    writeFileSync(jsonPath, JSON.stringify(results, null, 2), "utf8");
    console.log(`\n書き出した(JSON): ${jsonPath}`);
  }

  /*
    ------------------------------------------------------------------
    トップ用の抜粋を選ぶ。

    トップの速報カードは「注目校の試合をいくつか」出すだけなので、
    全国ぶんを読む必要がない。47県で6MB近くになるため、**抜粋を別ファイルにする。**

    ★**ここでシャッフルしないこと。** 実行のたびに並びが変わると、試合が
    1つも増えていなくても差分が出て、3時間おきのCIが意味のないコミットを
    積み続ける。**選ぶ基準は決め打ちにして、混ぜるのは表示のとき**にする
    （`pickRegionalGames`）。

    選び方は「公立が勝った試合を優先」「新しい順」「1県から取りすぎない」。
    公立が負けた試合ばかり並ぶと応援サイトとして据わりが悪く、1県が
    独占すると全国を見ている感じが出ない。
  */
  /*
    ★**抜粋には古い大会を混ぜない。**

    残す範囲（`KEEP_DAYS`）は**県ごと・季節ごと**に決めている。県によっては
    秋のページがまだ前年ぶんしか無く、その県のファイルには前年の秋が入る。
    トップの抜粋は全国から集めるので、そのままだと**2025年9月の試合が
    「9月6日」として今年の試合と並ぶ**（画面に年を出していないため見分けが付かない）。

    抜粋に入れるのは「いちばん新しい試合から `KEEP_DAYS` 以内」だけにする。
    県のページ（`src/lib/data/regional/<県>.ts`）はそのままで、前年の秋も残る。
  */
  const newestOverall = districts.flatMap((d) => d.games.map((g) => g.date)).sort().at(-1) ?? null;
  const pickupFrom = (() => {
    if (!newestOverall) return null;
    const limit = new Date(`${newestOverall}T00:00:00Z`);
    limit.setUTCDate(limit.getUTCDate() - KEEP_DAYS);
    return limit.toISOString().slice(0, 10);
  })();

  const pickups = [];
  for (const d of districts) {
    const sorted = [...d.games]
      .filter((g) => g.teams.some((t) => t.slug && !t.combined))
      .filter((g) => !pickupFrom || g.date >= pickupFrom)
      .sort((a, b) => {
        const wonA = a.teams.some((t) => t.slug && t.won) ? 1 : 0;
        const wonB = b.teams.some((t) => t.slug && t.won) ? 1 : 0;
        return wonB - wonA || b.date.localeCompare(a.date);
      })
      .slice(0, PICKUP_PER_DISTRICT);

    for (const g of sorted) {
      pickups.push({
        districtSlug: d.slug,
        district: d.district,
        sourceName: d.sourceName,
        sourceUrl: d.sourceUrl,
        date: g.date,
        season: g.season,
        tournament: g.tournament,
        round: g.round,
        teams: g.teams,
      });
    }
  }
  // 全体でも新しい順に並べてから上限で切る
  pickups.sort((a, b) => b.date.localeCompare(a.date));
  const picked = pickups.slice(0, PICKUP_TOTAL);
  /*
    **鮮度は抜粋ではなく全試合から出す。** 抜粋は「公立が勝った試合を優先」で
    選んでいるので、いちばん新しい試合が入っているとは限らない。
    抜粋の先頭を使うと「7月20日の試合まで」と、実際より古く見える。
  */
  const latestDate =
    districts.flatMap((d) => d.games.map((g) => g.date)).sort().at(-1) ?? null;

  /*
    ------------------------------------------------------------------
    いま開催中の大会で**勝ち上がっている公立校**。

    トップの右カラム（甲子園の期間中は「今年夏の出場校」）を、
    甲子園が終わったあとに差し替えるためのもの。

    **「まだ1度も負けていない」で判定する。** 地方大会はブラケットを
    持っていないので「次に誰と当たるか」は出せないが、負けていないことは
    行われた試合だけから確実に言える。大会が終われば優勝校だけが残るが、
    それは「その大会を勝ち上がった学校」としてそのまま意味を持つ。

    対象はいちばん新しい試合が属する季節だけ。春の結果と秋の結果を
    混ぜると、どの大会の話なのか分からなくなる。
  */
  const spotlightSeason =
    districts
      .flatMap((d) => d.games)
      .sort((a, b) => a.date.localeCompare(b.date))
      .at(-1)?.season ?? null;

  /*
    ★**「1勝」ではなく「4回戦突破」で出す。**

    参加校数は県で大きく違う（神奈川は172チーム、少ない県は30校台）。
    「1勝」だけ並べても、どこまで勝ち上がったのかが伝わらない。

    **ベストNは断念した。** ベストNを出すには「その時点で何チーム残っているか」が
    要るが、それは**全試合が取れていること**が前提になる。実際には取りこぼしがあり
    （神奈川の夏は172チーム＝171試合のところ158試合しか取れず）、
    ベストNが実際よりずっと小さく出た。トーナメント表から取ることも試したが、
    3県とも**画像**で機械では読めなかった。

    **「4回戦突破」は取りこぼしがあっても嘘にならない。**
    その試合に勝ったことは、取れているデータそのものだからである。
  */

  /** 回戦の並び。深いほど後ろ */
  const ROUND_ORDER = [
    "1回戦", "2回戦", "3回戦", "4回戦", "5回戦", "6回戦", "7回戦",
    "代表決定戦", "準々決勝", "準決勝", "決勝",
  ];
  /** 勝った回戦 → 画面に出す言い方 */
  const roundLabel = (round) => {
    if (!round) return null;
    if (round === "決勝") return "優勝";
    if (round === "準決勝") return "決勝進出";
    if (round === "準々決勝") return "準決勝進出";
    if (/^\d+回戦$/.test(round)) return `${round}突破`;
    return `${round}突破`;
  };
  const bySlugRecord = new Map();
  /** 「地区\t大会名」→ その大会の全チームの成績。私立も数える */
  const tournaments = new Map();
  /** 決勝まで終わっている大会の鍵。取りこぼしの検算に使う */
  const finalPlayed = new Set();

  if (spotlightSeason) {
    for (const d of districts) {
      // 大会ごとの全チームの成績。**私立も含めて数える**（絞る前の試合を使う）
      for (const g of d.allGames) {
        if (g.season !== spotlightSeason) continue;
        const key = `${d.slug}\t${g.tournament ?? ""}`;
        if (!tournaments.has(key)) tournaments.set(key, new Map());
        const table = tournaments.get(key);
        if (g.round === "決勝") finalPlayed.add(key);
        for (const t of g.teams) {
          /*
            **鍵は正規化した校名。** 生の表記のままだと、表示用の空白が入った
            「横 浜」と「横浜」が別チームとして数えられ、勝敗が2つに割れる。
            その結果、優勝校まで「未敗退が複数」に見えていた。
          */
          const id = normalizeSchoolName(t.display);
          const rec = table.get(id) ?? { wins: 0, losses: 0 };
          if (t.won) rec.wins += 1;
          else rec.losses += 1;
          table.set(id, rec);
        }
      }

      // 公立校のほうは、学校マスタに結び付いた試合から拾う
      for (const g of d.games) {
        if (g.season !== spotlightSeason) continue;
        const key = `${d.slug}\t${g.tournament ?? ""}`;
        for (const t of g.teams) {
          if (!t.slug || t.combined) continue;
          const school = bySlugRecord.get(t.slug) ?? {
            slug: t.slug,
            display: t.display,
            name: t.name,
            district: d.district,
            districtSlug: d.slug,
            tournamentKey: key,
            wins: 0,
            losses: 0,
            /** 勝った回戦のうちいちばん深いもの */
            deepestWon: null,
          };
          if (t.won) {
            school.wins += 1;
            const rank = ROUND_ORDER.indexOf(g.round ?? "");
            const best = ROUND_ORDER.indexOf(school.deepestWon ?? "");
            if (rank >= 0 && rank > best) school.deepestWon = g.round;
          } else {
            school.losses += 1;
          }
          bySlugRecord.set(t.slug, school);
        }
      }
    }
  }

  /*
    ★**取りこぼしの検算。** 勝ち抜き戦は1試合につき1チームが必ず消えるので、
    「参加チーム数 − 試合数 = まだ負けていないチーム数」が成り立つ。
    ここが大きすぎるなら、取れていない試合がある。

    **黙って通さないこと。** 取りこぼした試合に敗戦が含まれていると、
    負けた学校が「勝ち残り」として画面に出る（実際に神奈川で起きた。
    夏が終わっているのに5校が勝ち残り扱いになった）。
  */
  /*
    ★**取りこぼしの検算は、校名ではなく回戦ごとの試合数で見る。**

    最初は「チーム数 − 試合数 = 未敗退数」で検算していたが、これは
    **校名の表記揺れに弱い。** 長野の出典は同じ学校を回戦ごとに
    「東京都市大学塩尻」「都市大塩尻」「東京都市大塩尻」「都市大学塩尻」と
    書き分けており、1校が4チームに割れて「未敗退が3チーム」に見えた
    （実際に欠けている試合は無かった）。

    代わりに**回戦ごとの試合数**を見る。校名が要らない。

    ★**見るのは準々決勝・準決勝・決勝の3つだけ**（4・2・1になるはず）。
    それより前の回戦は**不戦勝があって半分にならない。** 1回戦だけの話かと
    思ったがそうではなく、神奈川は2回戦66試合→3回戦32試合、埼玉は
    2回戦74試合→3回戦32試合で、2回戦にも不戦勝が入っていた。
    全回戦で半分を要求すると、欠けていない大会まで誤って弾く。
  */
  /*
    ★**準々決勝は「多い」を異常としない。**

    山梨の秋季県大会は準々決勝が6試合ある（敗者にもう一度機会がある形式で、
    出典もその6試合を「準々決勝」と書いている）。**大会の形は県ごとに違う**ので、
    ここで4試合を強いると、欠けていない大会を毎回警告することになり、
    警告そのものが読まれなくなる。

    見たいのは**取りこぼし**なので、準々決勝は「4試合より少ない」ときだけ鳴らす。
    準決勝・決勝は形が変わらないので、多い場合も鳴らす
    （実際に、別の大会が混ざっているのをこれで見つけた）。
  */
  const TAIL_ROUNDS = [
    ["準々決勝", 4, "atLeast"],
    ["準決勝", 2, "exact"],
    ["決勝", 1, "exact"],
  ];
  const gamesPerRound = new Map();
  for (const d of districts) {
    for (const g of d.allGames) {
      if (g.season !== spotlightSeason) continue;
      const key = `${d.slug}\t${g.tournament ?? ""}`;
      if (!gamesPerRound.has(key)) gamesPerRound.set(key, new Map());
      const byRound = gamesPerRound.get(key);
      byRound.set(g.round ?? "?", (byRound.get(g.round ?? "?") ?? 0) + 1);
    }
  }
  for (const [key, byRound] of gamesPerRound) {
    for (const [round, expected, mode] of TAIL_ROUNDS) {
      const actual = byRound.get(round);
      // その回戦にまだ達していない大会は検算の対象外
      if (actual === undefined) continue;
      if (mode === "atLeast" ? actual >= expected : actual === expected) continue;
      console.log(
        `  ⚠️ ${key.replace("\t", " / ")}: ${round}が${actual}試合（${expected}試合のはず）。` +
          (actual < expected ? "試合が欠けている" : "別の大会が混ざっている"),
      );
    }
  }

  const spotlight = [...bySlugRecord.values()]
    /*
      まだ負けていない学校。

      ★**決勝まで終わった大会は出さない。** 終わった大会に「勝ち上がっている
      学校」はいない（いるのは優勝校で、それは別の話）。ここを出そうとすると、
      校名の表記揺れや取りこぼしで負けた学校が混ざる余地が生まれる。
      **開催中の大会に限れば、その余地ごと無くなる。**
    */
    .filter((r) => r.losses === 0 && r.wins > 0 && !finalPlayed.has(r.tournamentKey))
    .map((r) => ({ ...r, standing: roundLabel(r.deepestWon) }))
    .sort((a, b) => {
      const ra = ROUND_ORDER.indexOf(a.deepestWon ?? "");
      const rb = ROUND_ORDER.indexOf(b.deepestWon ?? "");
      return rb - ra || b.wins - a.wins || a.name.localeCompare(b.name, "ja");
    })
    .slice(0, SPOTLIGHT_LIMIT)
    /*
      敗戦数・大会の鍵・作業用の項目は生成物に残さない。
      敗戦数はこのサイトの方針で画面に出さない。
    */
    .map(({ losses: _l, tournamentKey: _k, deepestWon: _d, ...rest }) => rest);

  console.log(
    `\n抜粋: ${picked.length} 件（${districts.length} 県から。1県あたり最大 ${PICKUP_PER_DISTRICT} 件）`,
  );
  console.log(
    `勝ち上がり: ${spotlight.length} 校（${spotlightSeason ?? "-"}）` +
      (spotlight.length
        ? ` — ${spotlight.map((s) => `${s.display}(${s.standing ?? `${s.wins}勝`})`).join("、")}`
        : ""),
  );

  if (DRY) {
    console.log("--dry のため生成物は書き換えません。");
    return;
  }

  // ---- 県ごとのファイル ----
  mkdirSync(OUT_DIR, { recursive: true });
  for (const { allGames: _allGames, ...d } of districts) {
    // `allGames` はベストNを数えるための作業用。生成物には出さない
    const file =
      `// このファイルは scripts/build-regional-results.mjs が生成する。直接編集しない。\n` +
      `// 出典: ${d.sourceName}（${d.sourceUrl}）\n\n` +
      `import type { RegionalDistrict } from "@/lib/regional-results";\n\n` +
      `export const REGIONAL_${d.slug.toUpperCase().replace(/-/g, "_")}: RegionalDistrict = ${JSON.stringify(d, null, 2)};\n`;
    const out = path.join(OUT_DIR, `${d.slug}.ts`);
    writeFileSync(out, file, "utf8");
    console.log(`  書き出した: ${path.relative(ROOT, out)}（${Math.round(file.length / 1024)}KB）`);
  }

  /*
    ---- 県のページが読むための索引 ----

    ★**動的 import の表にすること。** 県のページ（`/prefectures/<slug>`）は
    自分の県のファイルだけ要る。ここで全県を静的 import すると、
    **どの県のページにも全国ぶんが入る**（6県で約430KB、47県なら6MB）。

    ★**手で書かない。** アダプタを足すたびに直し忘れると、
    データはあるのにページに出ない、という気づきにくい形で壊れる。

    ★**ファイルがある県だけ載せる。** アダプタを足しただけでまだ生成して
    いない県を書くと、**存在しないファイルを import してビルドが落ちる。**
    `--pref` で1県だけ動かしたときに他県が消えないよう、
    ここは ADAPTERS 全体を見て（今回動かした県だけを見ない）作る。
  */
  /*
    ★**ファイル名は `index.ts` にしないこと。**
    `@/lib/data/regional` のようなディレクトリ指定の import は、本番ビルドは
    通るのに **`next dev` のブラウザ側のコンパイルだけが解決に失敗する**
    （`Module not found: Can't resolve '@/lib/data/regional'` がリクエストごとに出る）。
    ファイルを名指しできる名前にしておけば、どちらでも同じ解決になる。
  */
  const known = ADAPTERS.filter((a) => existsSync(path.join(OUT_DIR, `${a.slug}.ts`)));
  const indexFile =
    `// このファイルは scripts/build-regional-results.mjs が生成する。直接編集しない。\n` +
    `// 県のページが自分の県だけ読み込むための表。**静的 import にしないこと**\n` +
    `// （全県が1つのページに入る）。\n\n` +
    `import type { RegionalDistrict } from "@/lib/regional-results";\n\n` +
    `export const REGIONAL_LOADERS: Record<string, () => Promise<RegionalDistrict>> = {\n` +
    known
      .map(
        (a) =>
          `  ${a.slug}: () => import("./${a.slug}").then((m) => m.REGIONAL_${a.slug
            .toUpperCase()
            .replace(/-/g, "_")}),\n`,
      )
      .join("") +
    `};\n`;
  const indexOut = path.join(OUT_DIR, "loaders.ts");
  writeFileSync(indexOut, indexFile, "utf8");
  console.log(`  書き出した: ${path.relative(ROOT, indexOut)}（${known.length} 県）`);

  // ---- トップ用の抜粋 ----
  /*
    ★**1県だけの実行では抜粋を書き換えない。**
    抜粋は全国から選ぶものなので、`--pref` の結果で上書きすると
    **その1県だけの抜粋になり、他の県がトップから消える**（実際にやった）。
    県ごとのファイルは上で書けているので、抜粋は全県の実行で作り直す。
  */
  if (onlyPref) {
    console.log(`  ${path.relative(ROOT, OUT_PICKUP)} は書き換えません（--pref のため）`);
    return;
  }

  const pickupFile =
    `// このファイルは scripts/build-regional-results.mjs が生成する。直接編集しない。\n` +
    `// トップの速報カード用の抜粋。**全国ぶんはここに入れない**（県ごとのファイルにある）。\n\n` +
    `import type { RegionalPickups } from "@/lib/regional-results";\n\n` +
    `export const REGIONAL_PICKUPS: RegionalPickups = ${JSON.stringify(
      { latestDate, spotlightSeason, spotlight, games: picked },
      null,
      2,
    )};\n`;
  writeFileSync(OUT_PICKUP, pickupFile, "utf8");
  console.log(
    `  書き出した: ${path.relative(ROOT, OUT_PICKUP)}（${Math.round(pickupFile.length / 1024)}KB）`,
  );
}

await main();
