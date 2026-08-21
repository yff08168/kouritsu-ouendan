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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { fetchPdfPages } from "./lib/pdf-text.mjs";
import {
  assembleSlotBracket,
  explodeNumberRuns,
  joinSplitDates,
  orientPage,
  splitLeadingMark,
  stripInningMarks,
  stripVerticalInningMarks,
  stripVerticalNotes,
} from "./lib/slot-bracket.mjs";
import { readHsbBracket } from "./lib/svg-bracket.mjs";
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
    /*
      ★**決勝だけラベルの書き方が違う表がある**（2026-08-16。静岡）。

      枝の試合は `4岡②`（日＋球場記号＋第何試合）と1断片にまとまっているのに、
      **決勝だけは中央に「27日」「10:00」「決勝」「（草薙）」と縦に積まれている。**
      `parseLabel` では1件も取れないので、

        - `datesExcludeFinal` … 「表の日付の個数＝試合数」の検算から決勝を外す
        - `finalLabel`        … 決勝の日付・球場を中央から別に読む
                                （`(中央の断片, 球場の凡例) => {date, venue}`。
                                 **球場は凡例の記号を返すこと**。名前への変換は下でやる）

      ★**決勝の日付が読めなくても他の試合は出す。** 105試合を1つのラベルで
      落とすのは割に合わない。**推測では埋めず null のまま**にして警告を出す。
    */
    datesExcludeFinal = false,
    finalLabel,
    /** 連合チームの略称 → 展開した校名。凡例が行で読めない表のため（鹿児島の `連合①`） */
    expand,
    /** 表の別の場所に書いてある優勝校と決勝のスコア。**合わなければ1試合も出さない** */
    verify,
    /** 校名の掃除（字間の空白など） */
    cleanName = (s) => s,
    /** 半分ごとの読み取り範囲。既定は境目で2つに割るだけ */
    ranges,
    /** ★スコアが「連結線の両端」に書かれる表（山口）。`slot-bracket.mjs` の説明を読むこと */
    hitSpan = false,
    /** ★離れた「回」を巻き込む表（宮崎）。`stripInningMarks` の説明を読むこと */
    inningMarkGap,
    /**
     * ★**継続試合の注記**（例 `/継続試合/`）。日付の個数の検算で、
     * **この個数だけ超過を認める**（継続試合は開始日と再開日の2つを持つため）。
     * 渡さなければ今までどおり完全一致を要求する。
     */
    continuationMark,
    /*
      ★**大会名から年を出す**（2026-08-17。山口の春季のため）。

      既定は選手権の「第N回 + 1918」。**春季・秋季には回数が無い**ので、
      そのままだと `match(...)[1]` が例外になる（`第\d+回` に当たらない）。
      山口の春は `令和8年度春季山口県高等学校野球大会` なので `2018 + N` で出す。
      ★**元号は年度。** 春（4〜5月）と秋（8〜10月）はどちらも暦年と一致するが、
      **1〜3月の大会に使うときは食い違う**ので、そのときは渡す側で直すこと。
    */
    yearOf = (t) => Number(t.match(/第(\d+)回/)?.[1]) + 1918,
  } = opts;
  const flat = raw.lines.map((l) => normalize(l.text.replace(/\t/g, "")));
  const tournament = flat.map((t) => t.match(titlePattern)?.[0]).find(Boolean);
  if (!tournament) return null;
  // 既定は選手権の回数 = 年 - 1918（`build-live-results.mjs` と同じ）
  const year = yearOf(tournament);
  if (!Number.isFinite(year)) {
    console.log(`  ⚠️ ${district}: 大会名「${tournament}」から年を出せない。1試合も出さない`);
    return [];
  }

  const page = stripInningMarks(raw, inningMarkGap === undefined ? undefined : { maxGap: inningMarkGap });
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
        hitSpan,
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
  /** ★決勝だけ書き方が違う表（静岡）。中央の断片から日付・球場（＝凡例の記号）を読む */
  const fromLabel = finalLabel ? finalLabel(mid, venues) : null;
  const finalDate =
    fromLabel?.date ??
    finalPair?.date ??
    nearest(mid.filter((i) => /^\d{1,2}\/\d{1,2}[(（]?$/.test(i.t)))?.t.replace(/[(（]$/, "");
  const finalVenue =
    fromLabel?.venue ?? (finalPair ? finalPair.venue : (nearest(mid.filter((i) => symbols.has(i.t)))?.t ?? null));
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
  /*
    ★**出典が出場チーム数を書いていることがある**（2026-08-16。宮崎の
    お知らせ本文「ともに夏を戦い抜いた47校46チームへの敬意と感謝を胸に」）。

    上の「チーム数 − 試合数 = 1」は**組み立てた結果どうしの整合**しか見ていない。
    スロットを1つ読み落とせばチーム数も試合数も一緒に減るので、この検算は通る。
    **表の外から来る実数**と突き合わせれば、その取りこぼしを止められる。
  */
  if (verify?.teams && teams !== verify.teams) {
    console.log(`  ⚠️ ${district}: ${teams} チームを読んだが、出典は ${verify.teams} チームと書いている。1試合も出さない`);
    return [];
  }
  if (hasDates) {
    const printed = raw.lines
      .flatMap((l) => l.items)
      .filter((i) => {
        const t = i.text.trim();
        return parseLabel ? Boolean(parseLabel(t)?.date) : /^\d{1,2}\/\d{1,2}[(（]?$/.test(t);
      }).length;
    /** ★決勝だけラベルの形が違う表（静岡）では、決勝は枝の日付に含まれない */
    const branches = datesExcludeFinal ? built.slice(0, -1) : built;
    /*
      ★★**継続試合は日付を2つ持つ**（2026-08-17。山口の春季）。

      雨で中断した試合は翌日に再開されるので、紙には**開始日と再開日の両方**が書かれる
      （山口の春は準決勝第2試合が 4/26 → 4/27。連盟のお知らせにも
      「準決勝の第2試合が降雨の為、継続試合になりました」とある）。
      日付の個数と試合数はその1件ぶんだけ食い違う。

      ★**「1件くらいずれてもよい」にしないこと。** この検算は
      「日付を1つ取りこぼした」「別の回戦の日付を拾った」を捕まえるためにある。
      **紙が「継続試合」と書いている個数だけ**超過を認める。
      書いていない表では今までどおり完全一致を要求する
      （`continuationMark` を渡さなければ 0 件）。
    */
    const continued = continuationMark
      ? raw.lines.flatMap((l) => l.items).filter((i) => continuationMark.test(i.text.trim())).length
      : 0;
    if (printed !== branches.length + continued) {
      console.log(
        `  ⚠️ ${district}: 表の日付が ${printed} 件、組み立てた試合が ${branches.length} 件` +
          (continued ? `（継続試合 ${continued} 件ぶんを見込んでも合わない）` : "") +
          "。1試合も出さない",
      );
      return [];
    }
    if (branches.some((g) => !g.date)) {
      console.log(`  ⚠️ ${district}: 日付の読めない試合がある。1試合も出さない`);
      return [];
    }
    // ★決勝の日付だけは、読めなくても推測で埋めずに null のまま出す
    if (datesExcludeFinal && !built.at(-1).date) {
      console.log(`  ⚠️ ${district}: 決勝の日付が中央から読めなかった。決勝だけ日付なしで出す`);
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
    /*
      ★**準優勝校まで書いていない出典もある**（2026-08-16。山口）。
      連盟のお知らせは「高川学園が優勝を飾りました」とだけ書く。
      **優勝校だけでも、決勝の相手が違えば片方は必ず食い違う**ので検算にはなる
      （石川で通ってしまった「構造は合うのに決勝の相手が違う」もここで止まる）。
    */
    const ok =
      same(verify.champion, champ) &&
      (!verify.runnerUp || same(verify.runnerUp, runner)) &&
      (!verify.score || (score[0] === verify.score[0] && score[1] === verify.score[1]));
    if (!ok) {
      const printed = verify.score ? ` ${verify.score[0]}-${verify.score[1]} ` : " / ";
      console.log(
        `  ⚠️ ${district}: 決勝が出典の記載と合わない` +
          `（記載「${verify.champion}${verify.runnerUp ? printed + verify.runnerUp : ""}」/ ` +
          `組み立て「${champ} ${score[0]}-${score[1]} ${runner}」）。1試合も出さない`,
      );
      return [];
    }
  }
  console.log(
    `  （${tournament}: ${built.length} 試合 / 優勝 ${pair[0] > pair[1] ? A : B} / ${teams} チーム` +
      (hasDates ? "" : "・**日付なし**") + "）",
  );
  /*
    ★**組み立てた試合をそのまま出せるようにしておく**（`BRACKET_DEBUG=1`。2026-08-17）。
    生成物には**公立が絡む試合しか残らない**ので、私立どうしの試合は
    画面にもJSONにも出ず、**そこが合っているかを確かめる手段が無かった**
    （山口の春は準決勝以降の4校が全部私立で、継続試合の日付を確認できなかった）。
  */
  if (process.env.BRACKET_DEBUG) {
    for (const g of built) {
      console.log(`  [debug] ${g.date ?? "日付なし"} ${g.round} ${g.a} ${g.sa}-${g.sb} ${g.b}`);
    }
  }

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
 * 山形県高等学校野球連盟（`yamagata-hbf.org`）。
 * ★**「一球速報の県」に分類していたが誤りだった**（2026-08-16）。
 * 連盟は結果を **Google Drive** に置いていて、omyutech とは無関係。
 *
 * ------------------------------------------------------------------
 * ★ なぜ Drive のファイルIDを直に持っているのか
 *
 *   連盟のサイトはReactのSPAで、**Driveへのリンクは omyutech の告知API
 *   （`other-api.omyutech.com/otherapi/rest`）からしか辿れない。**
 *   そのAPIのパス名は難読化された遅延チャンクの中にあり、追いかけても
 *   **サイトを作り直すたびに壊れる**（chunkのハッシュごと変わる）。
 *
 *   ★**IDを固定しても大会中は自動で追随する。** 連盟は**同じファイルを
 *   上書き更新**しているため（お知らせは6/25付なのに、PDFには7/26の決勝まで
 *   入っていた）。人が手を入れるのは**新しい大会になったときだけ**。
 *
 *   ★**大会名はPDFから読む。** IDと一緒に大会名を書くと、
 *   ファイルが差し替わったときに**古い大会名のまま出る**。
 *
 * ------------------------------------------------------------------
 * ★ 紙の形（スコア表。組み立ても推測も要らない）
 *
 *   開催日   回戦   球場   試合開始時間   一塁側  ー  三塁側   備考
 *   7月10日(金)  ﾔﾏﾘｮｰｽﾀｼﾞｱﾑ山形
 *            1回戦        12時30分   創学館 17 ー 7 米沢東   8回コールド
 *
 *   見出し行が列の x をくれる。★**開催日と球場はセルが縦に結合されていて、
 *   変わったときだけ書かれる**ので、行を上から順に見て持ち回る。
 *
 *   ★**回戦の欄は中央揃え。** 「準々決勝」は4文字なので x=98 から始まり、
 *   「1回戦」（104）「準決勝」（102）より左に出る。**列の左端を 104 にすると
 *   準々決勝の4試合だけ落ちる**（実際に落ちて 32/36 になった）。
 *
 *   ★**スコアが空の行は「予定」**（順延で組み直されたぶん）。同じ対戦が
 *   空欄と結果ありで2回出てくる。**空欄のほうは捨てる。**
 *   ★**サヨナラは `11x`**。`Number("11x")` は NaN。
 *
 * ------------------------------------------------------------------
 * ★ 検算
 *
 *   - のべ出場校 − 試合数 = 1（37 − 36）
 *   - **やぐら表のPDFに「優勝：◯◯ 準優勝：◯◯」**があり、決勝の結果と突き合わせる
 *   - 2026年（第108回）は 5+16+8+4+2+1 = 36試合、優勝 鶴岡東（決勝 5-0 山形城北）で一致
 *
 * **規約**: 連盟のサイトに転載の制限は無い。robots.txt は全許可。
 * 結果PDFは Google Drive にあり、**omyutech からは1件も取っていない。**
 */
const yamagata = {
  slug: "yamagata",
  district: "山形",
  name: "山形県高等学校野球連盟",
  siteUrl: "https://www.yamagata-hbf.org/",
  politenessMs: 2000,
  // **夏だけ。** 春季・秋季も同じ形のPDFが出るか確かめてから足すこと
  seasons: { summer: "https://www.yamagata-hbf.org/" },
  /*
    ★**Google Drive のファイルID。新しい大会になったら人が入れ替える。**
    連盟のトップ → お知らせ「第N回…山形大会【勝ち上がり】・【試合結果一覧】」
    → 各リンクの `drive.google.com/file/d/<ここ>/view`。
    **大会名は書かない**（PDFから読む）。
  */
  files: {
    summer: {
      results: "1lbzp2D9qaueOlUr4jLinl1bEMfZ6fCHq",
      bracket: "1p-nBzeXkCDs4Joapx5_TaxD-T9gQfJPO",
    },
  },
  async collect({ season }) {
    const ids = this.files[season];
    if (!ids) return [];
    const drive = (id) => `https://drive.google.com/uc?export=download&id=${id}`;
    const results = await fetchPdfPages(drive(ids.results), { headers: UA });
    await sleep(this.politenessMs);
    if (!results?.length) {
      console.log("  ⚠️ 山形: 試合結果一覧のPDFが読めない。ファイルIDが差し替わった可能性がある");
      return [];
    }
    const bracket = ids.bracket ? await fetchPdfPages(drive(ids.bracket), { headers: UA }) : null;
    await sleep(this.politenessMs);
    return this.readSheet(results, bracket, season);
  },
  readSheet(pages, bracket, season) {
    const flat = pages.flatMap((p) => p.lines.map((l) => normalize(l.text.replace(/\t/g, ""))));
    const tournament = flat.map((t) => t.match(/第\d+回全国高等学校野球選手権山形大会/)?.[0]).find(Boolean);
    if (!tournament) {
      console.log("  ⚠️ 山形: PDFに大会名が無い。中身が変わった可能性がある");
      return [];
    }
    // 選手権の回数は 年 - 1918
    const year = Number(tournament.match(/第(\d+)回/)[1]) + 1918;
    const ROUND = /^(\d+回戦|準々決勝|準決勝|決勝)$/;

    const games = [];
    let date = null;
    let venue = null;
    for (const page of pages) {
      for (const line of page.lines) {
        const txt = (lo, hi) =>
          line.items.filter((i) => i.x >= lo && i.x < hi).sort((a, b) => a.x - b.x).map((i) => i.text).join("").replace(/\s+/g, "");

        const d = normalize(txt(0, 100)).match(/(\d{1,2})月(\d{1,2})日/);
        if (d) date = `${year}-${String(+d[1]).padStart(2, "0")}-${String(+d[2]).padStart(2, "0")}`;
        const v = txt(140, 240);
        if (v && !/^\d/.test(v)) venue = v;

        // ★列の左端は 90。104 にすると「準々決勝」（中央揃えで x=98）が落ちる
        const round = normalize(txt(90, 145));
        if (!ROUND.test(round)) continue;

        const a = txt(300, 365);
        const b = txt(420, 478);
        const bar = txt(385, 398);
        const sa = normalize(txt(365, 385));
        const sb = normalize(txt(398, 420));
        if (!a || !b || !/^[ー―—-]$/.test(bar)) {
          console.log(`  ⚠️ 山形: 読めない行がある（${round}・${a} ${bar} ${b}）。1試合も出さない`);
          return [];
        }
        // ★スコアが空の行は「予定」。順延で組み直されたぶんが同じ対戦で2回出る
        if (!sa && !sb) continue;
        // ★サヨナラは `11x`
        const na = sa.match(/^(\d{1,2})[xX×]?$/);
        const nb = sb.match(/^(\d{1,2})[xX×]?$/);
        if (!na || !nb) {
          console.log(`  ⚠️ 山形: スコアが読めない（${a} ${sa}-${sb} ${b}）。1試合も出さない`);
          return [];
        }
        if (!date) {
          console.log("  ⚠️ 山形: 日付の分からない試合がある。1試合も出さない");
          return [];
        }
        games.push({
          date, season, tournament, round, venue,
          teams: [
            { display: a, score: +na[1], won: +na[1] > +nb[1] },
            { display: b, score: +nb[1], won: +nb[1] > +na[1] },
          ],
        });
      }
    }
    if (!games.length) return [];

    // ---- 検算 ----
    const teams = new Set(games.flatMap((g) => g.teams.map((t) => t.display)));
    if (teams.size - games.length !== 1) {
      console.log(`  ⚠️ 山形: ${teams.size} チームに対し ${games.length} 試合（${teams.size - 1} のはず）。1試合も出さない`);
      return [];
    }
    /*
      ★**やぐら表のPDFに「優勝：◯◯ 準優勝：◯◯」**が書いてある。
      **結果表とは別の紙から来る事実**なので、決勝の結果と突き合わせる。
    */
    if (bracket?.length) {
      const bt = bracket.flatMap((p) => p.lines.map((l) => l.text.replace(/[\t\s]/g, ""))).join("\n");
      const champion = bt.match(/優勝：(\S+?)準優勝/)?.[1] ?? null;
      const runnerUp = bt.match(/準優勝：([^【\s]+)/)?.[1] ?? null;
      const final = games.filter((g) => g.round === "決勝").at(-1);
      const same = (x, y) => Boolean(x) && Boolean(y) && (x.includes(y) || y.includes(x));
      if (champion && runnerUp && final) {
        const win = final.teams.find((t) => t.won)?.display;
        const lose = final.teams.find((t) => !t.won)?.display;
        if (!same(champion, win) || !same(runnerUp, lose)) {
          console.log(
            `  ⚠️ 山形: 決勝がやぐら表と合わない（表「${champion} / ${runnerUp}」/ 結果「${win} / ${lose}」）。1試合も出さない`,
          );
          return [];
        }
      }
    }
    console.log(`  （${tournament}: ${games.length} 試合 / ${teams.size} チーム・**スコア表から**）`);
    return games;
  },
};

/**
 * ★**omyutech の「お知らせ」APIを読む**（2026-08-16 に足した。静岡・山口・宮崎・茨城）。
 *
 * ------------------------------------------------------------------
 * ★ これは一球速報のスコアではない
 *
 *   9県の連盟サイトは omyutech 製の同じReact SPAで、**お知らせの本文と
 *   添付ファイルだけがこのAPIから来る。** 中身は連盟が書いた文章と
 *   連盟が作ったPDFで、**一球速報のスコアデータ（`baseballapi`）ではない。**
 *   運営者の判断（2026-08-16）は「**連盟が作った文書なら omyutech の
 *   置き場からでも取る。スコアAPIからは取らない**」なので、ここはその範囲。
 *
 * ------------------------------------------------------------------
 * ★ なぜ「Drive のIDを直書きする」（山形）ではなくAPIを読むのか
 *
 *   山形のときは「**告知APIのパスは難読化された遅延チャンクの中にあり、
 *   サイトを作り直すたびに壊れる**」としてIDを直書きした。
 *   ★**2026-08-16 に測り直したところ、これは違った。**
 *   APIの入口（`other-api.omyutech.com/otherapi/rest`）と `leagueId` は
 *   **チャンクのハッシュが変わっても同じ**で、`leagueId` は県ごとの定数。
 *   直書きが必要なのは `leagueId` だけで済む。
 *
 *   静岡はIDの直書きでは**そもそも足りない。** 結果PDFに**月も年も
 *   書かれていない**（日付が「4」「27」だけ）ので、お知らせの掲載日が要る。
 *   優勝・準優勝も**PDFではなくお知らせの本文**に書かれている（＝検算材料）。
 *
 * @param leagueId 県ごとの定数。連盟サイトの `main.*.chunk.js` の `leagueId=NNN`
 * @param type "N"（お知らせ）/ "T"（トピック）
 */
async function fetchOmyuNews(leagueId, type = "N") {
  const j = await fetchOmyuJson(`newsandtopic/list?userID=&language=&leagueId=${leagueId}&type=${type}`);
  return j?.news ?? null;
}

/** お知らせ1件の本文（HTML）。添付リンクは本文の `<a href>` に入っている */
async function fetchOmyuNewsBody(leagueId, newsId) {
  const j = await fetchOmyuJson(`newsandtopic/detail?userID=&language=&leagueId=${leagueId}&newsId=${newsId}`);
  if (!j?.datas) return null;
  // TT＝見出し／TD＝掲載日／TR＝本文。**本文は複数に分かれることがある**ので全部つなぐ
  return j.datas.filter((d) => d.type === "TR").map((d) => d.content ?? "").join("\n");
}

/**
 * ★**`retCode` を必ず見ること。** このAPIは中身が空でも HTTP 200 を返す
 * （`{"retCode":0,...,"news":[]}`）。パラメータを1つ落とすと 400 の**HTML**が返り、
 * `res.json()` が例外になるので、そこも握って null にする。
 */
async function fetchOmyuJson(pathAndQuery) {
  const url = `https://other-api.omyutech.com/otherapi/rest/${pathAndQuery}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(3000 * attempt);
    try {
      const res = await fetch(url, {
        headers: { ...UA, Accept: "application/json" },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) continue;
      const j = await res.json();
      return j?.retCode === 0 ? j : null;
    } catch {
      // 次の試行へ
    }
  }
  return null;
}

/**
 * 静岡県高等学校野球連盟（`shizuoka-hbf.com`）。
 * ★**「一球速報の県」に分類していたが誤りだった**（2026-08-16）。
 * 連盟は結果を **Google Drive** に置いていて、スコアは omyutech から取っていない。
 *
 * ------------------------------------------------------------------
 * ★ 出典の流れ
 *
 *   お知らせAPI（`fetchOmyuNews`）→「第108回全国高等学校野球選手権静岡大会結果」
 *   → 本文の Drive リンク → **やぐら表（結果入り）のPDF 1枚**
 *
 *   ★**お知らせの本文がそのまま検算材料になる。**
 *   「優　勝　聖隷クリストファー高校／準優勝　常葉大菊川高校」と書いてある。
 *   **表の枝とは別の場所から来る事実**なので、千葉と同じ強さの検算ができる
 *   （優勝だけでなく**準優勝まで**突き合わせられる）。
 *
 * ------------------------------------------------------------------
 * ★ 紙の形（左右2段組のスロット格子。千葉・広島と同じ向き）
 *
 *   左 … スロット1〜53（x≒138）、校名は x=51〜121、回戦は右へ 180→279
 *   右 … スロット54〜106（x≒452）、校名は x=466〜535、回戦は左へ 409→309
 *   決勝 … 中央 x=289/299。106チーム・105試合
 *
 *   ★**シード記号（◎○△）は校名とは別の列**（左 x=37／右 x=550）にあるので、
 *   千葉と同じく**列ごと外す**（`ranges`）。
 *
 * ------------------------------------------------------------------
 * ★ ここで踏んだところ
 *
 *   1. ★**PDFに月も年も書かれていない。** 日付のラベルは `4岡②`
 *      （4日・浜岡球場・第2試合）で、**日しか無い。** 鹿児島は開催期間の行から
 *      月を決められたが、静岡の紙にはその行が無い。
 *      **お知らせの掲載日（`createTime`）から決める。** 掲載は決勝の当日〜翌日なので、
 *      掲載日より大きい日は前の月とみなす（6月開幕の年に備える）。
 *      ★**年も回数（`回 - 1918`）と掲載年の一致で確かめる。**
 *   2. ★**決勝だけラベルの形が違う**（中央に「27日」「10:00」「決勝」「（草薙）」と
 *      縦に積まれる）。`datesExcludeFinal` と `finalLabel` はこのために足した
 *   3. ★**球場の凡例が「愛：愛鷹」で、名前に「球場」も「スタジアム」も入らない。**
 *      広島・鹿児島の凡例の拾い方（名前に球場と入っているものだけ）では0件になる。
 *      **先にラベルから記号の集合を作り、その記号の凡例だけを拾う。**
 *   4. 中央の縦書き「優勝 聖隷クリストファー」は**数字を含まない**ので、
 *      千葉のような（24年振り6回目）の誤検出は起きない
 *
 * **規約**: 連盟のサイトに転載の制限は無い。robots.txt は全許可
 * （`data/federation-sites.json`）。結果PDFは Google Drive にあり、
 * **一球速報のスコアAPIからは1件も取っていない。**
 *
 * ★**春季・秋季は紙の形が違う**（スロットが横一列で回戦が上へ伸びる京都型。
 * 日付と球場も別々の断片になる）。**確かめてから足すこと。**
 */
const shizuoka = {
  slug: "shizuoka",
  district: "静岡",
  name: "静岡県高等学校野球連盟",
  siteUrl: "https://shizuoka-hbf.com/",
  politenessMs: 2000,
  /*
    ★**夏と春の2季**（春は 2026-08-19 に追加。下の「春季」の節を読むこと）。
    秋季はまだ大会の途中で、**「勝ち上がり表（8/16終了時）」しか出ていない。**
  */
  seasons: { summer: "https://shizuoka-hbf.com/", spring: "https://shizuoka-hbf.com/" },
  /** 連盟ごとの定数。`main.*.chunk.js` の `leagueId=221` */
  leagueId: 221,
  async collect({ season }) {
    if (season === "spring") return this.collectSpring();
    if (season !== "summer") return [];
    const news = await fetchOmyuNews(this.leagueId);
    if (!news) {
      console.log("  ⚠️ 静岡: お知らせの一覧が取れない。出典の作りが変わった可能性がある");
      return [];
    }
    const posts = news
      .filter((n) => /第\d+回全国高等学校野球選手権静岡大会結果/.test(normalize(n.title ?? "")))
      // **新しい順に見る**（前年ぶんのお知らせが下に残っている）
      .sort((a, b) => String(b.createTime).localeCompare(String(a.createTime)));
    if (!posts.length) {
      console.log("  ⚠️ 静岡: 選手権の結果のお知らせが見つからない");
      return [];
    }

    for (const post of posts.slice(0, 2)) {
      await sleep(this.politenessMs);
      const body = await fetchOmyuNewsBody(this.leagueId, post.newsId);
      if (!body) continue;
      const fileId = body.match(/drive\.google\.com\/file\/d\/([\w-]{20,})/)?.[1];
      if (!fileId) {
        console.log(`  ⚠️ 静岡: 「${post.title}」に結果PDFのリンクが無い`);
        continue;
      }

      /*
        ★**優勝・準優勝は本文から読む。** 「準優勝」にも「優勝」が入っているので、
        **先に準優勝を取り、その部分を消してから優勝を取る。**
      */
      const text = normalize(plain(body));
      const runnerUp = text.match(/準\s*優\s*勝\s*(\S+?)(?:高等学校|高校)/)?.[1] ?? null;
      const champion =
        text.replace(/準\s*優\s*勝\s*\S+?(?:高等学校|高校)/, "").match(/優\s*勝\s*(\S+?)(?:高等学校|高校)/)?.[1] ??
        null;
      if (!champion || !runnerUp) {
        console.log(`  ⚠️ 静岡: 「${post.title}」に優勝・準優勝の記載が無い。検算できないので1試合も出さない`);
        return [];
      }

      /*
        ★**月と年は紙に書かれていない。** お知らせの掲載日から決める。
        掲載は決勝の当日〜翌日なので、**掲載日より大きい日は前の月。**
      */
      const stamp = String(post.createTime).match(/^(\d{4})\D(\d{1,2})\D(\d{1,2})$/);
      if (!stamp) {
        console.log(`  ⚠️ 静岡: お知らせの掲載日が読めない（${post.createTime}）。月を決められないので1試合も出さない`);
        return [];
      }
      const [, py, pm, pd] = stamp.map(Number);
      const monthOf = (day) => (day <= pd ? pm : ((pm + 10) % 12) + 1);
      // ★選手権の回数は 年 - 1918。掲載年と食い違ったら、前年のお知らせを見ている
      const round = Number(normalize(post.title).match(/第(\d+)回/)?.[1]);
      if (round + 1918 !== py) {
        console.log(`  ⚠️ 静岡: 第${round}回（${round + 1918}年）のお知らせが ${py} 年に掲載されている。1試合も出さない`);
        return [];
      }

      const parsed = await fetchPdfPages(`https://drive.google.com/uc?export=download&id=${fileId}`, { headers: UA });
      await sleep(this.politenessMs);
      if (!parsed?.length) {
        console.log(`  ⚠️ 静岡: 「${post.title}」の結果PDFが読めない`);
        continue;
      }
      for (const raw of parsed) {
        const games = this.readSheet(raw, season, { champion, runnerUp }, monthOf);
        if (games) return games;
      }
    }
    return [];
  },
  /** 1枚のやぐら表を読む。**組めなければ null**（呼び出し側は次のPDFへ） */
  readSheet(raw, season, verify, monthOf) {
    const flat = raw.lines.map((l) => normalize(l.text.replace(/\t/g, "")));
    if (!flat.some((t) => /第\d+回全国高等学校野球選手権静岡大会/.test(t))) return null;

    /*
      ★**ラベルは `4岡②`（日＋球場記号＋第何試合）。**
      丸数字まで揃っているものだけを見る。中央の「27日」を
      「27日・球場『日』」と読んでしまわないための歯止めでもある。
    */
    const LABEL = /^(\d{1,2})([^\d\s：:])[①-⑳]$/;
    const symbols = new Set();
    for (const l of raw.lines) {
      for (const it of l.items) {
        const m = normalize(it.text.trim()).match(LABEL);
        if (m) symbols.add(m[2]);
      }
    }
    if (!symbols.size) {
      console.log("  ⚠️ 静岡: 日付のラベル（`4岡②` の形）が1つも無い。紙の形が変わった可能性がある");
      return [];
    }

    /*
      ★**凡例は「愛：愛鷹」で、名前に「球場」も「スタジアム」も入らない。**
      広島・鹿児島の拾い方（名前で絞る）では0件になるので、
      **ラベルに出てきた記号のぶんだけ**拾う。
    */
    const venues = new Map();
    for (const l of raw.lines) {
      for (const m of l.text.matchAll(/(?:^|\t)([^\t\s])\s*[：:]\s*([^\t]+?)(?=\t|$)/g)) {
        if (symbols.has(m[1]) && !venues.has(m[1])) venues.set(m[1], m[2].trim());
      }
    }
    const missing = [...symbols].filter((s) => !venues.has(s));
    if (missing.length) console.log(`  （静岡: 凡例に無い球場の記号 ${missing.join("・")}。球場名なしで出す）`);

    const parseLabel = (t) => {
      const m = normalize(t).match(LABEL);
      if (!m || !symbols.has(m[2])) return null;
      const day = Number(m[1]);
      return { date: `${monthOf(day)}/${day}`, venue: m[2] };
    };

    /*
      ★**決勝だけは中央に「27日」「10:00」「決勝」「（草薙）」と縦に積まれている。**
      球場は括弧の中の短い名前（「草薙」）なので、**凡例の名前に含まれる記号**を探す
      （記号を返すのは、名前への変換を呼び出し側と1か所にそろえるため）。
    */
    const finalLabel = (mid, legend) => {
      const day = mid.map((i) => normalize(i.t).match(/^(\d{1,2})日$/)?.[1]).find(Boolean);
      const paren = mid.map((i) => i.t.match(/^[（(]([^）)]+)[）)]$/)?.[1]).find(Boolean);
      const sym = paren ? ([...legend].find(([, name]) => name.includes(paren))?.[0] ?? null) : null;
      return { date: day ? `${monthOf(Number(day))}/${Number(day)}` : null, venue: sym };
    };

    return readTwoColumnBracket(raw, {
      district: "静岡",
      titlePattern: /第\d+回全国高等学校野球選手権静岡大会/,
      // 左右で分ける境目。スロット列は x≒138 と x≒452 にあり、その中間
      half: 295,
      // 2桁のスコアが1〜2ポイント左にずれるだけなので、千葉と同じ狭さでよい
      rowTolerance: 3,
      // 左は上から、右は下から読む（スロットは縦、校名は横書き）
      nameOrder: ["asc", "desc"],
      season,
      hasDates: true,
      datesExcludeFinal: true,
      finalAt: "innermost",
      finalLabel,
      parseLabel,
      verify,
      venueLegend: () => venues,
      /*
        ★**シード記号の列と、決勝の欄を範囲ごと外す。**

        左 … 記号 x=37 ／ 校名 x=51〜121 ／ 回戦 180〜279
        右 … 回戦 309〜409 ／ 校名 x=466〜535 ／ 記号 x=550

        ★**境目で割るだけでは組めない**（2026-08-16 に実際に落ちた）。
        決勝のスコア（左 x=289／右 x=299）は境目のすぐ内側にあり、
        **半分ごとの準決勝（279／309）と同じ帯にまとめられてしまう**
        （帯のまとめ幅は回戦の間隔の0.45＝約10ポイント）。
        準決勝の帯の数字が3個になり「必要2個」で止まった。
        **決勝は `finalAt: "innermost"` が元のページから別に読む**ので、
        半分の側からは外してよい。
      */
      ranges: [
        [45, 284],
        [306, 545],
      ],
      // 字間の空白を詰める（日本の校名に空白は入らない）
      cleanName: (s) => s.replace(/\s+/g, ""),
    });
  },

  /*
    ------------------------------------------------------------------
    ★ 春季（春季東海地区高校野球 静岡県大会）。2026-08-19 に追加
    ------------------------------------------------------------------

    ★★**夏と紙の形がまるで違う。** 夏は「左右2段組・スロットは縦」だが、
    春は**京都と同じ「スロットが横一列・回戦は上へ」**なので、
    `readTwoColumnBracket` ではなく `assembleSlotBracket` を直に呼ぶ。

    ★ ここで踏んだところ

      1. ★★**日付の帯がスコアの帯の 11〜12 ポイント下にある。**
         回戦をまとめる既定の幅（回戦の間隔の 0.45 ＝ 13〜15）に収まるので、
         **日付がスコアと一緒の帯にまとめられ**、数字がちょうど 1.5 倍になって
         （2回戦は 32 + 16 = 48）必ず落ちた。`roundBandGap: 6` で上限を切る。
         ★**日付はスコアと同じ中点の上に置かれる**ので、位置では見分けが付かない
      2. ★**日付は「19」「25」だけで月が無い。**
         紙の下の日程欄（`月 日 曜 試合 …`）から**日→月**の対応を作る。
         ★**月は変わったときにしか印字されない**ので、上から読んで持ち回る。
         ★**裸の数字を日付として返してよいのは**、`assembleSlotBracket` が
         「個数がその回戦の試合数と一致する帯」を日付の帯として選ぶから
         （スコアの帯は個数が2倍なので選ばれない）
      3. ★**校名の下に日程欄と球場の凡例がある。**
         校名は「スロット行より下」を全部拾うので、そのままだと
         **「浜松商」が「浜松商１・２回戦（11）２回戦（12）…」になる**（実際になった）。
         ★**列（x）では切れない** —— 日程欄は x=457〜668 で、スロット22〜33 の校名と重なる。
         ★**行の間隔で切る** —— 校名どうしは最大 8.6 ポイントしか空かないのに対し、
         校名の最終行と日程欄は 25.1 ポイント空いている
      4. ★★**球場は出さない。** 記号（`草①`）は**日付とは別の行**にあり、
         スコアの帯の 22 ポイント下＝**1つ前の回戦の帯にも届く距離**にある。
         いちばん近い記号を採ると 2回戦の試合に 1回戦の球場が付きうる
         （実測でスロット 1.87 の 2回戦に、0.17 しか離れていない 1回戦の記号がある）。
         **確かめられない割り当てはしない。**
         ★夏は `4岡②` と**日付と球場が1つの断片**なので、この心配が無い
      5. **3位決定戦がある**（聖隷クリストファー 2-3 日大三島）。
         ★**出さない。** 勝ち抜きの枝ではないので「チーム数 − 試合数 = 1」に乗らない。
         日程欄との突き合わせでだけ数に入れる

    ★ 検算（合わなければ**1試合も出さない**）

      - 39チーム − 38試合 = 1
      - ★**お知らせ本文の優勝校と準優勝校の両方**が決勝と一致（千葉と同じ強さ）
      - ★**日程欄の合計**（球場ごとの試合数を全部足したもの＝39）が、
        組み立てた試合数（＋紙に「三位」があれば1）と一致。**枝とは別の場所の事実**
      - 全38試合の日付が読めている
      - 「回数 + 1953」とお知らせの掲載年が一致（第73回＝2026年）
  */
  async collectSpring() {
    const news = await fetchOmyuNews(this.leagueId);
    if (!news) {
      console.log("  ⚠️ 静岡: お知らせの一覧が取れない。出典の作りが変わった可能性がある");
      return [];
    }
    /*
      ★**「地区予選」を必ず外す。** 同じ春に
      「第73回春季東海地区高校野球静岡県大会予選　結果」（＝県大会に出る前の予選）
      という別のお知らせがあり、紙の形が違う。
      ★**題に「東海地区」が入らない年がある**（2026は「第73回春季高校野球静岡県大会結果」）
      ので、「春季」＋「静岡県大会」＋「結果」で拾う。
    */
    const posts = news
      .map((n) => ({ ...n, title: normalize(n.title ?? "") }))
      .filter((n) => /春季/.test(n.title) && /静岡県大会/.test(n.title) && /結果/.test(n.title))
      .filter((n) => !/予選|組み?合わ?せ|軟式/.test(n.title))
      .sort((a, b) => String(b.createTime).localeCompare(String(a.createTime)));
    if (!posts.length) {
      console.log("  ⚠️ 静岡: 春季県大会の結果のお知らせが見つからない");
      return [];
    }

    for (const post of posts.slice(0, 2)) {
      await sleep(this.politenessMs);
      const body = await fetchOmyuNewsBody(this.leagueId, post.newsId);
      const fileId = body?.match(/drive\.google\.com\/file\/d\/([\w-]{20,})/)?.[1];
      if (!fileId) {
        console.log(`  ⚠️ 静岡: 「${post.title}」に結果PDFのリンクが無い`);
        continue;
      }
      /*
        ★**優勝・準優勝は本文から読む**（夏と同じ。「準優勝」にも「優勝」が
        入っているので、**先に準優勝を取り、その部分を消してから優勝を取る**）。
      */
      const text = normalize(plain(body));
      const runnerUp = text.match(/準\s*優\s*勝\s*(\S+?)(?:高等学校|高校)/)?.[1] ?? null;
      const champion =
        text.replace(/準\s*優\s*勝\s*\S+?(?:高等学校|高校)/, "").match(/優\s*勝\s*(\S+?)(?:高等学校|高校)/)?.[1] ??
        null;
      if (!champion || !runnerUp) {
        console.log(`  ⚠️ 静岡(春): 「${post.title}」に優勝・準優勝の記載が無い。検算できないので1試合も出さない`);
        return [];
      }
      /*
        ★**春季東海地区大会の回数は「年 − 1953」**（第73回＝2026年、第71回＝2024年）。
        夏の「年 − 1918」とは別なので使い回さないこと。
      */
      const round = Number(normalize(post.title).match(/第(\d+)回/)?.[1]);
      const py = Number(String(post.createTime).slice(0, 4));
      if (!Number.isFinite(round) || round + 1953 !== py) {
        console.log(
          `  ⚠️ 静岡(春): 第${round}回（${round + 1953}年）のお知らせが ${py} 年に掲載されている。1試合も出さない`,
        );
        return [];
      }

      const parsed = await fetchPdfPages(`https://drive.google.com/uc?export=download&id=${fileId}`, { headers: UA });
      await sleep(this.politenessMs);
      if (!parsed?.length) {
        console.log(`  ⚠️ 静岡: 「${post.title}」の春季の結果PDFが読めない`);
        continue;
      }
      for (const raw of parsed) {
        const games = this.readSpringSheet(raw, { champion, runnerUp }, py);
        if (games) return games;
      }
    }
    return [];
  },

  /** 春季のやぐら表を1枚読む。**組めなければ null**（呼び出し側は次のPDFへ） */
  readSpringSheet(raw, verify, year) {
    const flat = raw.lines.map((l) => normalize(l.text.replace(/\t/g, "")));
    const tournament = flat.map((t) => t.match(/第\d+回春季[^\t]*?静岡県大会/)?.[0]).find(Boolean);
    if (!tournament) return null;

    /*
      ★**スロット行（1〜39 が横一列）を探す。** 整数の断片がいちばん多い行。
      日程欄の行にも数字が並ぶが、こちらは39個あるので勝つ。
    */
    const slotLine = raw.lines.reduce((best, l) => {
      const n = l.items.filter((i) => /^\d+$/.test(i.text.trim())).length;
      return n > (best?.n ?? 0) ? { y: l.y, n } : best;
    }, null);
    if (!slotLine || slotLine.n < 8) {
      console.log("  ⚠️ 静岡(春): スロット番号の行が見つからない。紙の形が変わった可能性がある");
      return [];
    }

    /*
      ★★**校名の下にある日程欄と球場の凡例を、行ごと落としてから渡す**（上の3）。
      **決め打ちの座標にしない**（表が伸び縮みしても付いていく）。
    */
    const NAME_GAP = 12;
    let floor = slotLine.y;
    for (const l of raw.lines.filter((l) => l.y < slotLine.y).sort((a, b) => b.y - a.y)) {
      if (floor - l.y > NAME_GAP) break;
      floor = l.y;
    }
    const cropped = { page: raw.page, lines: raw.lines.filter((l) => l.y >= floor) };

    // ---- 日 → 月。**月は変わったときにしか印字されない**ので上から持ち回る ----
    const monthByDay = this.springMonths(raw);
    if (!monthByDay) return [];

    /*
      ★★**日付の行を先に見分けて `4/19` の形に書き換えてから渡す。**

      ★**「裸の数字を日付として返す `parseLabel`」にしてはいけない**
      （一度そう書いて失敗した）。**スコアも裸の数字**なので、日程欄に載っている日と
      同じ数（4・5・6・10 など）が片端から日付になる。組み立て側は
      「個数がその回戦の試合数と一致する帯」を日付の帯として選ぶが、
      **帯を決められなかったときは窓の中の候補を全部返す**ので、
      **スコア由来の偽の日付が混ざって「5/10」のような日が付く**（実際に付いた）。

      ★**行で見分ける。** 日付の行は**その行の数字が全部、日程欄に載っている日**。
      スコアの行には必ず 0・1・7・8 のような「日程欄に無い数」が混ざる
      （この紙では6つの回戦すべてでそうなっている）。
      ★**数字以外の断片があってもよい** —— 決勝の日付の行には、
      中央の縦書き「日大三島」の「日」が同じ高さに来る。
    */
    const dayOf = (t) => {
      const m = normalize(String(t).trim()).match(/^(\d{1,2})$/);
      return m ? Number(m[1]) : null;
    };
    const dayRows = [];
    for (const l of cropped.lines) {
      if (l.y <= slotLine.y) continue;
      const ns = l.items.map((i) => dayOf(i.text)).filter((v) => v !== null);
      if (!ns.length || ns.some((v) => !monthByDay.has(v))) continue;
      dayRows.push({ y: l.y, count: ns.length });
    }
    dayRows.sort((x, y) => x.y - y.y);

    const withDates = {
      page: cropped.page,
      lines: cropped.lines.map((l) => {
        if (!dayRows.some((r) => r.y === l.y)) return l;
        const items = l.items.map((i) => {
          const d = dayOf(i.text);
          return d === null ? i : { ...i, text: `${monthByDay.get(d)}/${d}` };
        });
        return { ...l, items, text: items.map((i) => i.text).join("\t") };
      }),
    };

    const built = assembleSlotBracket(withDates, {
      roundLabels: ["決勝", "準決勝", "準々決勝"],
      /*
        ★**日付の帯がスコアの帯の 11〜12 ポイント下にある**（上の1）。
        この紙はスコアが1行も割れていないので 6 で足りる。
      */
      roundBandGap: 6,
    });
    if (!built) {
      console.log(`  ⚠️ 静岡: ${tournament} の組合せ表を組み立てられなかった。1試合も出さない`);
      return [];
    }

    /*
      ---- 検算0: 日付の行の並びが、組み立てた回戦ごとの試合数と一致する ----

      ★**日付の行はスコアの行とは別に印字されている**ので、
      「スコアでない行を回戦として読んだ」「回戦を1つ飛ばした」をここで捕まえられる。
      39チームなら下から 7・16・8・4・2・1。

      ★**下から数えたぶんだけを見る。** 決勝より上には**3位決定戦のスコア（2-3）と
      日付（3）**があり、どちらも「日程欄に載っている日」だけでできているので
      日付の行に見える。決勝までで打ち切れば混ざらない。
    */
    const perRound = [];
    for (const g of built.games) {
      if (!perRound.length || perRound.at(-1).round !== g.round) perRound.push({ round: g.round, n: 0 });
      perRound.at(-1).n += 1;
    }
    const counts = dayRows.slice(0, perRound.length).map((r) => r.count);
    if (counts.length !== perRound.length || counts.some((n, i) => n !== perRound[i].n)) {
      console.log(
        `  ⚠️ 静岡(春): 日付の行が [${counts.join(",")}] で、組み立てた回戦 ` +
          `[${perRound.map((r) => `${r.round}${r.n}`).join(",")}] と合わない。1試合も出さない`,
      );
      return [];
    }

    // ---- 検算1: チーム数 − 試合数 = 1 ----
    if (built.teams - built.games.length !== 1) {
      console.log(
        `  ⚠️ 静岡(春): ${built.teams} チームに対し ${built.games.length} 試合（${built.teams - 1} のはず）。1試合も出さない`,
      );
      return [];
    }

    /*
      ---- 検算2: 日程欄の合計 ----
      ★**枝とは別の場所に作られた表**（日ごと・球場ごとの試合数）。
      3位決定戦は枝ではないので組み立てには入らない。
      紙に「三位」の見出しがあるときだけ、1件の超過を認める。
    */
    const printedTotal = this.springScheduleTotal(raw);
    const thirdPlace = flat.some((t) => /三位|３位/.test(t)) ? 1 : 0;
    if (printedTotal !== null && printedTotal !== built.games.length + thirdPlace) {
      console.log(
        `  ⚠️ 静岡(春): 日程欄の合計 ${printedTotal} 試合に対し組み立ては ${built.games.length} 試合` +
          (thirdPlace ? "（3位決定戦1件を見込んでも合わない）" : "") +
          "。1試合も出さない",
      );
      return [];
    }

    // ---- 検算3: お知らせの優勝校・準優勝校 ----
    const final = built.games.at(-1);
    const [champ, runner] = final.sa > final.sb ? [final.a, final.b] : [final.b, final.a];
    const same = (a, b) =>
      normalizeSchoolName(a).includes(normalizeSchoolName(b)) ||
      normalizeSchoolName(b).includes(normalizeSchoolName(a));
    if (!same(verify.champion, champ) || !same(verify.runnerUp, runner)) {
      console.log(
        `  ⚠️ 静岡(春): 決勝がお知らせと合わない（お知らせ「${verify.champion} / ${verify.runnerUp}」` +
          `／ 組み立て「${champ} / ${runner}」）。1試合も出さない`,
      );
      return [];
    }

    // ---- 検算4: 日付の読めない試合が無い ----
    const undated = built.games.filter((g) => !g.date).length;
    if (undated) {
      console.log(`  ⚠️ 静岡(春): 日付の読めない試合が ${undated} 件。1試合も出さない`);
      return [];
    }

    console.log(`  （${tournament}: ${built.games.length} 試合 / 優勝 ${champ} / ${built.teams} チーム）`);
    return built.games.map((g) => {
      const [mm, dd] = g.date.split("/");
      return {
        date: `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`,
        season: "spring",
        tournament,
        round: g.round,
        // ★球場は出さない（上の4）
        venue: null,
        teams: [
          { display: g.a, score: g.sa, won: g.sa > g.sb },
          { display: g.b, score: g.sb, won: g.sb > g.sa },
        ],
      };
    });
  },

  /**
   * ★**日程欄から「日 → 月」を作る**（枝の日付には月が書かれていない）。
   *
   *   月 日 曜 試 合            草 清 愛 浜 掛 磐
   *   4 18 土 １・２回戦（11）  3  2  2  2  2
   *     19 日 ２回戦（12）      2  2  2  2  2  2
   *
   * ★**月は変わったときにしか印字されない**ので、上から読んで持ち回る。
   * 同じ日が2つの月に出てきたら**その紙は読めない**として null を返す
   * （春は4〜5月にまたがるが、日は重ならない）。
   */
  springMonths(raw) {
    const header = raw.lines.find((l) => /(^|\t)月\t日\t曜/.test(l.text));
    if (!header) {
      console.log("  ⚠️ 静岡(春): 日程欄の見出し（月 日 曜）が無い。月を決められないので1試合も出さない");
      return null;
    }
    const at = (l, x) => l.items.find((i) => Math.abs(i.x - x) <= 6 && /^\d{1,2}$/.test(i.text.trim()));
    const mx = header.items.find((i) => i.text.trim() === "月")?.x ?? 0;
    const dx = header.items.find((i) => i.text.trim() === "日")?.x ?? 0;
    const map = new Map();
    let month = null;
    for (const l of raw.lines.filter((l) => l.y < header.y).sort((a, b) => b.y - a.y)) {
      const m = at(l, mx);
      const d = at(l, dx);
      if (m) month = Number(m.text.trim());
      if (!d || !month) continue;
      const day = Number(d.text.trim());
      if (map.has(day) && map.get(day) !== month) {
        console.log(`  ⚠️ 静岡(春): ${day}日が ${map.get(day)}月と ${month}月の両方にある。月を決められない`);
        return null;
      }
      map.set(day, month);
    }
    if (!map.size) {
      console.log("  ⚠️ 静岡(春): 日程欄から日付を1つも読めない。1試合も出さない");
      return null;
    }
    return map;
  },

  /**
   * ★**日程欄の球場ごとの試合数を全部足す**（＝その大会の総試合数）。
   * 枝とは別に作られた表なので、**組み立ての取りこぼしを止められる。**
   * 読めなければ null（この検算だけを飛ばす）。
   */
  springScheduleTotal(raw) {
    const header = raw.lines.find((l) => /(^|\t)月\t日\t曜/.test(l.text));
    if (!header) return null;
    // 球場ごとの列は「試 合」の右。見出しの記号のうちいちばん左を境目にする
    const dx = header.items.find((i) => i.text.trim() === "日")?.x ?? 0;
    const from = Math.min(...header.items.filter((i) => i.x > dx + 60).map((i) => i.x));
    if (!Number.isFinite(from)) return null;
    let total = 0;
    for (const l of raw.lines.filter((l) => l.y < header.y)) {
      for (const i of l.items) {
        const t = i.text.trim();
        if (i.x >= from - 6 && /^\d{1,2}$/.test(t)) total += Number(t);
      }
    }
    return total || null;
  },
};

/**
 * 山口県高等学校野球連盟（`yamaguchi-hbf.com`）。
 * ★**「一球速報の県」に分類していたが誤りだった**（2026-08-16）。
 * 連盟は結果を **omyutech のファイル置き場**（`safe-api.omyutech.com/webdata/`）に
 * 自分で置いている。**スコアAPI（`baseballapi`）からは1件も取っていない。**
 *
 * ------------------------------------------------------------------
 * ★ 出典の流れ
 *
 *   お知らせ一覧（leagueId=235・type=N）
 *     → 「108選手権：高川学園が優勝を飾りました。」
 *     → 本文のPDFリンク → **やぐら表1枚（50チーム・49試合）**
 *
 *   ★**「日別の試合結果PDF」ではなかった。** お知らせは「7/26の試合結果です」と
 *   日別に見えるが、**添付はどれも同じやぐら表の途中経過**で、日ごとに
 *   新しい1枚が上がるだけ。**最後の1枚（優勝を伝えるお知らせ）に全部入っている。**
 *
 *   ★**検算材料は優勝校だけ**（準優勝は書かれていない）。
 *   お知らせの見出しから読む。**表の枝とは別の場所から来る事実**なので、
 *   石川で通ってしまった「構造は合うのに決勝の相手が違う」はここで止まる。
 *
 * ------------------------------------------------------------------
 * ★ 紙の形（左右2段組のスロット格子。静岡・千葉と同じ向き）
 *
 *   左 … スロット1〜25（x≒135）・校名 x=44〜114・回戦は右へ 165→267
 *   右 … スロット26〜50（x≒454）・校名 x=467〜543・回戦は左へ 426→324
 *   決勝 … 中央 x=279/313
 *
 * ------------------------------------------------------------------
 * ★ ここで踏んだところ
 *
 *   1. ★**球場は試合ごとではなく「ブロックごと」に縦書きされている**
 *      （左 x=26 に `岩国会場` `周南会場`、右 x=556）。1文字ずつの縦書きなので、
 *      **そのまま読むと校名の列（スロット行より下）に混ざる。**
 *      `ranges` で列ごと外し、**球場は出さない**（推測で1試合ずつに割り当てない）。
 *      シード記号（１⃣🄐⑤）も同じ列にあるので一緒に落ちる
 *   2. **2桁のスコアが4ポイントほど左にずれる**（左は右揃え・右は左揃えで
 *      揃え方が逆）。`rowTolerance` は広げず、**組み立て側のまとめ（回戦の
 *      間隔の0.45＝約12ポイント）に任せる**。広げると日付の帯と混ざる
 *   3. ★**決勝の日付だけ `nearest` で拾えない。** 中央の帯には準決勝・
 *      準々決勝の日付も入っている。**中央（左右の境目）にいちばん近い日付**を
 *      決勝のものとする（`finalLabel`）
 *   4. **コールドと延長の注記が同じ列に混ざる**（`7回コールド` `延長11回`）。
 *      数字ではないので `numbersOf` は拾わない
 *
 * ------------------------------------------------------------------
 * ★ 検算（合わなければ**1試合も出さない**）
 *
 *   - 50チーム − 49試合 = 1
 *   - 表に書かれた日付が49件（9+8+4+2+1 ＋ 決勝1 ＋ 1+2+4+8+9）
 *   - **お知らせの優勝校と決勝の勝者が一致**
 *   - 「回数 − 1918」とお知らせの掲載年が一致
 *
 * **規約**: 連盟のサイトに転載の制限は無い。robots.txt は全許可
 * （`data/federation-sites.json`）。
 *
 * ★**夏だけ。** 春季・秋季・新人・一年生大会の結果PDFも同じ置き場にあるが、
 * **紙の形を確かめてから足すこと。**
 */
const yamaguchi = {
  slug: "yamaguchi",
  district: "山口",
  name: "山口県高等学校野球連盟",
  siteUrl: "https://yamaguchi-hbf.com/",
  politenessMs: 2000,
  /*
    ★**春季も同じ入口から取れる**（2026-08-17）。
    お知らせ「春季大会：高川学園が優勝を飾りました。」の本文に
    **「春季大会やぐら」PDF**があり、**夏とまったく同じ形の表**だった
    （左右2段組・スロット列が x≒134 と x≒454）。

    ★**秋季も足した**（2026-08-21）。秋（令和N年度山口県スポーツ大会高校野球競技(硬式)）は
    **「地区予選」と「県決勝大会」の2枚**で、**地区予選は1枚から8校が勝ち上がる。**
    夏・春とは紙の形も読み方もまるで違うので、**別の道**（`collectAutumn`）にしてある。
    ★**「枚をまたぐ検算」がそのまま使える**（県決勝大会の出場8校 ＝ 地区予選の代表8校）。
  */
  seasons: {
    summer: "https://yamaguchi-hbf.com/",
    spring: "https://yamaguchi-hbf.com/",
    autumn: "https://yamaguchi-hbf.com/",
  },
  /** 連盟ごとの定数。`main.*.chunk.js` の `leagueId=235` */
  leagueId: 235,
  /** 左右の境目。スロット列は x≒135 と x≒454 にあり、その中間 */
  half: 295,
  /**
   * 季節ごとの見分け方。
   *
   * ★**見出しは大会そのものの名前ではなく略称**（連盟が「以下、春季大会と表記」と
   * 宣言して以降ずっとその略称を使う）。`post` は一覧の見出し、`title` は紙の表題。
   */
  bySeason: {
    summer: {
      /*
        ★**「選手権」かつ「優勝」の見出しを探す。**
        同じ一覧に春季・秋季・新人・一年生・中国大会の優勝の知らせも並ぶ
        （どれも「選手権」が付かない）。**軟式は別の大会**なので外す。
      */
      post: (t) => /選手権/.test(t) && /優勝/.test(t) && !/軟式/.test(t),
      title: /第\d+回全国高等学校野球選手権山口大会/,
      // 選手権の回数は 年 - 1918
      yearOf: (t) => Number(t.match(/第(\d+)回/)?.[1]) + 1918,
      /*
        左 … 記号・球場 x=26 ／ 校名 x=44〜114 ／ 回戦 165〜267（決勝279は外す）
        右 … 回戦 324〜426（決勝313は外す）／ 校名 x=467〜543 ／ **記号・球場 x=556**
      */
      ranges: [
        [40, 273],
        [318, 550],
      ],
    },
    spring: {
      /*
        ★**「春季中国大会」を必ず外すこと。** 中国地区大会は県大会ではないうえ、
        他県の学校が混ざる。文字列としては「春季大会」を含まないが、
        **見出しの書き方は年ごとに変わる**ので明示的に外しておく。
        新人・一年生の大会も「春季」が付かないので混ざらない。
      */
      post: (t) => /春季/.test(t) && /優勝/.test(t) && !/軟式|中国/.test(t),
      title: /令和\d+年度春季山口県高等学校野球大会/,
      // ★春季には回数が無い。令和N年 = 2018 + N（春は年度と暦年が一致する）
      yearOf: (t) => 2018 + Number(t.match(/令和(\d+)年度/)?.[1]),
      /*
        ★★**右端が夏と違う。** 春はシード記号が **x=545.6**（夏は x=556）にあり、
        夏と同じ `550` で切ると**記号が校名にくっつく**
        （`高川学園②` `山口県桜ケ丘③` `宇部工業⑥` `南陽工業⑦` の4件が出た）。
        春の校名は x=527.4 の断片（幅14.4）までなので **543 で切る。**
        ★記号を文字で消さないこと（千葉の「宣」の件）。**列で外す。**
      */
      ranges: [
        [40, 273],
        [318, 543],
      ],
    },
  },
  async collect({ season }) {
    // ★秋季は紙の形がまるで違う（下の `collectAutumn` の説明を読むこと）
    if (season === "autumn") return this.collectAutumn();
    const cfg = this.bySeason[season];
    if (!cfg) return [];
    const news = await fetchOmyuNews(this.leagueId);
    if (!news) {
      console.log("  ⚠️ 山口: お知らせの一覧が取れない。出典の作りが変わった可能性がある");
      return [];
    }
    const posts = news
      .map((n) => ({ ...n, title: normalize(n.title ?? "") }))
      .filter((n) => cfg.post(n.title))
      .sort((a, b) => String(b.createTime).localeCompare(String(a.createTime)));
    if (!posts.length) {
      console.log(`  ⚠️ 山口: ${season} の優勝を伝えるお知らせが見つからない`);
      return [];
    }

    for (const post of posts.slice(0, 2)) {
      /*
        ★**見出しの書き方は年によって違う**（2026「108選手権：高川学園が優勝を…」／
        2025「第107回選手権山口大会は、高川学園が優勝を…」）。
        **句読点や「：」をまたがない**ようにすれば、どちらでも校名だけが取れる。
      */
      const champion = post.title.match(/([^\s、。「」（）()：:]+)が[^。]{0,20}優勝/)?.[1] ?? null;
      if (!champion) {
        console.log(`  ⚠️ 山口: 「${post.title}」から優勝校を読めない。検算できないので飛ばす`);
        continue;
      }
      const year = Number(String(post.createTime).slice(0, 4));

      await sleep(this.politenessMs);
      const body = await fetchOmyuNewsBody(this.leagueId, post.newsId);
      const url = body?.match(/https?:\/\/[^"']+\.pdf/)?.[0];
      if (!url) {
        console.log(`  ⚠️ 山口: 「${post.title}」にPDFのリンクが無い`);
        continue;
      }
      const parsed = await fetchPdfPages(url, { headers: UA });
      await sleep(this.politenessMs);
      if (!parsed?.length) {
        console.log(`  ⚠️ 山口: 「${post.title}」のPDFが読めない`);
        continue;
      }
      for (const raw of parsed) {
        const games = this.readSheet(raw, season, { champion }, year);
        if (games) return games;
      }
    }
    return [];
  },
  /** 1枚のやぐら表を読む。**組めなければ null**（呼び出し側は次のPDFへ） */
  readSheet(raw, season, verify, postYear) {
    const cfg = this.bySeason[season];
    const flat = raw.lines.map((l) => normalize(l.text.replace(/\t/g, "")));
    const title = flat.map((t) => t.match(cfg.title)?.[0]).find(Boolean);
    if (!title) return null;
    /*
      ★**紙の年と、お知らせの掲載年が合っているか見る。**
      合わなければ**前年のお知らせを読んでいる**（一覧は数年ぶん残っている）。
      夏は「第N回 = 年 - 1918」、春は「令和N年度 = 2018 + N」。
    */
    const sheetYear = cfg.yearOf(title);
    if (sheetYear !== postYear) {
      console.log(
        `  ⚠️ 山口: ${sheetYear} 年の表（${title}）が ${postYear} 年のお知らせに付いている。1試合も出さない`,
      );
      return [];
    }

    const half = this.half;
    /*
      ★**決勝の日付は「中央にいちばん近いもの」を取る。**
      中央の帯には準決勝（7/26）・準々決勝（7/24）の日付も入っているので、
      既定の「決勝のスコアにいちばん近い」では拾い分けられない。
      決勝の欄（x=291）は左右の境目のほぼ真上にある。
    */
    const finalLabel = (mid) => {
      const dates = mid.filter((i) => /^\d{1,2}\/\d{1,2}[(（]?$/.test(i.t));
      if (!dates.length) return null;
      const near = dates.reduce((p, c) => (Math.abs(c.x - half) < Math.abs(p.x - half) ? c : p));
      return { date: near.t.replace(/[(（]$/, ""), venue: null };
    };

    /*
      ★**シード記号と校名がくっついた断片を割ってから渡す**（春のスロット1だけ）。
      `① 下 関 国 際` が x=36.2 から始まる1つの断片で、**記号の列（x≒36）を
      外す `ranges` に丸ごと巻き込まれて校名が消えていた。**
      割れば記号は x≒36、校名は x≒57 になり、**今までどおり列で外せる。**
      ★記号を文字で消さないこと（千葉の「宣」の件）。
    */
    const page = splitLeadingMark(raw, /^([①-⑳])\s+(\S.*)$/);

    const games = readTwoColumnBracket(page, {
      district: "山口",
      titlePattern: cfg.title,
      yearOf: cfg.yearOf,
      half,
      // 広げないこと。2桁のずれ（4ポイント）は組み立て側のまとめが吸収する
      rowTolerance: 2,
      // 左は上から、右は下から読む（スロットは縦、校名は横書き）
      nameOrder: ["asc", "desc"],
      season,
      hasDates: true,
      finalAt: "innermost",
      finalLabel,
      verify,
      /*
        ★**この表は全回戦でスコアを「連結線の両端」に置く。**
        既定の窓（中点から0.95スロット）では2回戦の16個が1つも入らず、
        **3回戦の帯が2回戦として選ばれて**組み立てが止まった。
      */
      hitSpan: true,
      /*
        ★★**中央の縦書きが、遠くのスコアを消す**（2026-08-17。春で判明。宮崎と同じ形）。

        春の表は中央（x≒294）に「（３年ぶり**８回**目の優勝）」を縦書きしている。
        その `回` と**同じ行**にあるのは、**103ポイント左**の2回戦のスコア `9`（x=190.7）で、
        `stripInningMarks` がこれをコールドの「9回」とみなして消していた
        （2回戦の数字が16個必要なところ15個になり、組み立てが止まった）。

        ★**この紙のコールドは `５回コールド` と1つの断片**なので、
        「回」だけの断片は中央の縦書きしか無い。**30ポイントで十分に切れる**
        （本物の隣接は1文字ぶん＝5〜15ポイント）。
        ★**夏も同じ値を渡している。** 夏の生成物が変わらないことは確認済み。
      */
      inningMarkGap: 30,
      /*
        ★**継続試合は日付を2つ持つ**（春の準決勝第2試合が 4/26 → 4/27。
        連盟のお知らせにも「降雨の為、継続試合になりました」と書いてある）。
        紙が「継続試合」と書いている個数ぶんだけ、日付の検算で超過を認める。
        ★**日付そのものは下の `dropContinuationDates` で落とす**（この紙は
        再開日を枝ではなく注記の列に書くので、`pickDate` では拾えない）。
      */
      continuationMark: /継続試合/,
      /*
        ★**ブロックごとの球場（縦書き）とシード記号の列を、範囲ごと外す。**
        ★**春と夏で右端が違う**ので `bySeason` に持たせてある（下を見ること）。

        決勝のスコアを外すのは静岡と同じ理由（半分ごとの準決勝と同じ帯に
        まとめられて数字が3個になる）。決勝は `finalAt: "innermost"` が別に読む。
      */
      ranges: cfg.ranges,
      /*
        ★**コールド・延長の注記がスロット番号の列に混ざる。**
        `5回コールド`（x=134）`５回コールド`（x=131）`6回コールド`（x=133）が
        **スロット番号（x=134〜135）とほぼ同じ列**にあり、校名として読まれる
        （実際に `聖光５回コールド` `6回コールド宇部鴻城` が出た）。
        列で切り分けられないので、**校名の側で落とす。**

        ★**「⾧」は康熙部首の「長」**（U+2FA7 ではなく Kangxi Radicals ブロック）。
        このPDFは `⾧門` `延⾧11回` と部首のほうを使っており、そのままだと
        **画面に見慣れない字が出るうえ、学校マスタとも結び付かない。**
        NFKC は部首を通常の漢字に寄せるので、**その範囲の字だけ**に掛ける
        （全体に掛けると「光英ＶＥＲＩＴＡＳ」のような全角ラテンまで潰れる）。
      */
      cleanName: (s) =>
        s
          .replace(/[⼀-⿟]/g, (c) => c.normalize("NFKC"))
          .replace(/\s+/g, "")
          .replace(/[0-9０-９]{1,2}回コールド/g, "")
          .replace(/延長[0-9０-９]{1,2}回/g, ""),
    });

    return this.dropContinuationDates(page, games);
  },
  /**
   * ★★**秋季は「1枚から複数の代表が出るブロック表」**（2026-08-21 実装）。
   *
   * ------------------------------------------------------------------
   * ★ 紙が2枚ある
   *
   *   | 紙 | 中身 |
   *   |---|---|
   *   | **地区予選** | 4会場のブロック表が**上下2段に横並び**。**1枚から8校**が勝ち上がる |
   *   | **県決勝大会** | その8校の勝ち抜き（準々決勝→決勝）＋3位決定戦 |
   *
   *   どちらも**お知らせの「◯/◯の試合結果」に付くPDF**で、
   *   **毎日おなじ紙が上書きで更新される**（最新の1本が完成版）。
   *   ★**新しいお知らせから順に開いて、種類ごとに最初に組めたものを使う。**
   *
   * ------------------------------------------------------------------
   * ★★ ブロックの切れ目は探さない
   *
   *   `assembleSlotBracket({ winners: 4 })` に段ごと渡す。
   *   ★**各段で隣どうしを組む**ので、**どのブロックも段数が同じなら
   *   切れ目を知らなくても組は正しくなる**（兵庫は①〜⑯の見出しで切ったが、
   *   この紙には見出しが無い。**推測で切らないぶん、こちらのほうが安全**）。
   *
   *   ★★**そのかわり「段数が同じ」は検算で担保すること。** 下の検算Aが効く。
   *
   * ------------------------------------------------------------------
   * ★★ 検算（4つ。1つでも合わなければ秋季を1試合も出さない）
   *
   *   | | 中身 |
   *   |---|---|
   *   | A | **組み立てた8校のブロック代表が、紙に刷ってある代表校名と一致**（`🄓山口県桜ケ丘` の形で段の上に並ぶ） |
   *   | B | **地区予選のチーム数 − 試合数 = 8**（勝ち抜きの算数。代表が8校なので） |
   *   | C | ★★**県決勝大会の出場8校が、地区予選の代表8校と過不足なく一致**（**枚をまたぐ検算**。兵庫と同じ形でいちばん強い） |
   *   | D | **県決勝大会の優勝校が、お知らせの本文と一致**（「下関国際が4年ぶり3回目の優勝」） |
   *
   * ------------------------------------------------------------------
   * ★ ここで踏んだところ
   *
   *   1. ★★**日付が `9/` と `26` の2断片に割れている**（県決勝大会）。
   *      割れた `26` `25` が**ちょうどスロットの境目に乗る**ので、
   *      **1回戦の帯として本物のスコアより先に選ばれた。** → `joinSplitDates`
   *   2. ★★**縦書きの注記がスロット番号の行より下まで伸びる**（地区予選）。
   *      `延長１０回` の `回` がスロット48の校名に入り、**`宇部` が `回宇部`** になった。
   *      `stripVerticalInningMarks` は「`回` の真上の数字」しか消さない。 → `stripVerticalNotes`
   *   3. ★★**長い連合チーム名が2列に組まれている。** 縦書きは**右の列から**読む。
   *      左から読むと `南陽・下関中等教育高森・柳井商工・新`（末尾の「新」が浮く）、
   *      右から読むと **`高森・柳井商工・新南陽・下関中等教育`**（4校の連合）で意味が通る。
   *      → `nameColumns: "desc"`
   *   4. ★**「◯◯会場」の行がスロット番号の行のすぐ下にある**（県決勝大会）。
   *      そのままだと `周南会場南陽工業` になる。**行ごと落とす**
   *      （8つとも「会場」で終わる行。**文字では消さない**）。
   *   5. ★**部首の「⾧」**（康熙部首）が使われている。夏・春の `cleanName` と同じ扱いで、
   *      **部首の範囲だけ NFKC に寄せる**（全体に掛けると全角ラテンが潰れる）。
   *
   * ------------------------------------------------------------------
   * ★ 球場は出さない
   *
   *   地区予選は**球場名がブロックの上に見出しとして**置かれているだけで、
   *   **試合ごとの記号が無い。** 座標の近さで割り当てるのは推測になる。
   *   県決勝大会は `絆` `オ` の記号があるが、**準々決勝の帯に4つと2つが別の高さに散っており**、
   *   どれがどの試合か紙からは決められない。**静岡の春と同じ判断で出さない。**
   */
  async collectAutumn() {
    const news = await fetchOmyuNews(this.leagueId);
    if (!news) {
      console.log("  ⚠️ 山口: お知らせの一覧が取れない。出典の作りが変わった可能性がある");
      return [];
    }
    const posts = news
      .map((n) => ({ ...n, title: normalize(n.title ?? "") }))
      .filter((n) => /秋季県大会/.test(n.title) && !/軟式|中国/.test(n.title))
      .sort((a, b) => String(b.createTime).localeCompare(String(a.createTime)));
    if (!posts.length) {
      console.log("  ⚠️ 山口: 秋季県大会のお知らせが見つからない");
      return [];
    }
    /*
      ★**優勝校はお知らせの見出しから取る**（検算D）。
      「秋季県大会は、下関国際が4年ぶり3回目の優勝を飾りました。」
      ★**見つからなければ検算Dだけ飛ばす**（優勝の知らせが出るのは大会の最後だけ）。
    */
    const champion =
      posts.map((p) => p.title.match(/([^\s、。「」（）()：:]+)が[^。]{0,20}優勝/)?.[1]).find(Boolean) ?? null;

    let district = null;
    let final = null;
    let sheets = 0;
    for (const post of posts) {
      if (district && final) break;
      if (sheets >= this.maxAutumnSheets) break;
      await sleep(this.politenessMs);
      const body = await fetchOmyuNewsBody(this.leagueId, post.newsId);
      const urls = [...new Set([...(body ?? "").matchAll(/https?:\/\/[^"'\s]+\.pdf/g)].map((m) => m[0]))];
      for (const url of urls) {
        if (district && final) break;
        if (sheets >= this.maxAutumnSheets) break;
        sheets += 1;
        const parsed = await fetchPdfPages(url, { headers: UA });
        await sleep(this.politenessMs);
        if (!parsed?.length) continue;
        const raw = this.fixRadicals(parsed[0]);
        const flat = raw.lines.map((l) => normalize(l.text.replace(/\t/g, "")).replace(/\s+/g, ""));
        const title = flat.map((t) => t.match(/令和\d+年度山口県スポーツ大会高校野球競技\(硬式\)(地区予選|県決勝大会)/)?.[0]).find(Boolean);
        if (!title) continue;
        // ★元号は年度。秋（9〜10月）は暦年と一致する
        const year = 2018 + Number(title.match(/令和(\d+)年度/)[1]);
        if (/地区予選/.test(title) && !district) district = this.readAutumnDistrict(raw, title, year);
        else if (/県決勝大会/.test(title) && !final) final = this.readAutumnFinal(raw, title, year);
      }
    }
    if (!district || !final) {
      console.log(
        `  ⚠️ 山口: 秋季の紙がそろわない（地区予選 ${district ? "○" : "×"} / 県決勝大会 ${final ? "○" : "×"}）。1試合も出さない`,
      );
      return [];
    }

    /*
      ---- 検算C: 枚をまたぐ ----
      ★★**このリポジトリでいちばん強い検算**（兵庫と同じ形）。
      地区予選の組み立てを1ブロックでも間違えれば、代表が必ずどれか食い違う。
    */
    const want = [...district.champions].sort();
    const got = [...final.teams].sort();
    if (want.length !== got.length || want.some((t, i) => t !== got[i])) {
      console.log(
        `  ⚠️ 山口: 県決勝大会の出場校が、地区予選の代表と合わない` +
          `（地区予選 ${want.join("・")} / 県決勝大会 ${got.join("・")}）。1試合も出さない`,
      );
      return [];
    }

    // ---- 検算D: お知らせの本文が書いている優勝校 ----
    if (champion && final.champion && !(champion.includes(final.champion) || final.champion.includes(champion))) {
      console.log(
        `  ⚠️ 山口: 秋季の優勝校がお知らせと合わない（お知らせ「${champion}」/ 組み立て「${final.champion}」）。1試合も出さない`,
      );
      return [];
    }

    console.log(
      `  （${district.tournament}: ${district.games.length} 試合 / ${district.teams} チーム → 代表8校` +
        ` ／ 県決勝大会: ${final.games.length} 試合 / 優勝 ${final.champion}` +
        `${champion ? "（お知らせと一致）" : "（お知らせに記載が無く未検算）"}）`,
    );
    return [...district.games, ...final.games];
  },
  /** 何枚までPDFを開くか。**毎日1本ずつ上がるので上限を必ず置く** */
  maxAutumnSheets: 12,
  /**
   * ★**部首の字を通常の漢字に寄せる**（`⾧門` の1文字目は康熙部首の U+2FA7）。
   * 夏・春は `cleanName` でやっているが、秋は `assembleSlotBracket` を直に呼ぶので
   * **ページの側で直す。** ★**全体に NFKC を掛けないこと**（全角ラテンが潰れる）。
   */
  fixRadicals(page) {
    const fix = (s) => s.replace(/[⼀-⿟]/g, (c) => c.normalize("NFKC"));
    return {
      page: page.page,
      lines: page.lines.map((l) => {
        const items = l.items.map((i) => ({ ...i, text: fix(i.text) }));
        return { ...l, items, text: items.map((i) => i.text).join("\t") };
      }),
    };
  },
  /**
   * 地区予選（4会場×2段＝8ブロック）。
   * ★**段は「スロット番号の行が2本ある」ことで分かる**ので、行の y で上下に割る。
   */
  readAutumnDistrict(raw, tournament, year) {
    const page = stripVerticalInningMarks(stripVerticalNotes(joinSplitDates(raw)), { dx: 5, dy: 10 });
    /*
      ★**スロット番号の行を2本とも見つけて、そのあいだで割る。**
      上段は「自分の行より上」、下段は「上段のスロット行より下」。
      ★**座標を決め打ちしないこと**（年ごとにチーム数が変わればレイアウトも動く）。
    */
    const runs = page.lines
      .map((l) => {
        const ns = l.items.map((i) => normalize(i.text.trim())).filter((t) => /^\d+$/.test(t)).map(Number);
        let best = 0;
        let cur = 0;
        for (let k = 0; k < ns.length; k++) {
          cur = k && ns[k] === ns[k - 1] + 1 ? cur + 1 : 1;
          best = Math.max(best, cur);
        }
        return { y: l.y, run: best };
      })
      .filter((r) => r.run >= 8)
      .sort((a, b) => b.y - a.y);
    if (runs.length !== 2) {
      console.log(`  ⚠️ 山口: ${tournament} のスロット番号の行が ${runs.length} 本（2本のはず）。1試合も出さない`);
      return null;
    }
    /*
      ★★**上下の境目を「2本のスロット行の中点」で決めないこと**（実際に間違えた）。
      校名はスロット行の**下**に伸びるので、中点で切ると
      **上段の校名の最終行が落ちる**（`山口県桜ケ丘` が `山口県桜ケ` になった）。

      ★**紙の中でいちばん広い隙間（＝段と段のあいだの余白）で切る。**
      実測では「上段の校名の最終行 → 下段の球場名」が 26.7 ポイントで、
      段の中の行間（最大15）よりはっきり広い。**座標は決め打ちしない。**
    */
    const between = page.lines
      .map((l) => l.y)
      .filter((y) => y < runs[0].y && y > runs[1].y)
      .sort((a, b) => b - a);
    let split = (runs[0].y + runs[1].y) / 2;
    let widest = 0;
    for (let k = 0; k + 1 < between.length; k++) {
      const gap = between[k] - between[k + 1];
      if (gap > widest) {
        widest = gap;
        split = (between[k] + between[k + 1]) / 2;
      }
    }

    const games = [];
    const champions = [];
    let teams = 0;
    for (const [name, lo, hi] of [
      ["上段", split, Infinity],
      ["下段", -Infinity, split],
    ]) {
      const half = { page: page.page, lines: page.lines.filter((l) => l.y > lo && l.y <= hi) };
      const built = assembleSlotBracket(half, { winners: 4, hitSpan: true, nameColumns: "desc" });
      if (!built) {
        console.log(`  ⚠️ 山口: ${tournament} の${name}を組み立てられなかった。1試合も出さない`);
        return null;
      }
      /*
        ---- 検算A: 紙に刷ってある代表校 ----
        段の上に `🄓山口県桜ケ丘` `🄑周防大島` … と**並び順は不定**で刷られている。
        ★**枝とは別の場所から来る事実**なので、ブロックの組み立てを間違えれば必ず落ちる。
      */
      const printed = half.lines
        .flatMap((l) => l.items.map((i) => normalize(i.text.trim())))
        /*
          ★**記号は「丸囲み」ではなく「括弧つきラテン大文字」**（🄐 は U+1F110）。
          丸囲み（U+1F150〜）だけを見ると**1件も当たらない**（実際に当たらなかった）。
          囲み文字の4種（括弧・角・黒丸・黒角）をまとめて見る。
        */
        .map((t) => t.match(/^[\u{1F110}-\u{1F189}](\S+)$/u)?.[1])
        .filter(Boolean);
      const a = [...printed].sort();
      const b = [...built.champions].sort();
      if (a.length !== 4 || a.length !== b.length || a.some((t, i) => t !== b[i])) {
        console.log(
          `  ⚠️ 山口: ${tournament} の${name}の代表が紙の記載と合わない` +
            `（紙 ${printed.join("・") || "読めない"} / 組み立て ${built.champions.join("・")}）。1試合も出さない`,
        );
        return null;
      }
      games.push(...built.games);
      champions.push(...built.champions);
      teams += built.teams;
    }

    // ---- 検算B: 勝ち抜きの算数（代表が8校なので チーム数 − 試合数 = 8）----
    if (teams - games.length !== champions.length) {
      console.log(
        `  ⚠️ 山口: ${tournament} は ${teams} チームに対し ${games.length} 試合` +
          `（代表 ${champions.length} 校なので ${teams - champions.length} のはず）。1試合も出さない`,
      );
      return null;
    }
    return { tournament, teams, champions, games: this.toGames(games, tournament, year) };
  },
  /** 県決勝大会（8校）。3位決定戦は表の外（右）にあるので、範囲で外す */
  readAutumnFinal(raw, tournament, year) {
    let page = stripVerticalInningMarks(stripVerticalNotes(joinSplitDates(raw)), { dx: 5, dy: 12 });
    /*
      ★**「◯◯会場」の行を落とす**（スロット番号の行のすぐ下にあり、校名にくっつく）。
      ★**行ごと落とす**（8つとも「会場」で終わる）。**文字では消さないこと。**
    */
    page = {
      page: page.page,
      lines: page.lines.filter((l) => {
        const ts = l.items.map((i) => normalize(i.text.trim())).filter(Boolean);
        return !(ts.length >= 4 && ts.every((t) => /会場$/.test(t)));
      }),
    };
    /*
      ★**3位決定戦と「中国大会出場校」の一覧を範囲で外す。**
      スロットは x=82〜564 に並び、右側（x≒609〜）は表の外。
      ★**外さないと決勝の帯に3位決定戦の得点が混ざる。**
    */
    const slotLine = page.lines
      .map((l) => l.items.filter((i) => /^\d+$/.test(normalize(i.text.trim()))))
      .reduce((a, b) => (b.length > a.length ? b : a), []);
    if (slotLine.length < 4) {
      console.log(`  ⚠️ 山口: ${tournament} にスロット番号の行が見つからない。1試合も出さない`);
      return null;
    }
    const right = Math.max(...slotLine.map((i) => i.x));
    const pitch = (right - Math.min(...slotLine.map((i) => i.x))) / (slotLine.length - 1);
    const built = assembleSlotBracket(orientPage(page, { range: [0, right + pitch * 0.6] }), {
      roundLabels: ["決勝", "準決勝", "準々決勝"],
      hitSpan: true,
      nameColumns: "desc",
    });
    if (!built) {
      console.log(`  ⚠️ 山口: ${tournament} を組み立てられなかった。1試合も出さない`);
      return null;
    }
    if (built.teams - built.games.length !== 1) {
      console.log(
        `  ⚠️ 山口: ${tournament} は ${built.teams} チームに対し ${built.games.length} 試合（${built.teams - 1} のはず）。1試合も出さない`,
      );
      return null;
    }
    /*
      ★**出場8校は「スロットの校名」から取る**（検算Cで地区予選の代表と突き合わせる）。
      1回戦（＝準々決勝）に出るのが全チームなので、その校名を集めれば足りる。
    */
    const first = built.games.filter((g) => g.round === "準々決勝");
    const teams = first.flatMap((g) => [g.a, g.b]);
    if (teams.length !== built.teams) {
      console.log(
        `  ⚠️ 山口: ${tournament} のいちばん浅い回戦に ${teams.length} 校しかいない（${built.teams} 校のはず）。1試合も出さない`,
      );
      return null;
    }
    return { tournament, champion: built.champion, teams, games: this.toGames(built.games, tournament, year) };
  },
  /** 組み立て結果を生成物の形にする。★**球場は出さない**（上の説明） */
  toGames(games, tournament, year) {
    return games.map((g) => {
      let date = null;
      if (g.date) {
        const [mm, dd] = g.date.split("/");
        date = `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
      }
      return {
        date,
        season: "autumn",
        tournament,
        round: g.round,
        venue: null,
        teams: [
          { display: g.a, score: g.sa, won: g.sa > g.sb },
          { display: g.b, score: g.sb, won: g.sb > g.sa },
        ],
      };
    });
  },
  /**
   * ★★**継続試合の「開始日」を決着日として出さない**（2026-08-17。春季で判明）。
   *
   * 雨で中断した試合は翌日に再開される。**この紙は再開日を枝ではなく
   * 注記の列に書く**（春は x=367 に `継続試合` `4/27` `12:00～` が縦に並ぶ）。
   * 枝には開始日（4/26）しか無いので、`pickDate` の「近くのうち最新を取る」では
   * 拾えず、**決着した日と違う日付を画面に出す**ことになる
   * （READMEの決まりに反する）。
   *
   * ★**注記と枝の対応づけはやらない。** 列と枝を結び付ける手掛かりは
   * 座標の近さしかなく、間違えると**別の試合に別の日が付く**——
   * これは「日付が無い」より悪い。
   * **再開日より前の、いちばん新しい日の試合をまとめて日付なしにする**
   * （春は 4/26 の準決勝2試合。どちらが継続したかは紙からは決められない）。
   * 46/48 は正しい日付のまま残り、**間違った日付は1件も出ない。**
   *
   * ★**注記が無ければ何もしない**ので、夏の生成物は変わらない（確認済み）。
   */
  dropContinuationDates(page, games) {
    if (!games?.length) return games;
    const items = page.lines.flatMap((l) => l.items.map((i) => ({ x: i.x, y: l.y, t: i.text.trim() })));
    const marks = items.filter((i) => /継続試合/.test(i.t));
    if (!marks.length) return games;

    /** 注記と同じ列（x が近い）にある日付＝再開して決着した日 */
    const resumed = [];
    for (const m of marks) {
      const near = items
        .filter((i) => /^\d{1,2}\/\d{1,2}$/.test(i.t) && Math.abs(i.x - m.x) <= 12 && Math.abs(i.y - m.y) <= 40)
        .sort((a, b) => Math.abs(a.y - m.y) - Math.abs(b.y - m.y))[0];
      if (!near) {
        console.log("  ⚠️ 山口: 「継続試合」の注記はあるが、同じ列に日付が無い");
        continue;
      }
      const [mm, dd] = near.t.split("/").map(Number);
      resumed.push(mm * 100 + dd);
    }
    if (!resumed.length) return games;

    const key = (iso) => {
      const [, mm, dd] = iso.split("-").map(Number);
      return mm * 100 + dd;
    };
    const dropped = new Set();
    for (const r of resumed) {
      // 再開日より前でいちばん新しい日＝中断した日
      const before = games.map((g) => g.date).filter(Boolean).map(key).filter((k) => k < r);
      if (before.length) dropped.add(Math.max(...before));
    }
    let n = 0;
    const out = games.map((g) => {
      if (!g.date || !dropped.has(key(g.date))) return g;
      n += 1;
      return { ...g, date: null };
    });
    console.log(
      `  （山口: 継続試合が ${marks.length} 件あるので、中断した日の ${n} 試合は日付を出さない）`,
    );
    return out;
  },
};

/**
 * 宮崎県高等学校野球連盟（`miyazaki-hbf.jp`）。
 * ★**「一球速報の県」に分類していたが誤りだった**（2026-08-16）。
 * 連盟は結果を **omyutech のファイル置き場**に自分で置いている。
 * **スコアAPI（`baseballapi`）からは1件も取っていない。**
 *
 * ------------------------------------------------------------------
 * ★ 出典の流れ
 *
 *   お知らせ一覧（leagueId=245・type=N）
 *     → 「第108回全国高等学校野球選手権宮崎大会　結果」
 *     → 本文のPDFリンク → **やぐら表1枚（46チーム・45試合）**
 *
 *   ★**検算材料が2つある。** お知らせ本文が「日南学園高校　優勝！」と
 *   「ともに夏を戦い抜いた**47校46チーム**へ」と書いている。
 *   **優勝校とチーム数**の両方を、表の枝とは別の場所から突き合わせられる。
 *
 * ------------------------------------------------------------------
 * ★ 紙の形（左右2段組のスロット格子。静岡・山口と同じ向き）
 *
 *   左 … スロット1〜23（x≒116）・校名 x=61〜114・回戦は右へ 143→251
 *   右 … スロット24〜46（x≒438）・校名 x=450〜491・回戦は左へ 413→305
 *   決勝 … 中央 x=264/290
 *
 *   ★**日付が1つも書かれていない**（千葉と同じ `hasDates: false`）。
 *   紙にあるのは大会全体の期間（`期日：令和８年７月４日～７月２０日`）だけ。
 *
 * ------------------------------------------------------------------
 * ★ ここで踏んだところ
 *
 *   1. ★★**紙の下半分に日程表がある**（`日程 / 月日 / 曜日 / 試合数`の表。
 *      y=136 以下）。**列が回戦の帯と同じ x に来る**ので、そのままだと
 *      スコアに混ざる。さらに悪いことに、日程表の行は
 *      **境目をはさんで数字が隣り合う**（`7 8` が x=264/278）ため、
 *      `finalAt: "innermost"` が**決勝より内側の組**として拾ってしまう。
 *      **スロット番号のいちばん下より下を、行ごと落としてから渡す。**
 *   2. ★**中央の縦書きに数字が入っている**（`（8年ぶり10回目）優勝 日南学園高等学校`）。
 *      `8` `1` `0` が準決勝の帯（x=251）に乗る。**千葉と同じ罠**だが、
 *      千葉と違って**帯の中身が5個になり**、準決勝が組めなくなる。
 *      `hitSpan` で窓を枝の形に合わせると、この3つは枝の外（スロット1.7〜4.1）に出る
 *   3. ★**この表もスコアが「連結線の両端」**（山口と同じ）。準決勝の2つは
 *      スロット約6と約18で、中点（約12）から6も離れている。`hitSpan` が要る
 *   4. **コールド・延長・タイブレークの注記が同じ列に混ざる**が、数字ではないので
 *      `numbersOf` は拾わない
 *
 * ------------------------------------------------------------------
 * ★ 検算（合わなければ**1試合も出さない**）
 *
 *   - 46チーム − 45試合 = 1
 *   - ★**お知らせの「46チーム」と読んだチーム数が一致**（`verify.teams`）
 *   - **お知らせの優勝校と決勝の勝者が一致**
 *   - 「回数 − 1918」とお知らせの掲載年が一致
 *
 * **規約**: 連盟のサイトに転載の制限は無い。robots.txt は全許可
 * （`data/federation-sites.json`）。
 *
 * ★**夏だけ。** 春季・秋季・1年生大会の結果PDFも同じ置き場にあるが、
 * **紙の形を確かめてから足すこと。**
 */
const miyazaki = {
  slug: "miyazaki",
  district: "宮崎",
  name: "宮崎県高等学校野球連盟",
  siteUrl: "https://miyazaki-hbf.jp/",
  politenessMs: 2000,
  /*
    ★**夏と秋の2季**（秋は 2026-08-19 に追加）。
    春季は**県大会＋県北・県央・県南の地区予選の4枚**で、
    ★**地区予選は1枚から代表が2〜3校出る**（優勝校が1つに収束しない）。
    `assembleSlotBracket` の前提に合わないので入れていない。
  */
  seasons: { summer: "https://miyazaki-hbf.jp/", autumn: "https://miyazaki-hbf.jp/" },
  /** 連盟ごとの定数。`main.*.chunk.js` の `leagueId=245` */
  leagueId: 245,
  /** 左右の境目。スロット列は x≒116 と x≒438 にあり、その中間 */
  half: 277,
  async collect({ season }) {
    if (season === "autumn") return this.collectAutumn();
    if (season !== "summer") return [];
    const news = await fetchOmyuNews(this.leagueId);
    if (!news) {
      console.log("  ⚠️ 宮崎: お知らせの一覧が取れない。出典の作りが変わった可能性がある");
      return [];
    }
    /*
      ★**見出しに「第N回」が付かない年がある**（2025は「全国高等学校野球選手権宮崎大会 結果」）。
      回数では絞れないので「選手権宮崎大会」＋「結果」で拾う。
      **県内の別大会**（第73回宮崎県高等学校野球選手権大会）は「選手権宮崎大会」に
      当たらないので混ざらない。軟式・予選は明示的に外す。
    */
    const posts = news
      .map((n) => ({ ...n, title: normalize(n.title ?? "") }))
      .filter((n) => /選手権宮崎大会/.test(n.title) && /結果/.test(n.title) && !/軟式|予選/.test(n.title))
      .sort((a, b) => String(b.createTime).localeCompare(String(a.createTime)));
    if (!posts.length) {
      console.log("  ⚠️ 宮崎: 選手権の結果のお知らせが見つからない");
      return [];
    }

    for (const post of posts.slice(0, 2)) {
      await sleep(this.politenessMs);
      const body = await fetchOmyuNewsBody(this.leagueId, post.newsId);
      const url = body?.match(/https?:\/\/[^"']+\.pdf/)?.[0];
      if (!url) {
        console.log(`  ⚠️ 宮崎: 「${post.title}」にPDFのリンクが無い`);
        continue;
      }
      /*
        ★**本文が検算材料になる。**
        「日南学園高校　優勝！」と「ともに夏を戦い抜いた47校46チームへの敬意」。
        **チーム数のほうが取りこぼしに強い**（校数ではなく連合チーム込みの数）。
      */
      const text = normalize(plain(body));
      const champion = text.match(/(\S+?)(?:高等学校|高校)\s*優勝/)?.[1] ?? null;
      const teams = Number(text.match(/\d+校\s*(\d+)\s*チーム/)?.[1]) || null;
      if (!champion) {
        console.log(`  ⚠️ 宮崎: 「${post.title}」に優勝校の記載が無い。検算できないので1試合も出さない`);
        return [];
      }
      const year = Number(String(post.createTime).slice(0, 4));

      const parsed = await fetchPdfPages(url, { headers: UA });
      await sleep(this.politenessMs);
      if (!parsed?.length) {
        console.log(`  ⚠️ 宮崎: 「${post.title}」のPDFが読めない`);
        continue;
      }
      for (const raw of parsed) {
        const games = this.readSheet(raw, season, { champion, teams }, year);
        if (games) return games;
      }
    }
    return [];
  },
  /** 1枚のやぐら表を読む。**組めなければ null**（呼び出し側は次のPDFへ） */
  readSheet(raw, season, verify, postYear) {
    const flat = raw.lines.map((l) => normalize(l.text.replace(/\t/g, "")));
    const title = flat.map((t) => t.match(/第(\d+)回全国高等学校野球選手権宮崎大会/)).find(Boolean);
    if (!title) return null;
    // ★選手権の回数は 年 - 1918。掲載年と食い違ったら、前年のお知らせを読んでいる
    if (Number(title[1]) + 1918 !== postYear) {
      console.log(
        `  ⚠️ 宮崎: 第${title[1]}回（${Number(title[1]) + 1918}年）の表が ${postYear} 年のお知らせに付いている。1試合も出さない`,
      );
      return [];
    }

    /*
      ★★**紙の下半分にある日程表を、行ごと落としてから渡す。**

      日程表（`日程 / 月日 / 曜日 / 試合数 / 雨天`）の列は**回戦の帯と同じ x**に来るので、
      範囲（`ranges`）では切り分けられない。切るなら**スロットの軸（y）**。
      ★**決め打ちの座標にしないこと。** スロット番号のいちばん下を実測し、
      そこから半スロットぶん下で切る。表が伸び縮みしても付いていく。

      落とさないと `finalAt: "innermost"` が日程表の行を拾う
      （`日程` の行は `7`(x=264) と `8`(x=278) が**境目をはさんで14ポイント**しか
      離れておらず、本物の決勝（26ポイント）より内側に見える）。
    */
    /*
      ★**右のスロット列（x≒438）では切れない。** 日程表の「日程」「月日」の行が
      **ちょうど x=438 に `20` `23` を置いている**ので、それを混ぜると
      いちばん下が y=124 になり、日程表ごと残ってしまう（実際にそうなった）。
      **左のスロット列（x≒116）を使う** — 日程表のその位置は
      「日」「月」「曜」「試」「数」で、数字が1つも無い。

      ★**上から 1,2,3,… と続いていることを確かめてから使う。**
      将来この列に別の数字が入ったら、ここで気づけるようにしておく。
    */
    const slots = raw.lines
      .map((l) => ({ y: l.y, n: l.items.find((i) => /^\d{1,2}$/.test(i.text.trim()) && i.x > 110 && i.x < 122) }))
      .filter((r) => r.n)
      .sort((a, b) => b.y - a.y)
      .map((r) => ({ y: r.y, v: Number(r.n.text.trim()) }));
    if (slots.length < 8 || slots.some((s, i) => s.v !== i + 1)) {
      console.log(
        `  ⚠️ 宮崎: 左のスロット番号が 1〜N の並びになっていない（${slots.map((s) => s.v).join(",")}）。` +
          "紙の形が変わった可能性がある。1試合も出さない",
      );
      return [];
    }
    /*
      ★**スロット番号のいちばん下から半スロットぶん下で切る。**
      これより下は「開始時刻の凡例」と「日程表」で、**日程表の列は
      回戦の帯と同じ x に来る**ので範囲では切り分けられない。
      決め打ちの座標にしないのは、表が伸び縮みしても付いていくため。
    */
    const gaps = slots.slice(1).map((s, i) => slots[i].y - s.y);
    const pitch = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    const floor = slots.at(-1).y - pitch * 0.5;
    const cropped = { page: raw.page, lines: raw.lines.filter((l) => l.y > floor) };

    return readTwoColumnBracket(cropped, {
      district: "宮崎",
      titlePattern: /第\d+回全国高等学校野球選手権宮崎大会/,
      half: this.half,
      // 2桁のスコアが1〜2ポイント左にずれる（右半分は 411／413）
      rowTolerance: 3,
      // 左は上から、右は下から読む（スロットは縦、校名は横書き）
      nameOrder: ["asc", "desc"],
      season,
      // ★**日付が1つも書かれていない。** 推測で埋めない（三重・千葉と同じ）
      hasDates: false,
      finalAt: "innermost",
      verify,
      /*
        ★**この表もスコアが「連結線の両端」**（山口と同じ）。
        準決勝はスロット約6と約18に置かれ、中点（約12）から6も離れている。
        ★**中央の縦書き「（8年ぶり10回目）」の数字を外す役目も兼ねている** —
        あれはスロット1.7〜4.1に来るので、枝の張る範囲の外に出る。
      */
      hitSpan: true,
      /*
        ★**中央の縦書きの「回」が、53ポイント左のスコアを消していた。**
        「（8年ぶり10**回**目）」の `回` が、同じ行にある3回戦の `0`（x=197）を
        「10回コールドの10」と同じ扱いで落としてしまい、その回戦が7個になった。
        この紙で隣り合う断片は20ポイントも離れないので、30で切る。
      */
      inningMarkGap: 30,
      /*
        ★**シード記号の列と、決勝の欄を範囲ごと外す。**
        左 … ☆ x=51 ／ 校名 x=61〜114 ／ 回戦 143〜251（決勝264は外す）
        右 … 回戦 305〜413（決勝290は外す）／ 校名 x=450〜491 ／ ☆ x=502
      */
      ranges: [
        [56, 258],
        [297, 498],
      ],
      // 字間の空白を詰める（日本の校名に空白は入らない）
      cleanName: (s) => s.replace(/\s+/g, ""),
    });
  },

  /*
    ------------------------------------------------------------------
    ★ 秋季（九州地区大会の宮崎県予選）。2026-08-19 に追加
    ------------------------------------------------------------------

    同じお知らせAPIの別の記事に、**1枚のやぐら表PDF**が付いている
    （2025年は「秋季九州地区高等学校野球大会宮崎県予選　結果」）。

    ★ 夏との違いは4つ。**同じ県の同じ連盟でも紙は別物**だった。

      1. **座標がぜんぶ違う。** 左のスロット列は x≒109（夏は 116）、
         右は x≒479（夏は 438）。**範囲は測り直すこと**
      2. ★**回数から年を出せない。**「第157回」は**九州地区大会**の通し番号で、
         県予選の年とは関係が無い（夏は「第N回 + 1918」で出せていた）。
         **紙の「期日： 令和７年９月１３日」から出す。**
         元号は年度だが、秋（9〜10月）は暦年と一致する
      3. ★**検算材料が紙の中にしかない。** お知らせ本文は
         「＊第157回九州地区高等学校野球大会宮崎県予選」の1行だけで、
         夏のような「優勝！」「46チーム」が無い。
         **中央の縦書き「優勝／小林西高等学校／（13季ぶり5回目）」から優勝校を読む**
      4. **3位決定戦がある**（日南学園 11-4 宮崎日大）。
         ★**出さない。** 勝ち抜きの枝ではないので「チーム数 − 試合数 = 1」に
         乗らず、足すと検算が緩む。この年は両校とも私立なので画面上も減らない

    ★ 検算（合わなければ**1試合も出さない**）

      - 43チーム − 42試合 = 1
      - **紙の中央に印字された優勝校と、組み立てた決勝の勝者が一致**
      - **紙の「令和N年」とお知らせの掲載年が一致**
  */
  async collectAutumn() {
    const news = await fetchOmyuNews(this.leagueId);
    if (!news) {
      console.log("  ⚠️ 宮崎: お知らせの一覧が取れない。出典の作りが変わった可能性がある");
      return [];
    }
    /*
      ★**「第N回」で絞れない**（題に回数が入らない年がある）。
      **九州地区大会そのもの**（県予選ではない）と**軟式**、
      **春の「春季九州地区…宮崎県予選」**を外す。
    */
    const posts = news
      .map((n) => ({ ...n, title: normalize(n.title ?? "") }))
      .filter((n) => /九州地区/.test(n.title) && /宮崎県予選/.test(n.title))
      .filter((n) => /結果/.test(n.title) && !/軟式|春季/.test(n.title))
      .sort((a, b) => String(b.createTime).localeCompare(String(a.createTime)));
    if (!posts.length) {
      console.log("  ⚠️ 宮崎: 秋季（九州地区大会県予選）の結果のお知らせが見つからない");
      return [];
    }

    for (const post of posts.slice(0, 2)) {
      await sleep(this.politenessMs);
      const body = await fetchOmyuNewsBody(this.leagueId, post.newsId);
      const url = body?.match(/https?:\/\/[^"']+\.pdf/)?.[0];
      if (!url) {
        console.log(`  ⚠️ 宮崎: 「${post.title}」にPDFのリンクが無い`);
        continue;
      }
      const parsed = await fetchPdfPages(url, { headers: UA });
      await sleep(this.politenessMs);
      if (!parsed?.length) {
        console.log(`  ⚠️ 宮崎: 「${post.title}」のPDFが読めない`);
        continue;
      }
      const postYear = Number(String(post.createTime).slice(0, 4));
      for (const raw of parsed) {
        const games = this.readAutumnSheet(raw, postYear);
        if (games) return games;
      }
    }
    return [];
  },

  /** 秋季のやぐら表を1枚読む。**組めなければ null**（呼び出し側は次のPDFへ） */
  readAutumnSheet(raw, postYear) {
    const flat = raw.lines.map((l) => normalize(l.text.replace(/\t/g, "")));
    const title = flat.map((t) => t.match(/第\d+回九州地区高等学校野球大会宮崎県予選/)?.[0]).find(Boolean);
    if (!title) return null;

    /*
      ★**年は回数から出せない**（上の 2 を参照）。**紙の期日から出す。**
    */
    const era = flat.map((t) => t.match(/期\s*日\D{0,4}令和(\d+)年/)?.[1]).find(Boolean);
    if (!era) {
      console.log("  ⚠️ 宮崎(秋): 期日の「令和N年」が読めない。年を決められないので1試合も出さない");
      return [];
    }
    const year = 2018 + Number(era);
    if (year !== postYear) {
      console.log(
        `  ⚠️ 宮崎(秋): 令和${era}年（${year}年）の表が ${postYear} 年のお知らせに付いている。1試合も出さない`,
      );
      return [];
    }

    /*
      ★**紙の下半分（開始時刻の凡例と日程表）を行ごと落とす。** 夏と同じ理由で、
      日程表の列は回戦の帯と同じ x に来るので範囲では切り分けられない。
      ★**左のスロット列（x≒109）で測る。** 右（x≒479）は日程表の
      「日程」「月日」の行にも数字が並ぶ。
      ★**決め打ちの座標にしない**（表が伸び縮みしても付いていく）。
    */
    const slots = raw.lines
      .map((l) => ({ y: l.y, n: l.items.find((i) => /^\d{1,2}$/.test(i.text.trim()) && i.x > 104 && i.x < 114) }))
      .filter((r) => r.n)
      .sort((a, b) => b.y - a.y)
      .map((r) => ({ y: r.y, v: Number(r.n.text.trim()) }));
    if (slots.length < 8 || slots.some((s, i) => s.v !== i + 1)) {
      console.log(
        `  ⚠️ 宮崎(秋): 左のスロット番号が 1〜N の並びになっていない（${slots.map((s) => s.v).join(",")}）。` +
          "紙の形が変わった可能性がある。1試合も出さない",
      );
      return [];
    }
    const gaps = slots.slice(1).map((s, i) => slots[i].y - s.y);
    const pitch = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    const floor = slots.at(-1).y - pitch * 0.5;
    const cropped = { page: raw.page, lines: raw.lines.filter((l) => l.y > floor) };

    /*
      ★**日程表を落としてから優勝校を読むこと。** 日程表の「２」「×」も
      中央の列に乗るので、落とさないと縦書きの列が数字だらけになる。
    */
    const champion = this.championFromCenter(cropped);
    if (!champion) {
      console.log("  ⚠️ 宮崎(秋): 中央の縦書きから優勝校を読めない。検算できないので1試合も出さない");
      return [];
    }

    return readTwoColumnBracket(cropped, {
      district: "宮崎",
      titlePattern: /第\d+回九州地区高等学校野球大会宮崎県予選/,
      // ★回数は九州大会の通し番号。年は上で紙の期日から読んである
      yearOf: () => year,
      /** 左のいちばん深い帯 x≒258 と右の x≒332 のあいだ */
      half: 295,
      rowTolerance: 3,
      nameOrder: ["asc", "desc"],
      season: "autumn",
      // ★**枝に日付が1つも書かれていない**（日程表は下に別にある）。推測で埋めない
      hasDates: false,
      /*
        ★**中央には決勝（1-4）と3位決定戦（11-4）の2組が縦に並ぶ。**
        「境目をはさむ組のうちいちばん内側」が決勝（幅15 対 41）。
      */
      finalAt: "innermost",
      verify: { champion },
      /*
        ★**スコアは連結線の両端に置かれる**（夏と同じ）。
        準々決勝の2試合はスロット 5.6／16.5 が中点なのに、
        準決勝のスコアは 5.4／16.7 に置かれている。
      */
      hitSpan: true,
      // 中央の縦書き「（13季ぶり5回目）」の「回」が離れたスコアを消さないように
      inningMarkGap: 30,
      /*
        ★**シード記号（☆）の列を範囲ごと外す**（左 x=36 ／ 右 x=552）。
        ★**中央の縦書きも外す**（左は 265 まで、右は 320 から）。
        外さないと、決勝・3位決定戦のスコアが半分ごとの帯に混ざる。
          左 … 校名 46〜92 ／ スロット 109 ／ 回戦 139〜258
          右 … 回戦 332〜451 ／ スロット 479 ／ 校名 492〜539
      */
      ranges: [
        [40, 265],
        [320, 545],
      ],
      cleanName: (s) => s.replace(/\s+/g, ""),
    });
  },

  /**
   * ★**中央の縦書きから優勝校を読む**（秋季の検算材料はここにしかない）。
   *
   * 「優勝」の断片の下に、**2本の縦書きの列**が並ぶ。
   *
   *   x≒282 … 小 林 西 高 等 学 校
   *   x≒274 … （ 13 季 ぶ り 5 回 目 ）
   *
   * ★**列を x でまとめてから、「高等学校」で終わる列を選ぶ。**
   * 8ポイントしか離れていないので、**x の近さだけでは選び分けられない。**
   */
  championFromCenter(raw) {
    const items = raw.lines.flatMap((l) => l.items.map((i) => ({ x: i.x, y: l.y, t: i.text.trim() })));
    const mark = items.find((i) => i.t === "優勝");
    if (!mark) return null;
    const cols = new Map();
    for (const i of items.filter((i) => i.y < mark.y && Math.abs(i.x - mark.x) <= 20)) {
      const k = [...cols.keys()].find((v) => Math.abs(v - i.x) <= 3) ?? i.x;
      if (!cols.has(k)) cols.set(k, []);
      cols.get(k).push(i);
    }
    for (const col of cols.values()) {
      const s = col.sort((a, b) => b.y - a.y).map((i) => i.t).join("");
      /*
        ★**末尾で止めないこと。** 「小林西高等学校」の列には、3ポイント隣にある
        「コールド」の断片が混ざる（列の幅は3ポイントで見ている）。
        **先頭からの一致だけを見て、校名の長さで歯止めをかける。**
      */
      const m = s.match(/^(.{2,10}?)(?:高等学校|高校)/);
      if (m) return m[1];
    }
    return null;
  },
};

/**
 * 福井県高等学校野球連盟（`291fki.sakura.ne.jp`）。
 *
 * ------------------------------------------------------------------
 * ★ 「優勝校の4試合しか出していない」は誤りだった（2026-08-17 訂正）
 *
 *   2026-08-15 に「連盟はHTMLで結果を出しているが**優勝校の勝ち上がり4試合だけ**」
 *   と書いたのは、**大会ページのHTML本文しか見ていなかった**から。
 *   同じページに貼られている画像が `108抽選結果→勝ち上がり0725最終結果_page-0001.jpg`
 *   という名前で、**`_page-0001` は PDF から変換した跡**だった。
 *   元のPDFは別ディレクトリ（`wp2019/`）にあり、**全26試合が入っている。**
 *
 *   ★**WordPress の REST API で一覧できる**ので、URLを直書きしなくてよい。
 *
 *     /wp-json/wp/v2/media?mime_type=application/pdf&per_page=100
 *
 *   ★**このサイトは `wp2024/`（表側）と `wp2019/`（古い方・アップロード先）の
 *   2つの WordPress でできている。** 添付は `wp2019` 側に入るので、両方見る。
 *
 * ------------------------------------------------------------------
 * ★ どのPDFを使うか
 *
 *   `勝ち上がり` を含む題のうち、**先頭の数字が「年 − 1918」と一致するもの**
 *   （2026年なら `108…`）。同じ一覧に**北信越大会**（`153回北信越勝ち上がり…`）や
 *   **秋季県大会**（`153勝ち上がり0913`）が並んでいて、そちらの数字は
 *   北信越大会の回数なので、この条件で自然に分かれる。
 *   大会中は日ごとに新しい1枚が上がるので、**掲載日がいちばん新しいもの**を採る。
 *
 * ------------------------------------------------------------------
 * ★ 紙の形（京都と同じ「スロットが横一列・回戦は上へ」）
 *
 *   スロット番号 1〜27 が y=202 に横一列、校名はその下に**縦書き**。
 *   回戦は上へ 258（1回戦）→ 302 → 347 → 391（準決勝）→ 437（決勝）。
 *   日付（`１１日`）・開始時刻・球場記号（`(セ)` `(敦賀)`）が各試合に付く。
 *
 * ------------------------------------------------------------------
 * ★ ここで踏んだところ
 *
 *   1. ★**サヨナラが `7×` `9×`。** `numbersOf` が数字として読めず、
 *      2回戦が16個必要なところ14個になった（`slot-bracket.mjs` に `×` の除去を足した）
 *   2. ★**校名の下に「歴代優勝校」の表とシード記号（■）がある。**
 *      校名は「スロット行より下」を全部拾うので、**`2025年 敦賀気比 工大福井` が
 *      校名に連結される**（福井高専が `福井高専優勝敦賀気比北陸` になった）。
 *      ★**行の間隔では切れない** — 校名の行間が22.2ポイントなのに対し、
 *      ■の行はその19.8ポイント下にあり、**校名の続きと見分けが付かない。**
 *      **中身で切る**（`■` の項目を落とし、`歴代優勝校` の表から下を捨てる）
 *   3. **日付が `１１日`（全角・月が無い）。** 月は表の開催期間
 *      「◆７月８日(水) ～ ７月25日(土)」から決める（鹿児島と同じ考え方）
 *   4. **球場の凡例が `(セ) … セーレン・ドリームスタジアム`**（`：` ではなく `…`）
 *
 * ------------------------------------------------------------------
 * ★ 検算（合わなければ**1試合も出さない**）
 *
 *   - 27チーム − 26試合 = 1
 *   - **表に印字された「優勝 敦賀気比高校（２年連続１３回目）」と組み立てた優勝校が一致**
 *   - 日付の読めない試合が無い
 *
 * **規約**: サイトに転載・複製・営利・自動取得の記載は無い（2026-08-17 確認）。
 *
 * ★**夏だけ。** 春（`154やぐら→試合結果…`）・秋（`153勝ち上がり…`）・
 * 1年生大会のPDFも同じ一覧にあり、**題の付け方だけが違って紙の形は同じに見える。**
 * 確かめてから足すこと。
 */
const fukui = {
  slug: "fukui",
  district: "福井",
  name: "福井県高等学校野球連盟",
  siteUrl: "https://291fki.sakura.ne.jp/wp2024/",
  politenessMs: 2000,
  /*
    ★**3季ぜんぶ**（春季・秋季は 2026-08-19 に追加。下の「春季・秋季」の節を読むこと）。
    紙の形は3季とも同じ京都型だが、**大会名・回数の数え方・日付の有無が違う。**
  */
  seasons: {
    summer: "https://291fki.sakura.ne.jp/wp2024/",
    spring: "https://291fki.sakura.ne.jp/wp2024/",
    autumn: "https://291fki.sakura.ne.jp/wp2024/",
  },
  /** 添付の入り口。**表側（wp2024）と古い方（wp2019）の2つある** */
  wpRoots: ["https://291fki.sakura.ne.jp/wp2019", "https://291fki.sakura.ne.jp/wp2024"],
  async collect({ season, year }) {
    if (season === "spring" || season === "autumn") return this.collectSeason(season, year);
    if (season !== "summer") return [];
    // 選手権の回数は 年 - 1918
    const round = year - 1918;
    const media = await this.fetchMedia();
    if (!media) return [];

    /*
      ★**先頭の数字が「年 − 1918」のものだけ。**
      同じ一覧に北信越大会（`153回北信越勝ち上がり…`）と秋季県大会
      （`153勝ち上がり0913`）が並ぶが、そちらの数字は北信越大会の回数。
    */
    const want = new RegExp(`^${round}\\D*勝ち上がり`);
    const hits = media
      .filter((m) => want.test(m.title) && !/北信越/.test(m.title))
      // **大会中は日ごとに新しい1枚が上がる。** 掲載日がいちばん新しいものを採る
      .sort((a, b) => b.date.localeCompare(a.date));
    if (!hits.length) {
      console.log(`  ⚠️ 福井: 第${round}回の勝ち上がりPDFが見つからない`);
      return [];
    }

    for (const hit of hits.slice(0, 2)) {
      const parsed = await fetchPdfPages(hit.url, { headers: UA });
      await sleep(this.politenessMs);
      if (!parsed?.length) {
        console.log(`  ⚠️ 福井: 「${hit.title}」のPDFが読めない`);
        continue;
      }
      for (const raw of parsed) {
        const games = this.readSheet(raw, season);
        if (games) return games;
      }
    }
    return [];
  },
  /** 1枚のやぐら表を読む。**組めなければ null**（呼び出し側は次のPDFへ） */
  readSheet(raw, season) {
    const flat = raw.lines.map((l) => normalize(l.text.replace(/\t/g, "")));
    const tournament = flat.map((t) => t.match(/第\d+回全国高等学校野球選手権福井大会/)?.[0]).find(Boolean);
    if (!tournament) return null;
    const year = Number(tournament.match(/第(\d+)回/)[1]) + 1918;

    /*
      ★**校名の下にある「歴代優勝校」の表とシード記号を落とす。**

      校名は「スロット行より下」を全部拾う作りなので、そのままだと
      `2025年 敦賀気比 工大福井` が校名に連結される
      （福井高専が `福井高専優勝敦賀気比北陸` になった）。
      ★**行の間隔では切れない** — 校名の行間22.2ポイントに対し、
      ■の行はその19.8ポイント下で、校名の続きと見分けが付かない。**中身で切る。**
    */
    const histY = raw.lines.filter((l) => /準優勝|\d{4}年/.test(l.text)).map((l) => l.y);
    const floor = histY.length ? Math.max(...histY) : -Infinity;
    const cropped = {
      page: raw.page,
      lines: raw.lines
        .filter((l) => l.y > floor)
        .map((l) => {
          const items = l.items.filter((i) => !/^[■□]$/.test(i.text.trim()));
          return { ...l, items, text: items.map((i) => i.text).join("\t") };
        })
        .filter((l) => l.items.length),
    };

    /*
      ★**日付は `１１日`（全角・月が無い）。** 7月と決め打ちせず、
      開催期間の行「◆７月８日(水) ～ ７月25日(土)」から月を決める（鹿児島と同じ）。
    */
    const period = flat.map((t) => t.match(/(\d{1,2})月(\d{1,2})日.*?[～~-].*?(\d{1,2})月(\d{1,2})日/)).find(Boolean);
    if (!period) {
      console.log("  ⚠️ 福井: 開催期間の行が読めない。日付の月を決められないので1試合も出さない");
      return [];
    }
    const [, m1, d1, m2] = period.map(Number);
    const monthOf = (day) => (m1 === m2 ? m1 : day >= d1 ? m1 : m2);
    const parseLabel = (t) => {
      const m = normalize(t).match(/^(\d{1,2})日$/);
      return m ? { date: `${monthOf(Number(m[1]))}/${Number(m[1])}` } : null;
    };

    /** 凡例「(セ) … セーレン・ドリームスタジアム」。`：` ではなく `…` で結ぶ */
    const venues = new Map();
    for (const l of cropped.lines) {
      for (const m of l.text.matchAll(/(?:^|\t)(\([^\t]*?\))\t…\t([^\t]+?)(?=\t|$)/g)) venues.set(m[1], m[2].trim());
    }

    const built = assembleSlotBracket(cropped, {
      roundLabels: ["決勝", "準決勝", "準々決勝"],
      venueSymbols: new Set(venues.keys()),
      parseLabel,
    });
    if (!built) {
      console.log(`  ⚠️ 福井: ${tournament} の組合せ表を組み立てられなかった。1試合も出さない`);
      return [];
    }

    // ---- 検算1: 勝ち抜き戦の算数 ----
    if (built.teams - built.games.length !== 1) {
      console.log(
        `  ⚠️ 福井: ${built.teams} チームに対し ${built.games.length} 試合（${built.teams - 1} のはず）。1試合も出さない`,
      );
      return [];
    }

    /*
      ---- 検算2: 表に印字された優勝校 ----
      「優勝　敦賀気比高校（２年連続１３回目）」が**枝とは別の場所**に書いてある。
    */
    const printed = raw.lines.find((l) => /^優勝\t/.test(l.text))?.text.split("\t")[1] ?? null;
    if (!printed) {
      console.log("  ⚠️ 福井: 表に優勝校の記載が無い。検算できないので1試合も出さない");
      return [];
    }
    const bare = normalizeSchoolName(printed.replace(/[（(].*$/, "").replace(/高等?学?校$/, ""));
    if (!built.champion || !normalizeSchoolName(built.champion).startsWith(bare.slice(0, 2))) {
      console.log(
        `  ⚠️ 福井: 組み立てた優勝校が表と合わない（表「${printed}」/ 組み立て「${built.champion}」）。1試合も出さない`,
      );
      return [];
    }

    // ---- 検算3: 日付 ----
    const dated = built.games.filter((g) => g.date);
    if (dated.length !== built.games.length) {
      console.log(
        `  ⚠️ 福井: 日付の読めない試合が ${built.games.length - dated.length} 件。1試合も出さない`,
      );
      return [];
    }

    console.log(`  （${tournament}: ${built.games.length} 試合 / 優勝 ${built.champion} / ${built.teams} チーム）`);
    return built.games.map((g) => {
      const [mm, dd] = g.date.split("/");
      return {
        date: `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`,
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
  },

  /*
    ------------------------------------------------------------------
    ★ 春季・秋季（北信越地区大会の福井県大会）。2026-08-19 に追加
    ------------------------------------------------------------------

    同じPDFの一覧に**春と秋のやぐら表**も上がっている。
    **紙の形は夏と同じ**（京都型：スロットが横一列・回戦は上へ・27チーム）なので、
    夏の `readSheet` とほとんど同じ読み方で足せた。**違うのは4つだけ。**

      1. ★**大会名が違う。** 夏は「第108回全国高等学校野球選手権福井大会」、
         春秋は「**第154回北信越地区高等学校野球大会福井県大会（春季）**」。
         ★**回数は北信越大会の通し番号**（152＝2025春・153＝2025秋・154＝2026春）で、
         **年 − 1918 では出せない。**「年×2 − 3898（春）／ − 3897（秋）」で作って
         **ファイルを選ぶ条件にだけ使い**、年そのものは掲載日から採る
      2. ★★**春の紙には日付が1つも無い**（秋には夏と同じ `２０日` がある）。
         **推測で埋めない**（千葉・三重・宮崎と同じ扱い）
      3. ★**秋の紙には開催期間の行が無い。** 夏は
         「◆７月８日(水) ～ ７月25日(土)」から月を決めていたが、秋はこれが無いので
         **掲載日から決める**（掲載は決勝の当日〜数日後なので、**掲載日より大きい日は前の月**）
      4. ★**校名の下にあるのが「歴代優勝校」ではなく「■はシード校」**。
         夏の切り方（`準優勝` か `2025年` の行より下を捨てる）を**そのまま使うと
         紙の大半が消える** —— 春秋は「準優勝 若狭高校」が**スロット行より上**にあるため。
         **「シード」を含む行を落とす**に変える

    ★ 検算（合わなければ**1試合も出さない**）

      - 27チーム − 26試合 = 1
      - **表に印字された優勝校**（＋秋は準優勝校も）と決勝が一致
      - 秋は全26試合の日付が読めている（春は日付を持たない）
  */
  async collectSeason(season, year) {
    /*
      ★**北信越大会の通し番号**（春は年×2−3898、秋は年×2−3897）。
      152＝2025春・153＝2025秋・154＝2026春 で実測して合わせてある。
      ★**これはファイルを選ぶための条件にすぎない。** 年は掲載日から採る。
    */
    const round = year * 2 - (season === "spring" ? 3898 : 3897);
    const media = await this.fetchMedia();
    if (!media) return [];

    /*
      ★**北信越の本大会を必ず外す。** 同じ番号で
      「154回本大会やぐら→試合結果0606」「153回北信越勝ち上がり1019最終結果」が並ぶ
      （そちらは他県の学校が出てくる）。
      ★**大会中は日ごとに新しい1枚が上がる**ので、掲載日がいちばん新しいものから見る。
    */
    const hits = media
      .filter((m) => new RegExp(`^${round}\\D`).test(m.title))
      .filter((m) => !/北信越|本大会/.test(m.title))
      .sort((a, b) => b.date.localeCompare(a.date));
    if (!hits.length) return [];

    /*
      ★**4枚まで見る。** 番号だけでは「北信越の勝ち上がり」（`154_h_katiagari`）や
      **結果の入っていない抽選直後の表**（`154(2026)春季`）が混ざる。
      **紙の大会名で見分ける**ので、当たらなければ次の1枚へ。
    */
    for (const hit of hits.slice(0, 4)) {
      const parsed = await fetchPdfPages(hit.url, { headers: UA });
      await sleep(this.politenessMs);
      if (!parsed?.length) {
        console.log(`  ⚠️ 福井: 「${hit.title}」のPDFが読めない`);
        continue;
      }
      for (const raw of parsed) {
        const games = this.readSeasonSheet(raw, season, hit.date);
        if (games) return games;
      }
    }
    return [];
  },

  /** PDFの一覧。**表側（wp2024）と古い方（wp2019）の2つある** */
  async fetchMedia() {
    const media = [];
    for (const root of this.wpRoots) {
      const url = `${root}/wp-json/wp/v2/media?mime_type=application/pdf&per_page=100&_fields=date,source_url,title`;
      let list = null;
      try {
        const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
        if (res.ok) list = await res.json();
      } catch {
        list = null;
      }
      await sleep(this.politenessMs);
      if (Array.isArray(list)) media.push(...list);
    }
    if (!media.length) {
      console.log("  ⚠️ 福井: PDFの一覧が取れない。出典の作りが変わった可能性がある");
      return null;
    }
    return media.map((m) => ({
      title: normalize(plain(m.title?.rendered ?? "")),
      url: m.source_url,
      date: String(m.date ?? ""),
    }));
  },

  /** 春季・秋季のやぐら表を1枚読む。**組めなければ null**（呼び出し側は次のPDFへ） */
  readSeasonSheet(raw, season, published) {
    const label = season === "spring" ? "春季" : "秋季";
    const flat = raw.lines.map((l) => normalize(l.text.replace(/\t/g, "")));
    const tournament = flat
      .map((t) => t.match(new RegExp(`第\\d+回北信越地区高等学校野球(?:大会)?福井県大会（${label}）`))?.[0])
      .find(Boolean);
    if (!tournament) return null;

    const stamp = published.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!stamp) {
      console.log(`  ⚠️ 福井(${label}): 掲載日が読めない（${published}）。1試合も出さない`);
      return [];
    }
    const [, py, pm, pd] = stamp.map(Number);

    /*
      ★**校名の下にあるのは「■はシード校」の1行。**
      夏の切り方（「準優勝」「2025年」の行より下を捨てる）は**ここでは使えない** ——
      春秋は「準優勝 若狭高校」が**スロット行より上**にあり、
      そのまま使うと紙の大半が消える。**「シード」を含む行を落とす。**
    */
    const cropped = {
      page: raw.page,
      lines: raw.lines
        .filter((l) => !/シード/.test(l.text))
        .map((l) => {
          const items = l.items.filter((i) => !/^[■□]$/.test(i.text.trim()));
          return { ...l, items, text: items.map((i) => i.text).join("\t") };
        })
        .filter((l) => l.items.length),
    };

    /*
      ★**秋の紙には開催期間の行が無い**（夏はあった）。**掲載日から月を決める。**
      掲載は決勝の当日〜数日後なので、**掲載日より大きい日は前の月。**
      ★**春の紙には日付が1つも無い**ので、この関数は使われない。
    */
    const monthOf = (day) => (day <= pd ? pm : ((pm + 10) % 12) + 1);
    const parseLabel = (t) => {
      const m = normalize(t).match(/^(\d{1,2})日$/);
      return m ? { date: `${monthOf(Number(m[1]))}/${Number(m[1])}` } : null;
    };

    /*
      ★**凡例の結び方が夏と違う。**
      夏は `(セ)\t…\tセーレン・ドリームスタジアム` と別々の断片だが、
      春秋は `（セ）---セーレン・ドリームスタジアム` で**1つの断片**。
    */
    const venues = new Map();
    for (const l of raw.lines) {
      for (const i of l.items) {
        const m = normalize(i.text.trim()).match(/^([（(][^）)]{1,4}[）)])[-‐‑–—―…・]{2,4}(.+)$/);
        if (m) venues.set(m[1], m[2].trim());
      }
    }

    const built = assembleSlotBracket(cropped, {
      roundLabels: ["決勝", "準決勝", "準々決勝"],
      venueSymbols: new Set(venues.keys()),
      parseLabel,
    });
    if (!built) {
      console.log(`  ⚠️ 福井: ${tournament} の組合せ表を組み立てられなかった。1試合も出さない`);
      return [];
    }

    // ---- 検算1: 勝ち抜き戦の算数 ----
    if (built.teams - built.games.length !== 1) {
      console.log(
        `  ⚠️ 福井(${label}): ${built.teams} チームに対し ${built.games.length} 試合（${built.teams - 1} のはず）。1試合も出さない`,
      );
      return [];
    }

    /*
      ---- 検算2: 表に印字された優勝校（秋は準優勝校も） ----
      ★**枝とは別の場所**に「優勝　敦賀気比高校」「準優勝　若狭高校」と書いてある。
    */
    const printedOf = (word) =>
      raw.lines.find((l) => new RegExp(`^${word}\t`).test(l.text))?.text.split("\t")[1] ?? null;
    const bareOf = (s) => normalizeSchoolName(s.replace(/[（(].*$/, "").replace(/高等?学?校$/, ""));
    const printed = printedOf("優勝");
    if (!printed) {
      console.log(`  ⚠️ 福井(${label}): 表に優勝校の記載が無い。検算できないので1試合も出さない`);
      return [];
    }
    const final = built.games.at(-1);
    const [champ, runner] = final.sa > final.sb ? [final.a, final.b] : [final.b, final.a];
    const startsWith = (built0, bare) => normalizeSchoolName(built0 ?? "").startsWith(bare.slice(0, 2));
    if (!startsWith(champ, bareOf(printed))) {
      console.log(
        `  ⚠️ 福井(${label}): 組み立てた優勝校が表と合わない（表「${printed}」/ 組み立て「${champ}」）。1試合も出さない`,
      );
      return [];
    }
    const printedRunner = printedOf("準優勝");
    if (printedRunner && !startsWith(runner, bareOf(printedRunner))) {
      console.log(
        `  ⚠️ 福井(${label}): 組み立てた準優勝校が表と合わない（表「${printedRunner}」/ 組み立て「${runner}」）。1試合も出さない`,
      );
      return [];
    }

    /*
      ---- 検算3: 日付 ----
      ★**春の紙は日付を1つも持たない。** 全部無いなら「日付なしの大会」として出す。
      **一部だけ読めているときは出さない**（取りこぼしと見分けが付かない）。
    */
    const dated = built.games.filter((g) => g.date).length;
    if (dated !== 0 && dated !== built.games.length) {
      console.log(
        `  ⚠️ 福井(${label}): 日付の読めない試合が ${built.games.length - dated} 件。1試合も出さない`,
      );
      return [];
    }

    console.log(
      `  （${tournament}: ${built.games.length} 試合 / 優勝 ${champ} / ${built.teams} チーム` +
        (dated ? "" : "・**日付なし**") + "）",
    );
    return built.games.map((g) => {
      let date = null;
      if (g.date) {
        const [mm, dd] = g.date.split("/");
        date = `${py}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
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
  },
};

/**
 * （一財）和歌山県高等学校野球連盟（`whbf.jp`）。
 *
 * ------------------------------------------------------------------
 * ★ 「見送り確定」を覆した（2026-08-17）
 *
 *   2026-08-14 に「トーナメント表しか無く、**日付も検算材料も無い**ので見送り」と
 *   判断していたが、**検算材料はあった。**
 *   お知らせの一覧に**優勝校と準優勝校が別々の記事として載っている**
 *   （「…和歌山大会　優勝　智辯学園和歌山高等学校」「…　準優勝　県立耐久高等学校」）。
 *   **表の枝とは別の場所から来る事実**なので、千葉・静岡と同じ強さの検算ができる。
 *
 *   ★**日付が無いのは本当。** 千葉・三重・宮崎と同じ `hasDates` 無しで出す。
 *
 * ------------------------------------------------------------------
 * ★ 紙の形（京都・福井と同じ「スロットが横一列・回戦は上へ」）
 *
 *   スロット番号 1〜36 が y=142 に横一列、校名はその下に縦書き。
 *   回戦は上へ 185（1回戦・4試合）→ 233（2回戦・16）→ 267（3回戦・8）
 *   → 319（準々決勝・4）→ 450（準決勝・2）→ 477（決勝・1）。36チーム・35試合。
 *
 * ------------------------------------------------------------------
 * ★ ここで踏んだところ
 *
 *   1. ★**校名の下に「Ａゾーン Ｂゾーン …」の行がある。** 校名は
 *      「スロット行より下」を全部拾うので、そのままだと**校名に `ゾーン` が混ざる。**
 *      福井の「歴代優勝校」と同じ形の落とし穴で、**中身で切る**
 *   2. **優勝校の呼び方が出典の中で違う。** 表は `智辯和歌山`、お知らせは
 *      `智辯学園和歌山高等学校`。**どちらも相手を含まない**ので `includes` では
 *      突き合わせられない。★**文字の並びが崩れていないか**で見る
 *      （`智辯和歌山` の5文字が、その順で `智辯学園和歌山高等学校` に現れるか）。
 *      「県立」「学園」のような語を消す方式は、消しすぎる県が必ず出る
 *   3. **コールドの注記が `８回C` `11回TB` で1つの断片**なので、
 *      `numbersOf` は拾わない（`stripInningMarks` も効かないが、効かなくてよい）
 *
 * ------------------------------------------------------------------
 * ★ 検算（合わなければ**1試合も出さない**）
 *
 *   - 36チーム − 35試合 = 1
 *   - **お知らせの優勝校・準優勝校と、組み立てた決勝が一致**
 *
 * **規約**: robots.txt は全許可（`User-agent: * / Disallow:`）。
 * サイトに転載・複製・営利・自動取得の記載は無い（2026-08-17 確認）。
 *
 * ★**夏だけ。** 春季・秋季の表は形を確かめてから足すこと。
 */
const wakayama = {
  slug: "wakayama",
  district: "和歌山",
  name: "和歌山県高等学校野球連盟",
  siteUrl: "https://www.whbf.jp/",
  politenessMs: 2000,
  seasons: { summer: "https://www.whbf.jp/news.html" },
  /*
    ~~★準決勝以降は抽選なので出さない。`partial: true` で警告を止める~~
    ★**2026-08-18 に外した。** 抽選の結果は紙に書いてあり、
    `readDrawnRounds()` で読めるようになったので**準々決勝4・準決勝2・決勝1が揃う。**
    `partial` を付けたままだと、**将来この読み取りが壊れて3試合が消えても
    警告が出ない**（それがいちばん困る）。**検査を効かせておく。**
  */
  async collect({ fetchHtml, season, url }) {
    if (season !== "summer") return [];
    const html = await fetchHtml(url);
    if (!html) return [];

    /*
      ★**優勝校と準優勝校は、別々のお知らせの見出しに書いてある。**
      「第１０８回全国高等学校野球選手権和歌山大会　優勝　智辯学園和歌山高等学校」
      **表の枝とは別の場所から来る事実**なので、これを検算に使う。
    */
    const text = normalize(plain(html));
    const verifyOf = (round) => {
      const of = (word) =>
        text.match(new RegExp(`第${round}回全国高等学校野球選手権和歌山大会\\s*${word}\\s*(\\S+?)高等?学校`))?.[1] ??
        null;
      const champion = of("優勝");
      const runnerUp = of("準優勝");
      return champion && runnerUp ? { champion, runnerUp } : null;
    };

    /** 勝ち上がりトーナメントのPDF。**同じ見出しで何度も差し替わる**ので新しい順に見る */
    const links = [];
    for (const m of html.matchAll(/<a[^>]+href=["']([^"']*uploads\/[^"']+\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const label = normalize(plain(m[2]));
      const hit = label.match(/第(\d+)回全国高等学校野球選手権和歌山大会.*勝ち上がり/);
      if (hit) links.push({ round: Number(hit[1]), url: new URL(m[1], url).toString() });
    }
    if (!links.length) {
      console.log("  ⚠️ 和歌山: 勝ち上がりトーナメントのPDFへのリンクが見つからない");
      return [];
    }
    links.sort((a, b) => b.round - a.round || b.url.localeCompare(a.url));

    for (const link of links.slice(0, 3)) {
      const verify = verifyOf(link.round);
      if (!verify) {
        console.log(`  ⚠️ 和歌山: 第${link.round}回の優勝・準優勝の記載が無い。検算できないので1試合も出さない`);
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
  /** 1枚のトーナメント表を読む。**組めなければ null**（呼び出し側は次のPDFへ） */
  readSheet(raw, season, verify) {
    const flat = raw.lines.map((l) => normalize(l.text.replace(/\t/g, "")));
    const tournament = flat.map((t) => t.match(/第\d+回全国高等学校野球選手権和歌山大会/)?.[0]).find(Boolean);
    if (!tournament) return null;

    /*
      ★**校名の下にある「Ａゾーン Ｂゾーン …」の行を落とす。**
      落とさないと校名に `ゾーン` の字が混ざる（福井の「歴代優勝校」と同じ形）。
    */
    const zoneY = raw.lines.filter((l) => /ゾ\tー\tン|ゾーン/.test(l.text)).map((l) => l.y);
    const floor = zoneY.length ? Math.max(...zoneY) : -Infinity;
    const cropped = { page: raw.page, lines: raw.lines.filter((l) => l.y > floor) };

    /*
      ★**この表もスコアが「連結線の両端」**（山口・宮崎と同じ）。
      3回戦の16個は中点から±1.1スロット離れており、既定の窓（0.95）では
      **1つも入らない。** その結果**準々決勝の帯が3回戦として選ばれ**、
      「数字8個（必要16）」で止まった。
    */
    const built = assembleSlotBracket(cropped, {
      roundLabels: ["決勝", "準決勝", "準々決勝"],
      hitSpan: true,
    });
    if (!built) {
      console.log(`  ⚠️ 和歌山: ${tournament} の組合せ表を組み立てられなかった。1試合も出さない`);
      return [];
    }
    if (built.teams - built.games.length !== 1) {
      console.log(
        `  ⚠️ 和歌山: ${built.teams} チームに対し ${built.games.length} 試合（${built.teams - 1} のはず）。1試合も出さない`,
      );
      return [];
    }

    /*
      ---- ★★準決勝以降は枝から決まらない ----

      表にこう書いてある:
        「準決勝戦・決勝戦の前日は休養日。**準決勝戦の組み合わせは、
          準々決勝戦の勝利校より順次抽選する。**」

      ★**つまり和歌山は、準々決勝の勝者4校を「くじ引き」で組み直す。**
      枝をそのまま伸ばすと**実際とは違う対戦を作る**（実際に作った ——
      組み立ては決勝を `和歌山工 vs 智辯和歌山` としたが、それは準決勝の
      カードで、本当の決勝は `耐久 vs 智辯和歌山` だった）。
      甲子園の準々決勝以降と同じで、**補おうとしないこと。**

      **準々決勝までを出す**（`partial: true` で「試合が欠けている」の警告を止める）。
      準決勝2試合と決勝1試合は出さない。35試合中32試合。

      ★★**ただし「出せない」ではなかった**（2026-08-18）。
      **抽選の結果そのものが紙に書いてある** —— 準決勝に進んだ4校が
      **縦書きの校名**で並んでいる（x≒111/310/508/719）。
      枝を伸ばすのではなく**そこを読む**ので、推測にはならない。
      下の `readDrawnRounds()` を見ること。
    */
    const dropped = new Set(["決勝", "準決勝"]);
    const games = built.games.filter((g) => !dropped.has(g.round));

    /*
      ---- 検算: お知らせの優勝校・準優勝校 ----

      決勝が組めない以上、決勝そのものとは突き合わせられない。
      代わりに**「優勝校と準優勝校は、必ず準々決勝の勝者4校の中にいる」**を見る。
      枝の組み立てが崩れていれば、この2校のどちらかは4校に入らない。

      ★**表とお知らせで呼び方が違う**（表 `智辯和歌山` / お知らせ `智辯学園和歌山高等学校`）。
      どちらも相手を含まないので `includes` では突き合わせられない。
      **文字の並びが崩れていないか**（部分列になっているか）で見る。
      「県立」「学園」のような語を消す方式は、消しすぎる県が必ず出る。
    */
    const subseq = (short, long) => {
      const s = normalizeSchoolName(short);
      const l = normalizeSchoolName(long);
      let i = 0;
      for (const c of l) if (c === s[i]) i += 1;
      return i === s.length;
    };
    const winners = games.filter((g) => g.round === "準々決勝").map((g) => (g.sa > g.sb ? g.a : g.b));
    if (winners.length !== 4) {
      console.log(`  ⚠️ 和歌山: 準々決勝が ${winners.length} 試合（4試合のはず）。1試合も出さない`);
      return [];
    }
    for (const [label, name] of [
      ["優勝", verify.champion],
      ["準優勝", verify.runnerUp],
    ]) {
      if (!winners.some((w) => subseq(w, name))) {
        console.log(
          `  ⚠️ 和歌山: お知らせの${label}校「${name}」が準々決勝の勝者（${winners.join("・")}）にいない。1試合も出さない`,
        );
        return [];
      }
    }

    /*
      ---- ★★抽選で決まった準決勝・決勝を、紙から読む（2026-08-18）----
      **枝からは決まらないが、結果は紙に書いてある。** 読めなければ
      準々決勝までを出す（今までどおり）。
    */
    const drawn = this.readDrawnRounds(cropped, winners, verify, subseq);
    for (const g of drawn) games.push(g);

    console.log(
      `  （${tournament}: ${games.length} 試合 / ${built.teams} チーム・**日付なし**` +
        (drawn.length ? "／準決勝以降は抽選の結果を紙から読んだ" : "／準決勝以降は読めなかったので出さない") +
        "）",
    );
    return games.map((g) => ({
      // ★**日付が1つも書かれていない。推測で埋めない**（千葉・三重・宮崎と同じ）
      date: null,
      season,
      tournament,
      round: g.round,
      venue: null,
      teams: [
        { display: g.a, score: g.sa, won: g.sa > g.sb },
        { display: g.b, score: g.sb, won: g.sb > g.sa },
      ],
    }));
  },
  /**
   * ★★**抽選で決まった準決勝・決勝を、紙から読む**（2026-08-18）。
   *
   * 和歌山は準決勝の組み合わせを準々決勝の勝者から抽選し直すので、
   * **枝を伸ばすと実在しない対戦ができる。** ただし
   * **抽選の結果そのものが紙に書いてある** —— 準決勝に進んだ4校が
   * 縦書きで並んでいる（第108回は x≒111/310/508/719）。
   * 枝ではなくそこを読むので、これは推測ではなく**読み取り**。
   *
   * ★**実際に枝の順とは違った。** 準々決勝の勝者は枝の順で
   * 熊野・智辯和歌山・耐久・和歌山工 だが、抽選後は
   * **熊野 vs 耐久／和歌山工 vs 智辯和歌山**。
   * 枝を伸ばしていたら2試合とも実在しない対戦になっていた。
   *
   * ★**切り分けは「紙に書いてある行」で決める。** 同じ範囲に
   * **準々決勝の勝者名（横書き）と休養日の注記**が入るので、
   * **注記の行より上・準決勝のスコアの帯より下**だけを見る
   * （座標の決め打ちをしない）。
   *
   * ★**読めない・辻褄が合わないときは空を返す**（準々決勝までを出す）。
   * ここは「補えないなら補わない」に倒す。
   */
  readDrawnRounds(page, qfWinners, verify, subseq) {
    const items = page.lines.flatMap((l) => l.items.map((i) => ({ x: i.x, y: l.y, t: i.text.trim() })));
    /** 「準決勝戦の組み合わせは…抽選する」の注記。ここより上が抽選後の世界 */
    const note = page.lines.filter((l) => /抽\s*選|休\s*養\s*日/.test(l.text.replace(/\t/g, ""))).map((l) => l.y);
    if (!note.length) {
      console.log("  ⚠️ 和歌山: 抽選の注記が見つからない。準決勝以降は出さない");
      return [];
    }
    const noteY = Math.max(...note);

    /** 注記より上にある「数字だけの帯」を下から順に */
    const bands = new Map();
    for (const it of items) {
      if (it.y <= noteY || !/^\d{1,2}$/.test(it.t)) continue;
      const k = [...bands.keys()].find((v) => Math.abs(v - it.y) <= 3) ?? it.y;
      if (!bands.has(k)) bands.set(k, []);
      bands.get(k).push({ x: it.x, v: Number(it.t) });
    }
    const sorted = [...bands.entries()].sort((a, b) => a[0] - b[0]);
    const sf = sorted.find(([, ns]) => ns.length === 4);
    const fin = sorted.find(([y, ns]) => ns.length === 2 && (!sf || y > sf[0]));
    if (!sf || !fin) {
      console.log("  ⚠️ 和歌山: 準決勝(4個)・決勝(2個)のスコアの帯が見つからない。準決勝以降は出さない");
      return [];
    }

    /*
      ★**準決勝に出た4校の縦書き。** 注記より上・準決勝のスコアより下。
      同じ列（x が近い）の字を**上から下**につなぐ。
    */
    const cols = new Map();
    for (const it of items) {
      if (it.y <= noteY || it.y >= sf[0] || !it.t) continue;
      if (/^\d{1,2}$/.test(it.t)) continue;
      const k = [...cols.keys()].find((v) => Math.abs(v - it.x) <= 4) ?? it.x;
      if (!cols.has(k)) cols.set(k, []);
      cols.get(k).push(it);
    }
    const names = [...cols.entries()]
      .map(([x, cs]) => ({ x, name: cs.sort((a, b) => b.y - a.y).map((c) => c.t).join("") }))
      .sort((a, b) => a.x - b.x);
    if (names.length !== 4) {
      console.log(`  ⚠️ 和歌山: 準決勝に進んだ校名が ${names.length} 列（4列のはず）。準決勝以降は出さない`);
      return [];
    }

    /*
      ---- ★検算1: 4校は準々決勝の勝者の並べ替えでなければならない ----
      **これがいちばん強い。** 読み違えれば、必ずどれかが勝者に無い名前になる。
    */
    const pool = [...qfWinners];
    for (const n of names) {
      const i = pool.findIndex((w) => normalizeSchoolName(w) === normalizeSchoolName(n.name));
      if (i < 0) {
        console.log(
          `  ⚠️ 和歌山: 準決勝の「${n.name}」が準々決勝の勝者（${qfWinners.join("・")}）に無い。準決勝以降は出さない`,
        );
        return [];
      }
      pool.splice(i, 1);
    }

    /** スコアは校名の列のすぐそば（実測で 3〜4ポイント） */
    const scoreFor = (n) => {
      const hit = sf[1].filter((s) => Math.abs(s.x - n.x) <= 12).sort((a, b) => Math.abs(a.x - n.x) - Math.abs(b.x - n.x));
      return hit[0] ?? null;
    };
    const withScore = names.map((n) => ({ ...n, s: scoreFor(n) }));
    if (withScore.some((n) => !n.s) || new Set(withScore.map((n) => n.s.x)).size !== 4) {
      console.log("  ⚠️ 和歌山: 準決勝のスコアを校名に結び付けられない。準決勝以降は出さない");
      return [];
    }

    const out = [];
    const finalists = [];
    for (const [p, q] of [[withScore[0], withScore[1]], [withScore[2], withScore[3]]]) {
      if (p.s.v === q.s.v) {
        console.log("  ⚠️ 和歌山: 準決勝が同点になっている。準決勝以降は出さない");
        return [];
      }
      out.push({ round: "準決勝", a: p.name, b: q.name, sa: p.s.v, sb: q.s.v });
      finalists.push(p.s.v > q.s.v ? p : q);
    }

    /*
      ---- 決勝 ----
      ★**左右どちらの山の得点かは、準決勝の2校のあいだにあるかで決める。**
      （紙は決勝の得点を、その山の2校の中ほどに置く）
    */
    const side = (lo, hi) => fin[1].filter((f) => f.x > Math.min(lo, hi) && f.x < Math.max(lo, hi));
    const left = side(withScore[0].x, withScore[1].x);
    const right = side(withScore[2].x, withScore[3].x);
    if (left.length !== 1 || right.length !== 1) {
      console.log("  ⚠️ 和歌山: 決勝の得点を左右の山に振り分けられない。準決勝以降は出さない");
      return out;
    }
    if (left[0].v === right[0].v) {
      console.log("  ⚠️ 和歌山: 決勝が同点になっている。決勝は出さない");
      return out;
    }
    out.push({ round: "決勝", a: finalists[0].name, b: finalists[1].name, sa: left[0].v, sb: right[0].v });

    /*
      ---- ★検算2: 決勝の優勝校・準優勝校がお知らせと一致するか ----
      ★**ここが石川ですり抜けた「構造は合うのに決勝の相手が違う」を止める。**
      枝ではなく紙から読んでいるので、**両校とも**突き合わせられる。
    */
    const champ = left[0].v > right[0].v ? finalists[0].name : finalists[1].name;
    const runner = left[0].v > right[0].v ? finalists[1].name : finalists[0].name;
    if (!subseq(champ, verify.champion) || !subseq(runner, verify.runnerUp)) {
      console.log(
        `  ⚠️ 和歌山: 読んだ決勝（${champ} / ${runner}）がお知らせ（${verify.champion} / ${verify.runnerUp}）と合わない。準決勝以降は出さない`,
      );
      return [];
    }
    return out;
  },
};

/**
 * 滋賀県高等学校野球連盟。★**「トーナメント表しか無い」の判定が誤りだった県**
 * （2026-08-17。以前は「1〜N と並ぶ行が無い＝勝者を回戦ごとに書き直す形式」に
 * 分類していたが、実際に開いたら**スロット1〜47の格子型**だった）。
 *
 * ------------------------------------------------------------------
 * ★ この県が今まで組めなかった理由は2つだけだった
 *
 *   1. **スロット番号が全角で、しかも潰れている。**
 *      47個のうち17個が「１５ １６ １７ １８」のように1つの断片になっており、
 *      `assembleSlotBracket` の `/^\d+$/` に1つも当たらない。
 *      → `explodeNumberRuns()` でほどく（幅を文字数で割る）
 *   2. **スコアが `11-1` と1つの断片。** 3回戦以降は全角で `４－３`。
 *      → `pairedScores: true`
 *
 *   どちらも既定を変えていないので、**既存25県の生成物は1バイトも変わらない。**
 *
 * ------------------------------------------------------------------
 * ★ 検算材料が3つある（この県がやりやすい理由）
 *
 *   1. **紙に「出場チーム：４７チーム」**と印刷されている（`verify.teams`）。
 *      「チーム数−試合数=1」だけだと**スロットを1つ読み落としても両方一緒に減って通る。**
 *   2. **優勝校が新着一覧のリンクの見出しに入っている**
 *      （「…滋賀大会 結果【優勝：八幡商業高校】」）。**枝とは別の場所から来る事実**なので、
 *      石川ですり抜けた「構造は合うのに決勝の相手が違う」を止められる（鹿児島と同じ形）。
 *   3. **同じ優勝校が紙の上部にも横書きで印字されている。**
 *
 * ------------------------------------------------------------------
 * ★ 日付は出さない（`date: null`）
 *
 *   紙には**日にちだけ**が書いてある（7・8・…・25）。**月がどこにも無い。**
 *   連盟のサイト本文にも、過去大会記録にも、リンクの見出しにも無い。
 *   PDFの `Last-Modified` は 7/25 で決勝の日と合うが、
 *   **連盟が後からPDFを差し替えれば静かに別の月に化ける**（山形のように
 *   同じファイルを上書きする連盟がある）。しかも**回数と年の突き合わせでは
 *   捕まらない**（月だけ変わるので）。静岡は「お知らせの掲載日」という
 *   **公開された日付**が使えたが、ここにはそれが無い。
 *   **推測で月を埋めない**（千葉・三重・宮崎・和歌山と同じ）。
 *
 *   球場は日付と無関係に読めるので出す（凡例の「皇 … マイネットスタジアム皇子山」）。
 *
 * ------------------------------------------------------------------
 * ★ 軟式を必ず外すこと
 *
 *   同じ一覧に「第７１回全国高等学校**軟式**野球選手権滋賀大会」が並んでいる。
 *   このサイトは硬式と軟式を同じ書き方で出しているので、**見出しとURLの両方**で外す
 *   （`nannshikiyama` と `nanshikiyama` の2つづりがある）。
 */
const shiga = {
  slug: "shiga",
  district: "滋賀",
  name: "滋賀県高等学校野球連盟",
  siteUrl: "http://www.biwa.ne.jp/~shigafed/",
  politenessMs: 2000,
  /**
   * 新着一覧に硬式の夏と春が並んでいる。**秋は「8／26 18：00公開予定」でまだ出ていない**
   * （出たら `autumn` を足せる。見出しは「秋季近畿地区高等学校野球滋賀県大会」）。
   */
  seasons: {
    summer: "http://www.biwa.ne.jp/~shigafed/",
    spring: "http://www.biwa.ne.jp/~shigafed/",
  },
  /** 季節ごとの、見出しの見分け方 */
  matcher: {
    summer: /第\d+回全国高等学校野球選手権滋賀大会/,
    spring: /春季近畿地区高等学校野球滋賀県大会/,
  },
  /**
   * 表の凡例「皇 … マイネットスタジアム皇子山」。1文字の記号 → 球場名。
   *
   * ★**行末に固定しないこと。** 凡例の行には**優勝校と甲子園出場回数が
   * 続けて書かれている**（`皇 … ﾏｲﾈｯﾄｽﾀｼﾞｱﾑ皇子山 八 幡 商`）。
   * `$` で締めると1件も取れず、**全試合の球場が空になる**（実際そうなった）。
   */
  venueLegend(page) {
    const map = new Map();
    for (const l of page.lines) {
      for (const m of l.text.matchAll(/(?:^|\t)([^\t\s])\t…\t([^\t]+)/g)) {
        // ★半角カナで書かれている（ﾏｲﾈｯﾄｽﾀｼﾞｱﾑ皇子山）
        const name = m[2].trim().normalize("NFKC");
        if (/球場|スタジアム|パーク|ドーム/.test(name)) map.set(m[1], name);
      }
    }
    return map;
  },
  /**
   * 連合チームの内訳。紙の下端に
   * 「出場チーム：４７チーム（連合：① 安曇川・湖南農業・石部・信楽・愛知・長浜農業」とある。
   *
   * ★**行をつないだ文字列からは切り出せない。** すぐ後ろに「選手宣誓：…」が続くので、
   * 最後の学校が「長浜農業選手宣誓」になる。**断片のまま、末尾で終わるものを見る。**
   *
   * ★**この県の連合には「愛知」が入っている**（滋賀県立愛知高校・あいち）。
   * 展開しないと 1校に結び付けてしまい、しかも**愛知県の学校と取り違える**
   * 種類の間違いになる（AGENTS.md の「県大会で県外の学校に結び付けない」）。
   */
  combinedLegend(page) {
    const found = new Set();
    for (const l of page.lines) {
      for (const it of l.items) {
        /*
          ★**中の空白と、末尾の閉じ括弧に気をつける。**
          夏は `合：① 安曇川・湖南農業・…・長浜農業`、
          春は `合：① 安曇川・ 湖南農業・…・長浜農業）` と**書き方が揃っていない**
          （春は「安曇川・」の後ろに空白があり、末尾に `）` が付く）。
          空白を落として括弧を外してから、`・` でつながっているものだけを採る。
        */
        const m = it.text.trim().match(/[①-⑳]\s*([^：:]+)$/);
        if (!m) continue;
        const names = m[1].replace(/[）)]\s*$/, "").replace(/\s+/g, "");
        if (/・/.test(names)) found.add(names);
      }
    }
    /*
      ★**2つ以上見つかったら展開しない。** いまは連合が1つ（①）しか無いので
      スロットの校名も「連合」だが、**将来 ①② と増えたら、どちらを当てるかは
      この関数では決められない。** 黙って最後のものを当てると
      **別のチームの内訳が画面に出る。** 展開しなければ「連合」のまま残り、
      `readSheet` の検算で**1試合も出さずに止まる**（気づける壊れ方にする）。
    */
    return found.size === 1 ? new Map([["連合", [...found][0]]]) : new Map();
  },
  async collect({ fetchHtml, season, url }) {
    const re = this.matcher[season];
    if (!re) return [];
    const html = await fetchHtml(url);
    if (!html) return [];

    /*
      ★**優勝校は見出しに入っている**（「…滋賀大会 結果【優勝：八幡商業高校】」）。
      **枝とは別の場所から来る事実**なので、これを検算に使う。
      見出しに無いものは（＝抽選結果・公開予定）そもそも結果ではないので拾わない。
    */
    const links = [];
    for (const m of html.matchAll(/<a[^>]+href=["']([^"']+\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const label = normalize(plain(m[2]));
      const href = new URL(m[1], url).toString();
      // ★軟式を外す。見出しとURLの両方で見る
      if (/軟式/.test(label) || /nan+shiki/i.test(href)) continue;
      if (!re.test(label)) continue;
      const champion = label.match(/優勝[：:]\s*([^】\s]+?)(?:高等学校|高校)?\s*[】]/)?.[1];
      if (!champion) continue;
      links.push({ href, label, champion });
    }
    if (!links.length) {
      console.log(`  ⚠️ 滋賀: ${season} の結果PDFへのリンクが見つからない`);
      return [];
    }

    for (const link of links.slice(0, 2)) {
      const parsed = await fetchPdfPages(link.href, { headers: UA });
      await sleep(this.politenessMs);
      if (!parsed?.length) {
        console.log(`  ⚠️ 滋賀: 「${link.label}」のPDFが読めない`);
        continue;
      }
      for (const raw of parsed) {
        const games = this.readSheet(raw, season, link.champion);
        if (games) return games;
      }
      /*
        ★**「大会名が読めなかった」を黙って通り過ぎないこと。**
        `readSheet` の null は「次のページ／次のPDFを見る」の合図なので、
        全部外れると**何の警告も出ずに0試合**になる。
        実際、春の表題が1文字ずつ空けて組まれていたせいで0試合になり、
        原因を探すのに時間がかかった。
      */
      console.log(`  ⚠️ 滋賀: 「${link.label}」のPDFに大会名の見出しが見つからない`);
    }
    return [];
  },
  /** 1枚のやぐら表を読む。**組めなければ null**（呼び出し側は次のPDFへ） */
  readSheet(raw, season, champion) {
    /*
      ★**先に数字の断片をほどく。** スロット番号が全角で、しかも
      「１５ １６ １７ １８」と潰れている（この県が今まで組めなかった理由の1つ）。
    */
    /*
      ★★**コールドの「7回」は縦書き。落とさないと1回戦の帯を取り違える**
      （余って組めなくなるのではなく、**組めてしまう**ほうの壊れ方。
      詳しくは `stripVerticalInningMarks` のコメント）。
      **数字と「回」の間隔は実測13.2ポイント**（スコアまでは26.4あるので巻き込まない）。
    */
    const page = stripVerticalInningMarks(explodeNumberRuns(raw), { dy: 16 });
    /*
      ★**空白を落としてから大会名を探すこと。**
      春の表題は**1文字ずつ空けて**組まれている
      （`令 和 ８ 年 度　春 季 近 畿 地 区 高 等 学 校 野 球 滋 賀 県 大 会`）。
      夏は空きが無いので、詰めた文字列で見れば両方に効く。
      **画面に出す大会名も詰めたほうを使う**（空きが入ったまま出さない）。
    */
    const flat = page.lines.map((l) => normalize(l.text.replace(/\t/g, "")).replace(/\s+/g, ""));
    const tournament = flat
      .map((t) => t.match(/第\d+回全国高等学校野球選手権滋賀大会|令和\d+年度春季近畿地区高等学校野球滋賀県大会/)?.[0])
      .find(Boolean);
    if (!tournament) return null;

    /*
      ★**紙が書いている出場チーム数と突き合わせる。**
      「チーム数−試合数=1」だけでは、**スロットを1つ読み落としたときに
      両方一緒に減って通ってしまう**（宮崎で分かった）。
    */
    const printedTeams = Number(flat.map((t) => t.match(/出場チーム[：:]\s*(\d+)\s*チーム/)?.[1]).find(Boolean));

    const venues = this.venueLegend(page);
    const expand = this.combinedLegend(page);

    /*
      ★**紙の下端の注記を、行ごと落としてから渡す。**

      「加盟校：５２校　出場チーム：４７チーム（連合：…　選手宣誓：神谷 恭伍（彦根東高校）」が
      **校名より下**に1行あり、校名を集める側は**スロット行より下を全部**見るので、
      x がたまたま近い断片が校名の末尾にくっつく。実際に
      **「草津加盟校：５２校」「伊香出場チーム：４７チーム（連」「近江（彦根東高校）」**
      という**実在しない校名が5件できた。**

      ★**座標で決め打ちしないこと。** 注記の行そのものを探して、そこから下を落とす。
      ★**検算材料（出場チーム数）と連合の内訳はこの行にある**ので、
      **落とす前に読んでおく**（上の `printedTeams` と `expand`）。
    */
    const noteY = page.lines.filter((l) => /加盟校|出場チーム|選手宣誓/.test(l.text)).map((l) => l.y);
    const cropped = noteY.length
      ? { page: page.page, lines: page.lines.filter((l) => l.y > Math.max(...noteY)) }
      : page;

    const built = assembleSlotBracket(cropped, {
      roundLabels: ["決勝", "準決勝", "準々決勝"],
      venueSymbols: new Set(venues.keys()),
      // ★スコアが `11-1`（1〜2回戦）と `４－３`（3回戦以降）で1つの断片
      pairedScores: true,
      /*
        ★**球場の記号はスコアの帯の26〜29ポイント「上」にある**（この紙は上に積む）。
        既定の窓では届かず、**1つ前の回戦の球場が付く**（実測で3回戦に
        その回戦では使っていない今津スタジアムが付いた）。
        次の回戦のスコアは間隔の1.0倍上なので、0.75倍まで広げれば混ざらない。
      */
      labelReach: 2.5,
      expand,
    });
    if (!built) {
      console.log(`  ⚠️ 滋賀: ${tournament} の組合せ表を組み立てられなかった。1試合も出さない`);
      return [];
    }

    // ---- 検算1: チーム数 − 試合数 = 1 ----
    if (built.teams - built.games.length !== 1) {
      console.log(
        `  ⚠️ 滋賀: ${built.teams} チームに対し ${built.games.length} 試合（${built.teams - 1} のはず）。1試合も出さない`,
      );
      return [];
    }
    /*
      ---- 検算2: 紙に印刷された出場チーム数 ----
      ★**無くても止めない**（京都の「合計」と同じ扱い）が、**黙って通さない。**
      検算が1つ減ったことに気づけないと、次に壊れたときの原因が分からなくなる。
    */
    if (!Number.isFinite(printedTeams)) {
      console.log(`  ⚠️ 滋賀: ${tournament} の紙に「出場チーム：Nチーム」が無い。検算が1つ減っている`);
    } else if (printedTeams !== built.teams) {
      console.log(
        `  ⚠️ 滋賀: 読めたスロットが ${built.teams}（紙は「出場チーム：${printedTeams}チーム」）。1試合も出さない`,
      );
      return [];
    }
    /*
      ---- 検算3: 見出しの優勝校 ----
      ★**枝とは別の場所から来る事実。** 石川ですり抜けた
      「構造は合うのに決勝の相手が違う」を止められるのはこれだけ。
      見出しは「八幡商業高校」、表は「八幡商」なので**前方一致で見る**
      （点数と違い、校名は書き方が揃わない）。
    */
    const built0 = normalizeSchoolName(built.champion ?? "");
    if (!built0 || !normalizeSchoolName(champion).startsWith(built0)) {
      console.log(
        `  ⚠️ 滋賀: 組み立てた優勝校が見出しと合わない（見出し「${champion}」/ 組み立て「${built.champion}」）。1試合も出さない`,
      );
      return [];
    }
    /*
      ---- 検算4: 終盤の試合数が 4・2・1 か ----
      ★**校名では検算しない**（出典が同じ学校を回戦ごとに書き分けることがある）。
      **全回戦に半分を要求しない**（シード校が2回戦から登場する）。
    */
    for (const [round, want] of [["準々決勝", 4], ["準決勝", 2], ["決勝", 1]]) {
      const got = built.games.filter((g) => g.round === round).length;
      if (got !== want) {
        console.log(`  ⚠️ 滋賀: ${round}が ${got} 試合（${want} のはず）。1試合も出さない`);
        return [];
      }
    }
    /*
      ---- 検算5: 連合チームを展開できたか ----
      展開できないと「連合」という実在しない校名が画面に出る。
    */
    const bare = built.games.flatMap((g) => [g.a, g.b]).filter((n) => /^連合[①-⑳]?$/.test(n));
    if (bare.length) {
      console.log("  ⚠️ 滋賀: 連合チームの内訳が紙から読めない。1試合も出さない");
      return [];
    }

    console.log(
      `  （${tournament}: ${built.games.length} 試合 / 優勝 ${built.champion} / ${built.teams} チーム・**日付なし**）`,
    );
    return built.games.map((g) => ({
      // ★**日にちしか書かれていない。月を推測で埋めない**（上のコメント）
      date: null,
      season,
      tournament,
      round: g.round,
      venue: venues.get(g.venue) ?? null,
      teams: [
        { display: g.a, score: g.sa, won: g.sa > g.sb },
        { display: g.b, score: g.sb, won: g.sb > g.sa },
      ],
    }));
  },
};

/**
 * 兵庫県高等学校野球連盟（`hyogo-koyaren.or.jp`）。
 * ★**「履歴が無い（当日のみ）」に分類していたが誤りだった**（2026-08-18）。
 * トップページに**大会が終わったあとの結果PDFが4枚**並んでいる。
 * 規約の制限は無い（Copyright表記のみ・robots.txt は404）。
 *
 * ------------------------------------------------------------------
 * ★★ この県は**1つの大会が4枚のPDFに分かれている**（このリポジトリで初）
 *
 *   108hyogo.pdf        「4回戦まで」… **16ブロック × 9チーム = 128試合**
 *   108hyogo 5R.pdf     「5回戦」    … 8試合（ブロックの優勝校16校）
 *   108hyogo quarter.pdf「準々決勝戦」… 4試合
 *   108hyogo final.pdf  「準決勝・決勝戦」… 3試合
 *
 *   144チーム・143試合。★**1枚ずつでは「チーム数−試合数=1」が成立しない**ので、
 *   **4枚を突き合わせて検算する**（下記）。
 *
 * ------------------------------------------------------------------
 * ★ 紙の形は2種類
 *
 *   **本体**… 4列×4段の**16ブロック**が格子に並ぶ。1ブロックは
 *   「スロット番号1〜9の列 → 校名 → 回戦ごとの得点の列」が**左から右**へ並ぶ縦型。
 *   ★**校名と得点がスロット番号の同じ側にある**ので、`assembleSlotBracket` の
 *   前提（校名と回戦が反対側）に合わない。**スロット番号の列を校名と得点のあいだへ
 *   動かしてから渡す**（スロット軸は y なので、x を動かしても順番は変わらない）。
 *
 *   **残り3枚**… 校名を縦に並べ、得点を1本の列に置くだけの単純な形。
 *   ブロックが無いので専用の読み手（`readSimpleSheet`）で読む。
 *
 * ------------------------------------------------------------------
 * ★ 検算（4枚をまたぐのがこの県の要）
 *
 *   1. 各ブロックが **9チーム・8試合**（`assembleSlotBracket` の構造検査）
 *   2. ブロックは **16個**ちょうど（見出し①〜⑯）
 *   3. ★★**5回戦に出た16校が、ブロックの優勝校16校と完全に一致する**
 *      —— **枚をまたぐので、本体の読み違いをここで捕まえられる。**
 *      1ブロックでも組み立てを間違えれば、必ずどれかが一致しなくなる
 *   4. 準々決勝の8校 = 5回戦の勝者8校／準決勝の4校 = 準々決勝の勝者4校
 *   5. 合計 143試合（144チーム − 1）
 */
const hyogo = {
  slug: "hyogo",
  district: "兵庫",
  name: "兵庫県高等学校野球連盟",
  siteUrl: "http://www.hyogo-koyaren.or.jp/",
  politenessMs: 2000,
  // **夏だけ。** 春季（`26haru.pdf`）と秋季は紙の形が未確認
  seasons: { summer: "http://www.hyogo-koyaren.or.jp/index.php" },
  /**
   * トップページから4枚を見分ける。★**軟式を必ず外す**
   * （同じ一覧に `71hyogo.pdf`＝第71回軟式、`N26haru.pdf` などが並ぶ。
   * 軟式は**ファイル名が `N` で始まる**か「軟式」と書いてある）。
   */
  sheets: [
    { key: "main", label: /4回戦まで/, games: 128 },
    { key: "r5", label: /5回戦/, games: 8 },
    { key: "quarter", label: /準々決勝/, games: 4 },
    { key: "final", label: /準決勝|決勝/, games: 3 },
  ],
  async collect({ fetchHtml, season, url }) {
    if (season !== "summer") return [];
    const html = await fetchHtml(url);
    if (!html) return [];

    /** 見出し → PDFのURL。**「108hyogo」で始まるものだけ**を見る（軟式・春季を外す） */
    const found = new Map();
    for (const m of html.matchAll(/<a[^>]+href=["']([^"']+\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const href = new URL(m[1], url).toString();
      const file = decodeURIComponent(href.split("/").pop() ?? "");
      if (!/^108hyogo/i.test(file)) continue;
      const label = normalize(plain(m[2]));
      for (const s of this.sheets) {
        if (!found.has(s.key) && s.label.test(label)) found.set(s.key, { href, label });
      }
    }
    const missing = this.sheets.filter((s) => !found.has(s.key));
    if (missing.length) {
      console.log(`  ⚠️ 兵庫: ${missing.map((s) => s.key).join("・")} のPDFが見つからない。1試合も出さない`);
      return [];
    }

    const sheets = new Map();
    for (const s of this.sheets) {
      const { href } = found.get(s.key);
      const parsed = await fetchPdfPages(href, { headers: UA });
      await sleep(this.politenessMs);
      if (!parsed?.length) {
        console.log(`  ⚠️ 兵庫: ${s.key} のPDFが読めない。1試合も出さない`);
        return [];
      }
      sheets.set(s.key, parsed[0]);
    }

    const tournament = raw2flat(sheets.get("main"))
      .map((t) => t.match(/第\d+回全国高校野球選手権兵庫大会/)?.[0])
      .find(Boolean);
    if (!tournament) {
      console.log("  ⚠️ 兵庫: 本体のPDFに大会名の見出しが無い。1試合も出さない");
      return [];
    }
    // 「第108回全国高校野球選手権兵庫大会」→ 画面には全国と同じ書き方でそろえる
    const title = tournament.replace("全国高校野球選手権", "全国高等学校野球選手権");

    const blocks = this.readBlocks(sheets.get("main"));
    if (!blocks) return [];
    const later = [];
    for (const [key, round] of [["r5", "5回戦"], ["quarter", "準々決勝"], ["final", null]]) {
      const got = this.readSimpleSheet(sheets.get(key), key, round);
      if (!got) return [];
      later.push(...got);
    }

    const games = [...blocks.games, ...later];
    if (!this.verify(blocks, later, games)) return [];

    console.log(`  （${title}: ${games.length} 試合 / ${blocks.teams} チーム・16ブロック・**日付なし**）`);
    return games.map((g) => ({
      /*
        ★**日付を出さない。** 本体の紙は**ブロックごとに1つの日付も書いていない**
        （見出しの「7月18日」は印刷日）。残り3枚には日付があるが、
        **128試合に日付が無いまま15試合だけ日付を出すと、県のページの並びが
        「日付のある試合が先」になって回戦の順が崩れる。** そろえて出さない。
      */
      date: null,
      season,
      tournament: title,
      round: g.round,
      venue: null,
      teams: [
        { display: g.a, score: g.sa, won: g.sa > g.sb },
        { display: g.b, score: g.sb, won: g.sb > g.sa },
      ],
    }));
  },
  /**
   * 本体（16ブロック）を読む。
   *
   * ★**座標を決め打ちしない。** 見出し①〜⑯の位置から
   * 列（x が同じもの）と段（y が同じもの）を作る。
   */
  readBlocks(raw) {
    const marks = [];
    for (const l of raw.lines) {
      for (const i of l.items) {
        if (/^[①-⑳]$/.test(i.text.trim())) marks.push({ x: i.x, y: l.y, t: i.text.trim() });
      }
    }
    if (marks.length !== 16) {
      console.log(`  ⚠️ 兵庫: ブロックの見出しが ${marks.length} 個（16個のはず）。1試合も出さない`);
      return null;
    }
    const uniq = (vs) => [...new Set(vs.map((v) => Math.round(v)))].sort((a, b) => a - b);
    const colX = uniq(marks.map((m) => m.x));
    const rowY = uniq(marks.map((m) => m.y)).reverse(); // 上から
    if (colX.length !== 4 || rowY.length !== 4) {
      console.log(`  ⚠️ 兵庫: ブロックが ${colX.length}列 × ${rowY.length}段（4×4のはず）。1試合も出さない`);
      return null;
    }
    /** 列の幅。いちばん右の列は次が無いので、他の列と同じ幅とみなす */
    const pitchX = colX[1] - colX[0];

    const games = [];
    const winners = [];
    let teams = 0;
    for (const m of marks.sort((a, b) => b.y - a.y || a.x - b.x)) {
      const xlo = m.x - 6;
      const xhi = m.x + pitchX - 6;
      const below = rowY.find((y) => y < m.y - 1);
      const ylo = below ?? 0;
      const yhi = m.y - 1;

      /*
        ★**スロット番号の列を、校名と得点のあいだへ動かす。**
        この紙は「スロット番号 → 校名 → 得点」と**同じ向き**に並ぶので、
        そのままでは `assembleSlotBracket` が校名を帯として読む。
        スロット軸は y なので、**x を動かしてもスロットの順番は変わらない。**
        ★**得点の列から 20ポイント以上離すこと**（近いと1回戦の得点を
        スロット番号として拾う。実測で 14ポイントでは足りなかった）。
        校名は見出しから +13〜+35、最初の得点の列は +92 なので **+60** に置く。
      */
      const lines = raw.lines
        .filter((l) => l.y > ylo && l.y <= yhi)
        .map((l) => {
          const items = l.items
            .filter((i) => i.x >= xlo && i.x <= xhi)
            // ★コールド・延長・タイブレークの注記は落とす（校名の側にも得点の側にも混ざる）
            .filter((i) => !/^[（(]|※/.test(i.text.trim()))
            .map((i) =>
              Math.abs(i.x - (m.x + 3)) < 5 && /^\d+$/.test(i.text.trim()) ? { ...i, x: m.x + 60 } : i,
            )
            .sort((a, b) => a.x - b.x);
          return { y: l.y, items, text: items.map((i) => i.text).join("\t") };
        })
        .filter((l) => l.items.length);

      const built = assembleSlotBracket(orientPage({ page: 1, lines }, { slotAxis: "y", rowTolerance: 2 }), {
        roundLabels: [],
        nameOrder: "asc",
        /*
          ★**ブロックの大きさは一定ではない**（実測で9チームと10チームが混在）。
          **9チームのブロックは1回戦がちょうど1試合**（9→8→4→2→1）なので、
          既定（2試合ぶん＝4個）のままだと1回戦の帯が飛ばされ、
          **2回戦が1回戦として読まれる。**
        */
        minFirstRound: 1,
      });
      if (!built || built.games.length !== built.teams - 1) {
        console.log(
          `  ⚠️ 兵庫: ブロック${m.t}を組み立てられない（${built ? `${built.teams}チーム/${built.games.length}試合` : "null"}）。1試合も出さない`,
        );
        return null;
      }
      games.push(...built.games);
      winners.push(built.champion);
      teams += built.teams;
    }
    return { games, winners, teams };
  },
  /**
   * 5回戦・準々決勝・準決勝決勝の3枚を読む。
   *
   * ★**本体とは別の、ずっと単純な形。** 校名を縦に並べ、
   * 得点は**1本（5回戦は左右2本）の列**に置くだけ。
   * 「2つの得点は、その試合の2校の中間の高さをはさむ」だけで組める。
   */
  readSimpleSheet(raw, key, fixedRound) {
    /** 得点。**列ごと**にまとめる（5回戦は左右2本、準決勝決勝は準決勝用と決勝用の2本） */
    const nums = [];
    for (const l of raw.lines) {
      for (const i of l.items) {
        if (/^\d{1,2}$/.test(i.text.trim())) nums.push({ x: i.x, y: l.y, v: Number(i.text.trim()) });
      }
    }
    const cols = new Map();
    for (const n of nums) {
      const k = [...cols.keys()].find((v) => Math.abs(v - n.x) <= 8) ?? n.x;
      if (!cols.has(k)) cols.set(k, []);
      cols.get(k).push(n);
    }
    const colXs = [...cols.keys()].sort((a, b) => a - b);

    /*
      ★★**校名は「得点の列で区切った帯」ごとに組み立てること。**
      5回戦の紙は**左右2組**が同じ高さに並ぶので、行の文字を素直につなぐと
      **「西脇工業小野」のように2校がくっつく**（実際にそうなった）。

      ★**文字の間隔では切り分けられない。** この紙は校名を一定の幅に
      引き伸ばして組むので、「小 野」の字間（84ポイント）が
      左右の組の隙間（172ポイント）と同じ桁になる。**得点の列で切る。**
    */
    const region = (x) => {
      const i = colXs.findIndex((c) => x < c - 5);
      return i < 0 ? colXs.length : i;
    };
    const teams = [];
    for (const l of raw.lines) {
      const byRegion = new Map();
      for (const i of l.items) {
        const t = i.text.trim();
        if (!t || /^\d+$/.test(t) || /^[（(]|※|：|:/.test(t)) continue;
        const r = region(i.x);
        if (!byRegion.has(r)) byRegion.set(r, []);
        byRegion.get(r).push(i);
      }
      for (const [r, cs] of byRegion) {
        const name = cs.sort((a, b) => a.x - b.x).map((i) => i.text.trim()).join("").replace(/\s+/g, "");
        // 見出し・脚注を外す（校名にこれらの語は入らない）
        if (/大会|組合せ|試合日|球場|場所|本部|回戦|決勝|年|月|日/.test(name)) continue;
        teams.push({ y: l.y, x: Math.min(...cs.map((i) => i.x)), region: r, name });
      }
    }

    const out = [];
    for (let k = 0; k < colXs.length; k++) {
      const cx = colXs[k];
      const list = cols.get(cx);
      if (list.length % 2 !== 0) continue;
      /*
        ★**その得点の列に対応するのは、同じ帯にいる校名。**
        帯が空なら、**それより浅い帯**（＝同じ校名を使う深い回戦。
        準決勝決勝の紙の「決勝」がこれ）を使う。
      */
      const here = teams.filter((t) => t.region === k);
      const pool = here.length ? here : teams.filter((t) => t.region < k);
      const sorted = [...list].sort((a, b) => b.y - a.y);
      for (let i = 0; i + 1 < sorted.length; i += 2) {
        const hi = sorted[i];
        const lo = sorted[i + 1];
        const mid = (hi.y + lo.y) / 2;
        // 中間の高さをはさんで、いちばん近い上下1校ずつ
        const above = pool.filter((t) => t.y > mid).sort((a, b) => a.y - b.y)[0];
        const below = pool.filter((t) => t.y < mid).sort((a, b) => b.y - a.y)[0];
        if (!above || !below) continue;
        out.push({ round: fixedRound, a: above.name, b: below.name, sa: hi.v, sb: lo.v, cx, mid });
      }
    }
    /*
      ★**準決勝・決勝の紙だけは2つの回戦が入っている。**
      得点の列が浅い順に「準決勝2試合」「決勝1試合」。
    */
    if (key === "final") {
      const byCol = new Map();
      for (const g of out) byCol.set(g.cx, [...(byCol.get(g.cx) ?? []), g]);
      const ordered = [...byCol.entries()].sort((a, b) => a[0] - b[0]);
      if (ordered.length !== 2 || ordered[0][1].length !== 2 || ordered[1][1].length !== 1) {
        console.log("  ⚠️ 兵庫: 準決勝2試合・決勝1試合として読めない。1試合も出さない");
        return null;
      }
      for (const g of ordered[0][1]) g.round = "準決勝";
      ordered[1][1][0].round = "決勝";
      /*
        ★**決勝は「準決勝の勝者2校」で組み直す。** 決勝の得点の左側にいるのは
        準決勝の4校なので、そのままでは負けた学校を拾いうる。
      */
      const winners = ordered[0][1].map((g) => (g.sa > g.sb ? g.a : g.b));
      ordered[1][1][0].a = winners[0];
      ordered[1][1][0].b = winners[1];
    }
    const want = this.sheets.find((s) => s.key === key).games;
    if (out.length !== want) {
      console.log(`  ⚠️ 兵庫: ${key} が ${out.length} 試合（${want} 試合のはず）。1試合も出さない`);
      return null;
    }
    return out.map(({ round, a, b, sa, sb }) => ({ round, a, b, sa, sb }));
  },
  /** ★★4枚をまたぐ検算。この県の要 */
  verify(blocks, later, games) {
    const key = (s) => normalizeSchoolName(s ?? "");
    /*
      ★★**紙ごとに略し方が違う**（実測）。
      本体「市尼崎・西脇工・神戸商・明石商・神戸学院大附属」／
      5回戦「市立尼崎・西脇工業・神戸商業・明石商業・神戸学院大附」。
      **完全一致では突き合わせられない。**

      ★**どちらかがもう一方の部分列**なら同じ学校とみなす
      （「市尼崎」⊂「市立尼崎」、「神戸学院大附」⊂「神戸学院大附属」）。
      ★**緩いのは1組の比べ方だけで、要求は「16校が過不足なく1対1で対応する」。**
      1ブロックでも読み違えれば、必ずどれかが余る。
      ★**先に完全一致を取ってから**部分列を見る（取り違えを減らす）。
    */
    const sub = (a, b) => {
      let i = 0;
      for (const c of b) if (c === a[i]) i += 1;
      return i === a.length;
    };
    const alike = (a, b) => a === b || sub(a, b) || sub(b, a);
    /** xs と ys が1対1で対応するか。対応しなければ余りを返す */
    const match = (xs, ys) => {
      const bag = [...ys].map(key);
      const rest = [];
      const left = [];
      for (const x of xs.map(key)) {
        const i = bag.indexOf(x);
        if (i >= 0) bag.splice(i, 1);
        else rest.push(x);
      }
      for (const x of rest) {
        const i = bag.findIndex((b) => alike(x, b));
        if (i >= 0) bag.splice(i, 1);
        else left.push(x);
      }
      return { ok: xs.length === ys.length && !left.length && !bag.length, left, bag };
    };
    const same = (xs, ys) => match(xs, ys).ok;
    /** ★合わないときは**どこが違うか**を出す（16校を目で見比べるのは無理） */
    const diff = (xs, ys) => {
      const { left, bag } = match(xs, ys);
      return `後の紙だけ: ${left.join("・") || "なし"} / 前の紙だけ: ${bag.join("・") || "なし"}`;
    };

    const r5 = later.filter((g) => g.round === "5回戦");
    const qf = later.filter((g) => g.round === "準々決勝");
    const sf = later.filter((g) => g.round === "準決勝");
    const fin = later.filter((g) => g.round === "決勝");

    /*
      ★★**5回戦に出た16校が、ブロックの優勝校16校と一致するか。**
      **枚をまたぐ検算なので、本体の読み違いをここで捕まえられる。**
      1ブロックでも組み立てを間違えれば、必ずどれかが一致しなくなる。
    */
    if (!same(r5.flatMap((g) => [g.a, g.b]), blocks.winners)) {
      console.log(
        `  ⚠️ 兵庫: 5回戦の16校が、ブロックの優勝校16校と合わない（${diff(r5.flatMap((g) => [g.a, g.b]), blocks.winners)}）。1試合も出さない`,
      );
      return false;
    }
    const winnersOf = (gs) => gs.map((g) => (g.sa > g.sb ? g.a : g.b));
    for (const [name, prev, next] of [
      ["準々決勝", winnersOf(r5), qf],
      ["準決勝", winnersOf(qf), sf],
      ["決勝", winnersOf(sf), fin],
    ]) {
      if (!same(next.flatMap((g) => [g.a, g.b]), prev)) {
        console.log(`  ⚠️ 兵庫: ${name}の出場校が、前の回戦の勝者と合わない。1試合も出さない`);
        return false;
      }
    }
    /*
      ★**合計は「チーム数 − 1」。** ブロックの大きさは一定ではない
      （実測で9チームと10チームが混在）ので、**数を決め打ちしない。**
    */
    if (games.length !== blocks.teams - 1) {
      console.log(`  ⚠️ 兵庫: 合計 ${games.length} 試合（${blocks.teams} チームなので ${blocks.teams - 1} のはず）。1試合も出さない`);
      return false;
    }
    return true;
  },
};

/** 行を「タブを外して全角を寄せた文字列」にする（大会名を探すため） */
function raw2flat(page) {
  return page.lines.map((l) => normalize(l.text.replace(/\t/g, "")));
}

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
/**
 * 福島県高等学校野球連盟（`fks-kouyaren.com`）。
 *
 * ------------------------------------------------------------------
 * ★★ 規約：**「禁止」ではなく「ご遠慮下さい」**（2026-08-20 に読み直した）
 *
 *   トップに「**本連盟ホームページ内のコンテンツの無断使用はご遠慮下さい。**」とある。
 *
 *   ★**他の6県とは表現の強さが違う。** 北海道・青森・秋田・東京・鳥取は
 *   「全ての画像・文章・**データ**の無断転用・転載を**お断りします**」と
 *   **データを名指しして断って**おり、宮城は**引用まで明示的に禁じている。**
 *   福島は**名指しが「コンテンツ」と曖昧で、表現も「ご遠慮下さい」**。
 *
 *   ★★**この差を踏まえたうえで、運営者の判断（2026-08-21）で取ることにした。**
 *   ★**取るのは試合結果の数値と校名・日付・球場・回戦だけ。**
 *   このリポジトリ共通の整理（数値＝事実を引用する）から外れないこと。
 *
 * ------------------------------------------------------------------
 * ★★ 出典の形 ── **スコア表。組み立てが要らない**
 *
 *   石川・山形・愛媛・栃木と同じ「スコア表型」で、**枝から対戦を推測する余地が無い**
 *   （対戦相手が同じ表に印刷されている）。紙は2本ある。
 *
 *   | URL | 中身 |
 *   |---|---|
 *   | `taikai/shiaishousai.pdf` | 「県 試合結果詳細」＝**いま開催中/直近の大会** |
 *   | `taikai/konnendo_kiroku/konnendo_kiroku.pdf` | 「今年度 大会記録」＝**今年度の終わった大会** |
 *
 *   ★★**どちらにどの大会が入るかは決まっていない。**
 *   2026-08-21 時点では前者が選手権（第108回・61試合）、後者が春季（第78回・28試合）。
 *   ★**だから「ファイルで季節を決めない」。** 紙のページごとの見出しから大会名を読み、
 *   そこに入っている語（選手権／春季／秋季）で季節を決める。
 *   **同じ試合が両方に入っても、呼び出し側が日付＋校名で重複を落とす。**
 *
 *   ★**`taikai/touhokutaikai.pdf`（東北大会）は読まない。** 他県の学校が出てくる。
 *   見出しに「福島大会」「福島県大会」が入っていることを必ず要求すること。
 *
 *   紙の中身:
 *
 *     第108回 全国高等学校野球選手権福島大会          第１０日
 *     決勝   令和 8 年 7 月 25 日 ( 土 )  2時間53分  ヨーク開成山スタジアム
 *     チ ー ム 名   1  2  3 … 15   計
 *     東日大昌平    3  2  0 …       10
 *     学 法 石 川   1  0  1 …        7
 *
 * ------------------------------------------------------------------
 * ★★ 踏んだところ 1 ── **1行に試合が横に2つ並ぶ**（前セッションの積み残し）
 *
 *   ★**見出し行（`チ ー ム 名 … 計`）には「チーム名」が2つある。**
 *   左の段が x≈80〜660、右の段が x≈685〜1250。
 *   **見出し行1本＝1試合として読んでいたので、32試合しか取れていなかった。**
 *   ★**段ごとに「校名の列・イニングの列・計の列」を持たせて、行を段の範囲で切る。**
 *
 *   ★**段の境目は「左の『計』と右の『チーム名』の中点」にすること。**
 *   見出しの x で割ると**日付・回戦の行が左にはみ出していて**取り違える
 *   （右の `３回戦` は x=685 で、右の見出し x=696 より**左**にある）。
 *
 *   ★★**そもそも「このPDFには32試合しか載っていない（福島は約75校）」という
 *   前セッションの記録も誤りだった。** 32は**見出し行の数**で、
 *   段まで数えれば **61試合**（1回戦30・2回戦16・3回戦8・準々4・準決2・決勝1）。
 *   **62チーム − 61試合 = 1** で勝ち抜きの算数も合う。
 *
 * ------------------------------------------------------------------
 * ★★ 踏んだところ 2 ── **両校の行のあいだにコールドの注記が挟まる**
 *
 *   「見出しの下2行が両校」ではない。
 *
 *     y=1770.3  帝 京 安 積 0 0 0 …  0     ← 1校目
 *     y=1752.3  ６回コールド                ← ★これが挟まる
 *     y=1736.2  聖 光 学 院 3 0 4 … 10     ← 2校目
 *
 *   ★**「校名と合計がそろう行」を上から2本拾う**形にする。
 *   投手の行（`( 帝 京 ) 緑川 － 笹島`）は合計の列に数字が無いので自然に落ちる。
 *
 * ------------------------------------------------------------------
 * ★★ 踏んだところ 3 ── **2桁の得点が校名の列に食い込む**
 *
 *   `相馬連合@100  13@198  5@232 …` に対しイニング「1」の見出しは x=204。
 *   **2桁の断片は左端が1桁より約5ポイント左に出る**ので、
 *   「イニングの見出しより左＝校名」だと **`相馬連合13`** になった。
 *   ★**境目はイニングの間隔の半分だけ手前に取る**（204 − 29/2 ＝ 189.5）。
 *   これで2桁でも落ちる。**桁数で場合分けしないこと。**
 *
 * ------------------------------------------------------------------
 * ★ 3位決定戦は出す（春季にある）
 *
 *   ★**組み立てをしない出典なので、宮崎（やぐら表）とは扱いが違う。**
 *   長野・奈良・島根などと同じで **`3位決定戦` として出す。**
 *   ★**勝ち抜きの算数（チーム数 − 試合数 = 1）からは外すこと。**
 *
 * ------------------------------------------------------------------
 * ★★ 検算
 *
 *   ★★**「決勝が読めた大会」だけ強い検算をかける。**
 *   `shiaishousai.pdf` は**開催中も毎日更新される**紙なので、
 *   **途中の大会に「勝ち抜きの算数」や「勝者が次の回戦にいるか」を要求すると、
 *   大会期間中ずっと1試合も出せなくなる。**
 *
 *   | | いつ | 中身 |
 *   |---|---|---|
 *   | A | 常に | **前の回戦で負けた学校が次の回戦に出ていない**（途中でも成り立つ） |
 *   | B | 決勝が読めたとき | **前の回戦の勝者が全員、次の回戦に出ている** |
 *   | C | 決勝が読めたとき | **チーム数 − 試合数 = 1**（3位決定戦は除く） |
 *   | D | 組合せ表が同じ大会のとき | **印字された優勝校と決勝の勝者が一致** |
 *
 *   ★**BとCが、石川で通ってしまった「構造は合うのに相手が違う」に相当する検査。**
 *   この出典は対戦相手が同じ表に印刷されているので相手を取り違える余地は無いが、
 *   **段の読み落とし（まさに前セッションの不具合）はBとCで必ず出る。**
 *
 *   ★**1試合ぶんの表がうまく読めないときは、その試合だけ飛ばして警告**
 *   （栃木・島根・岩手と同じ。組み立てが要らない出典の流儀）。
 *   **落とした試合があれば C が合わなくなる**ので、終わった大会なら必ず気づける。
 */
const fukushima = {
  slug: "fukushima",
  district: "福島",
  name: "福島県高等学校野球連盟",
  siteUrl: "https://www.fks-kouyaren.com/",
  politenessMs: 2000,
  /** ★**季節でURLを分けない。** どの紙にどの大会が入るかは決まっていない（上の説明） */
  seasons: {
    spring: "https://www.fks-kouyaren.com/",
    summer: "https://www.fks-kouyaren.com/",
    autumn: "https://www.fks-kouyaren.com/",
  },
  sheets: [
    "http://fks-kouyaren.com/taikai/shiaishousai.pdf",
    "http://fks-kouyaren.com/taikai/konnendo_kiroku/konnendo_kiroku.pdf",
  ],
  /** 組合せ表。**優勝校が文章で書いてある**（検算D） */
  bracketSheet: "http://fks-kouyaren.com/taikai/kumiawase.pdf",
  /*
    ★**同じPDFを季節ごとに取りに行かない。**
    3季 × 3本 ＝ 9回になる。相手は連盟の小さなサーバーなので、
    1回の実行のあいだは読んだものを使い回す。
    ★**約束（Promise）のまま持つこと。** 値を持つと、取得中にもう一度呼ばれたときに
    二重取得になる（いまの呼び出しは順番だが、そこに依存しない）。
  */
  _pdfs: new Map(),
  pdf(url) {
    if (!this._pdfs.has(url)) {
      this._pdfs.set(
        url,
        (async () => {
          const parsed = await fetchPdfPages(url, { headers: UA });
          await sleep(this.politenessMs);
          return parsed;
        })(),
      );
    }
    return this._pdfs.get(url);
  },
  async collect({ season }) {
    const games = [];
    let tournament = null;
    for (const url of this.sheets) {
      const parsed = await this.pdf(url);
      if (!parsed?.length) {
        console.log(`  ⚠️ 福島: ${url} が読めない。出典の作りが変わった可能性がある`);
        continue;
      }
      for (const page of parsed) {
        const got = this.readPage(page, season);
        if (!got.length) continue;
        tournament ??= got[0].tournament;
        games.push(...got);
      }
    }
    if (!games.length) return [];
    /*
      ★**同じ季節に2つの大会が混ざったら出さない。**
      「今年度大会記録」に春季と秋季が両方入る時期がありうる。
      混ざったまま出すと、県のページで**別の大会の試合が1つの大会として並ぶ。**
    */
    const names = [...new Set(games.map((g) => g.tournament))];
    if (names.length > 1) {
      console.log(`  ⚠️ 福島: ${season} に大会が2つ混ざっている（${names.join(" / ")}）。1試合も出さない`);
      return [];
    }
    return (await this.verify(games, names[0])) ? games : [];
  },
  /** ページの見出しから大会名を読む。**季節が合わなければ null** */
  titleOf(page, season) {
    const head = normalize((page.lines[0]?.text ?? "").replace(/\t/g, "")).replace(/\s+/g, "");
    /*
      ★**「福島大会」「福島県大会」で終わるところまで**を大会名にする。
      見出しの続きは「第10日」で、**全角の 第１０日 は `normalize` で 第10日 になる**ので、
      欲張ると日数まで大会名に入る。
    */
    const m = head.match(/第\d+回.*?福島県?大会/);
    if (!m) return null;
    const want = { spring: /春季/, summer: /選手権/, autumn: /秋季/ }[season];
    return want?.test(m[0]) ? m[0] : null;
  },
  /** 1ページぶんのスコア表を読む */
  readPage(page, season) {
    const tournament = this.titleOf(page, season);
    if (!tournament) return [];
    const out = [];
    const lines = page.lines;
    const squeeze = (s) => normalize(s).replace(/\s+/g, "");
    for (let i = 0; i < lines.length; i++) {
      const head = lines[i].items;
      const marks = head.filter((it) => squeeze(it.text) === "チーム名");
      if (!marks.length) continue;
      /*
        ★**段ごとに列を決める。** 見出しの「チーム名」の数だけ試合が横に並ぶ。
        イニングの見出し（1〜15）と「計」も段ごとに拾う。
      */
      const cols = marks.map((m, k) => {
        const next = marks[k + 1];
        const inSection = (it) => it.x >= m.x - 20 && (!next || it.x < next.x - 20);
        const innings = head.filter((it) => inSection(it) && /^\d{1,2}$/.test(squeeze(it.text)));
        return {
          m,
          innings,
          // ★イニングの間隔。**2桁の得点が校名の列に食い込むのを防ぐのに要る**
          pitch: innings.length > 1 ? innings[1].x - innings[0].x : 29,
          total: head.find((it) => inSection(it) && squeeze(it.text) === "計"),
        };
      });
      for (let k = 0; k < cols.length; k++) {
        const col = cols[k];
        if (!col.innings.length || !col.total) {
          console.log(`  ⚠️ 福島: ${tournament} のスコア表で列（イニング/計）が読めない。この試合は出さない`);
          continue;
        }
        /*
          ★**段の境目は「左の『計』と右の『チーム名』の中点」。**
          見出しの x で割ると、**左にはみ出している回戦・日付の行**を取り違える。
        */
        const lo = k === 0 ? -Infinity : (cols[k - 1].total.x + col.m.x) / 2;
        const hi = cols[k + 1] ? (col.total.x + cols[k + 1].m.x) / 2 : Infinity;
        const cut = (line) => (line?.items ?? []).filter((it) => it.x >= lo && it.x < hi);

        const infoItems = cut(lines[i - 1]);
        const info = normalize(infoItems.map((it) => it.text).join(" "));
        /*
          ★**ラテン文字の球場名がある**（2026-08-21）。福島の楢葉町は
          `ポニーリーグNARAHASTADIUM` と刷られており、他県で使っている
          `球場|スタジアム|パーク|ドーム` では拾えない（春季の8試合で球場が落ちていた）。
        */
        const venue =
          infoItems.map((it) => it.text.trim()).find((t) => /球場|スタジアム|パーク|ドーム|STADIUM/i.test(t)) ?? null;
        const d = info.match(/令和\s*(\d+)\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
        // 令和1年 = 2019年。★**回数からは出さない**（春季・秋季は選手権と別の系列）
        const date = d ? `${2018 + Number(d[1])}-${String(d[2]).padStart(2, "0")}-${String(d[3]).padStart(2, "0")}` : null;

        const teams = [];
        for (let j = i + 1; j < Math.min(i + 6, lines.length) && teams.length < 2; j++) {
          const its = cut(lines[j]);
          /*
            ★**校名の列の右端は「イニングの見出し − 間隔の半分」。**
            `- 5` にすると、**2桁の得点（左端が5ポイント左に出る）が校名にくっつく**
            （`相馬連合13` になった）。
          */
          const name = its
            .filter((it) => it.x < col.innings[0].x - col.pitch / 2)
            .map((it) => it.text)
            .join("")
            .replace(/\s+/g, "");
          // 投手の行（`( 帝 京 ) 緑川 － 笹島`）とコールドの注記を落とす
          if (!name || /[（(－◆]/.test(name)) continue;
          const score = its
            .filter((it) => Math.abs(it.x - col.total.x) <= 20)
            .map((it) => Number(normalize(it.text.trim())))
            .find((v) => Number.isFinite(v));
          if (score === undefined) continue;
          teams.push({ name, score });
        }
        if (teams.length !== 2) {
          console.log(
            `  ⚠️ 福島: ${tournament} の「${info.slice(0, 24)}」で両校がそろわない（${teams.length}校）。この試合は出さない`,
          );
          continue;
        }
        const [a, b] = teams;
        out.push({
          date,
          season,
          tournament,
          round: pickRound(info),
          venue,
          // ★引き分けがある。「勝っていない＝負け」と読まないこと
          teams: [
            { display: a.name, score: a.score, won: a.score > b.score },
            { display: b.name, score: b.score, won: b.score > a.score },
          ],
        });
      }
    }
    return out;
  },
  /** 上の表の A〜D。**1つでも合わなければその大会を1試合も出さない** */
  async verify(games, tournament) {
    // ★結果が未来にあることはありえない（栃木で入れた歯止め）
    const today = new Date().toISOString().slice(0, 10);
    const future = games.filter((g) => g.date && g.date > today);
    if (future.length) {
      console.log(`  ⚠️ 福島: ${tournament} に未来の日付（${future[0].date}）がある。1試合も出さない`);
      return false;
    }

    /*
      勝ち抜きの並び。★**3位決定戦は枝ではない**ので、この検算からは外す
      （出しはする）。
    */
    const ORDER = ["1回戦", "2回戦", "3回戦", "4回戦", "5回戦", "準々決勝", "準決勝", "決勝"];
    const roundsHere = ORDER.map((r) => games.filter((g) => g.round === r)).filter((gs) => gs.length);
    const complete = games.some((g) => g.round === "決勝");

    let entrants = 0;
    for (let k = 0; k < roundsHere.length; k++) {
      const here = roundsHere[k].flatMap((g) => g.teams.map((t) => t.display));
      const prev = k === 0 ? [] : roundsHere[k - 1];
      const winners = prev.map((g) => g.teams.find((t) => t.won)?.display).filter(Boolean);
      const losers = prev.map((g) => g.teams.find((t) => !t.won)?.display).filter(Boolean);
      /*
        ---- A: 負けた学校が次の回戦に出ていないか ----
        ★**開催中でも成り立つ**ので常にかける。校名の取り違えはここに出る。
      */
      const zombie = here.filter((t) => losers.includes(t) && !winners.includes(t));
      if (zombie.length) {
        console.log(
          `  ⚠️ 福島: ${tournament} で前の回戦に負けた学校が次の回戦に出ている（${[...new Set(zombie)].join("・")}）。1試合も出さない`,
        );
        return false;
      }
      // ---- B: 勝った学校が全員、次の回戦に出ているか（終わった大会だけ） ----
      const missing = winners.filter((w) => !here.includes(w));
      if (complete && missing.length) {
        console.log(
          `  ⚠️ 福島: ${tournament} で勝ったのに次の回戦にいない学校がいる（${[...new Set(missing)].join("・")}）。1試合も出さない`,
        );
        return false;
      }
      entrants += here.filter((t) => !winners.includes(t)).length;
    }

    // ---- C: チーム数 − 試合数 = 1（終わった大会だけ。3位決定戦は除く） ----
    const bracketGames = roundsHere.flat().length;
    if (complete && entrants - bracketGames !== 1) {
      console.log(
        `  ⚠️ 福島: ${tournament} は ${entrants} チームに対し ${bracketGames} 試合` +
          `（${entrants - 1} のはず）。読み落としがある。1試合も出さない`,
      );
      return false;
    }

    // ---- D: 組合せ表に印字された優勝校 ----
    const final = games.find((g) => g.round === "決勝");
    let checkedChampion = false;
    if (final) {
      const printed = await this.printedChampion(tournament);
      if (printed) {
        checkedChampion = true;
        const won = final.teams.find((t) => t.won)?.display ?? "";
        /*
          ★**紙によって書き方が違う。** 組合せ表は「東日本国際大学附属昌平高等学校」、
          スコア表は「東日大昌平」。**先頭2文字だけを突き合わせる。**
        */
        const bare = normalizeSchoolName(printed.replace(/高等?学?校.*$/, ""));
        if (!normalizeSchoolName(won).startsWith(bare.slice(0, 2))) {
          console.log(
            `  ⚠️ 福島: ${tournament} の決勝の勝者が組合せ表の記載と合わない（記載「${printed}」/ 読み取り「${won}」）。1試合も出さない`,
          );
          return false;
        }
      }
    }

    /*
      ★**どの検算が効いたかを必ず出す。** 組合せ表は**いまの大会のもの**なので、
      **終わった大会（春季）では検算Dが飛ぶ。**
      黙って飛ばすと「通った」と「していない」が見分けられない。
    */
    console.log(
      `  （${tournament}: ${games.length} 試合${complete ? ` / ${entrants} チーム・決勝まで` : "・**開催中**"}` +
        ` / 優勝校の検算 ${checkedChampion ? "一致" : "は組合せ表が別の大会のため未実施"}）`,
    );
    return true;
  },
  /**
   * 組合せ表に印字された優勝校。**読めなければ null**（検算Dだけ飛ばす）。
   *
   * ★★**大会名が一致するときだけ使うこと。** 組合せ表は**いまの大会のもの**なので、
   * 春季を読んでいるときに選手権の組合せ表を突き合わせると**必ず食い違う**
   * （その季節を丸ごと落としてしまう）。
   */
  async printedChampion(tournament) {
    const parsed = await this.pdf(this.bracketSheet);
    if (!parsed?.length) return null;
    const head = normalize((parsed[0].lines[0]?.text ?? "").replace(/\t/g, "")).replace(/\s+/g, "");
    if (!head.includes(tournament)) return null;
    for (const page of parsed) {
      for (const line of page.lines) {
        const m = normalize(line.text.replace(/\t/g, "")).match(/(\S+?)高等学校は(?:初|\d+年ぶり)?優勝/);
        if (m) return m[1];
      }
    }
    return null;
  },
};

/**
 * 栃木県高校野球連盟（`tochigi-koyaren.net`）。
 *
 * ------------------------------------------------------------------
 * ★★ 規約：**「写真、記事」しか名指ししていない**（2026-08-20 に読み直した）
 *
 *   全ページのフッタに「**掲載の写真、記事の無断転載を禁じます。**」とある。
 *   ★**「データ」も「コンテンツ」も名指ししていない。**
 *   青森・秋田・鳥取が「画像・文章・**データ**の無断転用・転載をお断りします」と
 *   **データを名指ししている**のとは別の類型で、岩手（「文章や画像、動画等の
 *   **著作物**」）に近い。**スコアは写真でも記事でもない。**
 *
 *   ★**だから記事の文章は取らない。** 取るのは試合結果の表（校名・回戦・得点）だけ。
 *   `robots.txt` は 404（制限そのものが無い）。
 *
 *   ★**47連盟の調査で「制限あり12件」に入れていたのは誤り**だった
 *   （大分と同じで、自動分類が語だけを拾っていた）。
 *
 * ------------------------------------------------------------------
 * ★★ 出典の形 ── **このリポジトリでいちばん素直な形のひとつ**
 *
 *   大会ごとの索引（`report/108ch.html`）に
 *   **「日付 → 球場 → 試合結果へのリンク」**が並び、その先が
 *   **日別×球場ごとのイニングスコアのページ**（`108ch/ajex/7-9_ajex.html`）。
 *
 *     <div class="gamescore">
 *       <h3>さくら清修　―　鹿沼商工</h3>
 *       <table class="tb_noline"><tr>
 *         <td>第1試合</td><td>（1回戦）</td><td>開始10時52分</td>…
 *       <div class="board"><table>
 *         <tr><th>校名</th><td>1</td>…<td>計</td></tr>
 *         <tr><th>鹿沼商工</th><td>5</td>…<td rowspan="2" colspan="8">7回コールド</td><td>8</td></tr>
 *         <tr><th>さくら清修</th><td>0</td>…<td>1</td></tr>
 *
 *   ★**組み立てが要らない。** トーナメント表のPDF（`108ch/tournament.pdf`）も
 *   あるが、**スロットが縦向き**で大分とは別の形。**読む必要が無い。**
 *
 * ------------------------------------------------------------------
 * ★ ここで踏んだところ
 *
 *   1. ★**合計は「その行のいちばん最後の `<td>`」。**
 *      コールドの注記が `rowspan="2" colspan="8"` のセルとして
 *      **合計の手前に割り込む**ので、「N番目の td」では取れない。
 *   2. ★**文字コードが Shift_JIS。** `fetchHtml` は UTF-8 として読むので、
 *      **自前で取り直して判定する**（このアダプタだけ `fetchHtml` を使わない）。
 *   3. **索引の日付は「7月9日(木)」で年が無い。** 大会名の回数から出す
 *      （選手権は 年 − 1918）。春季・秋季は索引の題から西暦を拾う。
 *
 * ------------------------------------------------------------------
 * ★ 検算
 *
 *   ★**組み立てが要らない出典なので、PDFの県とは失敗の仕方が違う。**
 *   対戦相手を推測する余地が無いので、**おかしな1件を飛ばして警告**に倒してある
 *   （omyutech の5県・島根・岩手と同じ）。
 *
 *   - 校名2つと得点2つが揃わない試合は出さない
 *   - **1ページも取れなかった大会は静かに終わる**（その年の大会がまだ無い）
 */
const tochigi = {
  slug: "tochigi",
  district: "栃木",
  name: "栃木県高校野球連盟",
  siteUrl: "https://www.tochigi-koyaren.net/",
  politenessMs: 1500,
  seasons: {
    spring: "https://www.tochigi-koyaren.net/report/",
    summer: "https://www.tochigi-koyaren.net/report/",
    autumn: "https://www.tochigi-koyaren.net/report/",
  },
  /**
   * 季節 → 索引のファイル名。
   * ★**夏だけ回数がファイル名に入る**（`108ch.html`）。選手権の回数は 年 − 1918。
   * ★**春は県大会と地区予選の2つ**ある。
   */
  indexesOf(season, year) {
    if (season === "summer") return [`${year - 1918}ch.html`];
    if (season === "spring") return ["spring-pref.html", "spring-area.html"];
    return ["autumn-pref.html"];
  },
  /**
   * ★**Shift_JIS のページがある。** 自前で取って判定する。
   *
   * ★★**`Connection: close` を必ず付けること**（2026-08-20）。
   * 付けずに全県の再生成を回したら、**栃木の途中で Node の HTTP パーサが
   * 内部アサーションで落ちた**（`assert(!this.paused)`。undici の keep-alive の道）。
   * ★**これは `try/catch` では拾えない**（イベントループから投げられる）。
   * ★★**生成物は全県ぶんを最後にまとめて書き出すので、1県で落ちると実行まるごと失われる。**
   */
  async fetchSjis(url) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await sleep(2000 * attempt);
      const buf = await this.rawGet(url);
      if (!buf) continue;
      const utf8 = buf.toString("utf8");
      return /\uFFFD/.test(utf8.slice(0, 3000)) ? new TextDecoder("shift_jis").decode(buf) : utf8;
    }
    return null;
  },
  /**
   * ★★**`fetch` を使わないこと**（2026-08-20）。
   *
   * この出典を `fetch`（undici）で取ると、**Node の HTTP パーサが内部アサーションで
   * 落ちる**（`AssertionError: assert(!this.paused)`）。`Connection: close` を
   * 付けても止まらなかった。**サーバの応答が undici の想定に合っていない。**
   *
   * ★**`try/catch` では拾えない。** イベントループから投げられるので、
   * **プロセスごと死ぬ。**
   * ★★**生成物は全県ぶんを最後にまとめて書き出すので、1県で落ちると実行まるごと
   * 失われる**（実際に、栃木の途中で落ちて35県ぶんが1つも書き出されなかった）。
   *
   * **Node 標準の `https` は別の実装**なので、この応答でも落ちない。
   * ★**この県だけの回避策。** 他の県は `fetchHtml` のままでよい。
   */
  rawGet(url) {
    return new Promise((resolve) => {
      /*
        ★★**必ず終わるようにすること。** `https.get` の `timeout` は
        **接続が無反応のときにしか効かない。** 応答が始まったまま終わらないと
        `end` が来ず、**この Promise が永久に解決しない**（実際に止まった）。
        **自前のタイマーで打ち切る。**
      */
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(v);
      };
      const timer = setTimeout(() => finish(null), 30000);
      import("node:https")
        .then(({ get }) => {
          const req = get(url, { headers: UA }, (res) => {
            if (res.statusCode !== 200) {
              res.resume();
              finish(null);
              return;
            }
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => finish(Buffer.concat(chunks)));
            res.on("error", () => finish(null));
          });
          req.on("error", () => finish(null));
          // タイマーが先に切れたら、開いたままの要求を捨てる
          timer.unref?.();
          setTimeout(() => req.destroy(), 30000).unref?.();
        })
        .catch(() => finish(null));
    });
  },
  async collect({ season, year }) {
    const games = [];
    for (const file of this.indexesOf(season, year)) {
      /** その大会ぶん。**未来の日付が混ざっていたら丸ごと捨てる**（下の検算） */
      const found = [];
      const baseUrl = `https://www.tochigi-koyaren.net/report/${file}`;
      const index = await this.fetchSjis(baseUrl);
      await sleep(this.politenessMs);
      // その大会のページがまだ無ければ静かに飛ばす
      if (!index) continue;

      /*
        ★**大会名は `<h2>` ではなく `<h3>`。** `<h2>` は「秋季県大会」のような
        ページの見出しで、回数が入っていない。
      */
      const tournament = normalize(plain(index.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? "")).trim() || null;
      /*
        ★★**索引に西暦が1つも書かれていないので、回数から出すしかない。**

          第108回 全国高等学校野球選手権栃木大会 … 2026年（＋1918。このリポジトリ共通）
          第79回  春季栃木県高等学校野球大会     … 2026年（＋1947）
          第78回  秋季栃木県高等学校野球大会     … **2025年**（＋1947）
          第74回  春季栃木県高等学校野球大会 地区予選 … 2026年（＋1952）

        ★**春と秋で回数の系列が同じ**（どちらも＋1947）。新潟は春と秋で増え方が
        違ったので、**県ごとに実データで確かめてから使うこと。**

        ★★**回数から年を出すのは危ういので、下で「未来の日付が無いか」を必ず見る**
        （結果が未来にあることはありえない）。これが無いと、秋の索引が前年のままの
        時期に**2025年の試合が2026年として出る**（実際に一度そうなった）。
      */
      const round = Number(normalize(tournament ?? "").match(/第(\d+)回/)?.[1]);
      const base = /選手権/.test(tournament ?? "") ? 1918 : /地区/.test(tournament ?? "") ? 1952 : 1947;
      const y = Number.isFinite(round) ? round + base : year;

      for (const { url, date, venue } of this.dailyLinks(index, baseUrl, y)) {
        const page = await this.fetchSjis(url);
        await sleep(this.politenessMs);
        if (!page) continue;
        found.push(...this.parse(page, season, tournament, date, venue));
      }

      /*
        ---- 検算: 未来の日付が無いか ----
        ★**結果が未来にあることはありえない。** 回数から年を出しているので、
        系列の数え方を取り違えるとここに出る。**1日でも先なら、その大会は1試合も出さない。**
      */
      const today = new Date().toISOString().slice(0, 10);
      const ahead = found.filter((g) => g.date && g.date > today);
      if (ahead.length) {
        console.log(
          `  ⚠️ 栃木: 「${tournament}」を ${y} 年として読んだが、` +
            `${ahead.length} 試合が未来の日付になる（${ahead[0].date}）。1試合も出さない`,
        );
        continue;
      }
      games.push(...found);
    }
    return games;
  },
  /**
   * 索引から「日別×球場」のページを拾う。
   * ★**日付・球場・リンクが順番に並ぶだけ**なので、**上から読んで持ち回る。**
   */
  dailyLinks(index, base, year) {
    const out = [];
    let date = null;
    const re = /(\d{1,2})月(\d{1,2})日|<a\s+href="([^"]+\.html)"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    let lastEnd = 0;
    while ((m = re.exec(index))) {
      if (m[1] !== undefined) {
        date = `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
        lastEnd = re.lastIndex;
        continue;
      }
      const label = normalize(plain(m[4])).trim();
      if (!/試合結果/.test(label) || !date) {
        lastEnd = re.lastIndex;
        continue;
      }
      /*
        ★**球場名はリンクの直前のテキスト。** 「7月9日(木)」の次に
        「エイジェックスタジアム」「試合結果」と並ぶ。
        直前の区間からタグを外し、最後のひとかたまりを球場名とする。
      */
      const before = normalize(plain(index.slice(lastEnd, m.index)))
        .split(/[\s|｜]+/)
        .filter(Boolean);
      const venue = before.length ? before.at(-1) : null;
      out.push({ url: new URL(m[3], base).toString(), date, venue });
      lastEnd = re.lastIndex;
    }
    return out;
  },
  /** 日別×球場のページを読む */
  parse(html, season, tournament, date, venue) {
    const out = [];
    for (const block of html.split(/<div class="gamescore">/).slice(1)) {
      const round = pickRound(
        normalize(plain(block.match(/<td>\s*[（(]([^）)]*?[回戦決勝][^）)]*?)[）)]\s*<\/td>/)?.[1] ?? "")),
      );
      /*
        ★**イニングスコアの表は `div.board` の中。**
        1行目は見出し（校名 1 2 3 … 計）なので、**`<th>` を持つ行のうち
        2行目・3行目**が両校。
      */
      const board = block.match(/<div class="board">([\s\S]*?)<\/div>/)?.[1] ?? "";
      const rows = [...board.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((r) => r[1]);
      const teams = [];
      for (const row of rows) {
        const name = normalize(plain(row.match(/<th[^>]*>([\s\S]*?)<\/th>/)?.[1] ?? "")).replace(/\s+/g, "");
        if (!name || name === "校名") continue;
        /*
          ★**合計はその行のいちばん最後の `<td>`。**
          コールドの注記が `rowspan="2" colspan="8"` のセルとして
          **合計の手前に割り込む**ので、「N番目の td」では取れない。
        */
        const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((t) =>
          normalize(plain(t[1])).replace(/\s+/g, ""),
        );
        const total = tds.length ? Number(tds.at(-1)) : NaN;
        if (!Number.isFinite(total)) continue;
        teams.push({ name, total });
      }
      if (teams.length !== 2) continue;
      const [a, b] = teams;
      out.push({
        date,
        season,
        tournament,
        round,
        venue,
        /*
          ★**引き分けがある。**「勝っていない＝負け」と読まないこと。
        */
        teams: [
          { display: a.name, score: a.total, won: a.total > b.total },
          { display: b.name, score: b.total, won: b.total > a.total },
        ],
      });
    }
    return out;
  },
};

/**
 * 大分県高等学校野球連盟（`oita-kouyaren.com`）。
 *
 * ------------------------------------------------------------------
 * ★★ 規約：**外していた根拠が誤りだった**（2026-08-20 訂正）
 *
 *   `data/federation-sites.json` は大分を「**営利目的の複製を禁止**」と分類し、
 *   47連盟の「制限あり12件」に入れて外していた。**原文にその記載は無い。**
 *
 *   実際の文面（`/privacy.html` の「禁止事項について ／ 許諾・禁止とする事項と行為と例外」）:
 *
 *     「本サイトで提供される情報及び著作物の複製は、
 *       それが非営利目的かつ私的利用での複製を禁止いたします。」
 *
 *   ★**この一文は文意が通らない。** 字義どおりなら「非営利かつ私的な複製を禁止」＝
 *   **営利目的の複製は禁止していない**という逆の意味になる。見出しが「**…と例外**」で
 *   あることからも、定型文の「…**を除き**禁止」から「を除き」が落ちたものと見える。
 *   ★**いずれにせよ「営利目的の利用を禁止する」条項は存在しない。**
 *   自動分類が「非営利」の語だけを拾った誤判定（福島・栃木と**同じ種類の誤り**）。
 *
 *   もう一段落は「個々の著作物」に権利者の表示がある場合はそれに従う、という内容で
 *   **写真等が対象**。スコアは事実なので、このサイトの整理の範囲内。
 *   `robots.txt` は 404（制限そのものが無い）。
 *
 * ------------------------------------------------------------------
 * ★ 出典の形
 *
 *   `/sokuho/sokuho_1.html` に `./img/pdf_<番号>.pdf` が**番号だけ**で並ぶ。
 *   ★**リンクに文字が無い**（画像を囲っているだけ）ので、**HTMLからは
 *   どのPDFが何の大会か分からない。開いて表題で見分ける**（京都と同じやり方）。
 *   番号は新しいものほど大きい。
 *
 *   同じ一覧に**軟式**（第71回全国高等学校軟式野球選手権大分大会）や
 *   **380ページの「大分県高校野球史」**が混ざるので、**表題で絞ること。**
 *
 * ------------------------------------------------------------------
 * ★ 紙の形（京都型。スロット 1〜41 が y≈109 に横一列、回戦は上へ）
 *
 *   ★**11ページあるが、文字があるのは1ページ目だけ**（2〜11ページは空）。
 *
 * ------------------------------------------------------------------
 * ★★ ここで踏んだところ ── **option が2つ要る**
 *
 *   1. `roundBandGap: 6` … **試合番号の行がスコアの行の 11〜12 ポイント下にある**
 *      （静岡の春季で日付の行が同じ位置にあったのと同型）。既定のまとめ幅だと
 *      巻き込んで数字が 1.5 倍になる
 *   2. ★★`hitSpan: true` … **試合番号の行が「試合の中心」にぴったり乗る。**
 *      既定の窓（中点 ±0.95）では**試合番号の行のほうがスコアの行より一致数が多くなり、
 *      帯の選択で勝ってしまう**（3回戦で「数字8個（必要16）」で止まった）。
 *      窓を枝の張る範囲に広げると **16 対 8** で正しい帯が勝つ。
 *      ★**スコアが両端に置かれているからではない**（山口・宮崎とは理由が違う）
 *
 * ------------------------------------------------------------------
 * ★ 検算（合わなければ**1試合も出さない**）
 *
 *   - **41チーム − 40試合 = 1**
 *   - ★**紙に印字された「優勝　大分商業高等学校（出場：13年ぶり16回目）」と
 *     組み立てた優勝校が一致**（枝とは別の場所から来る事実）
 *   - 「回数 − 1918」と取りに行った年が一致
 *
 * ★**夏だけ。** 春季・秋季は「第N回大分県高等学校野球選手権大会」（149＝2026春・
 * 150＝2026秋）という別の表題で同じ一覧にあるが、**紙の形が違う**
 * （春の `pdf_139` は7ページで整数が29個しかない）。**測り直してから足すこと。**
 */
const oita = {
  slug: "oita",
  district: "大分",
  name: "大分県高等学校野球連盟",
  siteUrl: "https://www.oita-kouyaren.com/",
  politenessMs: 2000,
  seasons: {
    spring: "https://www.oita-kouyaren.com/sokuho/sokuho_1.html",
    summer: "https://www.oita-kouyaren.com/sokuho/sokuho_1.html",
    autumn: "https://www.oita-kouyaren.com/sokuho/sokuho_1.html",
  },
  /** 何枚まで開いて表題を見るか。**新しい順**に見るので、当たればすぐ止まる */
  maxSheets: 8,
  /*
    ★**同じ一覧を季節ごとに開き直さない。** 3季 × 8枚 ＝ 24回になる。
    ★**この一覧には「大分県高校野球史」（380ページ）が混ざっている**ので、
    読み直しの代償が特に大きい。1回の実行のあいだは読んだものを使い回す。
    ★**約束（Promise）のまま持つこと**（取得中にもう一度呼ばれても二重に取らない）。
  */
  _pdfs: new Map(),
  pdf(n) {
    const url = `https://www.oita-kouyaren.com/sokuho/img/pdf_${n}.pdf`;
    if (!this._pdfs.has(n)) {
      this._pdfs.set(
        n,
        (async () => {
          const parsed = await fetchPdfPages(url, { headers: UA });
          await sleep(this.politenessMs);
          return parsed;
        })(),
      );
    }
    return this._pdfs.get(n);
  },
  async collect({ fetchHtml, season, url, year }) {
    const html = await fetchHtml(url);
    if (!html) {
      console.log("  ⚠️ 大分: 速報のページが取れない。出典の作りが変わった可能性がある");
      return [];
    }
    /*
      ★**番号の大きいものから見る。** リンクに文字が無いので、
      HTMLからは大会を見分けられない（開いて表題を見るしかない）。
    */
    const numbers = [...new Set([...html.matchAll(/img\/pdf_(\d+)\.pdf/gi)].map((m) => Number(m[1])))]
      .sort((a, b) => b - a);
    if (!numbers.length) {
      console.log("  ⚠️ 大分: 速報のページにPDFのリンクが無い");
      return [];
    }

    if (season !== "summer") return this.collectPrefectural(numbers, season);

    // 選手権の回数は 年 - 1918
    const want = new RegExp(`第${year - 1918}回全国高等学校野球選手権大分大会`);
    for (const n of numbers.slice(0, this.maxSheets)) {
      const parsed = await this.pdf(n);
      if (!parsed?.length) continue;
      const page = parsed[0];
      const flat = page.lines.map((l) => normalize(l.text.replace(/\t/g, "")));
      /*
        ★**軟式を必ず外す。** 同じ一覧に「第71回全国高等学校軟式野球選手権大分大会」があり、
        「全国高等学校」まで同じ。**回数で分かれる**が、念のため語でも外す。
      */
      if (!flat.some((t) => want.test(t)) || flat.some((t) => /軟式/.test(t))) continue;
      return this.readSheet(page, season);
    }
    return [];
  },
  /**
   * ★★**春季・秋季は「大分県高等学校野球選手権大会」**（2026-08-21 実装）。
   *
   * ------------------------------------------------------------------
   * ★ 夏とは別の大会・別の紙
   *
   *   同じ速報の一覧に `第149回大分県高等学校野球選手権大会 大会結果`（＝2026春）と
   *   `第150回…記念大会 組合せ`（＝2026秋。**まだ組合せだけ**）が並ぶ。
   *   ★**春も秋も表題が同じ**（回数だけ違う）ので、**季節は紙の「期間」の月で決める。**
   *
   *   ★**必ず外すもの**（表題がよく似ている）:
   *     - `…大会県北・久大支部予選結果`（支部予選。**別の紙**）
   *     - `…記念大会組合せ`（結果ではなく組合せ）
   *     - 軟式
   *
   * ------------------------------------------------------------------
   * ★ 紙の形は夏と同じ京都型。**違いは3つ。**
   *
   *   1. ★★**校名の下に「支部」の行がある**（`別杵` `久大` `県北` `大分` `豊肥` `県南` `推薦`）。
   *      そのままだと **`明豊別杵` `大分上野丘推薦`** という校名になる（実際になった）。
   *      ★**行の隙間では切れない** —— 校名は縦に引き伸ばして組まれており、
   *      2文字の校名（明豊）は上下の字が **129ポイント**離れているのに対し、
   *      校名の最終行と支部の行は **25ポイント**しか離れていない。
   *      ★★**字の大きさで切る。** 校名は幅 15.4、支部は **10.3**。
   *      **スロット番号の行のすぐ下の行の幅**を「校名の大きさ」として、
   *      そこから離れた行を落とす（`pdf-text.mjs` が返す `width` を使う）。
   *   2. ★★**日付が「16」「23」と日にちだけ**（静岡の春と同じ）。
   *      月は**見出しの「期間： 令和8年5月16日(土)・5月17日(日)、…5月23日…5月24日」**から作る。
   *      ★**行で見分けて `5/16` の形に書き換えてから渡す。**
   *      日付の行は**その行の数字が全部、期間に載っている日**。
   *      スコアの行には必ず 0・1・8・9・10 のような期間に無い数が混ざる。
   *      ★**期間が「7月5日～7月25日」のような範囲書きになったら、途中の日は拾えない。**
   *      そのときは**その回戦の日付が null になるだけ**で、誤った日付は出ない。
   *   3. **日付は見出しの複数行にまたがる。** 「期間」の語がある行だけを見ると
   *      5/23・5/24 を取り逃がす（実際に取り逃がして準決勝・決勝の日付が null になった）。
   *      ★**「優勝」の行より上を見出しとみなして、そこから全部拾う。**
   *
   * ------------------------------------------------------------------
   * ★ 検算（合わなければその大会を1試合も出さない）
   *
   *   - **チーム数 − 試合数 = 1**（8 − 7 = 1）
   *   - ★**紙に印字された優勝校と一致**（`優勝 大分商業 高等学校`。夏と同じ検算）
   *   - ★**未来の日付が無い**（栃木で入れた歯止め）
   *
   * ★**支部予選は取っていない。** 速報の一覧に上がっているのは
   * **県北・久大支部の1枚だけ**で、他の支部の紙が見つからない。
   * **一部だけ出すと「その支部しか試合が無かった」ように見える**ので出さない。
   */
  async collectPrefectural(numbers, season) {
    for (const n of numbers.slice(0, this.maxSheets)) {
      const parsed = await this.pdf(n);
      if (!parsed?.length) continue;
      const raw = parsed[0];
      const flat = raw.lines.map((l) => normalize(l.text.replace(/\t/g, "")).replace(/\s+/g, ""));
      const title = flat.find((t) => /^第\d+回大分県高等学校野球選手権(記念)?大会大会結果$/.test(t));
      if (!title || flat.some((t) => /軟式/.test(t))) continue;
      const games = this.readPrefSheet(raw, flat, title.replace(/大会結果$/, ""), season);
      if (games) return games;
    }
    return [];
  },
  /**
   * 春季・秋季のやぐら表を1枚読む。
   * **季節が違う紙なら null**（呼び出し側は次のPDFへ）。
   */
  readPrefSheet(raw, flat, tournament, season) {
    /*
      ★**見出し（「優勝」の行より上）から年と日付の一覧を取る。**
      日付は複数行にまたがるので、「期間」の語がある行だけを見ないこと。
    */
    const champIndex = flat.findIndex((t) => /^優勝/.test(t));
    const headTop = champIndex >= 0 ? raw.lines[champIndex].y : -Infinity;
    const days = new Map();
    let year = null;
    raw.lines.forEach((l, i) => {
      if (l.y <= headTop) return;
      const era = flat[i].match(/令和(\d+)年/);
      if (era) year ??= 2018 + Number(era[1]);
      for (const m of flat[i].matchAll(/(\d{1,2})月(\d{1,2})日/g)) days.set(Number(m[2]), Number(m[1]));
    });
    if (!year || !days.size) {
      console.log(`  ⚠️ 大分: ${tournament} の見出しから年・期間を読めない。1試合も出さない`);
      return [];
    }
    /*
      ★**季節は「期間の月」で決める。** 春も秋も表題が同じなので、回数では分けられない。
      **どちらでもない月なら、その紙は使わない**（null を返して次のPDFへ）。
    */
    const months = [...new Set([...days.values()])];
    const kind = months.every((m) => m >= 3 && m <= 6) ? "spring" : months.every((m) => m >= 8 && m <= 11) ? "autumn" : null;
    if (kind !== season) return null;

    // ---- スロット番号の行 ----
    const runLength = (l) => {
      const ns = l.items
        .map((i) => normalize(i.text.trim()))
        .filter((t) => /^\d+$/.test(t))
        .map(Number);
      let best = 0;
      let cur = 0;
      for (let k = 0; k < ns.length; k++) {
        cur = k && ns[k] === ns[k - 1] + 1 ? cur + 1 : 1;
        best = Math.max(best, cur);
      }
      return best;
    };
    const slotLine = raw.lines.reduce((a, b) => (runLength(b) > runLength(a) ? b : a), raw.lines[0]);
    if (runLength(slotLine) < 4) {
      console.log(`  ⚠️ 大分: ${tournament} にスロット番号の行が見つからない。1試合も出さない`);
      return [];
    }

    /*
      ★★**校名の大きさで「支部」の行を落とす**（上の 1）。
      **スロット番号の行のすぐ下の行**が校名の1行目なので、その字の幅を基準にする。
    */
    const widthOf = (l) => {
      const ws = l.items.map((i) => i.width ?? 0).filter((w) => w > 0).sort((a, b) => a - b);
      return ws.length ? ws[Math.floor(ws.length / 2)] : 0;
    };
    const firstNameRow = raw.lines.filter((l) => l.y < slotLine.y).sort((a, b) => b.y - a.y)[0];
    const nameWidth = firstNameRow ? widthOf(firstNameRow) : 0;
    if (!nameWidth) {
      console.log(`  ⚠️ 大分: ${tournament} の校名の字の大きさが測れない。1試合も出さない`);
      return [];
    }

    const lines = raw.lines
      // スロット行より下は「校名と同じ大きさの行」だけ残す（支部の行を落とす）
      .filter((l) => l.y >= slotLine.y || Math.abs(widthOf(l) - nameWidth) <= 2)
      .map((l) => {
        /*
          ★**日にちだけの行を `5/16` の形に書き換える**（上の 2）。
          **その行の数字が全部、期間に載っている日**のときだけ。
        */
        const ns = l.items.map((i) => normalize(i.text.trim())).filter((t) => /^\d{1,2}$/.test(t));
        if (!ns.length || !ns.every((t) => days.has(Number(t)))) return l;
        const items = l.items.map((i) => {
          const t = normalize(i.text.trim());
          return /^\d{1,2}$/.test(t) ? { ...i, text: `${days.get(Number(t))}/${t}` } : i;
        });
        return { ...l, items, text: items.map((i) => i.text).join("\t") };
      });

    const built = assembleSlotBracket(
      { page: raw.page, lines },
      {
        roundLabels: ["決勝", "準決勝", "準々決勝"],
        // ★夏と同じ。試合番号の行がスコアの行のすぐ下にある
        roundBandGap: 6,
        hitSpan: true,
      },
    );
    if (!built) {
      console.log(`  ⚠️ 大分: ${tournament} の組合せ表を組み立てられなかった。1試合も出さない`);
      return [];
    }

    // ---- 検算1: 勝ち抜き戦の算数 ----
    if (built.teams - built.games.length !== 1) {
      console.log(
        `  ⚠️ 大分: ${tournament} は ${built.teams} チームに対し ${built.games.length} 試合（${built.teams - 1} のはず）。1試合も出さない`,
      );
      return [];
    }

    // ---- 検算2: 紙に印字された優勝校（夏と同じ） ----
    const printed = flat[champIndex]?.replace(/^優勝\s*/, "") ?? null;
    if (!printed) {
      console.log(`  ⚠️ 大分: ${tournament} に優勝校の記載が無い。検算できないので1試合も出さない`);
      return [];
    }
    const bare = normalizeSchoolName(printed.replace(/[（(].*$/, "").replace(/高等?学?校.*$/, ""));
    if (!built.champion || !normalizeSchoolName(built.champion).startsWith(bare.slice(0, 2))) {
      console.log(
        `  ⚠️ 大分: ${tournament} の優勝校が表と合わない（表「${printed}」/ 組み立て「${built.champion}」）。1試合も出さない`,
      );
      return [];
    }

    const iso = (md) => {
      const [mm, dd] = md.split("/");
      return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    };
    // ---- 検算3: 未来の日付（栃木で入れた歯止め）----
    const today = new Date().toISOString().slice(0, 10);
    const dates = built.games.map((g) => (g.date ? iso(g.date) : null)).filter(Boolean);
    if (dates.some((d) => d > today)) {
      console.log(`  ⚠️ 大分: ${tournament} に未来の日付（${dates.sort().at(-1)}）がある。1試合も出さない`);
      return [];
    }

    const undated = built.games.length - dates.length;
    console.log(
      `  （${tournament}: ${built.games.length} 試合 / 優勝 ${built.champion} / ${built.teams} チーム` +
        `${undated ? ` ・日付の付かない試合 ${undated} 件` : ""}）`,
    );
    return built.games.map((g) => ({
      date: g.date ? iso(g.date) : null,
      season,
      tournament,
      round: g.round,
      // ★球場は会場が1つ（別大興産スタジアム）だが、枝には記号しか無いので出さない
      venue: null,
      teams: [
        { display: g.a, score: g.sa, won: g.sa > g.sb },
        { display: g.b, score: g.sb, won: g.sb > g.sa },
      ],
    }));
  },
  /** やぐら表を1枚読む */
  readSheet(page, season) {
    const flat = page.lines.map((l) => normalize(l.text.replace(/\t/g, "")));
    const tournament = flat.map((t) => t.match(/第\d+回全国高等学校野球選手権大分大会/)?.[0]).find(Boolean);

    const built = assembleSlotBracket(page, {
      roundLabels: ["決勝", "準決勝", "準々決勝"],
      /*
        ★**試合番号の行がスコアの行の 11〜12 ポイント下にある**（上の1）。
        この紙はスコアが1行も割れていないので 6 で足りる。
      */
      roundBandGap: 6,
      /*
        ★★**試合番号の行が「試合の中心」にぴったり乗る**（上の2）。
        既定の窓のままだと帯の選択でそちらが勝つ。
      */
      hitSpan: true,
    });
    if (!built) {
      console.log(`  ⚠️ 大分: ${tournament} の組合せ表を組み立てられなかった。1試合も出さない`);
      return [];
    }

    // ---- 検算1: 勝ち抜き戦の算数 ----
    if (built.teams - built.games.length !== 1) {
      console.log(
        `  ⚠️ 大分: ${built.teams} チームに対し ${built.games.length} 試合（${built.teams - 1} のはず）。1試合も出さない`,
      );
      return [];
    }

    /*
      ---- 検算2: 紙に印字された優勝校 ----
      ★**枝とは別の場所**に「優勝　大分商業高等学校（出場：13年ぶり16回目）」とある。
      石川で通ってしまった「構造は合うのに決勝の相手が違う」はここで止まる。
    */
    const printed = flat.find((t) => /^優勝/.test(t))?.replace(/^優勝\s*/, "") ?? null;
    if (!printed) {
      console.log("  ⚠️ 大分: 表に優勝校の記載が無い。検算できないので1試合も出さない");
      return [];
    }
    const bare = normalizeSchoolName(printed.replace(/[（(].*$/, "").replace(/高等?学?校.*$/, ""));
    if (!built.champion || !normalizeSchoolName(built.champion).startsWith(bare.slice(0, 2))) {
      console.log(
        `  ⚠️ 大分: 組み立てた優勝校が表と合わない（表「${printed}」/ 組み立て「${built.champion}」）。1試合も出さない`,
      );
      return [];
    }

    console.log(
      `  （${tournament}: ${built.games.length} 試合 / 優勝 ${built.champion} / ${built.teams} チーム・**日付なし**）`,
    );
    return built.games.map((g) => ({
      /*
        ★**枝に日付が1つも書かれていない**（あるのは「大会期間」と試合番号だけ）。
        推測で埋めない（千葉・三重・宮崎と同じ扱い）。
      */
      date: null,
      season,
      tournament,
      round: g.round,
      venue: null,
      teams: [
        { display: g.a, score: g.sa, won: g.sa > g.sb },
        { display: g.b, score: g.sb, won: g.sb > g.sa },
      ],
    }));
  },
};

/**
 * 沖縄県高等学校野球連盟。**トップページに春・夏・秋のやぐら表PDFが3枚並ぶ。**
 *
 * ------------------------------------------------------------------
 * ★ 規約（2026-08-21 確認）
 *
 *   `robots.txt` は 404。**転載・複製・営利を制限する掲示はどこにも無い**
 *   （トップ・過去大会の記録・加盟校の皆さんへ の本文を検索して確かめた）。
 *   唯一の禁止は「**球場で撮った動画や画像をSNSへ投稿しないこと**」で、
 *   これは観客に向けた注意であってサイトの中身の話ではない。
 *   ★`data/federation-sites.json` は `terms: []` としており、**今回は分類が正しかった**
 *   （大分・栃木では誤っていたので、原文を自分で読んで確かめてある）。
 *
 * ------------------------------------------------------------------
 * ★ 記録の訂正 ── 「スロット番号の行が無い」は誤りだった
 *
 *   README は長らく沖縄を「**1〜N と並ぶ行が無い**表で、勝者の校名を回戦ごとに
 *   書き直す形式。参加校数すら数えられない」としていたが、**実測すると
 *   1〜56 の行が y≈98 にある**（滋賀と同じで「見つからない」と「無い」の取り違え）。
 *   紙は**京都型**（スロットが横一列・回戦は上へ）で、`assembleSlotBracket` に
 *   そのまま渡せる。`orientPage` は要らない。
 *
 * ------------------------------------------------------------------
 * ★★ 踏んだところ 1 ── 「試合番号の行」を落とさないと**組めてしまう**
 *
 *   紙は下から順にこう積まれている（夏の例）。
 *
 *     | y     | 中身                                              |
 *     |-------|---------------------------------------------------|
 *     | 97.8  | **スロット番号 1〜56**                             |
 *     | 137.3 | 日付（`6/14`。不戦は `/`）                         |
 *     | 142.9 | ★**試合番号 1〜24**（不戦のところは `0`）          |
 *     | 148.6 | ★**本物の1回戦のスコア 48個**（不戦は `-1` `-2`）  |
 *     | 205.0 / 267.1 / 329.1 | 試合番号 25〜40 / 41〜48 / 49〜52   |
 *
 *   ★**試合番号の帯も「2つずつの中点がすべてスロットの境目に乗る」を満たす**ので、
 *   1回戦として通ってしまう（滋賀・大分で踏んだ「数字が余る」より危ない壊れ方）。
 *   ★**落とし方は「スロット行より上で、0 を除いた数字が 1 ずつ増える行」。**
 *   試合番号の行は必ずこの形で、**スコアの行がこの形になることはない。**
 *   3季とも4本ずつ正しく落ちた。
 *
 * ------------------------------------------------------------------
 * ★★ 踏んだところ 2 ── 凡例の注記が校名にくっつく
 *
 *   紙のいちばん下に連合・合同チームの凡例が1行ある。
 *
 *     【連合チーム】＊那陽開南：那覇工業・陽明・開邦・南部農林（x=288）
 *     ＊宮古総工：宮古総実・宮古工業（x=417）　＊美・嘉連合：美里・嘉手納（x=492）
 *
 *   校名は縦書きで、**同じ x の文字をつないで1校とする**作りなので、
 *   この注記が近くのスロットに丸ごと吸われる。実際に
 *   **`＊宮古総工：宮古総実・宮古工業エナジック`**（＝エナジック）、
 *   **`＊昭和薬附（興南）ＫＢＣ`**（＝ＫＢＣ）という校名が出ていた。
 *
 *   ★**行ごと落とす。**「`【` か `＊` で始まる断片しか無い行」がその行で、
 *   3季ともこの形（校名の行は1文字の断片しか持たない）。
 *   ★**文字で消す作りにしないこと**（千葉で「宣」を巻き込んだのと同じ轍）。
 *
 * ------------------------------------------------------------------
 * ★ 連合チームは凡例で展開する（`expand`）
 *
 *   スロットには `那陽開南` `宮古総工` `辺土中農` `宜嘉連` という**略称**が入る。
 *   展開しないと `isCombinedTeam` に当たらず、**どれか1校に結び付けてしまう。**
 *   ★**凡例が「略称：校名・校名」と書いてあるので、これは推測ではなく読み取り。**
 *   ★**`【合同チーム】＊辺土名(エナジック)` は展開しない。** あちらは
 *   「辺土名がエナジックから部員を借りている」という意味で、チームは辺土名のまま。
 *   **`：` があるものだけ**を連合として扱う（合同は括弧書きで `：` を持たない）。
 *
 * ------------------------------------------------------------------
 * ★★ 検算（5つ。どれか1つでも合わなければその大会を1試合も出さない）
 *
 *   1. **チーム数 − 試合数 = 1**（勝ち抜きの算数）
 *   2. ★★**トップページの本文が書いている優勝校と一致する**（鹿児島と同じ形）。
 *      ★**枝とは別の場所から来る事実**なので、石川で通ってしまった
 *      「構造の検算は通るのに決勝の相手が違う」を止められる。
 *      ★**書かれていない大会がある**（いまは秋季が載っていない）。
 *      **無いときは飛ばす**（無いことを理由に大会ごと落とさない）。
 *   3. **日付の付いていない試合が無い**（1試合でも欠けたら出さない）
 *   4. ★**紙の「会期」と、組み立てた試合の初日・最終日が一致する。**
 *      会期はやぐら表の**見出し**にあり、これも**枝とは別の場所から来る事実**。
 *      3季とも一致した（夏 6/13〜7/20 ／ 春 3/20〜4/8 ／ 秋 9/20〜10/12）。
 *   5. ★**未来の日付が無い**（栃木で入れた歯止めと同じ）
 *
 *   ★★**年は「回数」から出さない。**「会期」の元号（`令和８年…`）から出す。
 *   選手権は 年 − 1918 だが、春季・秋季は別の系列で、しかも
 *   **春の紙には九州地区大会の回数（第158回）も刷ってある。**
 *   ★**紙に西暦の根拠が書いてあるのだから、数え方を当てにいく理由が無い。**
 *
 * ------------------------------------------------------------------
 * ★ 3位決定戦は出さない（宮崎と同じ）
 *
 *   春の紙は決勝の右にもう1試合（試合番号55）を持つが、**勝ち抜きの枝ではない**ので
 *   「チーム数 − 試合数 = 1」に乗らない。`assembleSlotBracket` は枝から組むので
 *   **そもそも拾わない。** 拾ってしまうと検算1が落ちる。
 *
 * ------------------------------------------------------------------
 * ★ どのPDFを開くか
 *
 *   トップページに `yoko/<natu|haru|aki>/<回数>/…t.pdf` の形で並ぶ。
 *   **やぐら表のファイル名は必ず `t.pdf` で終わる**（`108natu_t.pdf` `73haru_t.pdf`
 *   `75t.pdf`）ので、要項（`01_76aki_yoko.pdf`）とエントリーシートはここで外れる。
 *   ★**`yoko/haru/73/158kyushu_t.pdf` は九州地区大会の表で他県の学校が出る。**
 *   ファイル名では外さず、**開いて表題で外す**（春の紙の本文にも
 *   「第158回九州地区高等学校野球大会沖縄県予選」という語が入っているので、
 *   表題は季節名まで含めて当てること）。
 */
const okinawa = {
  slug: "okinawa",
  district: "沖縄",
  name: "沖縄県高等学校野球連盟",
  siteUrl: "http://www.kouyaren-okinawa.jp/",
  politenessMs: 2000,
  seasons: {
    spring: "http://www.kouyaren-okinawa.jp/",
    summer: "http://www.kouyaren-okinawa.jp/",
    autumn: "http://www.kouyaren-okinawa.jp/",
  },
  /** 季節 → PDFが置かれるディレクトリ */
  dirOf: { spring: "haru", summer: "natu", autumn: "aki" },
  /**
   * 季節 → 紙の表題。★**九州地区大会の表を外すため、季節名まで含めて当てる。**
   * 春の紙の本文には「第158回九州地区高等学校野球大会沖縄県予選」も刷られている。
   */
  titleOf: {
    spring: /第\d+回沖縄県高等学校野球春季大会/,
    summer: /第\d+回全国高等学校野球選手権沖縄大会/,
    autumn: /第\d+回沖縄県高等学校野球秋季大会/,
  },
  /** 何枚まで開いて表題を見るか。**新しい順**に見るので、当たればすぐ止まる */
  maxSheets: 3,
  async collect({ fetchHtml, season, url }) {
    const dir = this.dirOf[season];
    const html = await fetchHtml(url);
    if (!html) {
      console.log("  ⚠️ 沖縄: トップページが取れない。出典の作りが変わった可能性がある");
      return [];
    }
    /*
      ★**やぐら表は `t.pdf` で終わる。** 要項（`01_76aki_yoko.pdf`）や
      エントリーシートを開かずに済ませるための絞り込みで、
      **大会の見分けはここではしない**（開いて表題で見る）。
    */
    const found = new Map();
    for (const m of html.matchAll(/yoko\/([a-z]+)\/(\d+)\/([^"'\s]*t\.pdf)/gi)) {
      if (m[1].toLowerCase() !== dir) continue;
      found.set(m[0], Number(m[2]));
    }
    if (!found.size) {
      console.log(`  ⚠️ 沖縄: ${season} のやぐら表へのリンクがトップページに無い`);
      return [];
    }
    const paths = [...found.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
    for (const p of paths.slice(0, this.maxSheets)) {
      const parsed = await fetchPdfPages(`http://www.kouyaren-okinawa.jp/${p}`, { headers: UA });
      await sleep(this.politenessMs);
      if (!parsed?.length) continue;
      const page = parsed[0];
      const flat = page.lines.map((l) => normalize(l.text.replace(/\t/g, "")));
      if (!flat.some((t) => this.titleOf[season].test(t))) continue;
      return this.readSheet(page, season, html);
    }
    return [];
  },
  /**
   * ★★**トップページの本文が優勝校を文章で書いている**（2026-08-21。鹿児島と同じ形）。
   *
   *     第108回全国高等学校野球選手権沖縄大会
   *     優　勝
   *     沖縄尚学高等学校
   *     ２年連続１３度目の優勝
   *
   * **やぐら表の枝とは別の場所から来る事実**なので、石川で通ってしまった
   * 「構造の検算は通るのに決勝の相手が違う」を止められる。
   *
   * ★**書かれていない大会がある。** いまトップに出ているのは選手権と春季だけで、
   * **秋季（第75回）は載っていない**（載るのは開催中とその直後だけらしい）。
   * **見つからなければ null を返し、構造の検算と会期だけで通す。**
   * ★**無いことを理由にその大会を落とさない**（落とすと秋季が丸ごと出せなくなる）。
   *
   * ★★**探すのは「季節の形」ではなく、紙から読んだ大会名そのもの**（回数まで）。
   * 2つの理由でそうしないと危ない。
   *   1. **見出しはページ上部のリンクにも同じ文字列で出る**（`…大会について`）。
   *      最初の1件だけ見ると**そのリンクに当たって毎回 null になる**（実際になった）
   *   2. ★★**トップに載っている回数が、紙の回数と違うことがある。**
   *      いまトップの秋季は**第76回**（これから開催）だが、
   *      置かれている紙は**第75回**。回数を見ないと**別の大会の優勝校と
   *      突き合わせる**ことになる
   * ★**当たりは1件とはかぎらない**ので、**見つかった全部を見て最初に取れたものを使う。**
   */
  printedChampion(html, tournament) {
    /*
      ★**`plain()` は使えない。** あれは改行ごと1行に潰すので、
      「見出しの次の行」という手掛かりが消える。**タグを改行に置き換えて行にする。**
    */
    const lines = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, "\n")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!tournament) return null;
    for (let at = 0; at < lines.length; at++) {
      if (!normalize(lines[at]).includes(tournament)) continue;
      for (let k = at + 1; k < Math.min(at + 4, lines.length); k++) {
        if (lines[k].replace(/[\s　]/g, "") !== "優勝") continue;
        const name = lines[k + 1]?.replace(/[（(].*$/, "").replace(/[\s　]/g, "").trim();
        if (name) return name;
      }
    }
    return null;
  },
  /** やぐら表を1枚読む */
  readSheet(raw, season, html = "") {
    const flat = raw.lines.map((l) => normalize(l.text.replace(/\t/g, "")));
    const tournament = flat.map((t) => t.match(this.titleOf[season])?.[0]).find(Boolean);
    const printedChampion = this.printedChampion(html, tournament);

    /*
      ---- 会期 ----
      「令和８年６月１３日（土）～７月２０日（月）」。**年はここから出す**（回数からは出さない）。
    */
    const term = flat.map((t) => t.match(/令和(\d+)年(\d+)月(\d+)日[^~～]*[~～](\d+)月(\d+)日/)).find(Boolean);
    if (!term) {
      console.log(`  ⚠️ 沖縄: ${tournament} の会期が読めない。検算できないので1試合も出さない`);
      return [];
    }
    const [, ge, m1, d1, m2, d2] = term.map(Number);
    // 令和1年 = 2019年
    const startYear = ge + 2018;
    /*
      ★**会期が年をまたぐ大会は無い**（春3〜4月・夏6〜7月・秋9〜10月）。
      またぐ紙が出てきたら日付の年が決められないので、ここで止める。
    */
    if (m2 < m1) {
      console.log(`  ⚠️ 沖縄: ${tournament} の会期が年をまたいでいる（${m1}月→${m2}月）。1試合も出さない`);
      return [];
    }

    /*
      ---- 球場の凡例 ----
      「セ : 沖 縄 セ ル ラ ー ス タ ジ ア ム 那 覇」。**1文字の記号 → 球場名。**
      ★**同じ行に「主催 ： 一般財団法人…」があるので、コロンの手前が
      1文字のものだけを採る**（主催・共催・後援・会場はどれも2文字）。
    */
    const venues = new Map();
    for (const l of raw.lines) {
      for (let k = 1; k < l.items.length; k++) {
        if (!/^[:：]$/.test(l.items[k].text.trim())) continue;
        const key = l.items[k - 1].text.trim();
        if (key.length !== 1) continue;
        const name = l.items
          .slice(k + 1)
          .map((i) => i.text)
          .join("")
          .replace(/[\s　]/g, "");
        if (/スタジアム|球場|ドーム|パーク/.test(name)) venues.set(key, name);
      }
    }

    /*
      ---- 連合チームの凡例 ----
      `＊那陽開南：那覇工業・陽明・開邦・南部農林` を「略称 → 展開」にする。
      ★**`：` を持つものだけ。** 合同チーム（`＊辺土名(エナジック)`）は
      「辺土名がエナジックから部員を借りている」の意味で、チームは辺土名のまま。
    */
    const expand = new Map();
    for (const l of raw.lines) {
      const t = l.items.map((i) => i.text).join("");
      if (!/＊|\*/.test(t)) continue;
      for (const chunk of t.split(/[＊*]/).slice(1)) {
        /*
          ★**末尾を `$` で留めないこと**（2026-08-21。春・秋で踏んだ）。
          春の紙は `＊宮古総工：宮古総実・宮古工業【合同チーム】＊辺土名(…)` と、
          **連合の最後の1件に「【合同チーム】」が続けて刷られている。**
          `$` を要求すると**その1件だけ展開されず**、連合チームが1校に
          結び付けられそうになる（実際に `宮古総工` が結び付かない校名として残った）。
        */
        const m = chunk.match(/^([^：:【]+)[：:]([^【]+)/);
        if (!m) continue;
        const members = m[2].replace(/[\s　]/g, "").trim();
        // 連合は必ず2校以上。中黒が無ければ凡例の読み違いなので使わない
        if (!members.includes("・")) continue;
        expand.set(m[1].replace(/[\s　]/g, "").trim(), members);
      }
    }

    /*
      ---- 試合番号の行と凡例の行を落とす ----
      ★**どちらも「落とさないと組めてしまう／校名が汚れる」ほうの壊れ方**なので、
      ここで確実に落としておく（上の説明を読むこと）。
    */
    const numbersIn = (l) =>
      l.items
        .map((i) => i.text.trim())
        .filter((t) => /^\d+$/.test(t))
        .map(Number)
        .filter((n) => n !== 0);
    const runLength = (l) => {
      const ns = numbersIn(l);
      let best = 0;
      let cur = 0;
      for (let k = 0; k < ns.length; k++) {
        cur = k && ns[k] === ns[k - 1] + 1 ? cur + 1 : 1;
        best = Math.max(best, cur);
      }
      return best;
    };
    const slotLine = raw.lines.reduce((a, b) => (runLength(b) > runLength(a) ? b : a), raw.lines[0]);
    if (runLength(slotLine) < 8) {
      console.log(`  ⚠️ 沖縄: ${tournament} にスロット番号の行が見つからない。1試合も出さない`);
      return [];
    }
    const page = {
      page: raw.page,
      lines: raw.lines.filter((l) => {
        const texts = l.items.map((i) => i.text.trim()).filter((t) => t && t !== "・");
        if (!texts.length) return true;
        // 凡例の行（`【…】` と `＊…` の断片しか無い行）
        if (texts.every((t) => /^[【＊*]/.test(t))) return false;
        // 試合番号の行。**スロット行より上にしかない**
        if (l.y <= slotLine.y) return true;
        if (!texts.every((t) => /^\d+$/.test(t))) return true;
        const ns = numbersIn(l);
        /*
          ★**2〜3個の行は落とさない。** 深い回戦のスコアは
          「4 3」「7 0 12 2」のように少ないので、**本物のスコアと見分けが付かない。**
          ★**そのぶん、深い回戦の試合番号の行（`53 54` `55`）は残る。**
          残っても平気なのは `roundBandGap` がスコアの帯と分けてくれるから
          （下の説明を読むこと）。**この2つは対になっている。**
        */
        if (ns.length < 4) return true;
        return !ns.every((n, i) => i === 0 || n === ns[i - 1] + 1);
      }),
    };

    const built = assembleSlotBracket(page, {
      roundLabels: ["決勝", "準決勝", "準々決勝"],
      /*
        ★**球場の記号には第何試合かが付く**（`セ1` `ユ2`）。
        `venueSymbols` は完全一致で見るので、凡例の記号に数字を足した形も渡す。
      */
      venueSymbols: new Set(
        [...venues.keys()].flatMap((k) => ["", "1", "2", "3", "4"].map((n) => k + n)),
      ),
      expand,
      /*
        ★**試合番号の行がスコアの行の 5〜6 ポイント下にある**（大分・静岡の春と同型）。
        既定の幅（回戦の間隔の 0.45 ＝ 約28）だとスコアと一緒の帯にまとめられる。
        ★**上の掃除で落とせるのは「4個以上の連番」の行だけ**なので、
        **深い回戦の試合番号（`53 54` ／ `55`）は残っている。**
        実測（`BRACKET_DEBUG=1`）では、これが無いと準決勝で
        **`53 54`（y=391）と スコア `7 0 12 2`（y=397）が1つの帯になり、
        「数字6個（必要4）」で止まる。**
        この紙はスコアが1行も割れていないので 4 で足りる。
      */
      roundBandGap: 4,
      /*
        ★★**試合番号の行が「試合の中心」にぴったり乗る**ので、既定の窓（中点 ±0.95）では
        試合番号の帯のほうが一致数で勝ってしまう。窓を枝の張る範囲に広げる。
      */
      hitSpan: true,
    });
    if (!built) {
      console.log(`  ⚠️ 沖縄: ${tournament} の組合せ表を組み立てられなかった。1試合も出さない`);
      return [];
    }

    // ---- 検算1: 勝ち抜き戦の算数 ----
    if (built.teams - built.games.length !== 1) {
      console.log(
        `  ⚠️ 沖縄: ${tournament} は ${built.teams} チームに対し ${built.games.length} 試合` +
          `（${built.teams - 1} のはず）。1試合も出さない`,
      );
      return [];
    }

    /*
      ---- 検算2: トップページの本文が書いている優勝校 ----
      ★**枝とは別の場所から来る事実。** 石川で通ってしまった
      「構造の検算は通るのに決勝の相手が違う」はここで止まる。
      ★**校名は完全一致では比べられない**（枝「エナジック」／本文
      「エナジックスポーツ高等学院」）。**どちらかがもう一方を含めば同じ**とみなす。
    */
    if (printedChampion) {
      const bare = printedChampion.replace(/高等学校$|高等学院$|高校$/, "");
      const got = built.champion ?? "";
      if (!bare || !(bare.includes(got) || got.includes(bare))) {
        console.log(
          `  ⚠️ 沖縄: ${tournament} の優勝校が本文の記載と合わない` +
            `（本文「${printedChampion}」/ 組み立て「${built.champion}」）。1試合も出さない`,
        );
        return [];
      }
    }

    // ---- 検算3: 日付の欠けが無いか ----
    const undated = built.games.filter((g) => !g.date).length;
    if (undated) {
      console.log(`  ⚠️ 沖縄: ${tournament} に日付の付かない試合が ${undated} 件ある。1試合も出さない`);
      return [];
    }

    /*
      ★**日付は `M/D` なので、会期の年を当てる。**
      会期が年をまたがないことは上で確かめてある。
    */
    const iso = (md) => {
      const [mm, dd] = md.split("/").map(Number);
      return `${startYear}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    };
    const dates = built.games.map((g) => iso(g.date)).sort();

    /*
      ---- 検算4: 紙の会期 ----
      ★**会期は見出しにあり、枝とは別の場所から来る事実。**
      これが効くのは「元号を読み違えて全部の日付が1年ずれる」たぐいの誤りで、
      **会期に収まるかを見れば必ず捕まる。**

      ★★**「最終日と一致するか」は落とす条件にしない。**
      会期は**予定として先に刷られる**ので、**雨天順延で決勝が1日ずれると
      正しい55試合を丸ごと捨てることになる。** 3季とも一致してはいるが、
      それは今年たまたま順延が無かったからで、**設計として当てにできない。**
      ずれたときは警告だけ出して人が見る。
      ★**初日のほうは落とす条件にしてよい** —— 1回戦は必ず初日に始まる。
    */
    const pad = (m, d) => `${startYear}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const [from, to] = [pad(m1, d1), pad(m2, d2)];
    if (dates[0] !== from || dates.at(-1) > to) {
      console.log(
        `  ⚠️ 沖縄: ${tournament} の日付が会期に収まらない` +
          `（会期 ${from}〜${to} / 組み立て ${dates[0]}〜${dates.at(-1)}）。1試合も出さない`,
      );
      return [];
    }
    if (dates.at(-1) !== to) {
      console.log(
        `  ⚠️ 沖縄: ${tournament} の最終日が会期の終わり（${to}）より早い（${dates.at(-1)}）。` +
          `順延や日程短縮なら正しい。出典が更新途中でないか一度見ること`,
      );
    }

    /*
      ---- 検算5: 未来の日付 ----
      ★**結果が未来にあることはありえない。** 元号の読み違いはここで止まる（栃木と同じ）。
    */
    const today = new Date().toISOString().slice(0, 10);
    if (dates.at(-1) > today) {
      console.log(`  ⚠️ 沖縄: ${tournament} に未来の日付（${dates.at(-1)}）がある。1試合も出さない`);
      return [];
    }

    const noVenue = built.games.filter((g) => !g.venue).length;
    /*
      ★**優勝校の検算が効いたかどうかを必ず出す。**
      本文に記載が無いときは飛ばす作りなので、**黙って飛ばすと
      「検算が通った」と「検算していない」が見分けられない。**
    */
    console.log(
      `  （${tournament}: ${built.games.length} 試合 / 優勝 ${built.champion}` +
        `${printedChampion ? "（本文と一致）" : "（本文に記載が無く未検算）"} / ` +
        `${built.teams} チーム / ${dates[0]}〜${dates.at(-1)}` +
        `${noVenue ? ` ・球場が読めない試合 ${noVenue} 件` : ""}）`,
    );
    return built.games.map((g) => ({
      date: iso(g.date),
      season,
      tournament,
      round: g.round,
      // ★記号は「セ1」のように第何試合かが付く。**球場名は先頭の1文字で引く**
      venue: (g.venue && venues.get(g.venue[0])) ?? null,
      teams: [
        { display: g.a, score: g.sa, won: g.sa > g.sb },
        { display: g.b, score: g.sb, won: g.sb > g.sa },
      ],
    }));
  },
};

/**
 * 白球ペンギン.com（`89penguin.com`）。**連盟ではない個人運営のサイト。**
 *
 * ------------------------------------------------------------------
 * ★ なぜ連盟から取らないのか
 *
 *   **岩手県高野連は写真・記事の無断転載を禁じている**ので、47連盟の調査で
 *   外した12連盟に入っている。埼玉・神奈川・愛知・島根と同じで**連盟以外から取る。**
 *
 * ------------------------------------------------------------------
 * ★★ 規約（2026-08-20 確認）── **ここは他の出典より慎重に扱うこと**
 *
 *   `robots.txt` は `/wp-admin/` 以外を許可しているが、**免責事項に
 *   「無断転載の禁止」がある。** ただし線の引き方が次のようになっている。
 *
 *     - 禁止しているのは「**文章や画像、動画等の著作物**の情報」の無断転載
 *     - 「**引用の範囲を超えるもの**については法的処置を行います」
 *     - 「転載する際にはお問い合わせよりご連絡いただけますよう」
 *
 *   ★**このリポジトリが 2026-08-20 に採った整理（数値＝事実を引用する）と同じ線。**
 *   ★**だから記事の文章は1文字も取らない。** 取るのは記事の末尾に付いている
 *   **スコア表（`▽回戦　＠球場` の段落）の数値と校名だけ。**
 *   ★**この方針を緩めないこと。** 前文の記述（試合の描写）を取り込んだ瞬間に
 *   「引用の範囲を超えるもの」に変わる。
 *
 *   ★**公開前に一度問い合わせること**（サイト自身が連絡を求めている）。
 *
 * ------------------------------------------------------------------
 * ★ 出典の形
 *
 *   **「大会成績」のページは全部「制作中」**で、構造化された結果は無い。
 *   カスタム投稿タイプ `matches` も**中身が0件**（リニューアル中）。
 *   結果は**日ごとの記事の末尾**に、次の形で付いている。
 *
 *     <h3>7月17日の試合結果</h3>
 *     <p>▽3回戦　＠きたぎんボールパーク<br>
 *        　花泉 000 000 0  =0　H1E4<br>
 *        花巻東 010 020 4x=7　H7E0<br>
 *        7回コールド<br>(泉)和久−菅原<br>…</p>
 *
 *   ★**1試合が1つの `<p>`。** 1行目が回戦と球場、2〜3行目が両校のイニングスコア。
 *   ★**WordPress の REST API は一覧に本文を載せられる**ので、
 *   `_fields=id,date,title,content` にすれば**1リクエストで1季節ぶん取れる。**
 *   相手が個人のサーバーなので、記事を1本ずつ取りに行かないこと。
 *
 * ------------------------------------------------------------------
 * ★ ここで踏んだところ
 *
 *   1. ★★**カテゴリは当てにならない。** 2020〜2025年は「2025年春季大会」の形だが、
 *      **2026年は「選手権岩手大会」「秋季大会」と年が入らない**名前に変わり、
 *      **2026年の春季にいたってはカテゴリが無い。**
 *      → **日付の窓と見出しの【…】で絞る。**
 *   2. ★★**東北大会の記事が同じ【春季大会】の見出しで並ぶ**
 *      （花巻東 対 青森山田など）。**他県の学校が出てくる**ので必ず外す。
 *   3. **校名の前に位置合わせの全角空白が入る**（`　花泉`）。`plain()` で落ちる。
 *   4. **サヨナラは合計の直前に `x`**（`4x=7`）。イニングの側に付くので合計には影響しない。
 *
 * ------------------------------------------------------------------
 * ★ 取れる範囲（2026-08-20 時点）
 *
 *   - **選手権（2026）48試合** … 大会は58校49チームなので **49 − 48 = 1** で
 *     勝ち抜きの算数が合う（＝**取りこぼしが無い**）
 *   - **春季（2026）** … 地区予選から県大会まで記事がある
 *   - ★**秋季はほとんど記事が無い**（2025年8〜11月で結果記事0本）。
 *     出典側の事情なので、取れないまま置いておく
 *
 * ★**検算は構造だけ。** 1つの `▽` から校名と得点が2組そろわなければその試合を出さない。
 * 組み立てが要らない出典なので、**おかしな1件を飛ばして警告**に倒してある。
 */
const iwate = {
  slug: "iwate",
  district: "岩手",
  name: "白球ペンギン.com",
  siteUrl: "https://89penguin.com/",
  politenessMs: 2000,
  seasons: {
    spring: "https://89penguin.com/",
    summer: "https://89penguin.com/",
    autumn: "https://89penguin.com/",
  },
  /**
   * 季節 → 記事を探す窓と、見出しの印。
   * ★**カテゴリを使わない**（上の1）。窓は前後に余裕を取ってある。
   */
  windowOf(season, year) {
    if (season === "spring") return { from: `${year}-03-01`, to: `${year}-07-05`, mark: /【春季大会】/ };
    if (season === "summer") return { from: `${year}-06-15`, to: `${year}-09-05`, mark: /【選手権岩手大会】/ };
    return { from: `${year}-08-15`, to: `${year}-12-20`, mark: /【秋季大会】/ };
  },
  async collect({ season, year }) {
    const w = this.windowOf(season, year);
    const url =
      `https://89penguin.com/wp-json/wp/v2/posts?per_page=100` +
      `&after=${w.from}T00:00:00&before=${w.to}T00:00:00&_fields=id,date,title,content`;
    let posts = null;
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (res.ok) posts = await res.json();
    } catch {
      posts = null;
    }
    await sleep(this.politenessMs);
    if (!Array.isArray(posts)) {
      console.log("  ⚠️ 岩手: 記事の一覧が取れない。出典の作りが変わった可能性がある");
      return [];
    }

    const games = [];
    for (const post of posts) {
      const title = normalize(plain(post.title?.rendered ?? ""));
      if (!w.mark.test(title)) continue;
      /*
        ★★**東北大会の記事を必ず外す**（上の2）。
        同じ【春季大会】の見出しで、青森・福島の学校が出てくる記事が並ぶ。
      */
      if (/東北大会|甲子園|全国/.test(title)) continue;
      games.push(...this.parse(post, season));
    }
    return games;
  },
  /** 記事1本ぶんのスコア表を読む。**文章には触らない** */
  parse(post, season) {
    const html = post.content?.rendered ?? "";
    const tournament = { spring: "春季岩手県大会", summer: "選手権岩手大会", autumn: "秋季岩手県大会" }[season];
    const year = Number(String(post.date ?? "").slice(0, 4));
    /** 記事の掲載日。見出しに日付が無いときのよりどころ */
    const fallback = String(post.date ?? "").slice(0, 10) || null;

    const out = [];
    let date = fallback;
    /*
      ★**見出し（`7月17日の試合結果`）とスコアの段落が交互に並ぶ**ので、
      順に読んで**直前の見出しの日付を持ち回る**（島根の球場と同じやり方）。
      1本の記事が2日ぶんを載せることがある（雨天順延のとき）。
    */
    const re = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>|<p[^>]*>\s*▽([\s\S]*?)<\/p>/g;
    let m;
    while ((m = re.exec(html))) {
      if (m[1] !== undefined) {
        const d = normalize(plain(m[1])).match(/(\d{1,2})月(\d{1,2})日/);
        if (d && Number.isFinite(year)) {
          date = `${year}-${String(d[1]).padStart(2, "0")}-${String(d[2]).padStart(2, "0")}`;
        }
        continue;
      }
      const lines = m[2].split(/<br\s*\/?>/i).map((l) => normalize(plain(l)).trim());
      const [head, ...rest] = lines;
      // 「3回戦　＠きたぎんボールパーク」
      const [roundPart, venuePart] = head.split(/[＠@]/);
      const rows = [];
      for (const line of rest) {
        /*
          「花泉 000 000 0 =0 H1E4」／「盛岡大附 010 031 6=11 H5E0」
          ★**合計だけを取る**（イニングごとの得点も安打も失策も使わない）。
          ★サヨナラの `x` はイニング側に付くので合計には影響しない。
        */
        /*
          ★**2桁のイニング得点は丸数字で書かれる**（`３１０ ⑩０=14`）。
          `normalize()` は全角数字は直すが**丸数字はそのまま**なので、
          イニングの側に丸数字を許さないと**その試合が丸ごと落ちる**（実測で2件落ちていた）。
          ★合計は `=` の右なので、イニングの中身は読まなくてよい。
        */
        const r = line.match(/^(\S+?)[\s]+([0-9０-９\s　xX×Ｘ①-⑳]*?)[=＝]\s*(\d+)/);
        if (r) rows.push({ name: r[1], score: Number(r[3]) });
        if (rows.length === 2) break;
      }
      if (rows.length !== 2 || !rows[0].name || !rows[1].name) continue;
      const [a, b] = rows;
      out.push({
        date,
        season,
        tournament,
        round: pickRound(roundPart),
        venue: venuePart ? venuePart.trim() || null : null,
        /*
          ★**引き分けがある。**「勝っていない＝負け」と読まないこと。
        */
        teams: [
          { display: a.name, score: a.score, won: a.score > b.score },
          { display: b.name, score: b.score, won: b.score > a.score },
        ],
      });
    }
    return out;
  },
};

/**
 * 島根県高校野球データベース（`kokoyakyu-database.jp`）。**連盟ではない個人運営のサイト。**
 *
 * ------------------------------------------------------------------
 * ★ なぜ連盟から取らないのか
 *
 *   **島根県高野連は写真・記事の無断転載を禁じている**ので、47連盟の調査で
 *   外した12連盟に入っている（README「都道府県高野連サイトの規約調査」）。
 *   埼玉・神奈川・愛知と同じで、**連盟以外の出典から取る。**
 *
 * ------------------------------------------------------------------
 * ★ 規約（2026-08-20 確認）
 *
 *   - `robots.txt` は **404**（制限そのものが無い）
 *   - **転載・無断・複製・営利・著作の記載がサイトのどこにも無い**
 *     （トップ・運営理念・スコア見方を確認）
 *   - 運営理念に「**利用者がデータ活用できるサイトを目指すこと**」と明記
 *   - フッタに「当サイトは島根県高校野球連盟とは無関係です」
 *
 *   ★**出典表示はこのサイトの名前で出すこと**（連盟の名前で出さない）。
 *
 * ------------------------------------------------------------------
 * ★ 出典の形（静的HTML。**このリポジトリでいちばん読みやすい**）
 *
 *   `search-year/<年代>/shimane-<大会>/shimane-<大会>-<年代>.html`
 *
 *   大会は `sensyuken`（選手権）・`haru`（春季）・`aki`（秋季）・
 *   `tiku`（地区大会）・`1nen`（一年生。**使わない**）。
 *
 *   1試合が1つの `ul.siaimei` に、意味のある class 付きで並んでいる。
 *
 *     <div class="taikai-nittei">
 *       <time class="siaikekka-time" datetime="2026-07-19">7月19日</time>
 *       <h1 class="kaizyo">県立浜山球場</h1>
 *       <div class="siaikekka">
 *         <ul class="siaimei">
 *           <li class="siai-number">第１試合</li>
 *           <li class="kaisen">３回戦</li>
 *           <li class="school-name">大　田</li>
 *           <li class="point">２</li>
 *           <li class="center">対</li>
 *           <li class="point">９</li>
 *           <li class="school-name">益田東</li>
 *           <h1 class="siaikekka-biko-big">７回コールド</h1>
 *
 *   ★**推測が1つも要らない。** 日付・球場・回戦・両校・得点が全部そのまま載っている。
 *
 * ------------------------------------------------------------------
 * ★★ URLの `<年代>` は「年度（チームの代）」であって暦年ではない
 *
 *   高校野球の1つの代は**秋に始まって翌夏に終わる**ので、
 *
 *     2026年代秋季島根県大会 … **2025年9月**
 *     2026年代春季島根県大会 … 2026年4〜5月
 *     2026年代島根県地区大会 … 2026年5〜6月
 *     第108回選手権島根県大会 … 2026年7月
 *
 *   ★**だから秋だけ `年代 = 暦年 + 1` で引く。**
 *   `main()` は「その年で0件なら前年で引き直す」ので、
 *   2026年の秋がまだ無いうちは 2026年代（＝2025年9月）が入る。
 *
 * ------------------------------------------------------------------
 * ★ 地区大会を春に入れている
 *
 *   5月末〜6月初めの県大会で、**同じ代の春季大会の続き**にあたる時期。
 *   春・夏・秋の3つしか持たないので、暦の近い**春**に入れてある。
 *   ★**大会名は画面に出る**（「2026年代島根県地区大会」）ので、
 *   読む人が何の大会かを取り違えることはない。
 *
 * ------------------------------------------------------------------
 * ★ 検算
 *
 *   ★**組み立てが要らないので、PDFの県とは失敗の仕方が違う。**
 *   対戦相手を推測する余地が無く、起きうるのは取りこぼしだけなので、
 *   **おかしな1件を飛ばして警告を出す**に倒してある（omyutech の5県と同じ）。
 *
 *   - 得点が読めない試合は出さない（まだ行われていない試合の枠がある）
 *   - **1件も取れなかった年のページは静かに飛ばす**（その年の大会がまだ無い）
 */
const shimane = {
  slug: "shimane",
  district: "島根",
  name: "島根県高校野球データベース",
  siteUrl: "https://kokoyakyu-database.jp/",
  politenessMs: 2000,
  seasons: {
    spring: "https://kokoyakyu-database.jp/",
    summer: "https://kokoyakyu-database.jp/",
    autumn: "https://kokoyakyu-database.jp/",
  },
  /**
   * 季節 → 読む大会と、URLの「年代」の作り方。
   * ★**秋だけ 年代 = 暦年 + 1**（上の説明）。
   */
  keysOf(season, year) {
    if (season === "spring") return [["haru", year], ["tiku", year]];
    if (season === "summer") return [["sensyuken", year]];
    return [["aki", year + 1]];
  },
  async collect({ fetchHtml, season, year }) {
    const games = [];
    for (const [key, era] of this.keysOf(season, year)) {
      const url = `https://kokoyakyu-database.jp/search-year/${era}/shimane-${key}/shimane-${key}-${era}.html`;
      const html = await fetchHtml(url);
      // ★その代の大会がまだ無ければ404。**静かに飛ばす**（例外にしない）
      if (!html) continue;
      games.push(...this.parse(html, season));
    }
    return games;
  },
  /** 1つの大会のページを読む */
  parse(html, season) {
    const tournament = normalize(plain(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "")).trim() || null;
    const out = [];
    let skipped = 0;
    /*
      日付のかたまり（`div.taikai-nittei`）ごとに切る。
      ★**1日に複数の球場がある**ので、球場と試合の並びを順に読んで
      **直前の球場を持ち回る**（球場ごとに `h1.kaizyo` → `div.siaikekka` が来る）。
    */
    for (const block of html.split(/<div class="taikai-nittei">/).slice(1)) {
      const date = block.match(/datetime="(\d{4}-\d{2}-\d{2})"/)?.[1] ?? null;
      let venue = null;
      const re = /<h1 class="kaizyo">([\s\S]*?)<\/h1>|<ul class="siaimei">([\s\S]*?)<\/ul>/g;
      let m;
      while ((m = re.exec(block))) {
        if (m[1] !== undefined) {
          venue = normalize(plain(m[1])).replace(/\s+/g, "") || null;
          continue;
        }
        const g = m[2];
        /*
          ★★**連合チームだけ class が違う**（`school-name-over`。名前が長いため）。
          `school-name` だけを見ていると**その試合が丸ごと落ちる**
          （2026年の選手権で1件、秋季で3件が消えていた）。

          ★**さらに `<br>` で折り返している**ものがある
          （`江津・江津工業<br>・浜田水産`）。`plain()` はタグを空白に変えるので、
          **中黒のまわりの空白を詰めないと「江津・江津工業 ・浜田水産」になる。**
          連合チームは `decorate` が空白を残す（空白が学校の区切りの出典があるため）ので、
          ここで詰めておかないとそのまま画面に出る。
        */
        const names = [...g.matchAll(/class="school-name(?:-over)?">([\s\S]*?)</g)].map((x) =>
          normalize(plain(x[1])).replace(/\s*[・･]\s*/g, "・").trim(),
        );
        const points = [...g.matchAll(/class="point">([\s\S]*?)</g)].map((x) =>
          normalize(plain(x[1])).trim(),
        );
        if (names.length !== 2 || points.length !== 2) {
          skipped += 1;
          continue;
        }
        const [a, b] = names;
        const s1 = Number(points[0]);
        const s2 = Number(points[1]);
        /*
          ★**まだ行われていない試合の枠がある**（得点が空）。出さない。
          推測で埋めないのはもちろん、0対0の引き分けとして出さないこと。
        */
        if (!a || !b || !Number.isFinite(s1) || !Number.isFinite(s2)) continue;
        out.push({
          date,
          season,
          tournament,
          round: pickRound(g.match(/class="kaisen">([\s\S]*?)</)?.[1] ?? null),
          venue,
          /*
            ★**引き分けがある。**「勝っていない＝負け」と読むと画面に事実と違うことが出る。
            得点が同じなら両方 false にする。
          */
          teams: [
            { display: a, score: s1, won: s1 > s2 },
            { display: b, score: s2, won: s2 > s1 },
          ],
        });
      }
    }
    if (skipped) {
      console.log(
        `  ⚠️ 島根: 校名か得点が2つ揃わない試合が ${skipped} 件。その試合は出さない。` +
          "出典の作りが変わった可能性がある",
      );
    }
    return out;
  },
};

// ------------------------------------------------------------------
// ★★ 一球速報（omyutech）の試合データを、連盟の公式サイト経由で読む5県
//     茨城・岡山・香川・高知・長崎（2026-08-20 追加）
// ------------------------------------------------------------------

/**
 * ★★**2026-08-20 に方針を変えた。** それまでは「omyutech からは取らない」だった。
 *
 * ------------------------------------------------------------------
 * ★ 何が変わったのか
 *
 *   **変えたのは「連盟の公式サイト上で連盟名義で公開されている試合結果は、
 *   連盟の著作物として扱い、その数値（事実）を引用する」という整理。**
 *   運営者の判断（2026-08-20）。
 *
 *   ★**この判断の前提を、次に触る人が誤解しないように書いておく。**
 *
 *   1. **著作権の面では元から問題になっていなかった。**
 *      スコアは事実であって、著作権が守るのは表現。このリポジトリは
 *      21世紀枠でも「事実の抽出では CC BY-SA の継承は発動しないが、
 *      文章を持ってくると発動する」と整理している。**同じ線を引いている。**
 *      ★だから**文章は取らない。数値・校名・日付・球場・回戦だけ**にすること。
 *   2. ★★**塞いでいたのは著作権ではなく利用規約だった。**
 *      一球速報.com の利用規約（2020-03-27 最終改訂）第20条（禁止行為）
 *      (2) コンテンツのクローリング・スクレイピング等による取得
 *      (3) コンテンツの営利目的での第三者提供
 *      **これは著作権の条項ではない**ので、「連盟の著作物として扱う」という
 *      整理ではこの条文に届かない。
 *   3. 判断材料として実際に確かめた事実:
 *      - 第20条の名宛人は「利用者」＝第2条(7)で
 *        「登録希望者及び登録ユーザーを含む本サービスを利用する一切の個人又は法人」
 *      - 一方 第3条1項は「登録ユーザーと当社との間」の関係に適用と書いている
 *      - 第21条3項の制裁（データの廃棄・消却請求、差止め）の対象は**登録ユーザー**
 *      - 4県の robots.txt は `Disallow:` が空＝**全許可**
 *      - 連盟サイト側には利用規約が無い（香川はメニュー構成を全部展開して確認）
 *
 *   ★**運営者が上記を踏まえて「取る」と決めた。** 覆すときも同じ材料で判断すること。
 *
 * ------------------------------------------------------------------
 * ★ 出典の形
 *
 *   `baseball.omyutech.com/json/omyuleagueschedule.action`
 *     ?league_id=<県ごとの定数>&year=<年+種別>&section_id=<節>
 *
 *   `league_id` は連盟サイトの `main.*.chunk.js` にある県ごとの定数
 *   （茨城208・岡山233・香川236・高知239・長崎242）。
 *   ★**`from=` は何を入れても結果が変わらない**（香川のサイト自身が
 *   `from=yamagata` を送っている）。空で送る。
 *
 *   返るのは**組み立て済みの試合の一覧**で、1件ずつに
 *   日付・回戦・球場・両校の正式名称と略称・得点・状態が入っている。
 *
 * ------------------------------------------------------------------
 * ★★ この出典は「組み立て」が要らない ── 失敗の仕方が他の県と違う
 *
 *   PDFの県は「1つでも検算が合わなければ、その大会を1試合も出さない」に
 *   倒してある。**枝の位置から対戦を推測するので、外すと存在しない試合を作る**からだ。
 *
 *   ここは1件ずつが出典の記録そのもので、**対戦相手を推測する余地が無い。**
 *   起きうるのは「余計な記録を混ぜる」「取りこぼす」だけなので、
 *   **おかしな1件を飛ばして警告を出す**に倒す。大会ごと落とすのは行き過ぎ。
 *
 * ------------------------------------------------------------------
 * ★ ここで踏んだところ
 *
 *   1. ★★**既定の応答だけでは足りない。** 香川の2025春は
 *      「第78回春季四国地区高等学校野球大会出場順位決定戦」**1試合**しか返らず、
 *      本体の34試合は `section_id=5`（春季県大会）にあった。
 *      **`section_list` を見て節ごとに取り直すこと。**
 *   2. ★★**未実施の記録が混ざる。** `試合開始前中止` は**0対0**で入っており、
 *      **同じ対戦が翌日に本物の結果として再度載る**（茨城の2025選手権で3件）。
 *      落とさないと「0-0の引き分け」が画面に出る。
 *   3. ★★**中断した試合も0対0ではないが結果ではない。**
 *      `6回裏より継続試合` はその時点のスコアで、**翌日に `試合終了` の記録が別にある**
 *      （竜ヶ崎一 4-7 常磐大 → 翌日 5-7）。これも落とす。
 *      **→ 状態はホワイトリスト方式にする。知らない状態は出さずに警告する。**
 *   4. ★**上位大会の節が混ざる。** 茨城には「春季関東大会」、岡山には「春季中国大会」の
 *      節があり、**他県の学校が出てくる。** 県のページに混ぜない。
 *   5. ★**軟式の大会が同じ節の一覧に並ぶ**（岡山）。このサイトは硬式なので外す。
 *   6. ★**岡山だけ `year` の作りが違う。** 他の4県は `年+種別`（20262＝2026年の選手権）
 *      だが、岡山は `年` だけで、**その年の全大会が節として並ぶ。**
 *      節の名前で季節を振り分ける（`byYearOnly`）。
 */

/** 終わった試合だけを通す。★**知らない状態は通さない**（上の3を参照） */
const OMYU_FINISHED = /^(試合終了|[0-9０-９]+回コールド|延長[0-9０-９]+回終了)$/;

/**
 * ★**このサイトが扱わない大会。** 硬式の県大会だけを残す。
 * ★**「全国」「関東」などの語で外さないこと** —— 選手権の県予選は
 * 「第108回**全国**高等学校野球選手権香川大会」、春季は
 * 「春季**四国**地区高等学校野球香川県大会」で、どちらも上位大会の語を含む
 * （これで外して香川の夏が0試合になった）。
 */
const OMYU_SKIP_SECTION = /軟式|交流試合|一年生|１年生|選抜|甲子園|神宮/;

/**
 * ★★**残すのは「大会名に県名が入っているもの」だけ。**
 *
 * 上位大会（岡山の「第144回春季中国地区高等学校野球大会」、
 * 茨城の「春季関東大会」）には**他県の学校が出てくる**ので県のページに混ぜない。
 * 県予選は必ず県名が入る（「…香川大会」「…茨城県大会」「…長崎県大会」）ので、
 * **県名の有無で線を引くのがいちばん確実。** main() の `isPrefectureOnly` と同じ考え方。
 */
const omyuKeeps = (district, name) =>
  Boolean(name) && name.includes(district) && !OMYU_SKIP_SECTION.test(name);

/** 節の名前 → 季節。岡山（`byYearOnly`）で使う */
const OMYU_SEASON_OF = (name) =>
  /春季/.test(name) ? "spring" : /選手権/.test(name) ? "summer" : /秋季/.test(name) ? "autumn" : null;

/**
 * ★**正式名称から、学校マスタの短い校名に当たる形を作る。**
 *
 *   香川県立善通寺第一高等学校 → 善通寺第一
 *   高松第一高等学校           → 高松第一
 *   香川高等専門学校高松       → （そのまま。高等専門学校は落とさない）
 *
 * ★**設置区分は先頭のぶんだけ落とす。** 「熊本県立第二高等学校」のように
 * **校名そのものに設置区分が入っている学校**があるので、
 * 落とした結果が空や1文字になるなら元に戻す。
 */
function omyuMatchName(full) {
  const s = normalize(String(full ?? "")).replace(/[\s　]/g, "");
  if (!s) return null;
  const bare = s.replace(/^.{1,4}?[都道府県]立/, "").replace(/^.{1,4}?[市町村区]立/, "");
  const dropped = bare.length >= 2 ? bare : s;
  // ★**高等専門学校を壊さない**（「高等学校」で終わるものだけ落とす）
  const out = dropped.replace(/高等学校$/, "");
  return out.length >= 2 ? out : dropped;
}

/**
 * 1回ぶんの取得。**取れなければ null。例外は投げない**（1県の失敗で全国を止めない）。
 */
async function fetchOmyuSchedule(leagueId, year, sectionId = "") {
  const url =
    `https://baseball.omyutech.com/json/omyuleagueschedule.action` +
    `?from=&league_id=${leagueId}&year=${year}&team_id=&section_id=${sectionId}&game_date=`;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(3000 * attempt);
    try {
      const res = await fetch(url, {
        headers: { ...UA, Accept: "application/json" },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) continue;
      const j = await res.json();
      // ★`retCode` を見ること。中身が空でも 200 を返す
      return j?.retCode === 0 ? j : null;
    } catch {
      // 次の試行へ
    }
  }
  return null;
}

/**
 * ★**5県で中身がまったく同じなので、アダプタを作る関数にしてある。**
 * 県ごとに違うのは `leagueId` と、岡山だけの `byYearOnly` だけ。
 */
function omyuAdapter({ slug, district, name, siteUrl, leagueId, byYearOnly = false }) {
  return {
    slug,
    district,
    name,
    siteUrl,
    politenessMs: 1500,
    // ★**3季とも同じ入口。** 季節の振り分けは `year` の作りか節の名前で決まる
    seasons: { spring: siteUrl, summer: siteUrl, autumn: siteUrl },
    leagueId,
    byYearOnly,
    /** 岡山は3季とも同じ応答から節を選ぶので、年ごとに1回だけ取る */
    sectionCache: new Map(),

    async collect({ season, year }) {
      const kind = { spring: 1, summer: 2, autumn: 3 }[season];
      const yearParam = this.byYearOnly ? `${year}` : `${year}${kind}`;

      let base = this.sectionCache.get(yearParam);
      if (base === undefined) {
        base = await fetchOmyuSchedule(this.leagueId, yearParam);
        this.sectionCache.set(yearParam, base);
        await sleep(this.politenessMs);
      }
      // その年・その季節の大会がまだ無いときは静かに終わる（例外を投げない）
      if (!base?.cup_name) return [];

      /*
        ★**節ごとに取り直す**（上の1）。節が無い応答は既定のぶんだけを使う。
      */
      const sections = base.section_list?.length
        ? base.section_list
        : [{ section_Id: "", section_name: base.cup_name }];

      const games = [];
      /** 同じ試合が別の節にも載ることがあるので `game_id` で落とす */
      const seen = new Set();
      /** 知らない状態。**黙って捨てない**ので、出典が変わったら気づける */
      const unknown = new Map();

      for (const s of sections) {
        const label = normalize(String(s.section_name ?? ""));
        if (OMYU_SKIP_SECTION.test(label)) continue;
        /*
          ★**節の名前に県名が入らない県がある**（香川の「選手権地方大会」）ので、
          ここでは外さない。**大会名（`cup_name`）で判定する**（下）。
        */
        // 岡山は3季ぶんの節が1つの一覧に並ぶので、名前で季節を振り分ける
        if (this.byYearOnly && OMYU_SEASON_OF(label) !== season) continue;

        const o =
          s.section_Id === "" ? base : await fetchOmyuSchedule(this.leagueId, yearParam, s.section_Id);
        if (s.section_Id !== "") await sleep(this.politenessMs);
        if (!o?.game_list?.length) continue;

        const tournament = normalize(String(o.cup_name ?? "")).replace(/\s+/g, " ").trim() || null;
        // ★**県名が入っている大会だけ残す**（`omyuKeeps` の説明を読むこと）
        if (!omyuKeeps(this.district, tournament)) continue;

        for (const g of o.game_list) {
          if (seen.has(g.game_id)) continue;
          seen.add(g.game_id);

          const status = normalize(String(g.game_status ?? "").trim());
          if (!OMYU_FINISHED.test(status)) {
            /*
              ★**未実施・中断中の記録**（`試合開始前` `試合開始前中止`
              `N回裏より継続試合`）。**本物の結果は別の日に載る**ので落とす。
              知らない状態だけ数えて出す。
            */
            /*
              ★★**進行中の試合は「7回表」「4回表」のように回で書かれる**
              （2026-08-20。茨城の秋季が開催中で実際に出た）。
              これは出典の作りが変わったのではなく**まだ終わっていないだけ**なので、
              警告を出さずに飛ばす。**次の実行で結果として入ってくる。**
            */
            if (!/試合開始前|継続試合|中止|ノーゲーム|試合前|\d+回[表裏]/.test(status)) {
              unknown.set(status || "(空)", (unknown.get(status || "(空)") ?? 0) + 1);
            }
            continue;
          }

          const s1 = Number(g.team1_score);
          const s2 = Number(g.team2_score);
          if (!Number.isFinite(s1) || !Number.isFinite(s2)) continue;

          const date = String(g.game_date ?? "").match(/^(\d{4})(\d{2})(\d{2})$/);
          const a = String(g.team1_name_abbr || g.team1_name || "").trim();
          const b = String(g.team2_name_abbr || g.team2_name || "").trim();
          if (!a || !b) continue;

          games.push({
            // ★日付が読めなければ null のまま。推測で埋めない
            date: date ? `${date[1]}-${date[2]}-${date[3]}` : null,
            season,
            tournament,
            // 「１回戦」→「1回戦」。他県の生成物と表記をそろえる
            round: normalize(String(g.pk_number ?? "").trim()) || null,
            venue: String(g.stadium_name ?? "").trim() || null,
            /*
              ★**引き分けがある。**「勝っていない＝負け」と読むと画面に事実と違うことが出る
              （岐阜で実際に出た）。得点が同じなら両方 false にする。
            */
            /*
              ★★**画面に出す名前と、照合に使う名前を分ける。**

              略称（`team1_name_abbr`）は「善通寺一」「高松一」「観音寺一」のように
              **「第」を落とす**ので、学校マスタ（「善通寺第一高校」）に当たらない。
              一方 `team1_name` は文科省の一覧と同じ**正式名称**
              （「香川県立善通寺第一高等学校」）なので、そこから作った形なら確実に当たる。

              ★**画面には略称を出す**（正式名称は一覧に並べるには長すぎる）。
            */
            teams: [
              { display: a, match: omyuMatchName(g.team1_name), score: s1, won: s1 > s2 },
              { display: b, match: omyuMatchName(g.team2_name), score: s2, won: s2 > s1 },
            ],
          });
        }
      }

      if (unknown.size) {
        console.log(
          `  ⚠️ ${district}: 知らない試合状態 ${[...unknown].map(([k, v]) => `「${k}」${v}件`).join("・")}。` +
            "その試合は出さない。出典の作りが変わった可能性がある",
        );
      }
      return games;
    },
  };
}

/*
  ★**league_id は連盟サイトの `main.*.chunk.js` にある県ごとの定数。**
  変わらない（omyutech の SPA はチャンクのハッシュが変わっても同じ値を使う）。
  ★**出典表示は連盟の名前で出す**（サイトの見た目も連盟のもの）。
*/
const ibaraki = omyuAdapter({
  slug: "ibaraki",
  district: "茨城",
  name: "茨城県高等学校野球連盟",
  siteUrl: "http://www.ibaraki-hbf.com/",
  leagueId: 208,
});

const okayama = omyuAdapter({
  slug: "okayama",
  district: "岡山",
  name: "岡山県高等学校野球連盟",
  siteUrl: "https://www.okayama-hbf.com/",
  leagueId: 233,
  // ★岡山だけ `year` が年のみで、その年の全大会が節として並ぶ
  byYearOnly: true,
});

const kagawa = omyuAdapter({
  slug: "kagawa",
  district: "香川",
  name: "香川県高等学校野球連盟",
  siteUrl: "https://www.kagawa-hbf.com/top",
  leagueId: 236,
});

const kochi = omyuAdapter({
  slug: "kochi",
  district: "高知",
  name: "高知県高等学校野球連盟",
  siteUrl: "https://www.kochi-hbf.com/top",
  leagueId: 239,
});

const nagasaki = omyuAdapter({
  slug: "nagasaki",
  district: "長崎",
  name: "長崎県高等学校野球連盟",
  siteUrl: "https://nagasaki-kouyaren.com/",
  leagueId: 242,
});

/**
 * HSB flash（`fukuoka.hsbflash.jp`）。**福岡県高野連ではない。**
 *
 * ------------------------------------------------------------------
 * ★★ なぜ連盟から取らないのか
 *
 *   **福岡県高野連は結果を全部JPG画像で出している**（PDFが1つも無い）。
 *   このリポジトリはOCRを持たないので読めない。**連盟以外を探すしかなかった。**
 *   埼玉・神奈川・愛知・島根・岩手と同じ扱いで、
 *   ★**出典表示は「HSB flash」**にすること（連盟の名前で出さない）。
 *
 * ------------------------------------------------------------------
 * ★★ 規約（2026-08-21 に運営者と確認して採用）
 *
 *   掲示は「**記事、写真**の無断転載を禁じます」の1文だけ。
 *   ★**名指しは「記事」と「写真」で、データもコンテンツも挙げていない。**
 *   **栃木県高野連（掲載の写真、記事の無断転載を禁じます）とまったく同じ類型**で、
 *   岩手の白球ペンギン.com（「文章や画像、動画等の著作物」）より名指しが狭い。
 *   `robots.txt` は 200 だが**中身が空**（制限なし）。営利目的の禁止も無い。
 *
 *   ★**だから記事の文章は1文字も取らない。** 取るのは
 *   **校名・得点・回戦・日付・球場だけ。** この線を緩めないこと。
 *   ★**公開前に一度問い合わせること**（岩手で決めたのと同じ線）。
 *
 *   ★★**このサイトは47都道府県ぶんある**（`<県>.hsbflash.jp`）。
 *   **規約で外している6県（北海道・青森・秋田・東京・鳥取・宮城）も
 *   ここからなら技術的には取れてしまう。**
 *   ★**連盟が断っているものを別経路で取るかどうかは運営者の判断**なので、
 *   **福岡だけにしてある。勝手に他県へ広げないこと。**
 *
 * ------------------------------------------------------------------
 * ★★ 出典の形 ── **枝が線として描いてあるトーナメント表**
 *
 *   このリポジトリは**トーナメント表を原則として出典にしない**（石川の件）。
 *   例外にした県は**座標から枝の形を推測して**組み立てているが、
 *   ★**この表はSVGで、どの枝とどの枝が1試合になるかが線で描いてある。**
 *   **推測が要らない**ので、石川で踏んだ「構造は合うのに相手が違う」が起きない。
 *   読み手は `scripts/lib/svg-bracket.mjs`（**そこの説明を必ず読むこと**）。
 *
 *   ★**`stroke="red"` が勝った側**。得点とは別に勝敗が描いてあるので、
 *   **「赤い側」と「点の多い側」の一致**を読み手の中で検算している。
 *
 * ------------------------------------------------------------------
 * ★ どこから辿るか
 *
 *   | ページ | 中身 |
 *   |---|---|
 *   | `/`（索引） | **開催中/直近の大会**。大会名・優勝・準優勝・`/tournament` へのリンク |
 *   | `/pasts` | 過去の大会の一覧（年度ごと）。`/past/<token>` へ |
 *   | `/past/<token>` | ★**西暦入りの大会期間**・優勝・準優勝・**出場校の一覧**・`/tournament/<token>` |
 *
 *   ★★**URLに24時間で切れる署名（`exp`）が入っている。** 固定して持てないので、
 *   **必ず索引から辿ること**（普通にブラウザで見るのと同じ道）。
 *   ★**トークンを自分で作らないこと。**
 *
 * ------------------------------------------------------------------
 * ★★ 検算（合わなければその大会を1試合も出さない）
 *
 *   | | 中身 |
 *   |---|---|
 *   | A | **赤い枝と点の多い側が一致**（読み手の中。全試合） |
 *   | B | **チーム数 − 試合数 = 1** |
 *   | C | ★★**組み立てたスロットの校名が、出典の「出場校」一覧と1対1で対応**（過去大会のみ） |
 *   | D | **決勝の勝者＝印字の優勝校／敗者＝準優勝校** |
 *
 *   ★**Cがいちばん強い。** 128スロットのうち1つでも読み違えれば必ず余る。
 *
 * ------------------------------------------------------------------
 * ★ ここで踏んだところ
 *
 *   1. ★★**左右の半分は同じ高さを使う。** 枝を「高さ」だけで持つと
 *      **スロット1と65が同じ枝**になる（128チームが64に潰れた）。**左右を鍵に入れる。**
 *   2. ★★**回戦の深さは半分ごとに数える。** まとめて並べると
 *      **右半分が全部浅い回戦**になり「8回戦・9回戦…」という名前が出る。
 *   3. ★**スロット番号の文字は枝の線より4ポイント下**（文字の基準線）。許容を広げる。
 *   4. ★**長い連合チーム名は表の中で切れている**
 *      （表「久留米高専久留米筑水・八女農業」／一覧「久留米高専・久留米筑水・八女農業・輝翔館」）。
 *      ★**過去大会は「出場校」一覧の校名を使う**（表の校名は検算にだけ使う）。
 *      **開催中の大会は一覧が無いので表の校名のまま**になる。
 *   5. ★**日付は「20(金)」と日にちだけ。** 月は大会期間から決める
 *      （またぐときは「開始日以上なら開始月、そうでなければ終了月」）。
 *      ★**決勝だけ縦書きの漢数字**（`四 月 六 日`）なので別に読む。
 */
const fukuoka = {
  slug: "fukuoka",
  district: "福岡",
  name: "HSB flash",
  siteUrl: "https://fukuoka.hsbflash.jp/",
  politenessMs: 2000,
  seasons: {
    spring: "https://fukuoka.hsbflash.jp/",
    summer: "https://fukuoka.hsbflash.jp/",
    autumn: "https://fukuoka.hsbflash.jp/",
  },
  /*
    ★**同じページを季節ごとに取りに行かない**（3季ぶんで3倍になる）。
    ★**約束（Promise）のまま持つ**（取得中にもう一度呼ばれても二重に取らない）。
  */
  _pages: new Map(),
  page(url, fetchHtml) {
    if (!this._pages.has(url)) this._pages.set(url, fetchHtml(url));
    return this._pages.get(url);
  },
  /** 大会名から季節を決める。★**当てはまらない大会は取らない**（1年生大会など） */
  seasonOf(title) {
    if (/選手権/.test(title)) return "summer";
    if (/春季/.test(title)) return "spring";
    if (/秋季/.test(title)) return "autumn";
    return null;
  },
  async collect({ fetchHtml, season, year }) {
    const get = (url) => this.page(url, fetchHtml);
    const base = "https://fukuoka.hsbflash.jp";

    // ---- 1. 索引（開催中/直近の大会）----
    const index = await get(`${base}/`);
    if (!index) {
      console.log("  ⚠️ 福岡: 索引が取れない。出典の作りが変わった可能性がある");
      return [];
    }
    /*
      ★★**大会名に「福岡」を必ず入れること。**
      索引の見出し（`games_name_L`）は `全国高等学校野球選手権` で県名が入らない。
      **大会名に県名も「県予選」「県大会」も無いと、`isPrefectureOnly` が false になり、
      校名の照合で全国の受け皿が使われる** ——
      AGENTS.md の「県大会で県外の学校に結び付けない」に反する
      （愛知「愛知」が滋賀県立愛知になったのと同じ壊れ方）。
      ★**試合日程の見出し（`games_name`）には「福岡大会」が入っている**ので、そちらを使う。
    */
    const curName = normalize(
      plain(/<p class="games_name">([\s\S]*?)<\/p>/.exec(index)?.[1] ?? "") ||
        plain(/<h1 class="games_name_L">([\s\S]*?)<\/h1>/.exec(index)?.[1] ?? ""),
    );
    const cur = {
      title: normalize(
        (plain(/<p class="games_year">([\s\S]*?)<\/p>/.exec(index)?.[1] ?? "") + curName).trim(),
      ),
      period: normalize(plain(/<p class="games_period">([\s\S]*?)<\/p>/.exec(index)?.[1] ?? "")),
      bracket: `${base}/tournament`,
      ...this.winners(index),
    };
    if (this.seasonOf(cur.title) === season && cur.title) {
      /*
        ★**索引には西暦が無い。** 選手権は「第N回 − 1918」で出せる。
        春季・秋季には回数が無いので、**開催中は暦年**とみなす
        （春3〜4月・秋8〜10月なので年をまたがない）。
        ★**未来の日付が出たら1試合も出さない**ので、取り違えればそこで止まる。
      */
      const n = Number(cur.title.match(/第(\d+)回/)?.[1]);
      const games = await this.readTournament(get, {
        ...cur,
        season,
        year: season === "summer" && Number.isFinite(n) ? n + 1918 : year,
        entries: null,
      });
      if (games.length) return games;
    }

    // ---- 2. 過去の大会 ----
    const pasts = await get(`${base}/pasts`);
    if (!pasts) return [];
    const links = [...pasts.matchAll(/<a[^>]+href="(\/past\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
      .map((m) => ({ url: base + m[1], title: normalize(plain(m[2])) }))
      .filter((l) => this.seasonOf(l.title) === season);
    /*
      ★★**いちばん新しい1件しか見ないこと**（2026-08-21 に直した）。
      検算で落ちたときに次（＝1年前）を試すと、**古い大会が「今の季節」として出る。**
      実際に**2025年の秋季が落ちて、2024年の秋季が出た**（2年前の試合が画面に並ぶ）。
      ★**落ちたらその季節は0件にする**のが正しい。前の内容は季節ごとの歯止めが残す。
    */
    for (const link of links.slice(0, 1)) {
      const html = await get(link.url);
      if (!html) continue;
      /*
        ★**過去大会のページには西暦入りの大会期間がある**
        （`大会期間 2026年3月20日(金) 〜 4月6日(月)`）。**回数から年を出さない。**
      */
      const period = normalize(plain(html).replace(/^.*大会期間/s, "").slice(0, 60));
      const y = Number(period.match(/(\d{4})年/)?.[1]);
      if (!Number.isFinite(y)) {
        console.log(`  ⚠️ 福岡: 「${link.title}」の大会期間から西暦を読めない`);
        continue;
      }
      const bracket = base + (/<a[^>]+href="(\/tournament\/[^"]+)"/.exec(html)?.[1] ?? "");
      /*
        ★**「出場校」の一覧はスロット順**（実測で 折尾=1・大和青藍=2・…・
        久留米高専・久留米筑水・八女農業・輝翔館=25 が表と一致した）。
        **表の中で切れている長い校名を、こちらで補う。**
      */
      const entries = [...html.matchAll(/<a[^>]+href="\/school\/[^"]+"[^>]*>([\s\S]*?)<\/a>/g)].map((m) =>
        normalize(plain(m[1])),
      );
      const games = await this.readTournament(get, {
        title: link.title,
        period,
        bracket,
        season,
        year: y,
        entries: entries.length ? entries : null,
        ...this.winners(html),
      });
      if (games.length) return games;
    }
    return [];
  },
  /** `<dt>優勝</dt><dd>◯◯高等学校</dd>` を読む */
  winners(html) {
    const dl = [...html.matchAll(/<dt>([^<]*)<\/dt>\s*<dd>([^<]*)<\/dd>/g)].map((m) => [
      normalize(plain(m[1])),
      normalize(plain(m[2])),
    ]);
    return {
      champion: dl.find(([k]) => k === "優勝")?.[1] ?? null,
      runnerUp: dl.find(([k]) => k === "準優勝")?.[1] ?? null,
    };
  },
  /** トーナメント表を1枚読んで、生成物の形にする */
  async readTournament(get, info) {
    if (!info.bracket) return [];
    const html = await get(info.bracket);
    if (!html) {
      console.log(`  ⚠️ 福岡: 「${info.title}」のトーナメント表が取れない`);
      return [];
    }
    const built = readHsbBracket(html, { district: "福岡" });
    if (!built) return [];

    // ---- 検算B: 勝ち抜きの算数 ----
    if (built.slots.length - built.games.length !== 1) {
      console.log(
        `  ⚠️ 福岡: ${info.title} は ${built.slots.length} チームに対し ${built.games.length} 試合` +
          `（${built.slots.length - 1} のはず）。1試合も出さない`,
      );
      return [];
    }

    /*
      ---- 検算C: 出場校の一覧と1対1 ----
      ★**表の中の校名は長いと切れている**ので、**部分列なら同じ**とみなす
      （兵庫で決めた比べ方）。**過不足なく対応することは要求する。**
    */
    let names = built.slots.map((s) => s.name);
    if (info.entries) {
      if (info.entries.length !== built.slots.length) {
        console.log(
          `  ⚠️ 福岡: ${info.title} の出場校が ${info.entries.length} 校、表は ${built.slots.length} スロット。1試合も出さない`,
        );
        return [];
      }
      /*
        ★★**中黒を外してから比べること。** 表の中で長い連合チーム名が折り返されると、
        **折り返しの位置にあった「・」が消える**
        （表「久留米高専久留米筑水・八女農業」／一覧「久留米高専・久留米筑水・八女農業・輝翔館」）。
        中黒を残したまま部分列を見ると**必ず食い違う**（春季・秋季が丸ごと落ちた）。
      */
      const bare = (v) => normalizeSchoolName(v).replace(/[・･]/g, "");
      const bad = built.slots.findIndex((s, i) => {
        const a = bare(s.name);
        const b = bare(info.entries[i]);
        return !(a.includes(b) || b.includes(a));
      });
      if (bad >= 0) {
        console.log(
          `  ⚠️ 福岡: ${info.title} のスロット ${bad + 1} が一覧と合わない` +
            `（表「${built.slots[bad].name}」/ 一覧「${info.entries[bad]}」）。1試合も出さない`,
        );
        return [];
      }
      // ★**画面に出すのは一覧のほう**（表は切れている）
      names = info.entries;
    }
    const byName = new Map(built.slots.map((s, i) => [s.name, names[i]]));

    // ---- 検算D: 印字された優勝校・準優勝校 ----
    const same = (a, b) => {
      const x = normalizeSchoolName((a ?? "").replace(/高等?学?校.*$/, ""));
      const y = normalizeSchoolName((b ?? "").replace(/高等?学?校.*$/, ""));
      return Boolean(x) && Boolean(y) && (x.includes(y) || y.includes(x));
    };
    const final = built.games.find((g) => g.round === "決勝");
    if (info.champion && final) {
      const won = built.champion;
      const lost = won === final.a ? final.b : final.a;
      if (!same(won, info.champion) || (info.runnerUp && !same(lost, info.runnerUp))) {
        console.log(
          `  ⚠️ 福岡: ${info.title} の決勝が記載と合わない` +
            `（記載「${info.champion} / ${info.runnerUp}」/ 組み立て「${won} / ${lost}」）。1試合も出さない`,
        );
        return [];
      }
    }

    /*
      ---- 日付 ----
      ★**枝の日付は「20(金)」と日にちだけ。** 月は大会期間から決める。
      期間が月をまたぐときは「**開始日以上なら開始月、そうでなければ終了月**」。
      （3/20〜4/6 なら 20→3月・29→3月・2→4月・6→4月。県大会は1か月半を超えない）
    */
    const span = info.period?.match(/(\d{1,2})月\s*(\d{1,2})日[\s\S]*?(\d{1,2})月\s*(\d{1,2})日/);
    if (!span) {
      console.log(`  ⚠️ 福岡: ${info.title} の大会期間が読めない（${info.period ?? ""}）。1試合も出さない`);
      return [];
    }
    const [m1, d1, m2] = [Number(span[1]), Number(span[2]), Number(span[3])];
    const iso = (day) => {
      const mm = m1 === m2 ? m1 : day >= d1 ? m1 : m2;
      return `${info.year}-${String(mm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    };
    /*
      ★★**カタカナの「ニ」が漢数字の「二」として使われている**（2026-08-21）。
      夏の決勝の縦書きが `七 月 ニ 十 五 日` で、**3文字目が U+30CB（カタカナ）**。
      漢字だけを見ていると**決勝の日付だけが null になる**（実際になった）。
    */
    const KANJI = { 一: 1, 二: 2, ニ: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
    const kanjiNum = (s) => {
      if (!s) return null;
      if (s.length === 1) return KANJI[s] ?? null;
      const [a, b] = [...s];
      if (a === "十") return 10 + (KANJI[b] ?? 0);
      if (b === "十") return (KANJI[a] ?? 0) * 10 + (KANJI[[...s][2]] ?? 0);
      return null;
    };

    const today = new Date().toISOString().slice(0, 10);
    const out = [];
    for (const g of built.games) {
      const label = g.label.join(" ");
      let date = null;
      const day = label.match(/(\d{1,2})\s*\(/)?.[1];
      if (day) date = iso(Number(day));
      else {
        // ★決勝だけ縦書きの漢数字（`四 月 六 日`）
        const k = label.replace(/\s+/g, "").match(/([一二ニ三四五六七八九十]+)月([一二ニ三四五六七八九十]+)日/);
        const mm = kanjiNum(k?.[1]);
        const dd = kanjiNum(k?.[2]);
        if (mm && dd) date = `${info.year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
      }
      // ★**未来の日付は出さない**（年を取り違えたらここで止まる。栃木で入れた歯止め）
      if (date && date > today) {
        console.log(`  ⚠️ 福岡: ${info.title} に未来の日付（${date}）がある。1試合も出さない`);
        return [];
      }
      /*
        ★**球場の記号は「開始時刻の直前の1文字」。** ただし決勝だけ
        `…(土)10:04北` と**時刻のうしろ**に付くので、そのときは末尾を見る。
        ★**どちらも「凡例にある記号か」で確かめてから使う**
        （曜日の `(土)` を球場と読み違えないため）。
      */
      const flat = label.replace(/\s+/g, "");
      const before = flat.match(/(.)\d{1,2}:\d{2}/)?.[1] ?? null;
      const last = flat.slice(-1);
      const mark = built.legend.has(before) ? before : built.legend.has(last) ? last : null;
      out.push({
        date,
        season: info.season,
        tournament: info.title,
        round: g.round,
        venue: (mark && built.legend.get(mark)) ?? null,
        teams: [
          { display: byName.get(g.a) ?? g.a, score: g.sa, won: g.sa > g.sb },
          { display: byName.get(g.b) ?? g.b, score: g.sb, won: g.sb > g.sa },
        ],
      });
    }
    const undated = out.filter((g) => !g.date).length;
    console.log(
      `  （${info.title}: ${out.length} 試合 / 優勝 ${built.champion}` +
        `${info.champion ? "（記載と一致）" : "（記載が無く未検算）"} / ${built.slots.length} チーム` +
        `${undated ? ` ・日付の付かない試合 ${undated} 件` : ""}）`,
    );
    return out;
  },
};

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
  yamagata,
  shizuoka,
  yamaguchi,
  miyazaki,
  fukui,
  wakayama,
  shiga,
  hyogo,
  // ★2026-08-20 に方針を変えて足した5県（omyuAdapter の説明を読むこと）
  ibaraki,
  okayama,
  kagawa,
  kochi,
  nagasaki,
  // ★連盟ではなく個人運営のサイトが出典（埼玉・神奈川・愛知と同じ）
  shimane,
  iwate,
  // ★規約で外していたのは誤りだった（oita / tochigi の説明を読むこと）
  oita,
  tochigi,
  // ★連盟が結果を画像でしか出していないので、連盟以外から取る（fukuoka の説明を読むこと）
  fukuoka,
  // ★「スロット番号の行が無い」という記録が誤りだった（okinawa の説明を読むこと）
  okinawa,
  /*
    ★**福島は「未完成」だった記録が2つとも誤りだった**（2026-08-21 に実装）。
    「32試合しか読めない」は**見出し行の数を試合数と取り違えていた**もので、
    **1行に試合が横に2つ並ぶ**（段まで数えれば61試合）。
    「そもそも32試合しか載っていない」も同じ取り違え。**fukushima の説明を読むこと。**
  */
  fukushima,
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
  /*
    ★**「第」を落とした形**（2026-08-20。岩手のため）。
    出典は「盛岡第一」を**「盛岡一」**、「一関第二」を**「一関二」**と書く。
    ★**弱い候補にする。** 同じ県に「◯◯一高校」が別にあるなら、そちらが優先される。
  */
  const noOrdinal = short.replace(/第([一二三四五六七八九十]|d+)/, "$1");
  if (noOrdinal !== short) weak.add(noOrdinal);
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
  /*
    ★**香川高専は高松・詫間の2キャンパスがあり、大会にはキャンパスごとに出る**
    （熊本高専と同じ形）。学校マスタは1校なので、両方を同じ学校に結び付ける。
    ★**出典で実際に使われている表記だけ足すこと。**
    2026-08-20 時点で確かめられたのは「香川高専高松」だけ。
  */
  "香川\t香川高専高松": "kagawa",
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
  /*
    静岡。★**この出典は市立校の書き方が2通りある**（2026-08-16 に確かめた）。

      静岡市立・浜松市立 … 市名のうしろに「市立」（規則で結び付く）
      市立沼津           … ★**前に付く**ので規則では拾えない ← ここで受ける

    やぐら表には 沼津東・沼津商・沼津城北・沼津高専 が別のスロットで出ており、
    **静岡県の公立で「市立沼津」に当たるのは沼津市立高校だけ**（学校マスタでは
    `numazu` ＝ 沼津高校・municipal）。
  */
  "静岡\t市立沼津": "numazu",
  /*
    山口。やぐら表は設置者と学校種を省く。**どちらも県内に同名は無い**
    （2026-08-16 に学校マスタで確認）。

      周防大島 → 山口県立大学附属周防大島高校（県立。2025年に改称）
      大島商船 → 大島商船高専（国立。「高専」を付けずに書かれる）
  */
  "山口\t周防大島": "yamaguchikenritsudaigakufuzokusuooshima",
  "山口\t大島商船": "oshimashosen",
  /*
    和歌山。★**「和歌山高校」は県立と市立の2件ある**（学校マスタで確認。2026-08-17）。
    出典は `県和歌山` `市和歌山` と**書き分けている**ので、そのとおりに受ける。
    分校2件は本校と別の学校としてマスタに入っている。

      県和歌山 → 和歌山**県立**和歌山高校
      市和歌山 → 和歌山**市立**和歌山高校
      南部龍神 → 南部高校**龍神分校**
      日高中津 → 日高高校**中津分校**（同名の日高高校が他県に4件あるが、分校は1件）
  */
  "和歌山\t県和歌山": "wakayama",
  "和歌山\t市和歌山": "wakayama-wakayama",
  "和歌山\t南部龍神": "minaberyujin",
  "和歌山\t日高中津": "hidakanakatsu",
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
  /*
    山形（2026-08-16）。どちらも公立で、規則では拾えない書き方をされている。

      山形商業   → 山形**市立**商業（出典は「市立」を省く。学校マスタで
                   「山形」と「商業」を含む学校はこの1校だけ）
      新庄神室   → 新庄神室**産業**（出典は「産業」を省く）
                   ★**分校は別**（真室川校・金山校）。出典はそちらを
                   「新庄神室産業真室川」のように書き分けるので、
                   「新庄神室」だけなら本校。**分校名が付いたら結び付けない。**
  */
  "山形\t山形商業": "yamagatashiritsushogyo",
  "山形\t新庄神室": "shinjokamurosangyo",
  /*
    兵庫（2026-08-18）。★**同名の県立と市立が3組ある**（尼崎・伊丹・西宮）。
    学校マスタではどちらも同じ名前なので、規則だけでは候補が2つになって
    結び付かない（**曖昧なら結び付けないのが正しい動作**）。

    ★**出典は「県尼崎」「市尼崎」と設置区分を前に付けて書き分けている。**
    同じ大会に両方が別のスロットとして載っているので、
    **どちらがどちらかは推測ではなく表の読み取り。**
    ★**5回戦の紙だけ「市立尼崎」と書く**（紙ごとに略し方が違う）ので両方受ける。
  */
  "兵庫\t県尼崎": "amagasaki",
  "兵庫\t市尼崎": "hyogo-amagasaki",
  "兵庫\t市立尼崎": "hyogo-amagasaki",
  "兵庫\t県伊丹": "itami",
  "兵庫\t市伊丹": "hyogo-itami",
  "兵庫\t県西宮": "nishinomiya",
  "兵庫\t市西宮": "hyogo-nishinomiya",
  /*
    兵庫。**規則では拾えない略し方**（学校マスタで候補が1件だけなのを確かめた）。

      県立大附 → 兵庫県立大学附属（「県立大」を含む学校はこの1校）
      県農     → 兵庫県立農業（但馬農業・播磨農業とは別。「県立農業」はこの1校）
      洲本実   → 洲本実業（**実業→実 は規則に無い**。商業→商・工業→工・農業→農だけ）
      篠山産   → 篠山産業（**産業→産 も規則に無い**）
      相生産   → 相生産業（同上）
      神戸高専 → 神戸市立工業高専（県内の高専は明石工業と神戸市立工業の2つで、
                 「神戸」を含むのはこの1校。規則は「◯◯市立工業高専→◯◯市立高専」
                 までしか畳まない）
  */
  "兵庫\t県立大附": "hyogokenritsudaigakufuzoku",
  "兵庫\t県農": "hyogokenritsunogyo",
  "兵庫\t洲本実": "sumotojitsugyo",
  "兵庫\t篠山産": "sasayamasangyo",
  "兵庫\t相生産": "aioisangyo",
  "兵庫\t神戸高専": "kobeshiritsukogyo",
  /*
    ★**「市姫路」と「市川」はここに書かない**（2026-08-18）。

      市姫路 … 学校マスタに**市立の姫路が2件**ある（`himejishiritsu` 姫路市立高校 /
               `himeji` 姫路高校・市立）。**どちらを指すか出典からは決められない。**
      市川   … 学校マスタに**「市川」を含む学校が1件も無い**。
               結び付ける先が無いので、そのまま校名だけを出す。

    **1試合を取りこぼすほうが、別の学校の戦績にするより軽い**（京都の宮津天橋と同じ判断）。
  */
  /*
    福岡。★**出典が「筑豊」を「築豊」と書いている**（2026-08-21）。
    学校マスタに「築豊」を含む学校は無く、**福岡県立筑豊高校**（田川郡）しかない。
    ★**一般の正規化（埼→崎）には足さない** —— 他県への影響が読めないので、
    **この県のこの1件だけ**受ける。
    ★**公開前に出典の表記を一度確かめること**（出典側の誤字の可能性がある）。

    ★**「公立」を省く学校がある**。学校マスタは「公立古賀竟成館高校」。
  */
  "福岡\t築豊": "chikuho",
  "福岡\t古賀竟成館": "koritsukogakyoseikan",
  /*
    福島。スコア表は設置者も学校種も省く（2026-08-21）。**県内に同名は無い**
    （学校マスタで確認）。

      ふたば未来 → ふたば未来学園（**「学園」まで落とす**ので規則では拾えない）
      二本松実   → 二本松実業（★**実業→実 は規則に無い**。商業→商・工業→工・農業→農だけ）
      白河実     → 白河実業（同上）

    ★**`磐農商情` はここに書かない。** あれは**連合チーム**で、
    組合せ表には「磐城農・いわき商業情報」と書いてある。**1校に結び付けてはいけない。**
    スコア表の略称には中黒が無いので `isCombinedTeam` に当たらないが、
    **結び付く先が無いので `slug` は null のまま**で、誤った戦績にはならない。
  */
  "福島\tふたば未来": "futabamiraigakuen",
  "福島\t二本松実": "nihonmatsujitsugyo",
  "福島\t白河実": "shirakawajitsugyo",
  /*
    沖縄。★**やぐら表は「沖高専」と2文字目まで畳む**（2026-08-21）。
    規則が作るのは「沖縄高専」までなので当たらない。
    **県内の高専は沖縄工業高専の1校だけ**なので、指す先は一意に決まる
    （学校マスタで確認。`okinawakogyo-kosen` ＝ 沖縄工業高等専門学校・国立）。
    ★**同じ紙の「沖縄工業」は県立の沖縄工業高校**で別の学校。
    **どちらも同じ大会に出ている**ので、畳めていないと取り違えかねない。
  */
  "沖縄\t沖高専": "okinawakogyo-kosen",
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

/**
 * ★**前の実行で書き出した県のファイルを読む**（季節ごとの歯止めに使う）。
 *
 * 生成物は `export const REGIONAL_XXX: RegionalDistrict = { ... };` の1行なので、
 * 最初の `= {` から末尾の `};` までを JSON として読む。
 * **読めなければ null**（初回の県・書式を変えた直後）。歯止めが効かなくなるだけで、
 * 生成そのものは止めない。
 */
const previousCache = new Map();
function previousDistrict(slug) {
  if (previousCache.has(slug)) return previousCache.get(slug);
  let out = null;
  try {
    const file = path.join(OUT_DIR, `${slug}.ts`);
    if (existsSync(file)) {
      const text = readFileSync(file, "utf8");
      const from = text.indexOf("= {");
      const to = text.lastIndexOf("};");
      if (from >= 0 && to > from) out = JSON.parse(text.slice(from + 2, to + 1));
    }
  } catch {
    out = null;
  }
  previousCache.set(slug, out);
  return out;
}

/**
 * ★★**1つの県を、組み立てた直後に書き出す**（2026-08-21）。
 *
 * ------------------------------------------------------------------
 * ★ なぜ最後にまとめて書かないのか
 *
 *   以前は全県ぶんを `districts` に貯めて、**ループが終わってから**書いていた。
 *   **1県で落ちると実行まるごとが失われる。**
 *
 *   2026-08-20 に実際に起きた: 栃木の出典を `fetch`（undici）で取ると
 *   **Node の HTTP パーサが内部アサーションで落ちる**（`assert(!this.paused)`）。
 *   ★**これは `try/catch` では拾えない**（イベントループから投げられる）ので、
 *   **プロセスごと死に、それまでに取れていた35県ぶんが1つも書き出されなかった。**
 *
 *   ★**回避策（栃木だけ `node:https` を使う）は原因の側の手当てにすぎない。**
 *   **どの県でも同じことが起きうる**ので、**取れたそばから書き出す**形にした。
 *   途中で死んでも、そこまでの県はディスクに残る。
 *
 * ------------------------------------------------------------------
 * ★ 1試合も取れなかった県のファイルは書き換えない
 *
 *   出典のサイトは作り替えられる。取れなくなった県をそのまま書き出すと
 *   **`games: []` で上書きされ、その県のページから試合が消える。**
 *   前の実行までの中身を残すほうが、まだ嘘が少ない。
 *   ★**季節ごとの歯止めは別にある**（`previousDistrict`）。
 *
 * @returns 書き出したら true
 */
function writeDistrict(district) {
  if (DRY) return false;
  const { allGames: _allGames, ...d } = district;
  if (d.games.length === 0) {
    console.log(`  ⚠️ ${d.district}: 1試合も取れなかった。${d.slug}.ts は書き換えない`);
    return false;
  }
  mkdirSync(OUT_DIR, { recursive: true });
  // `allGames` はベストNを数えるための作業用。生成物には出さない
  const file =
    `// このファイルは scripts/build-regional-results.mjs が生成する。直接編集しない。\n` +
    `// 出典: ${d.sourceName}（${d.sourceUrl}）\n\n` +
    `import type { RegionalDistrict } from "@/lib/regional-results";\n\n` +
    `export const REGIONAL_${d.slug.toUpperCase().replace(/-/g, "_")}: RegionalDistrict = ${JSON.stringify(d, null, 2)};\n`;
  const out = path.join(OUT_DIR, `${d.slug}.ts`);
  writeFileSync(out, file, "utf8");
  console.log(`  書き出した: ${path.relative(ROOT, out)}（${Math.round(file.length / 1024)}KB）`);
  return true;
}

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
        ★★**季節ごとの歯止め**（2026-08-19 追加）。

        **取得に1回失敗すると、その季節の試合が静かに消える**という不具合があった。
        2026-08-18 の再生成で、日別ページ1枚の `fetch failed` だけで
        **佐賀の夏32試合が丸ごと消えた。**

        歯止めは下の「1試合も取れなかった県のファイルは書き換えない」だけで、
        **県単位でしか効かない。** 佐賀は春34・秋34が取れていたので
        「その県は取れている」と判断され、夏が0のまま書き出された。
        自動更新は1日2回走るので、放っておくと必ず起きる。

        ★**0 になったときだけ前の内容を残す。**「前より減った」で止めるのは
        行き過ぎで、出典が誤りを直して減ることはある。

        ★**`kept` ではなく `seasonGames` が0のときに見ること。**
        `kept` は「その季節のいちばん新しい試合から ${KEEP_DAYS}日」で切るので、
        1試合でも取れていれば 0 にはならない。
      */
      if (seasonGames.length === 0) {
        const before = (previousDistrict(adapter.slug)?.games ?? []).filter(
          (g) => g.season === season,
        );
        if (before.length) {
          console.log(
            `  ⚠️ ${season}: 前は ${before.length} 試合あったのに1試合も取れなかった。` +
              `前の内容を残す（出典側の変更なら、直すまで古いままになる）`,
          );
          seasonGames.push(...before);
        }
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
    const decorate = (t0raw, allowNationwide) => {
      /*
        ★**照合用の別名は生成物に残さない**（2026-08-20。omyutech の5県）。
        あちらは画面に出す略称（`display`）と、照合に使う正式名称（`match`）の
        両方を返す。**`match` を先に外すこと。**
        ★**連合チームの枝でも外れるようにここで外す** ——
        下の連合チームの分岐は `t0` をそのまま広げるので、
        外し忘れると**連合チームの試合だけ `match` が生成物に残り、
        `RegionalTeam` に無い項目として型検査で落ちる**（実際に落ちた）。
      */
      const { match: matchName, ...t0 } = t0raw;
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
      /*
        ★**照合用の別名を持つ出典がある**（2026-08-20。omyutech の5県）。
        あちらは**画面に出す略称**（「善通寺一」）と**正式名称**（「香川県立善通寺第一
        高等学校」）の両方を返すので、**照合には正式名称から作った形を使う。**
        略称は「第」を落とすので学校マスタに当たらない。
        ★**生成物には残さない**（下で外す）。画面に出すのは `display` だけ。
      */
      const t = { ...t0, display: t0.display.replace(/[\s　]+/g, "") };
      /*
        ★**正式名称の側を先に試し、当たらなければ略称で引く。**
        「千葉市立千葉高等学校」のように**設置区分を落とすと同名になる**学校が
        あるので、正式名称の側が1件に決まらないときは略称（「市立千葉」）に頼る。
      */
      const norm = normalizeSchoolName(matchName ?? t.display);
      let hits = index.byDistrict.get(`${adapter.district}\t${norm}`) ?? [];
      /*
        県内で引けなければ全国で引く（**地区大会の県外の相手**）。
        ★**県大会では使わない**（上の `isPrefectureOnly` を参照）。
      */
      // ★正式名称で引けなければ、画面に出す略称でもう一度引く（上の説明）
      if (hits.length !== 1 && matchName) {
        const alt = index.byDistrict.get(`${adapter.district}\t${normalizeSchoolName(t.display)}`) ?? [];
        if (alt.length === 1) hits = alt;
      }
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

    const district = {
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
    };
    /*
      ★★**取れたそばから書き出す**（2026-08-21。`writeDistrict` の説明を読むこと）。
      以前は全県ぶんを貯めて最後に書いていたので、**1県で落ちると実行まるごとが
      失われた**（栃木で実際に35県ぶんが消えた）。
    */
    writeDistrict(district);
    districts.push(district);
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

  /*
    ---- 県ごとのファイル ----
    ★★**書き出しは県を組み立てた直後に済ませてある**（`writeDistrict`）。
    ここで数えているのは「1試合も取れなかった県」だけ。
  */
  const empty = districts.filter((d) => d.games.length === 0).map((d) => d.district);

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
