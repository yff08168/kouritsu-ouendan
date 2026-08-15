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

import { fetchPdfPages } from "./lib/pdf-text.mjs";
import { assembleSlotBracket, orientPage, stripInningMarks } from "./lib/slot-bracket.mjs";
import { fetchXlsxSheets } from "./lib/xlsx-rows.mjs";

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
 * 1季節あたり何枚のPDFを読むか。
 * **愛媛は球場ごと・日ごとに1枚**なので、夏は40枚を超える。
 * 1枚ずつ間隔をあけて取るため、上限が無いと1回の実行が長くなりすぎる。
 * ★**足りなくて切れたときは、その回戦の試合数の検算で気づける。**
 */
const MAX_PDF_PAGES = 45;

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
    /*
      **埼 と 崎 の書き違え。** 佐賀の出典は同じ学校を「神埼清明」（正しい）と
      「神崎清明」の両方で書いていた。人が打ち間違える組み合わせなので寄せる。
      別の学校に化ける心配は小さい（**1件に決まらなければ結び付けない**ため）。
    */
    .replace(/埼/g, "崎")
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
 * ★**見出しの記号や括弧を巻き込まない。** 熊本は `■リブワーク藤崎台球場`、
 * 佐賀は `【三回戦】さがみどりの森球場` と書く。`\S*` で拾うと
 * **「■」や「【三回戦】」ごと球場名になる**（どちらも実際に出ていた）。
 */
const pickVenue = (s) =>
  normalize(s ?? "").match(
    /[^\s■◆●▲▼□○◇☆★・【】〔〕［］\[\]()（）]*(?:球場|スタジアム|ドーム|パーク)/,
  )?.[0] ?? null;

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
 * 群馬県高等学校野球連盟（`gunma-hbf.com`）。
 *
 * **規約に転載の制限は無い**（2026-08-14 にトップ・結果ページを確認）。
 *
 * ★**1大会＝1ページ。** 日別ページを辿らずに済むので、1回の実行が
 * 「トップ1枚＋大会ページ数枚」で終わる。**自動更新と相性がよい形。**
 *
 * ★**結果ページのURLに意味が無い**（`99_blank010067.html`）。組み立てられないので
 * トップページの「結果」リンクを辿る。どの大会かは**リンクの周りの文字ではなく、
 * 開いたページ自身のタイトル**で決める（`R８夏大会`）。
 * リンクの近くの文字から大会名を拾うのは、レイアウトが変わると壊れる。
 *
 *   <title>R８夏大会 …</title>          ← 令和8年度＝2026年、夏
 *   ＝＝＝＝　　７月２６日（日）　＝＝＝＝
 *   決勝
 *   上毛新聞敷島球場
 *   健大高崎 ― 前橋商
 *   <table> チーム|1|2|…|9|計 </table>
 *   （前）秋元―中村                      ← 投手・捕手。**取らない**
 *
 * ★**選手の名前は取らない**（熊本と同じ）。読むのはイニング表だけ。
 */
const gunma = {
  slug: "gunma",
  district: "群馬",
  name: "群馬県高等学校野球連盟",
  siteUrl: "http://www.gunma-hbf.com/",
  /*
    ★**この出典は一部の回戦しか出さない。** 夏は3回戦以降の15試合だけで、
    1・2回戦のスコアは載らない（春はさらに少ない）。**取りこぼしではなく、
    出典がそこまでしか公開していない。** 取りこぼしの検算（準々決勝4・
    準決勝2・決勝1）で「試合が欠けている」と毎回鳴るので、この県では
    足りない側の警告を出さない。**多すぎる側の警告は残す**
    （別の大会が混ざるのは、部分公開でも起きてはいけない）。
  */
  partial: true,
  /*
    3季節ともトップページから辿るので同じURL。取得は1回で済ませる（`indexCache`）。
  */
  seasons: {
    spring: "http://www.gunma-hbf.com/",
    summer: "http://www.gunma-hbf.com/",
    autumn: "http://www.gunma-hbf.com/",
  },
  indexCache: new Map(),
  /** ページのタイトルの「春/夏/秋」→ 季節 */
  SEASON_OF: { 春: "spring", 夏: "summer", 秋: "autumn" },
  /**
   * 結果ページのURL → 大会名。
   *
   * ★**大会ページ自身は正式な大会名を持っていない**（見出しもタイトルも「R８夏大会」）。
   * トップの大会情報の欄には正式名があるので、そちらから取る。
   *
   *   ○108回全国高校野球　選手権群馬大会　7/4～7/26　[組合せ] [結果]
   *
   * 欄は `○` 区切り。**リンクより前のテキストが大会名**で、日付の範囲が続く。
   * 取れなければ null にして、大会名なしで出す（**回数を推測して補わない**）。
   */
  tournamentNames(index, baseUrl) {
    const names = new Map();
    for (const chunk of index.split("○").slice(1)) {
      for (const a of chunk.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        if (normalize(plain(a[2])) !== "結果") continue;
        if (!/\.html?$/i.test(a[1])) continue;
        const name = normalize(plain(chunk.slice(0, chunk.indexOf("<a"))))
          // 「7/4～7/26」のような開催期間は大会名ではない
          .replace(/\d{1,2}\/\d{1,2}.*$/, "")
          .replace(/\s+/g, "")
          .trim();
        try {
          names.set(new URL(a[1], baseUrl).toString(), name || null);
        } catch {
          /* リンクが壊れているだけ。大会名が付かないだけで試合は取れる */
        }
      }
    }
    return names;
  },
  async collect({ fetchHtml, season, url, year }) {
    if (!this.indexCache.has(url)) this.indexCache.set(url, await fetchHtml(url));
    const index = this.indexCache.get(url);
    if (!index) return [];

    /*
      「結果」と書かれた同一サイトのHTMLリンク。PDF（組合せ）は除く。
      **関東大会や1年生大会のリンクも混ざる**が、開いたページのタイトルで
      弾けるので、ここでは絞り込まない。
    */
    const pages = dailyLinks(index, url, {
      hrefPattern: /\.html?$/i,
      labelPattern: /^結果$/,
    });
    const names = this.tournamentNames(index, url);

    const games = [];
    for (const page of pages.slice(0, MAX_DAILY_PAGES)) {
      const html = await fetchHtml(page.url);
      if (!html) continue;

      /*
        ★**タイトルが「R<令和><春夏秋>大会」の形でなければ読まない。**
        関東大会（`R８春季関東大会`）や1年生大会をここで落とす。
        年も季節もこのタイトルだけで決まるので、**日付から推測しない。**
      */
      const title = normalize(plain(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? ""));
      const m = title.match(/R(\d+)(春|夏|秋)大会/);
      if (!m) continue;
      const pageYear = 2018 + Number(m[1]);
      if (this.SEASON_OF[m[2]] !== season || pageYear !== year) continue;
      const tournament = names.get(page.url) ?? null;

      let date = null;
      let round = null;
      let venue = null;
      let cursor = 0;
      for (const t of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
        /*
          表の直前のテキストに、日付・回戦・球場がこの順で書いてある。
          **前の試合の投手・捕手の行も混ざる**が、日付や回戦の形には一致しない。
          1日に複数試合ある日は2試合目以降に日付も回戦も無いので、
          **見つかったときだけ更新して持ち越す。**
        */
        const before = normalize(plain(html.slice(cursor, t.index)));
        cursor = t.index + t[0].length;
        const d = before.match(/(\d{1,2})月(\d{1,2})日/);
        if (d) {
          date = `${pageYear}-${d[1].padStart(2, "0")}-${d[2].padStart(2, "0")}`;
          // 日付が変わったら回戦も球場も引き継がない
          round = null;
          venue = null;
        }
        round = pickRound(before) ?? round;
        venue = pickVenue(before) ?? venue;
        if (!date) continue;

        const rows = tableRows(t[0]);
        if (rows.length < 3) continue;
        // 見出しの行は「チーム 1 2 … 計」
        if (!/チーム/.test(rows[0][0] ?? "")) continue;
        const [homeRow, awayRow] = rows.slice(1, 3);
        const home = homeRow[0];
        const away = awayRow[0];
        if (!home || !away) continue;
        const a = inningTotal(homeRow);
        const b = inningTotal(awayRow);
        if (a === null || b === null) continue;

        games.push({
          date,
          season,
          tournament,
          round,
          venue,
          // 勝者の印が無いので点数から決める
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
 * 佐賀県高等学校野球連盟（`kouyaren-saga.jp`）。
 *
 * **規約に転載の制限は無い**（2026-08-14 にトップ・記事を確認）。
 *
 * WordPress。1日ぶんが1つの記事で、記事の中に試合が並ぶ。
 *
 *   <div class="date">2026年 7月 14日 火曜日 @ PM 09:42</div>   ← **年が入っている**
 *   <p>【三回戦】さがみどりの森球場①</p>
 *   <table class="score"> …イニング表… </table>
 *   <p>（試合終了）<br />佐賀商：東條、溝口－立花…</p>          ← 投手・捕手。**取らない**
 *
 * ★**季節は月で決める。** 春と秋の県大会は**どちらも「第N回九州地区高等学校野球
 * 佐賀大会」**で、名前では見分けが付かない（2026年4月が第158回、2025年9月が第157回）。
 * 月ごとの一覧（`?m=YYYYMM`）から辿るので、どの月から来たかで季節が決まる。
 *
 * ★**記事の一覧は10件で切れる。** WordPressの月別一覧は既定で1ページ10件。
 * 夏は15日ぶんあるので、`&paged=2` まで辿らないと**大会の前半が丸ごと落ちる。**
 */
const saga = {
  slug: "saga",
  district: "佐賀",
  name: "佐賀県高等学校野球連盟",
  siteUrl: "http://kouyaren-saga.jp/",
  /*
    季節ごとに見に行く月。**大会の開催月をこちらで決め打ちしている。**
    ずれても「その月に記事が無い」だけで、他の季節には影響しない。
  */
  seasons: { spring: "3,4,5", summer: "6,7", autumn: "8,9,10" },
  archiveCache: new Map(),
  async collect({ fetchHtml, season, url, year }) {
    const site = this.siteUrl;
    /** その月の記事一覧（ページングを辿る） */
    const monthPosts = async (ym) => {
      if (this.archiveCache.has(ym)) return this.archiveCache.get(ym);
      const posts = [];
      for (let page = 1; page <= 3; page++) {
        const archive = await fetchHtml(`${site}?m=${ym}${page > 1 ? `&paged=${page}` : ""}`);
        if (!archive) break;
        /*
          記事は結果だけではない（組合せ決定・大会情報・御礼）。
          **タイトルに「日付」か「大会◯日目」が入っているものだけ**を結果とみなす。
          全部開いてから中身で判断すると、月ごとに何十リクエストにもなる。
        */
        const found = dailyLinks(archive, site, { hrefPattern: /\?p=\d+$/ }).filter(
          (p) => /第\d+回/.test(p.label) && /\d{1,2}[/／]\d{1,2}|大会[^\s]*日/.test(p.label),
        );
        const fresh = found.filter((f) => !posts.some((p) => p.url === f.url));
        if (!fresh.length) break;
        posts.push(...fresh);
      }
      this.archiveCache.set(ym, posts);
      return posts;
    };

    const games = [];
    for (const month of url.split(",")) {
      const posts = await monthPosts(`${year}${month.padStart(2, "0")}`);
      for (const post of posts.slice(0, MAX_DAILY_PAGES)) {
        const html = await fetchHtml(post.url);
        if (!html) continue;

        /*
          日付は記事の投稿日から。**タイトルの「（7/14…）」からは取らない** —
          書き方が大会ごとに違う（`(4/5)` / `（9/29）` / 前置き・後置き）。
          投稿日なら年も入っていて、形も一定。
        */
        const d = normalize(plain(/<div class="date">([\s\S]*?)<\/div>/i.exec(html)?.[1] ?? "")).match(
          /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/,
        );
        if (!d) continue;
        const isoDate = `${d[1]}-${d[2].padStart(2, "0")}-${d[3].padStart(2, "0")}`;

        /*
          「大会10日目(4/5) 第158回…佐賀大会」も「第108回…佐賀大会（7/14…）」も同じ形で取れる。
          ★**最短一致にすること。** 貪欲だと「…佐賀大会 大会8日目」の後ろの「大会」まで
          飲み込んで、大会名が「…佐賀大会 大会」になる。

          ★**県名の入った大会だけを残す。** この連盟は同じブログに
          **甲子園（第107回全国高等学校野球選手権大会）**や、他県で開かれる
          九州地区大会の結果も載せる。月で季節を決めているので、8月の甲子園が
          そのままだと「秋季大会」に混ざる（実際に2試合入っていた）。
          春の「佐賀県高等学校野球連盟杯」も県大会ではないのでここで落ちる。
        */
        const tournament = normalize(post.label).match(/第\d+回[^（(]*?大会/)?.[0] ?? null;
        if (!tournament?.includes(this.district)) continue;

        let cursor = 0;
        for (const t of html.matchAll(/<table[^>]*class="score"[\s\S]*?<\/table>/gi)) {
          const before = plain(html.slice(cursor, t.index));
          cursor = t.index + t[0].length;
          // 【三回戦】さがみどりの森球場①
          const head = before.match(/【[^】]*】[^【]*$/)?.[0] ?? before;

          const rows = tableRows(t[0]);
          if (rows.length < 3) continue;
          const [homeRow, awayRow] = rows.slice(1, 3);
          const home = homeRow[0];
          const away = awayRow[0];
          if (!home || !away) continue;
          const a = inningTotal(homeRow);
          const b = inningTotal(awayRow);
          if (a === null || b === null) continue;

          games.push({
            date: isoDate,
            season,
            tournament,
            round: pickRound(head),
            venue: pickVenue(head),
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
 * 奈良県高等学校野球連盟（`www1.kcn.ne.jp/~nhsbbf`）。
 *
 * **規約に転載の制限は無い**（2026-08-14 にトップ・結果ページを確認）。
 *
 * 大会ごとに1枚のHTML。開催中は `genzaisiai.html`、終わると
 * `kakonosiai.html`（過去の試合結果）から年ごとのページに移る。
 *
 *   <h3>第107回全国高等学校野球選手権奈良大会</h3>
 *   <b>7月28日 決勝　さとやくスタジアム</b>
 *   <table> 第1試合 |1|2|…|9|計 </table>
 *
 * ★**ページに年が書かれていない**（日付は「7月28日」まで）。年は次のどちらかで決める。
 * どちらも**計算で決まる**ので、日付から推測することはしない。
 *
 *   過去のページ  一覧のリンクの文字（「第107回（2025年)」）に年がある
 *   開催中のページ 大会名から。選手権は `年 = 1918 + 回`、
 *                  春秋は「令和N年度」から `年 = 2018 + N`
 *
 * ★**近畿大会のページを混ぜない。** 同じ一覧に「令和7年度（2025年)」として
 * 近畿地区大会（他県開催）のページも並んでいる。URLに `kinki` が入るので外す。
 */
const nara = {
  slug: "nara",
  district: "奈良",
  name: "奈良県高等学校野球連盟",
  siteUrl: "http://www1.kcn.ne.jp/~nhsbbf/",
  // 過去ページのURLに入る季節の語（`/and/2025natu.html` `/and/natu/nk24.html`）
  seasons: { spring: "haru", summer: "natu", autumn: "aki" },
  pageCache: new Map(),
  async collect({ fetchHtml, season, url, year }) {
    /*
      ★**HTMLコメントを落としてから読む。** このサイトは前の状態
      （`<!-- <h3>実施中の試合はありません</h3> -->`）をコメントにして残している。
      落とさないと**大会名としてそれを拾い**、開催中のページを丸ごと捨てる
      （実際に春夏が0試合になった）。
    */
    const get = async (u) => {
      if (!this.pageCache.has(u)) {
        const html = await fetchHtml(u);
        this.pageCache.set(u, html ? html.replace(/<!--[\s\S]*?-->/g, " ") : html);
      }
      return this.pageCache.get(u);
    };

    /** その年・その季節のページを1枚だけ選ぶ */
    const pageUrl = await (async () => {
      const archive = await get(`${this.siteUrl}kakonosiai.html`);
      if (archive) {
        const hit = dailyLinks(archive, this.siteUrl, { hrefPattern: /\.html?$/i }).find(
          (l) =>
            l.label.includes(`${year}年`) &&
            new RegExp(url, "i").test(l.url) &&
            !/kinki/i.test(l.url),
        );
        if (hit) return hit.url;
      }
      /*
        一覧に無ければ開催中のページ。**大会名から年と季節が確かめられるときだけ使う。**
        「第108回…選手権奈良大会」→ 1918+108=2026年の夏
        「令和8年度秋季…奈良県予選」→ 2018+8=2026年の秋
      */
      const current = await get(`${this.siteUrl}genzaisiai.html`);
      if (!current) return null;
      const names = [...current.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi)].map((m) =>
        normalize(plain(m[1])),
      );
      const ok = names.some((name) => {
        const sen = name.match(/第(\d+)回.*選手権/);
        const era = name.match(/令和(\d+)年度(春季|秋季)/);
        if (sen) return season === "summer" && 1918 + Number(sen[1]) === year;
        if (era) {
          return (
            2018 + Number(era[1]) === year &&
            ((era[2] === "春季" && season === "spring") || (era[2] === "秋季" && season === "autumn"))
          );
        }
        return false;
      });
      return ok ? `${this.siteUrl}genzaisiai.html` : null;
    })();
    if (!pageUrl) return [];

    const html = await get(pageUrl);
    if (!html) return [];
    const tournament =
      [...html.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi)]
        .map((m) => normalize(plain(m[1])))
        .find((t) => /大会|予選/.test(t)) ?? null;

    const games = [];
    let date = null;
    let round = null;
    let venue = null;
    let cursor = 0;
    for (const t of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
      /*
        表の直前の `<b>7月28日 決勝　さとやくスタジアム</b>`。
        日付が変わったら回戦と球場は引き継がない（1日に複数試合ある日は
        2試合目以降に見出しが無く、その日の見出しをそのまま使う）。
      */
      const before = normalize(plain(html.slice(cursor, t.index)));
      cursor = t.index + t[0].length;
      const d = before.match(/(\d{1,2})月(\d{1,2})日/);
      if (d) {
        date = `${year}-${d[1].padStart(2, "0")}-${d[2].padStart(2, "0")}`;
        round = null;
        venue = null;
      }
      round = pickRound(before) ?? round;
      venue = pickVenue(before) ?? venue;
      if (!date) continue;

      const rows = tableRows(t[0]);
      if (rows.length < 3) continue;
      const [homeRow, awayRow] = rows.slice(1, 3);
      // 1列目は「第1試合」などの見出しで、校名は2行目以降の先頭
      const home = homeRow[0];
      const away = awayRow[0];
      if (!home || !away) continue;
      const a = inningTotal(homeRow);
      const b = inningTotal(awayRow);
      if (a === null || b === null) continue;

      games.push({
        date,
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
    return games;
  },
};

/**
 * 愛媛県高等学校野球連盟（`ehimehbb.jp`）。**このリポジトリで最初のPDFの出典。**
 *
 * **規約に転載の制限は無い**（2026-08-14 にトップ・結果ページを確認）。
 *
 * 大会ごとのHTML（組合せ・試合結果）から、**球場ごと・日ごとのスコアPDF**へ。
 * リンクの文字が球場名、URLに月日が入っている（`Botchan0711score.pdf`）。
 *
 *   第108回全国高等学校野球選手権愛媛大会
 *   7 月 11 日 (土）
 *   坊っちゃんスタジアム   1回戦
 *   第１試合
 *   松山北 － 松山東
 *   チーム 1 2 … 15 計
 *   松 山 東  0 0 0 0 1 0 0 0 0   1
 *   松 山 北  2 1 0 0 1 0 0 0 ×   4
 *   松 山 東 ： 岩田－三瀬          ← 投手・捕手。**取らない**
 *
 * ★**PDFの文字は描画順に並んでいる。** 素直につなぐと表が壊れるので、
 * `scripts/lib/pdf-text.mjs` で**yで行にまとめ、xで並べ直して**から読む。
 *
 * ★**校名が2行に折り返すことがある**（「八 幡 浜 ・ 川 之 石」＋「連 合」）。
 * 数字を持たない行がスコア行の直前にあれば、校名の続きとして前に付ける。
 *
 * ★**新人大会は取らない。** 季節はURLのディレクトリ（haru/natsu/aki）で決める。
 * 「地区別新人大会」は県大会ではないので混ぜない（佐賀の連盟杯と同じ扱い）。
 */
const ehime = {
  slug: "ehime",
  district: "愛媛",
  name: "愛媛県高等学校野球連盟",
  siteUrl: "http://www.ehimehbb.jp/",
  // PDFを何十枚も取るので、1件ごとの間隔を長めにする
  politenessMs: 2000,
  seasons: { spring: "haru", summer: "natsu", autumn: "aki" },
  indexCache: new Map(),
  async collect({ fetchHtml, season, url, year }) {
    const top = this.indexCache.has("top")
      ? this.indexCache.get("top")
      : this.indexCache.set("top", await fetchHtml(this.siteUrl)).get("top");
    if (!top) return [];

    /*
      トップから「組合せ・試合結果」のリンクを拾う。**URLを組み立てない。**
      年は `/2026_R08/`、季節はその次のディレクトリ（haru/natsu/aki）で決まる。
    */
    const pages = dailyLinks(top, this.siteUrl, {
      hrefPattern: new RegExp(`/taikai/kousiki/${year}_R\\d+/${url}/`),
    });

    const games = [];
    for (const page of pages) {
      const index = await fetchHtml(page.url);
      if (!index) continue;
      // 球場ごと・日ごとのスコアPDF（組合せ表のPDFは除く）
      const pdfs = dailyLinks(index, page.url, { hrefPattern: /score\w*\.pdf$/i });

      for (const pdf of pdfs.slice(0, MAX_PDF_PAGES)) {
        const parsed = await fetchPdfPages(pdf.url, { headers: UA });
        await sleep(this.politenessMs);
        if (!parsed) continue;

        for (const { lines } of parsed) {
          const flat = lines.map((l) => ({ ...l, plain: l.text.replace(/\t/g, "") }));
          /*
            ★**大会名を正規化してから使う。** 出典のPDFは同じ大会を
            「第79回」「第7９回」「第７９回」と全角半角を混ぜて書いており、
            そのままだと1つの大会が3つに割れる（検算も勝ち上がりも狂う）。

            ★**県名の入った大会だけ残す。** 同じディレクトリに
            **四国地区大会（他県開催）や甲子園**のスコアPDFも置いてある。
            残さないと、高知商や花巻東が「愛媛の地方大会」に出てくる（実際に出た）。
          */
          const tournament = normalize(flat.find((l) => /大会/.test(l.plain))?.plain ?? "") || null;
          if (!tournament?.includes(this.district)) continue;
          const d = flat.map((l) => l.plain).join(" ").match(/(\d{1,2})月(\d{1,2})日/);
          if (!d) continue;
          const date = `${year}-${d[1].padStart(2, "0")}-${d[2].padStart(2, "0")}`;
          const headLine = flat.find((l) => /球場|スタジアム/.test(l.plain));
          const venue = pickVenue(headLine?.plain ?? "");
          const pageRound = pickRound(headLine?.plain ?? "");

          /** 直前の「数字を持たない行」。折り返した校名の前半 */
          let carry = null;
          let pending = null;
          for (const line of flat) {
            const cells = line.text.split("\t").map((c) => c.trim()).filter(Boolean);
            const isHeader = /チーム/.test(line.plain) && /計/.test(line.plain);
            if (isHeader) {
              pending = [];
              carry = null;
              continue;
            }
            if (!pending) continue;
            // 投手・捕手の行（「：」を含む）で1試合の終わり
            if (/[：:]/.test(line.plain)) {
              pending = null;
              continue;
            }

            // 校名（数字が出るまで）とスコア（そこから後ろ）に割る
            const firstNumber = cells.findIndex((c) => /^[0-9]+[×xX]?$/.test(normalize(c)));
            if (firstNumber <= 0) {
              // 数字が無い行は、折り返した校名の前半として覚えておく
              if (cells.length) carry = cells.join("");
              continue;
            }
            const name = (carry ?? "") + cells.slice(0, firstNumber).join("");
            carry = null;
            const score = inningTotal(["", ...cells.slice(firstNumber).map(normalize)]);
            if (!name || score === null) continue;
            pending.push({ name, score });

            if (pending.length === 2) {
              const [a, b] = pending;
              pending = null;
              games.push({
                date,
                season,
                tournament,
                round: pageRound,
                venue,
                teams: [
                  { display: a.name, score: a.score, won: a.score > b.score },
                  { display: b.name, score: b.score, won: b.score > a.score },
                ],
              });
            }
          }
        }
      }
    }
    return games;
  },
};

/**
 * 新潟県高等学校野球連盟（`niigata-hbf.jp`）。**このリポジトリで最初のExcelの出典。**
 *
 * **規約に転載の制限は無い**（2026-08-14 にトップ・結果ページを確認）。
 *
 * 大会ごとに「全試合データ」のExcelが1つ。**1大会が1ファイルで手に入る**ので、
 * 取得は1回の実行で3ファイルだけ。回戦ごとにシートが分かれている。
 *
 *   シート「1~2回戦」
 *     大会　第 | 1 | 日目 | | 令和 | 7 | 年 | 7 | 月 | 9 | 日 | （ | 水 | ）
 *     第１試合 |   | ハードオフ |  |  | １回戦
 *     校　名 | 1 | 2 | … | 9
 *     新潟青陵 | 0 | 0 | 0 | …          ← **合計欄が無い。イニングを足す**
 *     加茂暁星 | 0 | 0 | 4 | … | ×
 *     校　名 | バッテリー | …            ← 投手・捕手。**取らない**
 *
 * ★**合計欄が無いので、イニングを足して点数にする。** 「×」は打っていない印。
 *
 * ★**年はファイルの中の「令和N年」から取る。** ファイル名の回数（154haru）は
 * 春と秋で増え方が違う（154春→155秋）ので、**回数から年を割り出さない。**
 *
 * ★**甲子園のシートが入っている。** 夏のファイルには県代表の甲子園の試合が
 * 別シートで入っているので外す（佐賀・愛媛と同じ落とし穴）。
 */
const niigata = {
  slug: "niigata",
  district: "新潟",
  name: "新潟県高等学校野球連盟",
  siteUrl: "https://niigata-hbf.jp/",
  seasons: { spring: "haru", summer: "natu", autumn: "aki" },
  pageCache: new Map(),
  /**
   * 県大会ではないシート。
   * ★**「本大会」を忘れないこと。** 春のファイルには北信越本大会のシートが
   * 入っており、外さないと**星稜・敦賀気比・佐久長聖が「新潟の地方大会」に出てくる。**
   */
  SKIP_SHEETS: /甲子園|神宮|選抜|北信越|本大会/,
  async collect({ fetchHtml, season, url, year }) {
    const get = async (u) => {
      if (!this.pageCache.has(u)) this.pageCache.set(u, await fetchHtml(u));
      return this.pageCache.get(u);
    };
    // 今年度の一覧が先。過去の一覧は年が変わったあとの受け皿
    const current = await get(`${this.siteUrl}tournamentlist/`);
    const archive = await get(`${this.siteUrl}koushikikako2/`);

    /*
      大会名は今年度の一覧の見出しから取る（Excelの中には入っていない）。

        -春季大会- 第154回北信越地区高等学校野球新潟県大会（令和８年度春季）
        -夏季大会- 第108回全国高等学校野球選手権新潟大会

      ★**回数から名前を組み立てない。** 春と秋で増え方が違ううえ、
      正式名称は連盟の書き方に合わせる必要がある。
    */
    const marker = { spring: "-春季大会-", summer: "-夏季大会-", autumn: "-秋季大会-" }[season];
    const tournament =
      normalize(plain(current ?? ""))
        .split(marker)[1]
        ?.match(/^\s*(第[^【]*?大会(?:（[^）]*）)?)/)?.[1]
        ?.trim() ?? null;

    /** 「全試合データ」「試合結果」のExcel。新しい順に並べる */
    const links = [current, archive]
      .filter(Boolean)
      .flatMap((html, i) =>
        dailyLinks(html, i === 0 ? `${this.siteUrl}tournamentlist/` : `${this.siteUrl}koushikikako2/`, {
          hrefPattern: /\.xlsx$/i,
        }),
      )
      .filter((l) => new RegExp(`\\d+${url}`, "i").test(l.url));

    const games = [];
    /*
      **年が合うファイルを1つだけ読む。** 一覧には過去10年ぶんが並んでいるので、
      全部開くと1回の実行で何十ファイルにもなる。新しい順に見て、
      中の日付が指定の年ならそれを使い、違えば次を見る（3つまで）。
    */
    for (const link of links.slice(0, 3)) {
      const sheets = await fetchXlsxSheets(link.url, { headers: UA });
      await sleep(this.politenessMs ?? 1500);
      if (!sheets) continue;

      const found = [];
      let fileYear = null;
      for (const sheet of sheets) {
        if (this.SKIP_SHEETS.test(sheet.name)) continue;
        let date = null;
        /** 直前の「第N試合 ｜ 球場 ｜ 回戦」の行。**列の位置ごとに違う試合が入る** */
        let gameRow = [];
        for (let i = 0; i < sheet.rows.length; i++) {
          const cells = sheet.rows[i].map((c) => normalize(c));
          const line = cells.join("");

          const d = line.match(/令和(\d+)年(\d{1,2})月(\d{1,2})日/);
          if (d) {
            const y = 2018 + Number(d[1]);
            fileYear ??= y;
            date = `${y}-${d[2].padStart(2, "0")}-${d[3].padStart(2, "0")}`;
            continue;
          }
          if (cells.some((c) => /^第\d+試合$/.test(c))) {
            gameRow = cells;
            continue;
          }

          /*
            ★**1つの行に試合が横に2つ並ぶ。**（左が第1試合、右が第2試合。
            右のブロックは21列目から始まる）。左だけ読むと**試合がちょうど半分**しか
            取れない（実際に34試合になり、準々決勝2・準決勝1で検算に引っかかった）。
            **見出し行にある「校名」の列を全部拾って、それぞれをブロックとして読む。**

            イニング表の見出しは「校　名 | 1 | 2 | …」。
            **投手・捕手の表も見出しが「校　名」**なので、次の列が "1" かで見分ける。
          */
          const heads = cells.flatMap((c, idx) =>
            /^校名$/.test(c.replace(/\s/g, "")) && cells[idx + 1] === "1" ? [idx] : [],
          );
          if (!heads.length) continue;

          const rowA = (sheet.rows[i + 1] ?? []).map((c) => normalize(c));
          const rowB = (sheet.rows[i + 2] ?? []).map((c) => normalize(c));
          heads.forEach((start, k) => {
            const end = heads[k + 1] ?? Math.max(cells.length, rowA.length, rowB.length);
            // 「計」の列。**無ければイニングを足す**（年によって計の欄が無いファイルがある）
            const totalAt = cells.slice(start, end).indexOf("計");
            const scoreOf = (row) => {
              const total = totalAt >= 0 ? row[start + totalAt] : "";
              if (/^\d+$/.test(total ?? "")) return Number(total);
              return row
                .slice(start + 1, end)
                .reduce((sum, c) => (/^\d+$/.test(c) ? sum + Number(c) : sum), 0);
            };
            const nameA = rowA[start] ?? "";
            const nameB = rowB[start] ?? "";
            if (!nameA || !nameB || !date) return;

            // 球場と回戦も同じ列の範囲から取る（右の試合は球場が違うことがある）
            const head = gameRow.slice(start, end);
            const scoreA = scoreOf(rowA);
            const scoreB = scoreOf(rowB);
            found.push({
              date,
              season,
              tournament,
              round: pickRound(head.join(" ")),
              venue: head.find((c) => c && !/^第\d+試合$/.test(c) && !/回戦|決勝/.test(c)) ?? null,
              teams: [
                { display: nameA, score: scoreA, won: scoreA > scoreB },
                { display: nameB, score: scoreB, won: scoreB > scoreA },
              ],
            });
          });
          i += 2;
        }
      }
      if (fileYear === year) {
        games.push(...found);
        break;
      }
    }
    return games;
  },
};

/**
 * CATVase.jp（`catvase.jp`）── **愛知。連盟でも個人サイトでもない3つ目の型。**
 *
 * 運営は**愛知県ケーブルテレビ協議会**（県内のケーブルテレビ局14社）。
 * 選手権愛知大会の「応援Webサイト」で、テレビ放送と対になっている。
 * **愛知県高野連の公式サイトではない**ので、
 * ★**出典表示は「CATVase.jp（愛知県ケーブルテレビ協議会）」にすること。**
 * 連盟の名前で出さない（神奈川・埼玉の個人サイトと同じ扱い）。
 *
 * **愛知県高野連の結果はトーナメント表のPDFしか無い**（READMEの「PDFの13県」）。
 * 組み立ては3方式とも失敗しているので、愛知はこのサイトからでなければ出せない。
 *
 * **規約を確認した（2026-08-14）。** トップ・運営について・robots.txt を見て、
 * **転載・複製・営利目的・自動取得のいずれも制限が無い。**
 * 「営業を目的として…おやめください」とあるのは**応援メッセージの投稿**の
 * 注意事項で、サイトの内容の利用についての記載ではない。
 * robots.txt は `/wp/wp-admin/` を除いて全許可。
 *
 * ★**1回の実行でリクエストは1つだけ。** 全179試合が `/game/` の1枚に入っている。
 * これまでで**いちばん出典に優しい形**（神奈川・埼玉は日別ページを数十枚取る）。
 *
 *   <div class="day_wrap">
 *     <p class="game_day"><span>7</span>月<span>28</span>日 (火)</p>
 *     <ul class="game_list">
 *       <li><a href="https://catvase.jp/game-91279/">
 *         <p class="time_pc">11:30</p>
 *         <div class="school_wrap">
 *           <p class="school school_a">愛工大名電</p>
 *           <div class="point_wrap">
 *             <p class="status">終了</p>
 *             <div class="point_inner">
 *               <p class="point point_a">1</p><p class="vs">-</p><p class="point point_b">4</p>
 *
 * ★**このサイトは夏（選手権）だけ。** 春季・秋季大会は扱っていないので
 * `seasons` に summer しか置かない。愛知の春秋は当面出せない。
 */
const aichi = {
  slug: "aichi",
  district: "愛知",
  // ★**連盟の名前で出さないこと**（このサイトは高野連の公式ではない）
  name: "CATVase.jp（愛知県ケーブルテレビ協議会）",
  siteUrl: "https://catvase.jp/",
  politenessMs: 2000,
  // **夏だけ。** このサイトは選手権愛知大会の応援サイトで、春秋の大会は扱っていない
  seasons: { summer: "https://catvase.jp/game/" },
  /*
    ★**`year` を受け取らない。** 他の県は「その年のページ」を開きに行くが、
    このサイトは**大会が変わるとページごと作り替わる**（URLは `/game/` のまま）。
    年はページの大会名から出すので、外から渡された年は使わない。
  */
  async collect({ fetchHtml, season, url }) {
    const html = await fetchHtml(url);
    if (!html) return [];

    /*
      大会名は本文から拾う。**`<title>` を信用しない**という既知の落とし穴
      （山梨・神奈川は前年のまま更新されていなかった）があるので、
      ここでも「第N回…愛知大会」の形で本文ごと拾い、**回数から年を出す。**
      選手権の回数は `年 - 1918`（`build-live-results.mjs` と同じ）。
    */
    const tournament = normalize(html).match(/第\d+回全国高等学校野球選手権愛知大会/)?.[0] ?? null;
    const round108 = Number(tournament?.match(/第(\d+)回/)?.[1]);
    if (!Number.isFinite(round108)) {
      console.log("  ⚠️ 愛知: 大会名が読めない。出典の作りが変わった可能性がある");
      return [];
    }
    const pageYear = round108 + 1918;

    /*
      ★**ページに西暦が書かれていない。** 日付は「7月28日 (火)」で年が無く、
      年は大会の回数から出すしかない。**回数が前年のまま更新されていない
      サイトがある**（山梨・神奈川で実際にあった）ので、**そのまま信じない。**

      幸いこのサイトは**曜日を併記している。** 「7月28日(火)」が成り立つ年は
      6〜7年に1度しか来ないので、**曜日で年の検算ができる。**
      合わなければ**1試合も出さない**（画面に嘘の日付を出すよりよい）。
    */
    const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

    const games = [];
    /** 直前に出てきた日付の見出し。試合はその日のものとして読む */
    let date = null;
    /*
      日付の見出しと試合を**出てきた順に**見る（山梨・熊本と同じやり方）。
      `day_wrap` の入れ子を数えずに済むので、レイアウトの変更に強い。
    */
    const token =
      /<p class="game_day">([\s\S]*?)<\/p>|<a href="https:\/\/catvase\.jp\/game-\d+\/">([\s\S]*?)<\/a>/gi;
    for (const m of html.matchAll(token)) {
      if (m[1] !== undefined) {
        const d = normalize(plain(m[1])).match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*[(（]([日月火水木金土])/);
        date = null;
        if (!d) continue;
        const iso = `${pageYear}-${d[1].padStart(2, "0")}-${d[2].padStart(2, "0")}`;
        // ★ 曜日で年を検算する。合わなければその日は**まるごと捨てる**
        if (WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()] !== d[3]) {
          console.log(
            `  ⚠️ 愛知: ${iso} の曜日が出典（${d[3]}）と合わない。` +
              `大会名「${tournament}」から出した年が違う可能性がある`,
          );
          continue;
        }
        date = iso;
        continue;
      }

      if (!date) continue;
      const block = m[2];
      const pick = (re) => normalize(plain(re.exec(block)?.[1] ?? ""));
      const home = pick(/<p class="school school_a">([\s\S]*?)<\/p>/);
      const away = pick(/<p class="school school_b">([\s\S]*?)<\/p>/);
      const sa = pick(/<p class="point point_a">([\s\S]*?)<\/p>/);
      const sb = pick(/<p class="point point_b">([\s\S]*?)<\/p>/);
      /*
        ★**まだ行われていない試合と順延の試合は点が空。**
        `Number("")` は **0** なので `Number.isFinite` では弾けない
        （両校0点の引き分けとして入ってしまう）。**数字かどうかで見る。**
      */
      if (!home || !away || !/^\d+$/.test(sa) || !/^\d+$/.test(sb)) continue;

      /*
        回戦は「A 1回戦」「B 3回戦」のようにブロック記号が前に付く。
        ★**ブロックを大会名に足さないこと。** 徳島の新人ブロック大会は
        ブロックごとに別の大会（決勝がブロックの数だけある）だが、
        愛知のA〜Hは**1つの大会の中の山**で、準々決勝で合流する。
        分けると準々決勝以降が宙に浮き、検算も通らなくなる。
      */
      const label = pick(/<p class="block">([\s\S]*?)<\/p>/);
      const a = Number(sa);
      const b = Number(sb);
      games.push({
        date,
        season,
        tournament,
        round: pickRound(label),
        // 球場は `display_pc` のほう（`display_sp` は「ドーム」のような略記）
        venue: pick(/<span class="display_pc">([\s\S]*?)<\/span>/) || null,
        // 勝者の印が無いので点数から決める（神奈川・埼玉と同じ）
        teams: [
          { display: home, score: a, won: a > b },
          { display: away, score: b, won: b > a },
        ],
      });
    }

    /*
      ★**中断した試合は2回載る。**

      雷雨などで途中打ち切りになった試合は、その日のぶんが `試合打ち切り`
      （中断時の点数）として残ったまま、後日ぶんが `A 1回戦（継続試合）`
      として別の日に載る。**日付が違うので、呼び出し側の重複除去では落ちない。**

        7月11日  刈谷工科  9 - 0  小坂井   A 1回戦（試合打ち切り）
        7月14日  刈谷工科 10 - 0  小坂井   A 1回戦（継続試合）   ← こちらが最終結果

      そのままだと**1回戦が1試合多くなり、刈谷工科が2勝・小坂井が2敗**になる。
      勝ち抜き戦なので**同じ2校が同じ大会で2度当たることはない**から、
      **同じ組み合わせは新しい日付のほうだけ残す。**
    */
    const byPair = new Map();
    for (const g of games) {
      const key = g.teams
        .map((t) => normalizeSchoolName(t.display))
        .sort()
        .join("\t");
      const kept = byPair.get(key);
      if (!kept || g.date > kept.date) byPair.set(key, g);
    }
    if (byPair.size !== games.length) {
      console.log(`  （中断・再開で二重に載っている ${games.length - byPair.size} 試合をまとめた）`);
    }
    return [...byPair.values()];
  },
};

/**
 * 京都府高等学校野球連盟（`kyoto-hsbf.sakura.ne.jp`）。
 * ★**このリポジトリで唯一、トーナメント表（組合せ表）を出典にしている県。**
 *
 * **規約に転載の制限は無い**（2026-08-14 にトップ・大会ページを確認）。
 * 「営利目的とする撮影は禁止」とあるのは**球場内での撮影**の話で、
 * サイトの内容の利用についての記載ではない。
 *
 * ★**PDFは Google Drive に置かれている。**（大会ページに preview で埋め込み）
 * **IDを直書きしないこと。** 大会が変わればIDも変わる。
 * 大会ページのHTMLから `drive.google.com/file/d/<ID>/` を拾って辿る。
 * 出典はあくまで京都府高野連で、Drive は置き場所にすぎない。
 *
 * ------------------------------------------------------------------
 * ★ トーナメント表を出典にしないという決定を、なぜここだけ覆したか
 *
 *   富山・石川では3方式とも誤った対戦を作った（石川は検算を通ってなお
 *   決勝の相手が違った）。**京都の表は石川に無かった手掛かりを2つ持つ。**
 *
 *   1. **1回戦のスコアがスロットの中心に置かれる。** 71校中どの14校が
 *      1回戦を戦うかが推測なしで決まる。**石川で解けなかったのは
 *      「シード（不戦）と対戦の区別」**で、まさにここ
 *   2. **各回戦の数字の個数が試合数のちょうど2倍。** 左から順に対応させられ、
 *      「どのスコアがどの枝か」を座標から推測せずに済む
 *
 *   組み立ての中身は `scripts/lib/slot-bracket.mjs`。**扱える表の条件も
 *   そこに書いてある。富山・石川はいまも条件を満たさない。**
 *
 * ------------------------------------------------------------------
 * ★ 検算（合わなければ**1試合も出さない**）
 *
 *   石川の教訓は「**検算を通ってもなお間違える**」だった。そこで、
 *   **表の別の場所に書いてある事実**と突き合わせる検査を4つ置いている。
 *
 *   | 検査 | 出所 |
 *   |---|---|
 *   | 合計試合数 | 表の日程欄の「合計」 |
 *   | 優勝校 | 表に印字された「優勝 ○○高等学校」 |
 *   | 日ごとの試合数 | 表の左上の日程欄（枝とは別に作られている） |
 *   | 球場ごとの試合数 | 同上 |
 *
 *   2026年（第108回）で4つとも一致し、さらに**全70試合を外部の情報源と
 *   突き合わせて70/70で一致**した。★**来年レイアウトが変わればこの検査で
 *   落ちて0件になる。** 誤った試合が画面に出るより、出ないほうがよい。
 *
 * ★**夏（選手権）だけ。** 春季のPDFは「2次戦16校＋1次戦58校をA〜Lの
 * ブロックに分けた2ページ構成」で、スロット格子ではないので組めない。
 */
const kyoto = {
  slug: "kyoto",
  district: "京都",
  name: "京都府高等学校野球連盟",
  siteUrl: "https://kyoto-hsbf.sakura.ne.jp/khsbf/",
  politenessMs: 2000,
  // **夏だけ。** 春季は表の形が違い、秋季はまだ出ていない
  seasons: { summer: "https://kyoto-hsbf.sakura.ne.jp/khsbf/tournament/" },
  /** 表の凡例「わ・・わかさスタジアム京都」。1文字の記号 → 球場名 */
  venueLegend(page) {
    const map = new Map();
    for (const l of page.lines) {
      for (const m of l.text.matchAll(/([^\t\s])\s*[・･]{2}\s*([^\t]+?)(?=\t|$)/g)) {
        const name = m[2].trim();
        if (/球場|スタジアム|ドーム/.test(name)) map.set(m[1], name);
      }
    }
    return map;
  },
  async collect({ fetchHtml, season, url }) {
    const index = await fetchHtml(url);
    if (!index) return [];

    /*
      ★**IDを直書きせず、大会ページから拾う。** 同じページに春季・近畿大会の
      PDFも並んでいるので、**開いてみて「選手権京都大会」の表だったものだけ使う。**
    */
    const ids = [...new Set([...index.matchAll(/drive\.google\.com\/file\/d\/([\w-]{20,})/g)].map((m) => m[1]))];
    if (!ids.length) {
      console.log("  ⚠️ 京都: 大会ページにPDFのリンクが無い。出典の作りが変わった可能性がある");
      return [];
    }

    for (const id of ids.slice(0, 6)) {
      const parsed = await fetchPdfPages(`https://drive.google.com/uc?export=download&id=${id}`, {
        headers: UA,
      });
      await sleep(this.politenessMs);
      if (!parsed?.length) continue;

      for (const page of parsed) {
        const flat = page.lines.map((l) => normalize(l.text.replace(/\t/g, "")));
        const tournament = flat
          .map((t) => t.match(/第\d+回全国高等学校野球選手権京都大会/)?.[0])
          .find(Boolean);
        if (!tournament) continue;

        const round = Number(tournament.match(/第(\d+)回/)?.[1]);
        // 選手権の回数は 年 - 1918（`build-live-results.mjs` と同じ）
        const year = round + 1918;

        const venues = this.venueLegend(page);
        const built = assembleSlotBracket(page, {
          roundLabels: ["決勝", "準決勝", "準々決勝"],
          venueSymbols: new Set(venues.keys()),
        });
        if (!built) {
          console.log(`  ⚠️ 京都: ${tournament} の組合せ表を組み立てられなかった。1試合も出さない`);
          return [];
        }

        // ---- 検算1: 表の日程欄の「合計」 ----
        const totalRow = flat.find((t) => /^合計/.test(t.replace(/\s/g, "")));
        const printedTotal = Number(
          page.lines.find((l) => /合\t計/.test(l.text))?.text.match(/(\d+)\s*$/)?.[1] ?? NaN,
        );
        if (Number.isFinite(printedTotal) && built.games.length !== printedTotal) {
          console.log(
            `  ⚠️ 京都: 組み立て ${built.games.length} 試合 / 表の合計 ${printedTotal}。合わないので1試合も出さない`,
          );
          return [];
        }

        // ---- 検算2: 表に印字された優勝校 ----
        const printedChampion = flat.find((t) => /^優勝/.test(t))?.replace(/^優勝\s*/, "");
        if (printedChampion) {
          const bare = normalizeSchoolName(printedChampion.replace(/[（(].*$/, "").replace(/高等学校$/, ""));
          if (!bare.startsWith(normalizeSchoolName(built.champion ?? "")) && built.champion) {
            console.log(
              `  ⚠️ 京都: 組み立てた優勝校が表と合わない（表「${printedChampion}」/ 組み立て「${built.champion}」）。1試合も出さない`,
            );
            return [];
          }
        }

        /*
          ---- 検算3・4: 表の左上の日程欄 ----

          ★**これがいちばん強い検査。** 日程欄は枝とは別に作られた表で、
          「その日に、どの球場で何試合あるか」が書いてある。組み立てた試合を
          日ごと・球場ごとに数えて、ここと1つ残らず一致するかを見る。

            日 曜 回戦  わ 太 あ 計
             8 水  ②    2  2  2  6
            合計          35 18 17 70

          京都の第108回では**15日ぶんすべてと、球場3つすべて**が一致した。
        */
        const schedule = new Map();
        const venueTotals = new Map([...venues.keys()].map((k) => [k, 0]));
        const order = [...venues.keys()];
        for (const l of page.lines) {
          /*
            日程欄は**左右2つの組**が並んでいる（4〜17日と18〜27日）。
            1行から両方を拾う。数字だけの並びの先頭が日、続きが球場ごとの試合数。
          */
          for (const m of l.text.matchAll(/(?:^|\t)(\d{1,2})\t[土日月火水木金祝]+\t([^\t]*)\t([\d\t予]*?)(?=\t\d{1,2}\t[土日月火水木金祝]|$)/g)) {
            const day = Number(m[1]);
            const nums = m[3].split("\t").filter((t) => /^\d+$/.test(t)).map(Number);
            // 「わ 太 あ 計」。予備日・休養日は数字が無いか 0
            if (nums.length >= 2) schedule.set(`7/${day}`, nums);
          }
        }
        for (const g of built.games) if (g.venue) venueTotals.set(g.venue, (venueTotals.get(g.venue) ?? 0) + 1);

        let mismatch = null;
        for (const [d, n] of built.byDate) {
          const nums = schedule.get(d);
          if (!nums) continue; // 日程欄から読めなかった日は飛ばす（検査を厳しくしすぎない）
          const printed = nums.at(-1);
          if (printed !== n) mismatch ??= `${d} が ${n} 試合（日程欄は ${printed}）`;
        }
        const totalsRow = page.lines.find((l) => /合\t計/.test(l.text));
        if (totalsRow) {
          const nums = totalsRow.text.split("\t").filter((t) => /^\d+$/.test(t)).map(Number);
          // 末尾が「わ 太 あ 計」。並びは凡例の順
          const tail = nums.slice(-(order.length + 1), -1);
          if (tail.length === order.length) {
            order.forEach((sym, i) => {
              if (venueTotals.get(sym) !== tail[i]) {
                mismatch ??= `球場「${venues.get(sym)}」が ${venueTotals.get(sym)} 試合（日程欄は ${tail[i]}）`;
              }
            });
          }
        }
        if (mismatch) {
          console.log(`  ⚠️ 京都: 日程欄と合わない（${mismatch}）。1試合も出さない`);
          return [];
        }

        const games = built.games
          .filter((g) => g.date)
          .map((g) => {
            const [mm, dd] = g.date.split("/");
            const a = g.sa;
            const b = g.sb;
            return {
              date: `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`,
              season,
              tournament,
              round: g.round,
              venue: venues.get(g.venue) ?? null,
              teams: [
                { display: g.a, score: a, won: a > b },
                { display: g.b, score: b, won: b > a },
              ],
            };
          });
        if (games.length !== built.games.length) {
          console.log(
            `  ⚠️ 京都: 日付の読めない試合が ${built.games.length - games.length} 件。1試合も出さない`,
          );
          return [];
        }
        console.log(
          `  （${tournament}: ${games.length} 試合 / 優勝 ${built.champion} / ${built.teams} チーム）` +
            (totalRow ? "" : ""),
        );
        return games;
      }
    }
    return [];
  },
};

/**
 * 広島県高等学校野球連盟。★**2つ目のトーナメント表の出典**（京都に続く）。
 *
 * PDFは Google Drive に置かれている（京都と同じ）。**IDを直書きしない。**
 *
 * ------------------------------------------------------------------
 * ★ 京都と同じ「スロット格子型」だが、**向きと段組が違う**
 *
 *   京都 … スロットが横一列、回戦は上へ
 *   広島 … ★**出場校が縦に並び、左右2段組で中央へ向かって合流する**
 *          左（スロット1〜42、回戦は右へ）／右（43〜85、回戦は**左へ**）
 *
 *   中身の規則は同じなので、`orientPage()` で座標を入れ替えて
 *   **半分ずつ**組み立て、最後に中央の決勝でつなぐ。
 *
 * ------------------------------------------------------------------
 * ★ ここで踏んだ落とし穴（他の縦向きの表でも起きる）
 *
 *   - **スロット番号が2行に割れる**（桁数で位置が変わり「1〜9」と「10〜42」）
 *   - ★**コールドの回数がスコアと同じ列に来る。**
 *     `7/10(金) │ "12 8" │ 回` の 8 は**8回コールド**で、スコアは12。
 *     `stripInningMarks()` で落とさないと2回戦が32のところ38になる
 *   - ★**左右で数字の揃え方が逆。** 右半分は右揃えなので、
 *     **2桁のスコアだけ別の帯に落ちる**（1回戦が19個＝奇数になった）。
 *     `rowTolerance` を広げて吸収する
 *   - ★**帯をまとめる幅はスロット間隔ではなく回戦の間隔で決める。**
 *     左半分の決勝に**大会全体の決勝**が巻き込まれた
 *   - **日付の断片に括弧が付く**（`7/11(`）
 *
 * ------------------------------------------------------------------
 * ★ 検算（合わなければ**1試合も出さない**）
 *
 *   広島の表には**優勝校も合計試合数も日程欄も書かれていない**ので、
 *   京都のような「表の別の場所と突き合わせる」検算ができない。
 *   代わりに**構造の検算**を置く。どれも表の別々の場所から来る数字。
 *
 *     - スロット番号が 1〜N で**欠けなく**揃うか
 *     - **N チーム − 組み立てた試合数 = 1**（勝ち抜き戦の算数）
 *     - 表に書かれた**日付の個数**と組み立てた試合数が一致するか
 *
 *   ★**京都より検知力は落ちる**（優勝校で止められない）。
 *   2026年の第108回は**全84試合を外部の情報源と突き合わせて一致**を確認した。
 */
/**
 * ★**左右2段組のトーナメント表を1枚読む**（広島・三重で共通）。
 *
 * 出場校が縦に並び、左半分（回戦は右へ）と右半分（回戦は左へ）が
 * 中央で合流する形。**半分ずつ組み立てて、中央の決勝でつなぐ。**
 *
 * @returns 試合の配列 / `[]`（検算に落ちた。**その大会は1試合も出さない**）/
 *          null（この紙は目当ての大会ではない。呼ぶ側は次のPDFへ）
 */
function readTwoColumnBracket(raw, opts) {
  const {
    district, titlePattern, half, rowTolerance, nameOrder, season, hasDates, venueLegend,
    /*
      ★**決勝のスコアの置き場所は2通りある**（`finalAt`）。

        "middle"（広島・三重）… 左右の境目に**2つ並べて**書かれている
        "center"（鹿児島）    … **半分ごとの準決勝と同じ帯**に、中央をはさんで
                                 1つずつ向かい合って書かれている
        "innermost"（千葉）   … 中央の帯に**深い回戦のスコアが何段も並ぶ**ので、
                                 **境目をはさむ組のうちいちばん内側**を決勝とする

      後者は `assembleSlotBracket({ finalInCenter: true })` が
      `centerScore` として取り出すので、それを2つ合わせて決勝にする。
    */
    finalAt = "middle",
    /** 日付・球場が1つの断片になっている表のための読み手（鹿児島の `県12日9：00`） */
    parseLabel,
    /** 連合チームの略称 → 展開した校名。凡例が行で読めない表のため（鹿児島の `連合①`） */
    expand,
    /** 表の別の場所に書いてある優勝校と決勝のスコア。**合わなければ1試合も出さない** */
    verify,
    /** 校名の掃除（字間の空白など） */
    cleanName = (s) => s,
    /** 半分ごとの読み取り範囲。既定は境目で2つに割るだけ */
    ranges,
  } = opts;
  const flat = raw.lines.map((l) => normalize(l.text.replace(/\t/g, "")));
  const tournament = flat.map((t) => t.match(titlePattern)?.[0]).find(Boolean);
  if (!tournament) return null;
  // 選手権の回数は 年 - 1918（`build-live-results.mjs` と同じ）
  const year = Number(tournament.match(/第(\d+)回/)[1]) + 1918;

  const page = stripInningMarks(raw);
  const venues = venueLegend ? venueLegend(raw) : new Map();
  const symbols = new Set(venues.keys());
  /*
    ★**深いほうから固定で名前が付くぶんだけ渡す。**
    半分ずつ組むので、各半分のいちばん深い試合は**大会全体の準決勝**。
    それより浅い回戦は `slot-bracket.mjs` が「1回戦」「2回戦」…と付ける
    （大会の段数が県で違うので、一覧を決め打ちにすると回戦名がずれる）。
  */
  const LABELS = ["準決勝", "準々決勝"];
  const halves = [0, 1].map((i) =>
    assembleSlotBracket(
      orientPage(page, {
        slotAxis: "y",
        flip: i === 1,
        /*
          ★**校名の欄の外側を切り落とせるようにしてある**（`ranges`。千葉）。
          千葉はシード記号（Ａ・Ｂ・Ｃ）が**校名とは別の列**に並ぶ
          （左は x=31、右は x=561。校名は左 37〜78、右 513〜556 で、
          あいだに隙間がある）。この列を読み込むと校名にくっついてしまい、
          さらに**記号でない1文字が紛れていることがある**
          （右の x=560 に「宣」が1つあり、`千葉東` が `千葉東宣` になっていた）。
          **記号だけを消す作りにすると、そういう字を取りこぼす。列ごと外す。**
        */
        range: ranges?.[i] ?? (i === 0 ? [0, half] : [half, 1e6]),
        rowTolerance,
      }),
      {
        roundLabels: LABELS,
        venueSymbols: symbols,
        nameOrder: nameOrder[i],
        finalInCenter: finalAt === "center",
        parseLabel,
        expand,
      },
    ),
  );
  if (halves.some((h) => !h)) {
    console.log(`  ⚠️ ${district}: ${tournament} の組合せ表を組み立てられなかった。1試合も出さない`);
    return [];
  }

  /*
    ---- 決勝 ----
    左右の勝者の対戦。**中央（左右の境目）にだけ置かれている**ので、
    半分ずつの組み立てには入ってこない。
  */
  /*
    ★**鹿児島は半分ごとの組み立てが決勝の得点を1つずつ持って返る。**
    中央の帯を走査する必要が無い（走査するとシードのスロット番号を拾う）。
  */
  let finalPair = null;
  if (finalAt === "center") {
    const cs = halves.map((h) => h.centerScore);
    if (cs.some((c) => !c)) {
      console.log(`  ⚠️ ${district}: ${tournament} の決勝のスコアが中央に見つからない。1試合も出さない`);
      return [];
    }
    finalPair = {
      pair: cs.map((c) => c.v),
      // 日付・球場はどちらか片側にしか書かれていない（鹿児島は上半分だけ）
      date: cs.map((c) => c.date).find(Boolean) ?? null,
      venue: cs.map((c) => c.venue).find(Boolean) ?? null,
    };
  }

  const items = page.lines.flatMap((l) => l.items.map((i) => ({ x: i.x, y: l.y, t: i.text.trim() })));
  const mid = items.filter((i) => Math.abs(i.x - half) < half * 0.2);

  /*
    ★**中央に深い回戦のスコアが何段も並ぶ表がある**（`finalAt: "innermost"`。千葉）。

    左右それぞれの4回戦〜準決勝が、境目をはさんで対称に置かれるので、
    「境目をはさむ2つ」は**何組も**見つかる（千葉は14段）。
    **決勝はいちばん深い＝境目にいちばん近い組**なので、内側から選ぶ。

    ★**「境目にいちばん近い数字2つ」では駄目。** 千葉は中央に
    「優勝 拓殖大紅陵高等学校（24年振り6回目）」が縦書きで入っており、
    **その `2` `4` `6` が境目のほぼ真上に来る。**
    **同じ帯（y）で境目を左右にまたぐ組**に限れば、この文字列は候補にならない。
  */
  if (finalAt === "innermost") {
    const byRow = new Map();
    for (const i of mid) {
      if (!/^\d{1,2}$/.test(i.t)) continue;
      const k = [...byRow.keys()].find((v) => Math.abs(v - i.y) <= 1) ?? i.y;
      if (!byRow.has(k)) byRow.set(k, []);
      byRow.get(k).push(i);
    }
    let best = null;
    for (const row of byRow.values()) {
      const left = row.filter((i) => i.x < half).sort((a, b) => b.x - a.x)[0];
      const right = row.filter((i) => i.x > half).sort((a, b) => a.x - b.x)[0];
      if (!left || !right) continue;
      const span = right.x - left.x;
      if (!best || span < best.span) best = { left, right, span };
    }
    if (!best) {
      console.log(`  ⚠️ ${district}: ${tournament} の決勝が中央に見つからない。1試合も出さない`);
      return [];
    }
    finalPair = { pair: [Number(best.left.t), Number(best.right.t)], date: null, venue: null };
  }
  const nums = mid.filter((i) => /^\d{1,2}$/.test(i.t) || /^\d{1,2}\s+\d{1,2}$/.test(i.t));
  // 「3 4」のように2つが1断片に潰れていることがある（広島が実際そうだった）
  const glued = nums.find((i) => /^\d{1,2}\s+\d{1,2}$/.test(i.t));
  const anchor = glued ?? nums.filter((i) => /^\d{1,2}$/.test(i.t)).sort((a, b) => b.y - a.y)[0];
  if (!finalPair && !anchor) {
    console.log(`  ⚠️ ${district}: ${tournament} の決勝が読めなかった。1試合も出さない`);
    return [];
  }
  /*
    ★**日付と球場は「決勝のスコアにいちばん近いもの」を取る。**
    中央の帯には**準決勝2試合の日付・球場も入っている**ので、
    最初に見つかったものを使うと**準決勝の日付が決勝に付く**（実際に付いた）。
  */
  const nearest = (list) =>
    list.length ? list.reduce((p, c) => (Math.abs(c.x - anchor.x) < Math.abs(p.x - anchor.x) ? c : p)) : null;
  const finalDate =
    finalPair?.date ?? nearest(mid.filter((i) => /^\d{1,2}\/\d{1,2}[(（]?$/.test(i.t)))?.t.replace(/[(（]$/, "");
  const finalVenue = finalPair ? finalPair.venue : (nearest(mid.filter((i) => symbols.has(i.t)))?.t ?? null);
  const pair =
    finalPair?.pair ??
    (glued
      ? glued.t.split(/\s+/).map(Number)
      : nums.filter((i) => /^\d{1,2}$/.test(i.t)).sort((a, b) => b.y - a.y).slice(0, 2).map((i) => Number(i.t)));
  if (pair.length !== 2) {
    console.log(`  ⚠️ ${district}: ${tournament} の決勝のスコアが2つ読めなかった。1試合も出さない`);
    return [];
  }

  const [A, B] = halves.map((h) => cleanName(h.champion));
  const built = [
    ...halves.flatMap((h) => h.games).map((g) => ({ ...g, a: cleanName(g.a), b: cleanName(g.b) })),
    { round: "決勝", a: A, b: B, sa: pair[0], sb: pair[1], date: finalDate, venue: finalVenue },
  ];

  /*
    ---- 検算 ----
    ★**表に優勝校も合計試合数も日程欄も無い県がある**（広島・三重とも無い）。
    京都のような「表の別の場所と突き合わせる」検算ができないので、
    **構造の検算**で代える。どれも表の別々の場所から来る数字。
  */
  const teams = halves.reduce((s, h) => s + h.teams, 0);
  if (teams - built.length !== 1) {
    console.log(`  ⚠️ ${district}: ${teams} チームに対し ${built.length} 試合（${teams - 1} のはず）。1試合も出さない`);
    return [];
  }
  if (hasDates) {
    const printed = raw.lines
      .flatMap((l) => l.items)
      .filter((i) => {
        const t = i.text.trim();
        return parseLabel ? Boolean(parseLabel(t)?.date) : /^\d{1,2}\/\d{1,2}[(（]?$/.test(t);
      }).length;
    if (printed !== built.length) {
      console.log(`  ⚠️ ${district}: 表の日付が ${printed} 件、組み立てた試合が ${built.length} 件。1試合も出さない`);
      return [];
    }
    if (built.some((g) => !g.date)) {
      console.log(`  ⚠️ ${district}: 日付の読めない試合がある。1試合も出さない`);
      return [];
    }
  }
  /*
    ★**表の外に優勝校と決勝のスコアが書いてある出典がある**（鹿児島。2026-08-15）。

    連盟のトップページが「決勝戦 神村学園高等部 ９ ー ０ 鹿児島実業」と
    **文章で**書いている。組合せ表の枝から組み立てた結果と突き合わせれば、
    石川で通ってしまった「構造の検算は通るのに決勝の相手が違う」を止められる。
    **このリポジトリで京都に次いで強い検算。**
  */
  if (verify) {
    const champ = pair[0] > pair[1] ? A : B;
    const runner = pair[0] > pair[1] ? B : A;
    const score = [...pair].sort((x, y) => y - x);
    /*
      ★**校名は完全一致では比べられない。** 表は「神村学園」、文章は「神村学園高等部」。
      どちらかがもう一方を含んでいれば同じ学校とみなす。
      **勝敗と点数のほうは完全一致を要求する**（そこが緩むと検算にならない）。
    */
    const same = (a, b) => a.includes(b) || b.includes(a);
    /*
      ★**点数が書かれていない出典もある**（千葉は表の中央に優勝校と準優勝校の
      名前だけ縦書きされている）。**その場合は校名だけを突き合わせる。**
      点数があるなら完全一致を要求する。
    */
    const ok =
      same(verify.champion, champ) &&
      same(verify.runnerUp, runner) &&
      (!verify.score || (score[0] === verify.score[0] && score[1] === verify.score[1]));
    if (!ok) {
      const printed = verify.score ? ` ${verify.score[0]}-${verify.score[1]} ` : " / ";
      console.log(
        `  ⚠️ ${district}: 決勝が出典の記載と合わない` +
          `（記載「${verify.champion}${printed}${verify.runnerUp}」/ ` +
          `組み立て「${champ} ${score[0]}-${score[1]} ${runner}」）。1試合も出さない`,
      );
      return [];
    }
  }
  console.log(
    `  （${tournament}: ${built.length} 試合 / 優勝 ${pair[0] > pair[1] ? A : B} / ${teams} チーム` +
      (hasDates ? "" : "・**日付なし**") + "）",
  );

  return built.map((g) => {
    /*
      ★**日付が無ければ null のまま。推測で埋めない。**
      画面は回戦ごとに並べる（`groupGamesForDistrict`）。
    */
    let date = null;
    if (g.date) {
      const [mm, dd] = g.date.split("/");
      date = `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }
    return {
      date,
      season,
      tournament,
      round: g.round,
      venue: venues.get(g.venue) ?? null,
      teams: [
        { display: g.a, score: g.sa, won: g.sa > g.sb },
        { display: g.b, score: g.sb, won: g.sb > g.sa },
      ],
    };
  });
}

const hiroshima = {
  slug: "hiroshima",
  district: "広島",
  name: "広島県高等学校野球連盟",
  siteUrl: "https://hiroshima.hhbf1950.or.jp/",
  politenessMs: 2000,
  // **夏だけ。** 春季・秋季の表は形が違う可能性があるので確かめてから足すこと
  seasons: {
    summer:
      "https://hiroshima.hhbf1950.or.jp/%E5%A4%A7%E4%BC%9A%E9%96%A2%E9%80%A3/%E7%A1%AC%E5%BC%8F%E9%83%A8%E5%90%84%E7%A8%AE%E5%A4%A7%E4%BC%9A",
  },
  /** 凡例「呉 ： 鶴岡一人記念球場」。1文字の記号 → 球場名 */
  venueLegend(page) {
    const map = new Map();
    for (const l of page.lines) {
      for (const m of l.text.matchAll(/(?:^|\t)([^\t\s])\s*[：:]\s*([^\t]+?)(?=\t|$)/g)) {
        const name = m[2].trim();
        if (/球場|スタジアム|ドーム|パーク|Stadium/i.test(name)) map.set(m[1], name);
      }
    }
    return map;
  },
  async collect({ fetchHtml, season, url }) {
    const index = await fetchHtml(url);
    if (!index) return [];
    /*
      ★**このページにはPDFが22件ある**（地区予選の出場校一覧・パンフレットの案内・
      始球式の募集など）。全部開くと1回の実行で20回以上ダウンロードすることになる。
      **リンクの近くの文字が「組み合わせ表」のものだけに絞る。**
      「組み合わせ表（ベスト16）」は途中経過なので外す。
    */
    /*
      ★**リンクの名前は `aria-label` に入っている**（Google Sites）。
      前後の文字を窓で拾うと、**すぐ上にある「組み合わせ表（ベスト16）」を
      巻き込んで目当ての表が落ちる**（実際に落ちて0件になった）。
    */
    const ids = [];
    for (const m of index.matchAll(
      /drive\.google\.com\/file\/d\/([\w-]{20,})\/view[^"]*"[^>]*aria-label="([^"]*)"/g,
    )) {
      if (!/組\s*み?\s*合\s*わ?\s*せ\s*表/.test(m[2]) || /ベスト/.test(m[2])) continue;
      if (!ids.includes(m[1])) ids.push(m[1]);
    }
    if (!ids.length) {
      console.log("  ⚠️ 広島: 大会ページに組み合わせ表のPDFが見つからない。出典の作りが変わった可能性がある");
      return [];
    }
    for (const id of ids.slice(0, 6)) {
      const parsed = await fetchPdfPages(`https://drive.google.com/uc?export=download&id=${id}`, { headers: UA });
      await sleep(this.politenessMs);
      if (!parsed?.length) continue;
      for (const raw of parsed) {
        const games = this.readSheet(raw, season);
        if (games) return games;
      }
    }
    return [];
  },
  /** 1枚の組合せ表を読む。**組めなければ null**（呼び出し側は次のPDFへ） */
  readSheet(raw, season) {
    return readTwoColumnBracket(raw, {
      district: "広島",
      titlePattern: /第\d+回全国高等学校野球選手権広島大会/,
      /*
        左右で分ける境目。**中央の決勝はどちらにも入れない。**
        スロット列の x（左408／右2449）のちょうど中間あたりで切る。
      */
      half: 1400,
      /*
        ★**入れ替えたあとは行の許容幅を広げる。** 右半分は数字が右揃えで、
        2桁のスコアだけ約29ポイント別の帯に落ちる。回戦の間隔（約141）より十分小さく。
      */
      rowTolerance: 40,
      // ★広島の校名は横書きで折り返すので、京都（縦書き）と読む順が逆
      nameOrder: ["asc", "asc"],
      season,
      hasDates: true,
      venueLegend: (page) => this.venueLegend(page),
    });
  },
};

/**
 * 三重県高等学校野球連盟（`mie-kouyaren.com`）。
 * ★**日付を持たない出典**（このリポジトリで最初）。
 *
 * **規約に転載の制限は無い**（2026-08-14 に確認）。
 *
 * ------------------------------------------------------------------
 * ★ 日付が1つも書かれていない
 *
 *   組合せ表に**日付・開始時刻・球場が一切無い**。優勝校も合計試合数も無い。
 *   ★**以前はこれを理由に見送っていたが、「回戦が分かれば載せる」方針に変えた**
 *   （2026-08-14）。日付は **null のまま持ち、推測で埋めない。**
 *   画面は回戦ごとに並べる（`groupGamesForDistrict`）。
 *
 *   ★**日付の無い試合はトップの抜粋と勝ち上がりに出さない。**
 *   どちらも「新しい順」で選ぶので、順番を決められない試合を混ぜられない。
 *   県のページ（`/prefectures/mie`）にだけ出る。
 *
 * ------------------------------------------------------------------
 * ★ 検算が2つしかない（このリポジトリでいちばん弱い）
 *
 *   表に優勝校も合計も日程欄も無いので、**構造の検算だけ**になる。
 *
 *     - スロット番号が 1〜N で欠けなく揃うか
 *     - **N チーム − 試合数 = 1**（勝ち抜き戦の算数）
 *
 *   2026年（第108回）は**全56試合を外部の情報源と突き合わせて確認**した
 *   （57チーム・優勝 三重・準優勝 近大工業高専・回戦の内訳も一致）。
 *
 * ★**スロットの間隔が均等でない**（左は15→16、右は43→44だけ広い）。
 * `slot-bracket.mjs` は実測位置の区分線形で読むので扱えるが、
 * **等間隔を前提にした処理を足さないこと。**
 */
const mie = {
  slug: "mie",
  district: "三重",
  name: "三重県高等学校野球連盟",
  siteUrl: "https://mie-kouyaren.com/",
  politenessMs: 2000,
  /*
    ★**組合せ表は「組み合わせ」の一覧ではなく、ニュース記事に載っている。**
    `/pairing_category/latest/` には春季のPDFしか無く、選手権の表は
    `/2026/07/27/（最終結果）…トーナメント表` という記事にある。
    **記事はWordPressの検索APIで辿れる**ので、URLを直書きせずに済む。

    ★**「最終結果」だけを狙わないこと。** 大会中は
    「（7/21更新）」「（7/23更新）」…と同じ題で何度も上がる。
    **新しい記事から順に見て、最初に組み立てられたものを使う。**
  */
  // **夏だけ。** 春季・秋季の表は形を確かめてから足すこと
  seasons: { summer: "選手権三重大会トーナメント表" },
  async collect({ fetchHtml, season, url }) {
    const found = await fetchHtml(
      `https://mie-kouyaren.com/wp-json/wp/v2/search?search=${encodeURIComponent(url)}&per_page=10`,
    );
    if (!found) return [];
    let hits;
    try {
      hits = JSON.parse(found);
    } catch {
      console.log("  ⚠️ 三重: 記事の検索APIが読めない。出典の作りが変わった可能性がある");
      return [];
    }
    const articles = (Array.isArray(hits) ? hits : [])
      .filter((h) => /トーナメント表/.test(h.title ?? "") && /選手権/.test(h.title ?? ""))
      .map((h) => h.url)
      .filter(Boolean);
    if (!articles.length) {
      console.log("  ⚠️ 三重: 組合せ表の記事が見つからない");
      return [];
    }

    const pdfs = [];
    for (const article of articles.slice(0, 4)) {
      const html = await fetchHtml(article);
      await sleep(this.politenessMs);
      if (!html) continue;
      for (const m of html.matchAll(/https?:\/\/[^"']*?\.pdf/g)) {
        if (!pdfs.includes(m[0])) pdfs.push(m[0]);
      }
      if (pdfs.length) break;
    }
    if (!pdfs.length) {
      console.log("  ⚠️ 三重: 記事にPDFが無い");
      return [];
    }
    for (const pdf of pdfs.slice(0, 6)) {
      const parsed = await fetchPdfPages(pdf, { headers: UA });
      await sleep(this.politenessMs);
      if (!parsed?.length) continue;
      for (const raw of parsed) {
        const games = readTwoColumnBracket(raw, {
          district: "三重",
          titlePattern: /第\d+回全国高等学校野球選手権三重大会/,
          half: 300,
          rowTolerance: 6,
          nameOrder: ["asc", "desc"],
          season,
          // ★**日付を持たない**ので、日付での検算はできない
          hasDates: false,
        });
        if (games) return games;
      }
    }
    return [];
  },
};

/**
 * 鹿児島県高等学校野球連盟（`www.kagoshima-kouyaren.jp`）。
 * ★**トーナメント表の出典としては4つ目**（京都・広島・三重に続く）。
 *
 * **規約に転載の制限は無い**（2026-08-15 にトップ・大会日程・試合結果・大会記録の
 * 4ページを「転載・無断・複製・営利・著作権」で検索して確認。footer の
 * Copyright 表記だけで、利用条件の記載そのものが無い）。
 * ★**robots.txt は `/library/` を Disallow しているが、
 * `/library/5e337f119132af322adf5678/*` だけ Allow している。**
 * 組合せ表のPDFはちょうどこのディレクトリにある。**他の library 配下は取らないこと。**
 *
 * ★**同じサイトに一球速報（omyutech）へのリンクがある**が、そちらは
 * 軟式・九州地区大会のもので、**選手権鹿児島大会の結果は連盟自身のPDF**にある。
 * 取っているのはPDFだけで、omyutech からは1件も取っていない。
 *
 * ------------------------------------------------------------------
 * ★ この表がほかの3県と違うところ
 *
 *   1. **上下2段組**（広島・三重は左右）。`orientPage` の扱いは同じ
 *   2. ★**決勝のスコアが、半分ごとの準決勝と同じ帯の中央にある。**
 *      準決勝のスコアは連結線の**両端**（中点から±6.5スロット）に置かれ、
 *      中点に来るのは決勝の得点。`finalInCenter` で外して `centerScore` に取る
 *   3. ★**日付が `県12日9：00`**（球場記号＋日＋開始時刻が1断片）。
 *      月が書かれていないので、表の開催期間の行から月を決める
 *   4. **スコアの後ろに丸数字**（`10⑤` ＝ 5回コールドで10点）
 *   5. 連合チームの凡例が「連合①」と中身の2列組
 *
 * ------------------------------------------------------------------
 * ★ 検算（京都に次いで強い）
 *
 *   - **連盟のトップページが決勝の結果を文章で書いている**
 *     （「決勝戦 神村学園高等部 ９ ー ０ 鹿児島実業」）。
 *     枝から組み立てた決勝と突き合わせる。**表の枝とは別の場所から来る事実**なので、
 *     石川で通ってしまった「構造は合うのに決勝の相手が違う」を止められる
 *   - N チーム − 試合数 = 1
 *   - 表に書かれた日付の個数 = 試合数（鹿児島は61件＝61試合）
 *
 *   2026年（第108回）は 62チーム・61試合・優勝 神村学園（9-0 鹿児島実業）で
 *   すべて一致した。**表のシード欄のスロット番号（1・62・45・19・24・37・50・15）**も
 *   神村学園・鹿屋中央・樟南・鹿児島商業・川内・出水中央・鹿児島実業・徳之島を指しており、
 *   組み立てた並びと矛盾しない。
 */
const kagoshima = {
  slug: "kagoshima",
  district: "鹿児島",
  name: "鹿児島県高等学校野球連盟",
  siteUrl: "http://www.kagoshima-kouyaren.jp/",
  politenessMs: 2000,
  // **夏だけ。** 春季・秋季の表は形を確かめてから足すこと
  seasons: { summer: "http://www.kagoshima-kouyaren.jp/" },
  async collect({ fetchHtml, season, url }) {
    const html = await fetchHtml(url);
    if (!html) return [];
    /*
      ★**「勝ち上がり」のPDFを狙うこと。** 同じページに【組合せ】（スコアの入って
      いない抽選直後の表）も並んでいる。**軟式の同名PDFもある**ので、
      「全国高等学校野球選手権鹿児島」（軟式は「全国高等学校軟式野球選手権」）で分ける。
    */
    const links = [];
    for (const m of html.matchAll(/<a[^>]+href=["']([^"']+\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const label = normalize(plain(m[2]));
      const hit = label.match(/第(\d+)回全国高等学校野球選手権鹿児島\s*大会【勝ち上がり】/);
      if (hit) links.push({ round: Number(hit[1]), url: new URL(m[1], url).toString() });
    }
    if (!links.length) {
      console.log("  ⚠️ 鹿児島: 勝ち上がりのPDFへのリンクが見つからない。出典の作りが変わった可能性がある");
      return [];
    }
    // **新しい回から順に見る**（前年ぶんのリンクが下に残っている）
    links.sort((a, b) => b.round - a.round);

    /*
      ★**同じページに決勝の結果が文章で書いてある。** これを検算に使う。
      「第108回…【勝ち上がり】 決勝戦 神村学園高等部 ９ ー ０ 鹿児島実業 優勝 …」
    */
    const text = normalize(plain(html));
    const verifyOf = (round) => {
      const m = text.match(
        new RegExp(
          `第${round}回全国高等学校野球選手権鹿児島\\s*大会【勝ち上がり】\\s*決勝戦\\s*` +
            `(\\S+?)\\s*(\\d{1,2})\\s*[ー−–—-]\\s*(\\d{1,2})\\s*(\\S+?)\\s*優勝`,
        ),
      );
      return m ? { champion: m[1], runnerUp: m[4], score: [Number(m[2]), Number(m[3])] } : null;
    };

    for (const link of links.slice(0, 3)) {
      const verify = verifyOf(link.round);
      if (!verify) {
        console.log(`  ⚠️ 鹿児島: 第${link.round}回の決勝の記載がページに無い。検算できないので1試合も出さない`);
        continue;
      }
      const parsed = await fetchPdfPages(link.url, { headers: UA });
      await sleep(this.politenessMs);
      if (!parsed?.length) continue;
      for (const raw of parsed) {
        const games = this.readSheet(raw, season, verify);
        if (games) return games;
      }
    }
    return [];
  },
  /** 1枚の組合せ表を読む。**組めなければ null**（呼び出し側は次のPDFへ） */
  readSheet(raw, season, verify) {
    const flat = raw.lines.map((l) => normalize(l.text.replace(/\t/g, "")));
    if (!flat.some((t) => /第\d+回全国高等学校野球選手権鹿児島大会/.test(t))) return null;

    /*
      ★**日付に月が書かれていない**（`県12日9：00`）。
      **7月と決め打ちしないこと。** 表の開催期間の行
      「令和８年７月４日（土）～７月２５日（土）」から月を決める。
      またいでいたら、日で振り分ける（開幕日以降は前の月）。
    */
    const period = flat.map((t) => t.match(/(\d{1,2})月(\d{1,2})日.*?[～~－―-].*?(\d{1,2})月(\d{1,2})日/)).find(Boolean);
    if (!period) {
      console.log("  ⚠️ 鹿児島: 開催期間の行が読めない。日付の月を決められないので1試合も出さない");
      return [];
    }
    const [, m1, d1, m2] = period.map(Number);
    const monthOf = (day) => (m1 === m2 ? m1 : day >= d1 ? m1 : m2);
    const parseLabel = (t) => {
      const m = t.match(/^([^\d\s])(\d{1,2})日/);
      if (!m) return null;
      const day = Number(m[2]);
      return { date: `${monthOf(day)}/${day}`, venue: m[1] };
    };

    /** 連合チームの凡例（「連合①」と中身が同じ行の2列に並ぶ） */
    const expand = new Map();
    for (const l of raw.lines) {
      const m = l.text.match(/(?:^|\t)(連合[①-⑳])\t([^\t]+)$/);
      if (m) expand.set(m[1], m[2].trim());
    }

    return readTwoColumnBracket(raw, {
      district: "鹿児島",
      titlePattern: /第\d+回全国高等学校野球選手権鹿児島大会/,
      /*
        上下で分ける境目。**中央の決勝はどちらにも入れない**……のだが、
        鹿児島の決勝は準決勝と同じ帯にあるので、`finalAt: "center"` で
        半分ずつの組み立てから取り出す。スロット列は 194 と 789 にあり、その中間。
      */
      half: 490,
      // 丸数字つきのスコアだけ別の帯に落ちるので、行の許容幅を少し広げる
      rowTolerance: 8,
      nameOrder: ["asc", "desc"],
      season,
      hasDates: true,
      finalAt: "center",
      parseLabel,
      expand,
      verify,
      venueLegend: (page) => {
        // 凡例「県：平和リース球場（鹿児島県立鴨池野球場）」
        const map = new Map();
        for (const l of page.lines) {
          for (const m of l.text.matchAll(/(?:^|\t)([^\t\s])\s*[：:]\s*([^\t]+?)(?=\t|$)/g)) {
            const name = m[2].trim();
            if (/球場|スタジアム|ドーム|パーク|PARK/i.test(name)) map.set(m[1], name);
          }
        }
        return map;
      },
    });
  },
};

/**
 * 石川県高等学校野球連盟（`ishikawa-hbf.jp`）。
 * ★**トーナメント表ではなく「試合結果（スコア表）」から取る**（2026-08-15）。
 *
 * ------------------------------------------------------------------
 * ★ 石川は3回失敗している。**今回は同じ土俵に乗っていない**
 *
 *   2026-08-14 までに3方式でやぐら表（組合せ表）を組み立てて3回とも誤った。
 *   **検算（準々4・準決2・決勝1）を通ったのに決勝の相手が違った**
 *   （事実は 金沢 3-4x 遊学館、組み立ては 金沢 vs 小松大谷）。
 *
 *   ★**この出典は組み立てを一切しない。** 同じPDFの2ページ目以降に
 *   **1試合ずつイニングスコアが印刷されている**（愛媛と同じ「スコア表」型）。
 *   どの点がどの対戦のものかが紙に書いてあるので、推測する余地が無い。
 *   1ページ目のやぐら表は**優勝校の検算にだけ**使い、枝は読まない。
 *
 * ------------------------------------------------------------------
 * ★ 紙の形
 *
 *   `◆<球場> 第N試合` の x が**1試合ぶんの枠の左端**。1行に最大3試合並ぶ。
 *   枠の左端からの距離で中身が決まる:
 *
 *     38〜145 … 各回の得点（`X` は打たずに終わった回）
 *    152〜182 … 合計（`6x` のように x が付く。**`Number("6x")` は NaN**）
 *     36〜115 … 合計の下の行にある正式な校名（先攻・後攻）
 *
 *   ★**回戦と日付はページをまたいで続く**（2回戦は2〜3ページ、
 *   準々決勝は4〜5ページにまたがる）。ページごとに状態を捨てないこと。
 *
 * ------------------------------------------------------------------
 * ★ 検算（このリポジトリでいちばん強い）
 *
 *   1. **試合ごと**: 各回の得点の和 == 印刷された合計。41試合すべてで一致
 *   2. **勝ち上がり**: 3回戦以降の出場校は**全員が前の回戦の勝者**。
 *      勝ったのに次の回戦にいない学校が**0件**。2回戦の非勝者22校は
 *      シードで、42 −（1回戦10試合×2）= 22 と一致する
 *   3. **のべ出場校 42 / 試合 41**（N − 1）。42はやぐら表のスロット数と一致
 *   4. **優勝校が3か所で一致**（やぐら表の「優勝 遊学館」／決勝の勝者／
 *      連盟のお知らせの見出し「遊学館が優勝」）
 *
 *   ★**1と2は組み立て型の県には無い検算。** 石川で以前すり抜けた
 *   「構造は合うのに対戦相手が違う」は、2で必ず捕まる。
 *
 * **規約**: トップ・成績記録・試合スケジュール・過去データ・リンク・
 * お知らせの各ページを「転載・無断・複製・営利・著作権」で検索して
 * **制限の記載なし**。robots.txt は 404（2026-08-15 に確認）。
 * ★サイトに一球速報へのリンクがあるが、**取っているのは連盟自身のPDFだけ**。
 */
const ishikawa = {
  slug: "ishikawa",
  district: "石川",
  name: "石川県高等学校野球連盟",
  siteUrl: "https://ishikawa-hbf.jp/",
  politenessMs: 2000,
  // **夏だけ。** 春季・秋季は同じ形のPDFが出るか確かめてから足すこと
  seasons: { summer: "https://ishikawa-hbf.jp/?page_id=213" },
  async collect({ fetchHtml, season, url }) {
    const index = await fetchHtml(url);
    if (!index) return [];
    /*
      ★**お知らせの見出しが優勝校を持っている**
      （「第１０８回全国高等学校野球選手権石川大会 遊学館が優勝」）。
      PDFとは別の場所から来る事実なので、検算に使う。
    */
    const posts = [];
    for (const link of dailyLinks(index, url, { hrefPattern: /\?p=\d+/ })) {
      const m = link.label.match(/第(\d+)回全国高等学校野球選手権石川大会\s*(\S+?)が優勝/);
      if (m) posts.push({ url: link.url, round: Number(m[1]), champion: m[2] });
    }
    if (!posts.length) {
      console.log("  ⚠️ 石川: 優勝を伝えるお知らせが見つからない。出典の作りが変わった可能性がある");
      return [];
    }
    posts.sort((a, b) => b.round - a.round);

    for (const post of posts.slice(0, 2)) {
      const html = await fetchHtml(post.url);
      await sleep(this.politenessMs);
      if (!html) continue;
      const pdfs = dailyLinks(html, post.url, {
        hrefPattern: /\.pdf$/i,
        labelPattern: /試合結果|勝ち上がり/,
      });
      if (!pdfs.length) {
        console.log(`  ⚠️ 石川: 第${post.round}回のお知らせに試合結果のPDFが無い`);
        continue;
      }
      for (const pdf of pdfs.slice(0, 3)) {
        const pages = await fetchPdfPages(pdf.url, { headers: UA });
        await sleep(this.politenessMs);
        if (!pages?.length) continue;
        const games = this.readSheet(pages, season, post);
        if (games?.length) return games;
      }
    }
    return [];
  },
  /**
   * PDF全体を読む。**組めなければ空**（1試合も出さない）。
   * @param post お知らせから読んだ `{ round, champion }`
   */
  readSheet(pages, season, post) {
    const flat = pages.flatMap((p) => p.lines.map((l) => normalize(l.text.replace(/\t/g, ""))));
    const tournament = flat.map((t) => t.match(/第\d+回全国高等学校野球選手権石川大会/)?.[0]).find(Boolean);
    if (!tournament) return null;
    const no = Number(tournament.match(/第(\d+)回/)[1]);
    if (no !== post.round) return null;
    // 選手権の回数は 年 - 1918
    const year = no + 1918;

    /** やぐら表（1ページ目）の「優勝 ◯◯」。**枝は読まない** */
    const printedChampion = flat
      .map((t) => t.match(/^優勝\s*(\S+)$/)?.[1])
      .find(Boolean);

    const ROUNDS = new Set(["1回戦", "2回戦", "3回戦", "4回戦", "準々決勝", "準決勝", "決勝"]);
    /** `6x` `X` `１２` を数にする。**`Number("6x")` は NaN なので直に渡さない** */
    const score = (t) => {
      const s = normalize(t.trim());
      const m = s.match(/^(\d{1,2})[xX]?$/);
      return m ? Number(m[1]) : null;
    };

    const games = [];
    // ★回戦と日付は**ページをまたいで続く**。ページごとに捨てないこと
    let round = null;
    let date = null;
    for (const page of pages) {
      const lines = page.lines;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const text = normalize(line.items.map((it) => it.text.trim()).join(""));
        if (ROUNDS.has(text)) {
          round = text;
          continue;
        }
        const d = text.match(/令和(\d+)年(\d+)月(\d+)日/);
        if (d) {
          // ★**和暦と大会回数を突き合わせる**（令和は 2018 + N）。ずれたら出さない
          if (2018 + Number(d[1]) !== year) {
            console.log(`  ⚠️ 石川: 日付の年（令和${d[1]}）が大会の年（${year}）と合わない。1試合も出さない`);
            return [];
          }
          date = `${year}-${String(+d[2]).padStart(2, "0")}-${String(+d[3]).padStart(2, "0")}`;
          continue;
        }
        const marks = line.items.filter((it) => it.text.trim().startsWith("◆"));
        if (!marks.length) continue;
        if (!round || !date) {
          console.log("  ⚠️ 石川: 回戦か日付が分からない試合がある。1試合も出さない");
          return [];
        }
        const rows = [lines[i + 1], lines[i + 2]];
        if (!rows[0] || !rows[1]) continue;

        /*
          校名の行。**ラベル列（枠の左端から 10〜35）に何も無い**行で、
          先攻（+41 付近）と後攻（+106 付近）の2つが並ぶ。
          あいだに「（5回コールド）」の行が入ることがあるので、少し下まで探す。
        */
        let nameRow = null;
        for (let k = i + 3; k < Math.min(i + 8, lines.length); k++) {
          const off = lines[k].items.map((it) => it.x - marks[0].x);
          if (off.some((o) => o >= 10 && o <= 35)) continue;
          if (off.some((o) => o >= 36 && o <= 50) && off.some((o) => o >= 100 && o <= 115)) {
            nameRow = lines[k];
            break;
          }
        }
        if (!nameRow) {
          console.log(`  ⚠️ 石川: 校名の行が読めない枠がある（${round}・${date}）。1試合も出さない`);
          return [];
        }

        for (const mark of marks) {
          const at = (row, lo, hi) =>
            row.items.filter((it) => it.x - mark.x >= lo && it.x - mark.x <= hi).sort((p, q) => p.x - q.x);
          const sides = rows.map((row) => {
            const innings = at(row, 38, 145).map((it) => score(it.text)).filter((v) => v !== null);
            const total = at(row, 152, 182).map((it) => score(it.text)).filter((v) => v !== null);
            return { innings, total: total.at(-1) ?? null };
          });
          const names = at(nameRow, 36, 115).map((it) => it.text.trim());
          if (names.length !== 2 || sides.some((s) => s.total === null || !s.innings.length)) {
            console.log(`  ⚠️ 石川: 読めない枠がある（${round}・${date}）。1試合も出さない`);
            return [];
          }
          // ★**試合ごとの検算**: 各回の得点の和 == 印刷された合計
          const bad = sides.find((s) => s.innings.reduce((x, y) => x + y, 0) !== s.total);
          if (bad) {
            console.log(
              `  ⚠️ 石川: イニングの和が合計と合わない（${names.join(" vs ")}・${round}）。1試合も出さない`,
            );
            return [];
          }
          games.push({
            date,
            season,
            tournament,
            round,
            venue: mark.text.trim().replace(/^◆/, ""),
            teams: [
              { display: names[0], score: sides[0].total, won: sides[0].total > sides[1].total },
              { display: names[1], score: sides[1].total, won: sides[1].total > sides[0].total },
            ],
          });
        }
      }
    }
    if (!games.length) return [];

    /*
      ---- 勝ち上がりの検算 ----
      ★**組み立て型の県には無い検算。** 石川で以前すり抜けた
      「構造は合うのに対戦相手が違う」は、ここで必ず捕まる。
    */
    const ORDER = ["1回戦", "2回戦", "3回戦", "4回戦", "準々決勝", "準決勝", "決勝"];
    const played = ORDER.filter((r) => games.some((g) => g.round === r));
    let winners = null;
    for (const r of played) {
      const gs = games.filter((g) => g.round === r);
      const teams = gs.flatMap((g) => g.teams.map((t) => t.display));
      if (winners) {
        const missing = winners.filter((w) => !teams.includes(w));
        if (missing.length) {
          console.log(`  ⚠️ 石川: ${r} に出ていない前の回戦の勝者がある（${missing.join("・")}）。1試合も出さない`);
          return [];
        }
      }
      winners = gs.map((g) => g.teams.find((t) => t.won)?.display).filter(Boolean);
      if (winners.length !== gs.length) {
        console.log(`  ⚠️ 石川: ${r} に引き分けがある。読み方が違う可能性があるので1試合も出さない`);
        return [];
      }
    }
    const champion = winners[0];
    const entries = new Set(games.flatMap((g) => g.teams.map((t) => t.display)));
    if (entries.size - games.length !== 1) {
      console.log(`  ⚠️ 石川: ${entries.size} チームに対し ${games.length} 試合（${entries.size - 1} のはず）。1試合も出さない`);
      return [];
    }
    /*
      ★**優勝校を2か所と突き合わせる。**
      やぐら表の「優勝 ◯◯」と、連盟のお知らせの見出し「◯◯が優勝」。
      どちらも**枠のスコアとは別の場所から来る事実**。
    */
    const same = (a, b) => Boolean(a) && Boolean(b) && (a.includes(b) || b.includes(a));
    if (!same(post.champion, champion) || (printedChampion && !same(printedChampion, champion))) {
      console.log(
        `  ⚠️ 石川: 優勝校が一致しない（お知らせ「${post.champion}」/ 表「${printedChampion ?? "—"}」/ ` +
          `決勝の勝者「${champion}」）。1試合も出さない`,
      );
      return [];
    }
    console.log(
      `  （${tournament}: ${games.length} 試合 / 優勝 ${champion} / ${entries.size} チーム・**スコア表から**）`,
    );
    return games;
  },
};

/**
 * 岐阜県高等学校野球連盟（`ghbf.asfsite.jp`）。
 * ★**このリポジトリでいちばん素直な出典**（2026-08-15）。
 *
 * ------------------------------------------------------------------
 * ★ 「一球速報の県」という分類が誤りだった
 *
 *   READMEは岐阜を「結果を一球速報に載せている3県」に入れていたが、
 *   **大会ページに一球速報は無く、連盟が日別のスコア表PDFを出していた**。
 *   千葉・福井も同じ可能性があるので、同じ分類の県は見直すこと。
 *
 * ------------------------------------------------------------------
 * ★ 紙の形（組み立ても略称の推測も要らない）
 *
 *     第108回全国高等学校野球選手権岐阜県大会  試合結果報告書
 *     令和８年 7 月 28 日 (火)  場所： ぎふしん長良川球場
 *     【第１試合】 試合時間 9時32分～12時6分
 *     高校名  1  2  3  4  5  6  7  8  9  10 11 12  計   ← ここが列の x をくれる
 *     中京    1  0  0  2  0  0  2  0  0            5
 *     大垣日大 0  0  0  0  0  0  2  0  0            2
 *
 *   **見出し行が列の座標を持っている**ので、断片の並び順に頼らずに読める。
 *   ★**断片の順で読むと落ちる**（実測で14試合が検算に落ちた）。
 *
 *   ★**サヨナラは `1×`（全角の×）。** `^\d+$` で弾くとその回が消え、
 *   イニングの和が合計と合わなくなる。**`Number("1×")` は NaN。**
 *
 * ------------------------------------------------------------------
 * ★ 持っているもの / 持っていないもの
 *
 *   あり … 日付・球場・第N試合・**正式な校名**・各回の得点・合計
 *   なし … ★**回戦**（1回戦・2回戦…）。**三重とちょうど逆。**
 *          ファイル名に書いてある準決勝・決勝だけは分かるので、そこは入れる。
 *          **それ以外を日付から推測しない**（順延と再試合があるので当てられない）
 *
 * ------------------------------------------------------------------
 * ★ 検算
 *
 *   1. **試合ごと**: 各回の得点の和 == 印刷された合計。62/62 一致
 *   2. のべ出場校 − 試合数（★下の「校名の揺れ」を畳んでから数えること）
 *   3. 決勝のPDFに「中京高校 7年ぶり8回目の甲子園出場」と書いてある
 *
 *   ★**校名の揺れがある**（同じ学校が回戦で書き分けられる）。実測で5組:
 *   中津商/中津商業・多治見工/多治見工業・岐阜聖徳学園/岐阜聖徳・
 *   中津川工業/中津川工・大垣商業/大垣商。**畳まないと「差5」になって
 *   検算が通らない**（学校マスタとの照合は `labelCandidates` が吸収する）。
 *
 *   ★**引き分け再試合がある。** 市岐阜商 0-0 県岐阜商（7/18）が
 *   翌日 0-10 で再試合になった。**引き分けも試合として出す**
 *   （画面は `RegionalDistrictCard` が △ と書く）。
 *
 *   ★**順延の告知がスコア空欄で載る。** 得点が読めない枠は**捨てる**
 *   （その試合は後日ぶんに載っている）。
 *
 * **規約**: トップ・policy・privacy・about・link・sitepolicy を
 * 「転載・無断・複製・営利・著作権」で検索して**制限の記載なし**。
 * robots.txt は 404（2026-08-15 に確認）。
 */
const gifu = {
  slug: "gifu",
  district: "岐阜",
  name: "岐阜県高等学校野球連盟",
  siteUrl: "https://ghbf.asfsite.jp/",
  politenessMs: 1500,
  // **夏だけ。** 春季・秋季も同じ形の報告書が出るか確かめてから足すこと
  seasons: { summer: "https://ghbf.asfsite.jp/event/schedule/" },
  async collect({ fetchHtml, season, url }) {
    /*
      大会ページの一覧から「全国高等学校野球選手権岐阜」の回を探す。
      ★**URLを直書きしない**（毎年 entry-NNNN.html が変わる）。
    */
    const index = await fetchHtml(url);
    if (!index) return [];
    /*
      ★**大会の一覧は `<a>` ではなく、ページに埋め込まれたJSON**。
      `{ "title": "第108回…岐阜大会", "url": "…/entry-6247.html", … }` が並ぶ。
      `dailyLinks`（`<a>` を読む）では1件も取れない。
    */
    const entries = [];
    for (const m of index.matchAll(/"title":\s*"([^"]+)"\s*,\s*"url":\s*"([^"]+)"/g)) {
      const round = Number(normalize(m[1]).match(/第(\d+)回全国高等学校野球選手権岐阜/)?.[1]);
      if (Number.isFinite(round)) entries.push({ url: m[2].replace(/\\\//g, "/"), round });
    }
    entries.sort((a, b) => b.round - a.round);
    if (!entries.length) {
      console.log("  ⚠️ 岐阜: 選手権岐阜大会のページが一覧に無い。出典の作りが変わった可能性がある");
      return [];
    }

    for (const entry of entries.slice(0, 2)) {
      const html = await fetchHtml(entry.url);
      await sleep(this.politenessMs);
      if (!html) continue;
      /*
        ★**「試合結果報告書」だけを取る。** 同じページに要項・組合せ表
        （やぐら）も並んでいる。**やぐらは読まない**（組み立てをしないため）。
      */
      const reports = dailyLinks(html, entry.url, {
        hrefPattern: /\.pdf$/i,
        labelPattern: /試合結果報告書/,
      });
      if (!reports.length) {
        console.log(`  ⚠️ 岐阜: 第${entry.round}回のページに試合結果報告書が無い`);
        continue;
      }
      const games = [];
      for (const report of reports) {
        const pages = await fetchPdfPages(report.url, { headers: UA });
        await sleep(this.politenessMs);
        if (!pages?.length) continue;
        // ファイル名にある回戦だけ拾う（【準決勝0726】【決勝0728】）
        const round = pickRound(report.label.match(/【([^】]*)】/)?.[1] ?? "");
        games.push(...this.readReport(pages, season, entry.round, round));
      }
      if (games.length) return this.verify(games, entry.round);
    }
    return [];
  },
  /** 日別の報告書1本を読む */
  readReport(pages, season, no, round) {
    const year = no + 1918; // 選手権の回数は 年 - 1918
    const tournament = `第${no}回全国高等学校野球選手権岐阜大会`;
    const han = (t) => normalize(t);
    /** 得点のます。`1×`（サヨナラ）・`X`（打たずに終了）・空欄がある */
    const cell = (t) => {
      const s = han(t.trim());
      if (!s || /^[xX×✕✖]$/.test(s)) return { v: null, blank: true };
      const m = s.match(/^(\d{1,2})\s*[xX×✕✖]?$/);
      return m ? { v: Number(m[1]), blank: false } : { v: null, blank: false, bad: true };
    };

    const out = [];
    let date = null;
    let venue = null;
    for (const page of pages) {
      const lines = page.lines;
      for (let i = 0; i < lines.length; i++) {
        const flat = han(lines[i].text.replace(/\t/g, ""));
        const d = flat.match(/令和(\d+)年(\d{1,2})月(\d{1,2})日/);
        if (d) {
          // ★和暦（2018 + N）と大会の回数から出した年が合うか
          if (2018 + Number(d[1]) !== year) {
            console.log(`  ⚠️ 岐阜: 日付の年（令和${d[1]}）が大会の年（${year}）と合わない。この報告書は使わない`);
            return [];
          }
          date = `${year}-${String(+d[2]).padStart(2, "0")}-${String(+d[3]).padStart(2, "0")}`;
          venue = flat.match(/場所[：:]\s*(.+?)$/)?.[1]?.trim() ?? venue;
        }
        if (!/^高校名/.test(flat)) continue;

        // 見出し行が列の x をくれる（1〜12 と 計）
        const cols = [];
        let totalX = null;
        for (const it of lines[i].items) {
          const t = han(it.text.trim());
          if (/^\d{1,2}$/.test(t)) cols.push({ n: Number(t), x: it.x });
          else if (t === "計") totalX = it.x;
        }
        cols.sort((a, b) => a.n - b.n);
        if (cols.length < 9 || totalX === null) continue;

        const rows = [lines[i + 1], lines[i + 2]];
        if (!rows[0] || !rows[1]) continue;
        const sides = rows.map((row) => ({
          name: row.items.filter((it) => it.x < cols[0].x - 12).map((it) => it.text.trim()).join(""),
          innings: cols.map((c) => {
            const hit = row.items.find((it) => Math.abs(it.x - c.x) <= 12);
            return hit ? cell(hit.text) : { v: null, blank: true };
          }),
          total: (() => {
            const hit = rows && row.items.find((it) => Math.abs(it.x - totalX) <= 14);
            return hit ? cell(hit.text) : { v: null, blank: true };
          })(),
        }));

        /*
          ★**得点の無い枠は捨てる**（順延の告知）。その試合は後日ぶんに載っている。
          読めない字が混ざっている枠は**捨てずに落とす**（黙って歪めない）。
        */
        if (sides.some((s) => s.total.v === null)) continue;
        if (sides.some((s) => !s.name || s.innings.some((x) => x.bad) || s.total.bad)) {
          console.log(`  ⚠️ 岐阜: 読めない枠がある（${date}・${sides.map((s) => s.name).join(" vs ")}）。1試合も出さない`);
          return [];
        }
        // ★試合ごとの検算: 各回の得点の和 == 印刷された合計
        const sums = sides.map((s) => s.innings.reduce((a, x) => a + (x.v ?? 0), 0));
        if (sums[0] !== sides[0].total.v || sums[1] !== sides[1].total.v) {
          console.log(
            `  ⚠️ 岐阜: イニングの和が合計と合わない（${sides.map((s, k) => `${s.name} ${sums[k]}/${s.total.v}`).join(" - ")}）。1試合も出さない`,
          );
          return [];
        }
        if (!date) {
          console.log("  ⚠️ 岐阜: 日付の分からない試合がある。1試合も出さない");
          return [];
        }
        out.push({
          date,
          season,
          tournament,
          round,
          venue,
          teams: [
            { display: sides[0].name, score: sides[0].total.v, won: sides[0].total.v > sides[1].total.v },
            { display: sides[1].name, score: sides[1].total.v, won: sides[1].total.v > sides[0].total.v },
          ],
        });
      }
    }
    return out;
  },
  /** 全部そろってからの検算 */
  verify(games, no) {
    /*
      ★**校名の揺れを畳んでから数える。** 同じ学校が回戦で書き分けられる
      （中津商/中津商業 など5組）。`labelCandidates` と同じ畳み方にそろえる。
    */
    const fold = (s) => s.replace(/商業$/, "商").replace(/工業$/, "工").replace(/農業$/, "農").replace(/学園$/, "");
    const teams = new Set(games.flatMap((g) => g.teams.map((t) => fold(t.display))));
    /*
      引き分け再試合があるぶん、試合数はチーム数−1より多くなる。
      **引き分けを除いた決着した試合が チーム数−1** になるはず。
    */
    const decided = games.filter((g) => g.teams[0].score !== g.teams[1].score).length;
    if (teams.size - decided !== 1) {
      console.log(
        `  ⚠️ 岐阜: ${teams.size} チームに対し決着した試合 ${decided}（${teams.size - 1} のはず）。1試合も出さない`,
      );
      return [];
    }
    const draws = games.length - decided;
    console.log(
      `  （第${no}回全国高等学校野球選手権岐阜大会: ${games.length} 試合 / ${teams.size} チーム` +
        (draws ? ` / 引き分け再試合 ${draws}` : "") + "・**日別のスコア表から**）",
    );
    return games;
  },
};

/**
 * 千葉県高等学校野球連盟（`chbf.or.jp`）。
 * ★**このリポジトリでいちばん大きい大会**（148チーム・147試合。2026-08-15）。
 *
 * ★**岐阜と同じく「一球速報の県」という分類が誤りだった。**
 * 連盟が自分でやぐら表（試合結果入り）のPDFを出している。
 *
 * ------------------------------------------------------------------
 * ★ 規約と robots.txt
 *
 *   転載・複製・営利の制限は**どのページにも無い**
 *   （毎ページに出る「禁止」はサイドバーの「動画撮影禁止区域」で、再利用の話ではない）。
 *
 *   ★**robots.txt は 199件の Disallow を持つが、全部が個別のURL指定で、
 *   2018〜2023年の内部書類だけ**（部員登録書・選手資格証明書・オーダー用紙・
 *   ガイドライン・審判資料など）。**結果と組合せは1件も入っていない。**
 *   2024年以降のファイルも1件も無い。目当てのPDFは対象外。
 *   ★**他の `/wp-content/uploads/` 配下を無条件に取らないこと。**
 *
 * ------------------------------------------------------------------
 * ★ 紙の形（やぐら型・左右2段組）
 *
 *   スロット番号が**各校名の隣に縦に**並ぶ（左 1〜74 が x≈86、右 75〜148 が x≈505）。
 *   中央 x≈294 で合流する。`orientPage` で入れ替えれば京都・広島と同じ扱いになる。
 *
 *   ★**決勝は中央の帯にある**が、**左右の深い回戦も同じ帯に何段も並ぶ**ので、
 *   `finalAt: "innermost"`（境目をまたぐ組のうちいちばん内側）で取る。
 *
 *   ★**校名にシード記号が付く**（左は先頭 `Ａ学館浦安`、右は末尾 `中央学院Ｃ`）。
 *   Ａ・Ｂ・Ｃ の3種だけ。**全角ラテン文字を無条件に落とさないこと** —
 *   「光英ＶＥＲＩＴＡＳ」が壊れる。字間の空白も落とす（日本の校名に空白は入らない）。
 *
 * ------------------------------------------------------------------
 * ★ 日付が無い（三重と同じ）
 *
 *   1試合ぶんの日付が1つも書かれていない。**推測で埋めない。**
 *   画面は回戦ごとに並べる（`groupGamesForDistrict`）。
 *   ★**日付の無い試合はトップの抜粋と勝ち上がりに出さない**ので、
 *   147試合あっても出るのは県のページ（`/prefectures/chiba`）だけ。
 *
 * ------------------------------------------------------------------
 * ★ 検算（京都に次いで強い）
 *
 *   - ★**優勝と準優勝の両方**が表の中央に縦書きされている
 *     （「優勝 拓殖大紅陵高等学校（24年振り6回目）」「準優勝 専修大松戸高等学校」）。
 *     **準優勝まで突き合わせられるのは千葉が初めて。**
 *     左半分の勝ち上がりが優勝校・右半分が準優勝校と一致しなければ1試合も出さない
 *   - N チーム − 試合数 = 1（148 − 147）
 *   - 各回戦の数字の個数が試合数の2倍（`slot-bracket.mjs` が強制する）
 *
 *   ★**連盟のお知らせも外から裏付けている**（「千葉県代表の拓殖大紅陵高校
 *   （24年ぶり６度目）」）。表とは別の場所から来る事実。
 */
const chiba = {
  slug: "chiba",
  district: "千葉",
  name: "千葉県高等学校野球連盟",
  siteUrl: "https://chbf.or.jp/",
  politenessMs: 2000,
  // **夏だけ。** 春季・秋季の表は形を確かめてから足すこと
  seasons: { summer: "https://chbf.or.jp/wp-sitemap-posts-oshirase2-1.xml" },
  async collect({ fetchHtml, season, url }) {
    /*
      ★**大会の記事はトップからは辿れない**（秋季に差し替わると消える）。
      サイトマップに残るので、そこから「第N回…千葉大会について」を探す。
      記事には**最新版のPDFだけ**が貼ってある（大会中は ①〜⑬ と更新される）。
    */
    const xml = await fetchHtml(url);
    if (!xml) return [];
    const posts = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((m) => ({ url: m[1], name: decodeURIComponent(m[1]) }))
      .filter((p) => /全国高等学校野球選手権千葉大会/.test(normalize(p.name)));
    if (!posts.length) {
      console.log("  ⚠️ 千葉: 選手権千葉大会の記事がサイトマップに無い。出典の作りが変わった可能性がある");
      return [];
    }
    for (const post of posts.slice(0, 3)) {
      const html = await fetchHtml(post.url);
      await sleep(this.politenessMs);
      if (!html) continue;
      const pdfs = dailyLinks(html, post.url, { hrefPattern: /\.pdf$/i });
      for (const pdf of pdfs.slice(0, 4)) {
        const parsed = await fetchPdfPages(pdf.url, { headers: UA });
        await sleep(this.politenessMs);
        if (!parsed?.length) continue;
        for (const raw of parsed) {
          const games = this.readSheet(raw, season);
          if (games) return games;
        }
      }
    }
    return [];
  },
  /** 1枚のやぐら表を読む。**目当ての紙でなければ null**（呼ぶ側は次のPDFへ） */
  readSheet(raw, season) {
    const flat = raw.lines.map((l) => normalize(l.text.replace(/\t/g, "")));
    if (!flat.some((t) => /第\d+回全国高等学校野球選手権千葉大会/.test(t))) return null;

    /*
      表の中央に縦書きされた「優勝 ◯◯高等学校（…）」「準優勝 ◯◯高等学校」。
      **枝のスコアとは別の場所から来る事実**なので検算に使う。
    */
    const HALF = 294;
    const centre = raw.lines
      .flatMap((l) => l.items.map((i) => ({ x: i.x, y: l.y, t: i.text.trim() })))
      .filter((i) => Math.abs(i.x - HALF) <= 10)
      .sort((a, b) => b.y - a.y)
      .map((i) => i.t)
      .join("");
    const champion = centre.match(/(?:^|[^準])優勝(\S+?)高等学校/)?.[1] ?? null;
    const runnerUp = centre.match(/準優勝(\S+?)高等学校/)?.[1] ?? null;
    if (!champion || !runnerUp) {
      console.log("  ⚠️ 千葉: 表の中央から優勝・準優勝を読めなかった。検算できないので1試合も出さない");
      return [];
    }

    return readTwoColumnBracket(raw, {
      district: "千葉",
      titlePattern: /第\d+回全国高等学校野球選手権千葉大会/,
      half: HALF,
      rowTolerance: 3,
      // 左は上から、右は下から読む（スロットは縦、校名は横書き）
      nameOrder: ["asc", "desc"],
      season,
      // ★**日付が1つも書かれていない**ので、日付での検算はできない
      hasDates: false,
      finalAt: "innermost",
      /*
        ★**シード記号の列を範囲ごと外す**（2026-08-15 に実データで測った）。

          左 … 記号 x=31 ／ 校名 x=37〜78（74スロットすべて 37 から始まる）
          右 … 校名 x=513〜556 ／ 記号 x=561（556〜558 は空）

        **記号だけを文字で消す作りにしないこと。** 右の x=560 に
        記号でない「宣」が1つあり、`千葉東` が `千葉東宣` になっていた。
        文字で消す方式では、こういう字を取りこぼして**画面に誤った校名が出る**。
        ★**全角ラテン文字を無条件に落とすのも駄目**（「光英ＶＥＲＩＴＡＳ」が壊れる）。
      */
      ranges: [[35, HALF], [HALF, 558]],
      // 字間の空白を詰める（日本の校名に空白は入らない）
      cleanName: (s) => s.replace(/\s+/g, ""),
      verify: { champion, runnerUp },
    });
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
const ADAPTERS = [
  nagano,
  kanagawa,
  saitama,
  yamanashi,
  tokushima,
  kumamoto,
  gunma,
  saga,
  nara,
  ehime,
  niigata,
  aichi,
  kyoto,
  hiroshima,
  mie,
  kagoshima,
  ishikawa,
  gifu,
  chiba,
];

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
  const weak = new Set();
  /*
    ★**これは「弱い」候補。** 同じ県に同じ短い名前の高校があるときは足さない。
    新潟には**佐渡高校と佐渡中等教育学校の両方**があり、両方に「佐渡」を
    持たせると**出典の「佐渡」がどちらか決まらなくなって結び付かない。**
    出典は中等教育学校を「◯◯中等」と書くので、素の短名は高校のものとして扱う。
  */
  if (/中等教育学校$/.test(name)) weak.add(name.replace(/中等教育学校$/, ""));
  return { names: [...set].filter(Boolean), weak: [...weak].filter(Boolean) };
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
 * 「地区名＼出典の表記」→ **学校の slug**。**推測で書かないこと。**
 * 出典のページで実際にその表記が使われていることを確かめてから足す。
 *
 * ★**校名ではなく slug で指すこと。** 同じ県に同名の学校がある
 * （群馬の「前橋高校」は県立と市立の2件）。校名で指すと、
 * **対応表を書いたのにどちらか分からない**という元の問題に戻る。
 *
 * ★**分からないものは書かない。** 群馬の「前 橋」がまさにそれで、
 * 県立と市立のどちらを指すのか出典から確かめられなかった（この連盟は
 * 加盟校名簿を公開しておらず、結果ページに市立側の表記が出てこない）。
 * 1試合を取りこぼすほうが、別の学校の戦績にするより軽い。
 *
 * 高専のキャンパスについて:
 *   熊本高専は八代・熊本の2キャンパスがあり、**大会にはキャンパスごとに出る**
 *   （「高専八代」「高専熊本」）。学校マスタは1校なので、両方を同じ学校に
 *   結び付ける。**その結果、片方が勝って片方が負けた日は1校が1勝1敗になる。**
 *   勝ち上がり（1度も負けていない）の判定では出てこなくなるだけで、
 *   嘘にはならない側に倒れる。
 */
const DISTRICT_ALIASES = {
  "熊本\t高専八代": "kumamoto-kosen",
  "熊本\t高専熊本": "kumamoto-kosen",
  // 群馬は3回戦以降しか結果を出さないが、その中に出てくる略記
  "群馬\t桐生市商": "kiryushiritsushogyo",
  "群馬\t安中総合": "annakasogogakuen",
  /*
    奈良。**大学附属は略し方が2通りある**（同じ大会の中で「奈女大附」と
    「女子大附」の両方が出てくる）。国立なのでこのサイトの収録対象。
  */
  "奈良\t県大附属": "narakenritsudaigakufuzoku",
  "奈良\t奈女大附": "narajoshidaigakufuzoku",
  "奈良\t女子大附": "narajoshidaigakufuzoku",
  /*
    愛媛。**統合の前後で同じ校名の学校が2件ある**（小松・八幡浜）。
    出典は新しいほうを「（新）小松」と書いて区別している。
    括弧が**前に付く**ので、末尾の括弧を落とす正規化では拾えない。
    **どちらを指すか出典が書き分けているので、対応表で受ける。**
  */
  "愛媛\t愛大附": "ehimedaigakufuzoku",
  "愛媛\t（新）小松": "komatsushin",
  "愛媛\t（新）八幡浜": "yawatahamashin",
  /*
    愛知。**「名市」は名古屋市立の略。** この出典は市立校を「名市工業」
    「名市工芸」と書く（他の市立校は「菊里」「向陽」のように設置区分を
    付けないので、規則では拾えない2校だけを対応表で受ける）。

    ★**紛らわしい校名が同じ大会に出ている。** 対応表に書く前に、
    どれが公立でどれが私立かを1件ずつ確かめた（2026-08-14）。

      名市工業   → 名古屋市立工業高校（市立）        ← ここで受ける
      名市工芸   → 名古屋市立工芸高校（市立）        ← ここで受ける
      名古屋工科 → 愛知県立名古屋工科高校（県立。規則で結び付く）
      名古屋工業 → **私立**（学校法人名工学園）。学校マスタに無くて正しい
      科技高豊田 → **私立**科学技術学園高校 豊田校。県立豊田工科とは別
      名古屋     → **私立**名古屋高校
  */
  "愛知\t名市工業": "nagoyashiritsukogyo",
  "愛知\t名市工芸": "aichi-kogei",
  /*
    京都。組合せ表は「京教大附属」と略す。**国立なのでこのサイトの収録対象。**
    京都府高野連の加盟校一覧（№41「京都教育大学附属・国立」）で確かめた。

    ★**「宮津天橋」はここに書かない**（2026-08-14）。
    加盟校一覧では**1校（№69 宮津天橋・府立）**だが、学校マスタは
    **宮津学舎・加悦谷学舎の2件**に分かれている（文科省データがそうなっている）。
    どちらの学舎として出ているのか出典からは分からないので結び付けない。
    **1試合を取りこぼすほうが、別の学校の戦績にするより軽い。**
  */
  "京都\t京教大附属": "kyotokyoikudaigakufuzoku",
  /*
    広島。組合せ表は県名・市名を省く。**同名の県立と市立があるので確かめてから書いた**
    （2026-08-14。外部のチーム情報で正式名称を確認）。

      広島商   → 広島**県立**広島商業（市立にも同名がある）
      広島工   → 広島**県立**広島工業（表は市立を「広島市工」と書き分けている）
      広島市工 → 広島**市立**広島工業
  */
  "広島\t広島商": "hiroshimashogyo",
  "広島\t広島工": "hiroshimakogyo",
  "広島\t広島市工": "hiroshima-hiroshimakogyo",
  // 市名を省いた略記。同名は無いので規則で拾えないぶんだけ足す
  "広島\t誠之館": "fukuyamaseishikan",
  "広島\t明王台": "fukuyamamyodai",
  "広島\t庄原実": "shobarajitsugyo",
  "広島\t加計芸北": "kakegeihoku",
  "広島\t広島中等教育": "hiroshima-chuto",
  /*
    石川。結果表は「金大附属」と略す。**国立なのでこのサイトの収録対象。**

    ★**私立の「金沢学院大学附属」と紛らわしいので、同じPDFの中で
    書き分けられていることを確かめてから書いた**（2026-08-15）:

      金大附属     → 金沢大学人間社会学域学校教育学類附属（**国立**）  ← ここで受ける
      金沢学院大附 → **私立**金沢学院大学附属（シード欄では「金沢学院大学附属」と略さず書かれている）

    学校マスタの石川県に「金沢大学」を含む学校はこの1校だけ。
  */
  "石川\t金大附属": "kanazawadaigakuningenshakaigakuikigakkokyoikugakuruifuzoku",
  /*
    岐阜（2026-08-15）。

    ★**岐阜商業は県立と市立の2校があり、学校マスタではどちらも「岐阜商業高校」。**
    規則だけでは候補が2つになって結び付かない（**曖昧なら結び付けないのが正しい動作**）。
    出典は「県岐阜商」「市岐阜商」と書き分けているので、そこだけ受ける。
    `src/lib/school-name.ts` の短縮名（`gifushogyo: "県岐阜商"` /
    `gifu-gifushogyo: "市岐阜商"`）とまったく同じ対応にしてある。

    「岐阜総合」は岐阜総合学園。`labelCandidates` は「学園」を落とさないので規則では拾えない。
  */
  "岐阜\t県岐阜商": "gifushogyo",
  "岐阜\t市岐阜商": "gifu-gifushogyo",
  "岐阜\t岐阜総合": "gifusogogakuen",
  /*
    千葉（2026-08-15）。★**同名の県立と市立が5組ある**（このリポジトリで最多）。
    学校マスタではどちらも同じ名前なので、規則だけでは候補が2つになって
    結び付かない（**曖昧なら結び付けないのが正しい動作**）。

    ★**出典は市立だけ「市立◯◯」と書き、県立は school 名だけで書く。**
    同じ表に両方の書き方が別のスロットとして載っている（市立千葉＝13番・千葉＝95番）
    ので、**「市立が付かないほうが県立」は推測ではなく表の読み取り**。
  */
  "千葉\t市立千葉": "chiba-chiba",
  "千葉\t市立船橋": "chiba-funabashi",
  "千葉\t市立柏": "chiba-kashiwa",
  "千葉\t市立松戸": "chiba-matsudo",
  "千葉\t市立銚子": "chiba-choshi",
  "千葉\t千葉": "chiba",
  "千葉\t船橋": "funabashi",
  "千葉\t柏": "kashiwa",
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

  /** 「弱い」候補は全部の学校を入れ終わってから足す（下の2周目） */
  const weakLater = [];
  for (const s of schools) {
    const district = s.prefecture?.name;
    if (!district) continue;
    const { names, weak } = labelCandidates(s.name, s.name_aliases);
    for (const label of names) {
      // **鍵は正規化した校名。** 揺れ（ケ/ヶ・旧字体・空白）で外れるのを防ぐ
      const norm = normalizeSchoolName(label);
      push(byDistrict, `${district}\t${norm}`, s);
      push(nationwide, norm, s);
    }
    // 県名を省いた略称は県内の索引にだけ入れる（上の districtOnlyCandidates 参照）
    for (const label of districtOnlyCandidates(s.name, district)) {
      push(byDistrict, `${district}\t${normalizeSchoolName(label)}`, s);
    }
    for (const label of weak) weakLater.push({ school: s, district, norm: normalizeSchoolName(label) });
  }

  /*
    ★**「弱い」候補は、その名前がまだ空いているときだけ足す。**
    中等教育学校から「中等教育学校」を落とした形（佐渡中等教育学校→佐渡）は、
    同じ県に「佐渡高校」があると**出典の「佐渡」がどちらか決まらなくなる。**
    先に入れた高校の側を優先し、空いているときだけ足す。
  */
  for (const { school, district, norm } of weakLater) {
    if (byDistrict.has(`${district}\t${norm}`)) continue;
    push(byDistrict, `${district}\t${norm}`, school);
    if (!nationwide.has(norm)) push(nationwide, norm, school);
  }

  /*
    手で書いた対応表。★**規則で引いた結果を「上書き」する**（2026-08-14 に変更）。

    以前は同じ Map に足すだけだったが、それだと**同名が2件ある学校を
    対応表で決められない。** 広島の「広島商」は県立と市立の2件があり、
    足すだけでは3件になって結局「1件に決まらない」で落ちていた。

    ★**上書きにしてよいのは、対応表が「人が出典で確かめて書いたもの」だから。**
    確かめられないものは書かない、という決まりは今までどおり
    （群馬の「前 橋」は県立か市立か確かめられず、いまも書いていない）。
  */
  /** 対応表で既に置き換えた鍵。同じ鍵に2校を割り当てる書き方（高専のキャンパス）に備える */
  const aliasKeys = new Set();
  const bySlug = new Map(schools.map((s) => [s.slug, s]));
  for (const [key, slug] of Object.entries(DISTRICT_ALIASES)) {
    const [district, label] = key.split("\t");
    const hit = bySlug.get(slug);
    if (!hit) {
      // 学校マスタ側で slug が変わったときに黙って効かなくなるのを防ぐ
      console.log(`  ⚠️ 対応表の slug「${slug}」が学校マスタに見つからない（${key}）`);
      continue;
    }
    const mapKey = `${district}\t${normalizeSchoolName(label)}`;
    /*
      同じ表記に複数の slug を割り当てている場合だけは足す
      （熊本高専の「高専八代」「高専熊本」は別表記なので衝突しない。
      衝突するのは同じ表記に2校を意図的に結び付けたいときだけ）。
    */
    if (!aliasKeys.has(mapKey)) byDistrict.set(mapKey, []);
    aliasKeys.add(mapKey);
    push(byDistrict, mapKey, hit);
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
        /*
          ★**日付を持たない試合は窓で切らない。**（2026-08-14）
          三重のように**組合せ表に日付が1つも無い**出典がある。
          窓は「いちばん新しい試合から120日」で切るものなので、
          日付が無い試合には当てられない。**1大会ぶんしか持たない**ので
          そのまま全部残す。
        */
        const dated = seasonGames.filter((g) => g.date);
        if (!dated.length) return seasonGames;
        const newest = dated.reduce((a, g) => (g.date > a ? g.date : a), "");
        const limit = new Date(`${newest}T00:00:00Z`);
        limit.setUTCDate(limit.getUTCDate() - KEEP_DAYS);
        const from = limit.toISOString().slice(0, 10);
        return seasonGames.filter((g) => !g.date || g.date >= from);
      })();

      const dates = kept.map((g) => g.date).filter(Boolean).sort();
      const dropped = seasonGames.length - kept.length;
      console.log(
        `  ${season}: ${kept.length} 試合` +
          (dates.length ? `（${dates[0]} 〜 ${dates.at(-1)}）` : "") +
          (dropped ? ` ／ 過去分 ${dropped} 件は残さない` : ""),
      );
      all.push(...kept);
    }

    /*
      ★**県外の学校に結び付けてよい大会かどうかを、大会名から決める。**（2026-08-14）

      全国の索引（`index.nationwide`）は、**地区大会に出てくる県外の相手**を
      拾うために置いてある（長野の秋の先にある北信越大会に富山商業が出る）。
      ところが**県大会にもこの受け皿が効いていたため、同名の県外校に
      結び付いていた。** 実際に出ていた誤りは次のとおり。

        愛知「愛知」   → **滋賀**県立愛知（えち）高校   ×6試合
        愛知「桜丘」   → **神奈川**県立桜丘高校         ×3試合
        愛知「東海」   → **茨城**県立東海高校           ×2試合
        神奈川「旭丘」 → **愛知**県立旭丘高校           ×7試合
        熊本「城北」   → **徳島**県立城北高校           ×10試合

      どれも出典側は**その県の私立校**を指していて、学校マスタに無いのが正しい。
      ★**校名だけを見ていると気づけない**（警告も出ない。画面に出て初めて分かる）。

      **県大会に県外の学校は出ない**ので、県大会だと分かる大会では
      全国の受け皿を使わない。判定は大会名に
      「県の名前」「県予選」「県大会」のどれかが入っているか。

        第108回全国高等学校野球選手権愛知大会   → 県内だけ
        78回春季関東高校野球大会県予選           → 県内だけ（県名は入らない）
        第154回北信越地区高等学校野球大会       → **県外あり**（受け皿を使う）

      ★**大会名が取れていないときは県内だけにする。** 分からないまま
      全国から引くと、上と同じ誤りが黙って戻る。
      **1試合を取りこぼすほうが、別の学校の戦績にするより軽い。**
    */
    const isPrefectureOnly = (tournament) =>
      !tournament || tournament.includes(adapter.district) || /県予選|県大会/.test(tournament);

    // 公立校に結び付ける
    const decorate = (t0, allowNationwide) => {
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
      /*
        県内で引けなければ全国で引く（**地区大会の県外の相手**）。
        ★**県大会では使わない**（上の `isPrefectureOnly` を参照）。
      */
      if (hits.length === 0 && allowNationwide) hits = index.nationwide.get(norm) ?? [];
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
      .map((g) => {
        const allowNationwide = !isPrefectureOnly(g.tournament);
        return { ...g, teams: g.teams.map((t) => decorate(t, allowNationwide)) };
      })
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
  // ★**日付を持たない試合は抜粋に出さない**（新しい順に選ぶので順番を決められない）
  const newestOverall =
    districts.flatMap((d) => d.games.map((g) => g.date)).filter(Boolean).sort().at(-1) ?? null;
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
      .filter((g) => g.date && (!pickupFrom || g.date >= pickupFrom))
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
    districts.flatMap((d) => d.games.map((g) => g.date)).filter(Boolean).sort().at(-1) ?? null;

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
  /*
    ★**日付を持たない試合はここに入れない**（2026-08-14）。
    「いちばん新しい試合の季節」で決めるので、順番の付けられない試合は使えない。
    その県は勝ち上がりにも出ないが、県のページには出る。
  */
  const spotlightSeason =
    districts
      .flatMap((d) => d.games)
      .filter((g) => g.date)
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
  /** 一部の回戦しか公開しない出典。足りない側の警告を出さない（`partial`） */
  const partialDistricts = new Set(ADAPTERS.filter((a) => a.partial).map((a) => a.slug));

  for (const [key, byRound] of gamesPerRound) {
    for (const [round, expected, mode] of TAIL_ROUNDS) {
      const actual = byRound.get(round);
      // その回戦にまだ達していない大会は検算の対象外
      if (actual === undefined) continue;
      if (mode === "atLeast" ? actual >= expected : actual === expected) continue;
      if (actual < expected && partialDistricts.has(key.split("\t")[0])) continue;
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
  /** 1試合も取れなかった県。CIの判断に使うので数えておく */
  const empty = [];
  for (const { allGames: _allGames, ...d } of districts) {
    /*
      ★**1試合も取れなかった県のファイルを書き換えない。**

      出典のサイトは作り替えられる。取れなくなった県をそのまま書き出すと
      **`games: []` で上書きされ、その県のページから試合が消える。**
      CIは3時間おきに回るので、気づいたときには「消えたコミット」が
      積み重なっている。前の実行までの中身を残すほうが、まだ嘘が少ない。

      **鳴らしっぱなしにしないこと。** 大会の谷間ではなく出典側の変更なら、
      アダプタを直すまでデータは古いままになる。
    */
    if (d.games.length === 0) {
      empty.push(d.district);
      console.log(`  ⚠️ ${d.district}: 1試合も取れなかった。${d.slug}.ts は書き換えない`);
      continue;
    }
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

  /*
    ★**空の抜粋で上書きしない。**

    全県が取れなかった回（相手のサイトがまとめて落ちている、こちらの
    ネットワークが死んでいる）に空の抜粋を書くと、**トップの速報カードが
    「いまは掲載できる地方大会の結果がありません」になる。**
    県ごとのファイルは無事なのに、トップだけが空になる。
    1県でも取れていれば書く（その回の抜粋がその県に偏るのは許容する）。
  */
  if (!picked.length && existsSync(OUT_PICKUP)) {
    console.log(
      `  ⚠️ 1件も抜粋できなかった。${path.relative(ROOT, OUT_PICKUP)} は書き換えない` +
        (empty.length ? `（取れなかった県: ${empty.join("・")}）` : ""),
    );
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
