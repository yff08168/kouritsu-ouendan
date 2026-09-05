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
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { fetchPdfBytes, fetchPdfPages, pdfPages } from "./lib/pdf-text.mjs";
import { assembleVectorBracket, readFilledShapes } from "./lib/vector-bracket.mjs";
import { assembleYaguraBracket } from "./lib/yagura-bracket.mjs";
import {
  assembleSlotBracket,
  explodeNumberRuns,
  orientPage,
  splitLeadingMark,
  stripInningMarks,
  stripScoreNotes,
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
/**
 * ★**収録状況の一覧**（2026-08-27。運営者の指示。人が読むためのもので、サイトは読まない）。
 * ★**リポジトリの一番上に置く**（いつでも開けるように）。
 * ★**自動更新のワークフローの commit 対象にも入れてある**
 *   （`.github/workflows/update-regional-results.yml` の `TARGETS`）。
 */
const OUT_COVERAGE = path.join(ROOT, "収録状況.md");
/**
 * ★**タイル地図に出す「今季の進捗」**（2026-08-22 に追加）。
 *
 * 47地区ぶんの1行だけを持つ**小さな生成物**（数KB）。
 * ★**県ごとのファイル（1県100KB超）を47県ぶん読めない**ので、
 * 抜粋と同じ考え方で「地図が要るぶんだけ」を別に書き出す。
 */
const OUT_PROGRESS = path.join(ROOT, "src", "lib", "data", "regional-progress.ts");
const UA = { "User-Agent": "kouritsu-ouendan/1.0 (+https://kouritsu-ouendan.com)" };

/**
 * ★★**収録する大会かどうか**（2026-08-23。運営者が範囲を決めた）。
 *
 * 収録するのは次だけ。
 *
 *   甲子園   … 春のセンバツ、夏の選手権
 *   都道府県 … 春季大会、夏の大会、秋季大会
 *   地区大会 … 東北・関東・北信越・東海・近畿・中国・四国・九州 の春季・秋季
 *   明治神宮大会
 *
 * ★★**新人大会を「秋季大会」として入れないこと。** 秋に開かれるので
 * 季節の判定は秋になるが、**春季・夏・秋季とは別の大会**である。
 * 実際に徳島の新人大会5大会28試合が「秋の大会」として入っていた
 * （山口も、今年の大会が新人大会に改称されたのをそのまま拾おうとしていた）。
 *
 * ★**1年生大会・錬成会・連盟杯・招待試合も同じ扱いで外す。**
 * ★**名前で外す。** 季節（開催月）では区別が付かない。
 */
const OFF_TARGET = /新人|１年生|1年生|一年生|錬成|連盟杯|招待|交流|オープン戦/;
const isTargetTournament = (name) => !OFF_TARGET.test(normalize(name ?? ""));

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
/*
  ~~`--all` … 過去ぶんも全部残す。工数見積もりや検算のとき用~~
  → ★**2026-08-23 に既定が「全部残す」になったので消した**（`kept` の説明を読むこと）。
*/

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
        /*
          ★★**得点の欄が空のときに 0 と読まないこと**（2026-08-30 その2）。
          **`Number("")` は NaN ではなく `0`** なので `Number.isFinite` では止まらず、
          **中止・未実施の枠が「0対0の引き分け」として画面に出る**
          （島根で87件・栃木で10件・佐賀で7件やっていたのと同じ形。
          長野ではいまのところ0件だが、**歯止めは実データが出る前に入れておく**）。
        */
        if (!sa.text.trim() || !sb.text.trim()) continue;
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

    /*
      ラベルで絞らない理由は神奈川のアダプタのコメント参照。

      ★★**日別記事のURLは2つの形がある**（2026-08-24。過去年を取るために追加）。
        2019年度以降 … `/YYYY/MM/DD/<id>/`
        2015〜2018年度 … `/news/<YYYYMMDDhhmm>/`（実例 `/news/201607271415/`）
      ★**中身（球場の表＋`TEAM…計` の表）はどちらも同じ**なので、
      URLの形を足すだけで2015年度まで届く。
    */
    const days = dailyLinks(index, indexUrl, {
      hrefPattern: /(\/\d{4}\/\d{2}\/\d{2}\/\d+\/?$)|(\/news\/\d{12}\/?$)/,
    });

    const games = [];
    for (const day of days.slice(0, MAX_DAILY_PAGES)) {
      const html = await fetchHtml(day.url);
      if (!html) continue;
      const date =
        day.url.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//) ??
        day.url.match(/\/news\/(\d{4})(\d{2})(\d{2})\d{4}\/?$/);
      if (!date) continue;
      const isoDate = `${date[1]}-${date[2]}-${date[3]}`;
      /*
        ★**その年のインデックスに、別の年の記事へのリンクが混ざる**
        （「おすすめ」ウィジェット由来。実測3件）。
        **過去年を辿るときに、関係のない年の試合を拾ってしまう。**
        春・夏・秋はどれも同じ暦年に開かれるので、年で弾ける。
      */
      if (date[1] !== String(year)) continue;
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

/**
 * 表を「行 × セル」にほどく。セルは normalize 済み。長野以外の県で共通に使う。
 *
 * ★★**`</tr>` を閉じていない行がある**（2026-08-27。奈良の2013年ごろのページ）。
 *
 *   `<tr><td>智辯学園</td>…<td>11</td>            </tbody></table>`
 *
 *   **表の最後の行だけ閉じていない**書き方で、`<tr>…</tr>` を求めると
 *   ★**その行が丸ごと落ちる** —— 1試合が「見出し＋片方の校名」の2行になり、
 *   **`rows.length < 3` で試合ごと捨てられていた**（2013年秋は42表のうち34表が消えていた）。
 *
 * ★**既定は今までどおり `</tr>` を求める。**
 * ★**`closeOptional: true` を渡した県だけ、`</tr>` が無くても次の行の手前までを1行とする。**
 * **既定を変えないのは、他県の生成物が黙って変わるのを避けるため**
 * （同じ書き方の県が他にもあるかは、その県を1つずつ確かめてから足すこと）。
 */
const tableRows = (table, { closeOptional = false } = {}) =>
  [
    ...table.matchAll(
      closeOptional ? /<tr\b[\s\S]*?(?=<\/tr>|<tr\b|<\/tbody>|<\/table>|$)/gi : /<tr[\s\S]*?<\/tr>/gi,
    ),
  ].map((m) => [...m[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => normalize(plain(c[1]))));

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
 * ★★★**イニング表の合計は「計」の列から読む**（2026-08-30 その2）。
 *
 *   ★**中断した試合は「計」が空で刷られる**（雨天中断。翌日に改めて行われる）。
 *   `inningTotal` は**後ろから最初の数字**を返すので、**最終回の得点を合計として拾う。**
 *   両校の最終回が 0 なら **0対0 の幻の引き分け**になる
 *   （島根で87件・山梨で2件やっていたのと同じ形。実測で佐賀に7件あった）。
 *
 *     ["","1","2","3","4","5","6","7","8","9","10","計"]   ← 見出し
 *     ["鳥 栖","1","0","","","","","","","","",""]         ← 計が空（中断）
 *     ["佐賀西","1","0","","","","","","","","",""]
 *
 *   ★**見出しに「計」がある表だけ、その列を見る。**
 *   無い表は今までどおり（`inningTotal`）なので、**他県の生成物は変わらない。**
 *   ★**0対0の引き分けそのものは実在する**（引き分け再試合）ので、
 *   **「空かどうか」で見ること。「0かどうか」で見ると本物を捨てる。**
 */
function totalReader(rows) {
  const isTotal = (c) => normalize(String(c ?? "")).trim() === "計";
  const header = rows.find((r) => r.some(isTotal));
  const at = header ? header.findIndex(isTotal) : -1;
  return (row) => {
    if (at < 0 || at >= row.length) return inningTotal(row);
    /*
      ★★**サヨナラ勝ちは「計」にも印が付く**（`5×` `1×` `3×`。2026-08-30 その2）。
      **`Number("5×")` は NaN** なので、そのままでは合計が読めない。
      ★**印を落として読む。** それまでは `inningTotal` が**読めないセルを飛ばして
      手前のイニングを合計として返していた**ので、
      **延長サヨナラで決まった試合の得点が丸ごと違っていた**
      （`高志館 4-0 塩田工` … 紙は `4` 対 `5×`。佐賀の2016年だけで11試合）。
    */
    const cell = normalize(String(row[at] ?? "")).trim().replace(/[xX×]$/, "");
    const v = Number(cell);
    return cell !== "" && Number.isFinite(v) ? v : null;
  };
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
    const dayBlocks = [...html.matchAll(
      /<P class="topic_y">([\s\S]*?)<\/P>([\s\S]*?)(?=<P class="topic_y">|<\/body>|$)/gi,
    )];
    /*
      ★★**年の合わない日が2通りある**（2026-08-25）。**見分け方が肝。**

      (a) **前の年の日が消し残っている**（＝別の大会。落とす）
          連盟は**前年のページを雛形にして書き換える**ので、
          上書きされなかった日が前の年の日付のまま残る。

            26haruresult.html  大会12日目 2023年05月07日 ／ 大会**11日目** 2023年05月06日
                               大会**11日目** 2026年05月06日 … 大会１日目 2026年04月11日
            25akiresult.html   大会**９日目** 2024年09月29日 ／ 大会**９日目** 2025年09月23日

      (b) ★★**年だけ打ち間違えている**（＝この大会の日。**落としてはいけない**）

            13natsuresult.html 大会12日目 2013年07月27日  決勝戦
                               大会11日目 **2012年**07月26日  準決勝
                               大会10日目 2013年07月24日  準々決勝
                               大会９日目 **2012年**07月23日  準々決勝

      ★**見分けるのは「大会N日目」の重なり。**
      (a) は**同じ日番号が二重になる**（前の年の紙の日と今年の日が並ぶ）。
      (b) は**1〜Nが1回ずつ**で、年の違う日がその並びの穴を埋めている。

      ★★**この見分けを入れる前は (b) も落としていて、
      2013〜2016年の準々決勝・準決勝が消えていた**（「試合が欠けている」と鳴っていた）。
      ★**落とすほうに倒すと、静かに試合が消える。**

      ★**(a) で落とした試合を別の大会として拾い直さないこと。**
      前の年の大会名はこの紙のどこにも書かれておらず、回数を数えるのは推測になる。
      過去年が要るなら `--year` で前の年の紙を取ること（URLは年で引ける）。
    */
    const parsed = dayBlocks
      .map((day) => ({
        day,
        no: Number(normalize(plain(day[1])).match(/大会\s*(\d+)\s*日目/)?.[1] ?? NaN),
        date: normalize(plain(day[1])).match(/(\d{4})年(\d{1,2})月(\d{1,2})日/),
      }))
      .filter((d) => d.date);
    const seen = new Map();
    for (const d of parsed) {
      if (!Number.isFinite(d.no)) continue;
      seen.set(d.no, (seen.get(d.no) ?? 0) + 1);
    }
    /** 日番号が二重になっている＝前の年の紙が消し残っている */
    const leftover = [...seen.values()].some((n) => n > 1);
    let stale = 0;
    let repaired = 0;
    for (const { day, date } of parsed) {
      let y = Number(date[1]);
      if (y !== Number(year)) {
        if (leftover) {
          stale += 1;
          continue;
        }
        // 打ち間違い。**月日はそのままに、紙の年で読み替える**
        y = Number(year);
        repaired += 1;
      }
      const isoDate = `${y}-${date[2].padStart(2, "0")}-${date[3].padStart(2, "0")}`;

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
        /*
          ★★**イニングの見出し行がある表と無い表が混ざっている**（2026-08-25 に修正）。

            2016年7月23日 第1試合  … 見出し**なし**（1行目がいきなり `東海大甲府`）
            2016年7月23日 第2試合  … 見出し**あり**（1行目が `1 2 3 … 計`）

          ★**`rows.slice(1, 3)` と決め打ちしていたので、見出しの無い表の
          1試合目が丸ごと落ちていた**（第96〜98回の準決勝が1試合になっていた）。
          ★**行数が3に満たないと飛ばす作りだったので静かに消えていた。**

          ★**「校名の欄が空でなく、合計が読める行」の先頭2つ**を採る。
          見出し行は校名の欄が空（`&nbsp;`）なので、これで自然に外れる。
        */
        /*
          ★★**「計」の欄が空の表がある**（2026-08-25 に修正）。**中断した試合。**

            ["","1","2","3","4","5","6","7","8","9","","計"]   ← 見出し
            ["農林","3","7","0","0","1","","","","","",""]     ← 計が空
            ["日川","1","0","8","3","2","","","","","",""]

          翌日に改めて行われ、そちらは計まで埋まっている（日川 11-0 農林）。

          ★**`inningTotal` は「後ろから最初の数字」を返す**ので、
          **計が空だと最終回の得点を合計として拾う**（農林 1-2 日川 になっていた）。
          ★★**`北杜 0 0 0 0 0 0` と `日大明誠 2 0 1 0 0` は 0対0 になっていた**
          （どちらも最後の回が 0）。**島根で87件やっていたのと同じ「幻の引き分け」。**

          ★**合計は「計」の列から読む。** 見出しがある表はその位置、
          無い表（同じ紙に混在する）は行の最後。**空なら試合として出さない。**
        */
        const header = rows.find((r) => r.some((c) => normalize(c) === "計"));
        const totalAt = header ? header.findIndex((c) => normalize(c) === "計") : -1;
        const totalOf = (r) => {
          const cell = totalAt >= 0 && totalAt < r.length ? r[totalAt] : r.at(-1);
          const v = Number(normalize(String(cell ?? "")));
          return String(cell ?? "").trim() !== "" && Number.isFinite(v) ? v : null;
        };
        const teamRows = rows.filter(
          (r) => r[0] && !/^(先攻|後攻)チーム$/.test(r[0]) && totalOf(r) !== null,
        );
        if (teamRows.length < 2) continue;
        const [homeRow, awayRow] = teamRows;
        const home = homeRow[0];
        const away = awayRow[0];
        const a = totalOf(homeRow);
        const b = totalOf(awayRow);
        if (a === null || b === null) continue;
        /*
          ★★★**「計」が両校とも 0 なのに、イニングに点が入っている表がある**
          （2026-08-30 その2。出典の打ち間違い）。

            ["韮崎工業","0","0","02","0","0","","","","","0"]   ← 計が 0
            ["駿台甲府","4","3","3","1","x","","","","","0"]     ← 計が 0

          そのまま出すと **`韮崎工業 0-0 駿台甲府` という幻の引き分け**になる
          （実際に画面に出ていた。紙の枝では駿台甲府が5回コールドで勝っている）。
          ★★**0対0の引き分けは実在する**ので消してよいのは**この形だけ** ——
          **本物の 0対0 ならイニングもすべて 0。**
          ★**イニングから合計を組み立て直さない**（`02` のような打ち間違いがあり、
          10点以上を丸数字で書く紙もある。**推測で数字を作らない**）。**その試合を出さない。**
        */
        const scored = (r) =>
          r.some((c, i) => i > 0 && i !== totalAt && /^[1-9][0-9]*$/.test(normalize(String(c ?? "")).trim()));
        if (a === 0 && b === 0 && (scored(homeRow) || scored(awayRow))) {
          console.log(
            `  ⚠️ 山梨: ${homeRow[0]} と ${awayRow[0]} は「計」が両方 0 なのにイニングに点がある。この試合は出さない`,
          );
          continue;
        }

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
    if (stale) {
      console.log(
        `  ⚠️ 山梨: ${year} 年の紙に前の年の日が ${stale} 日ぶん消し残っている。その日は出さない`,
      );
    }
    if (repaired) {
      console.log(
        `  ⚠️ 山梨: ${year} 年の紙で年を打ち間違えている日が ${repaired} 日ぶん。` +
          "月日はそのままに、この紙の年として出す",
      );
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
        /*
          ★★★**合計は行のいちばん最後のセル。読めなければその試合を出さない**
          （2026-08-30 その2）。**この表には見出しが無い**（`計` の字が刷られていない）ので、
          `totalReader` は使えない。

          ★★**サヨナラ勝ちは合計に印が付く**（`7X` `10x`）。**`Number("7X")` は NaN。**
          `inningTotal` は**読めないセルを飛ばして手前を返す**ので、
          **サヨナラ勝ちの側の得点が「最終回の得点」になっていた** ——
          実測で**6件が 0対0 の引き分け**として画面に出ていた
          （`鹿本商工 0-0 学園大付属`。紙は `0` 対 `7X`）。
          ★**印を落として読む。落としたあとが数字でなければ出さない。**
          ★**空欄も同じく出さない**（中断した試合。翌日に改めて行われる）。
        */
        const readTotal = (r) => {
          const cell = normalize(String(r.at(-1) ?? "")).trim().replace(/[xX×]$/, "");
          return /^\d+$/.test(cell) ? Number(cell) : null;
        };
        const a = readTotal(homeRow);
        const b = readTotal(awayRow);
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

/** シード校の印。**校名の欄の中にも入っている紙がある**ので、列では外せない */
const SEED_MARK = /[■-◿★☆※〇◯〓]/;

/**
 * ★★**縦向きのトーナメント表で、スロット番号の縦の列を2本探す**（2026-08-26）。
 *
 * ★**「1から始まる」を前提にしない**（右half は 30 や 35 から始まる）。
 * **いちばん数の多い2本**を採る。
 *
 * ★★**左右の境目（`half`）を決め打ちしないために要る。**
 * 同じ連盟でも**紙の年で座標がまるごと違う**（鹿児島の夏は 2026年が中点490、
 * 2024年が約293）。決め打ちすると**古い紙で中央の決勝が読めない。**
 *
 * @returns `[左, 右]`（それぞれ `{ x, items }`）／ null（2本見つからない）
 */
function findSlotColumns(page, { minCount = 8, tolerance = 10 } = {}) {
  const ints = page.lines.flatMap((l) =>
    l.items.filter((i) => /^\d{1,2}$/.test(i.text.trim())).map((i) => ({ x: i.x, y: l.y })),
  );
  const cl = [];
  for (const it of ints.sort((a, b) => a.x - b.x)) {
    const c = cl.find((c) => Math.abs(c.x - it.x) <= tolerance);
    if (c) {
      c.items.push(it);
      c.x = (c.x * (c.items.length - 1) + it.x) / c.items.length;
    } else cl.push({ x: it.x, items: [it] });
  }
  const cand = cl.filter((c) => c.items.length >= minCount).sort((a, b) => a.x - b.x);
  return cand.length < 2 ? null : [cand[0], cand.at(-1)];
}

/**
 * 群馬県高等学校野球連盟（`gunma-hbf.com`）。
 *
 * **規約に転載の制限は無い**（2026-08-14 にトップ・結果ページを確認）。
 *
 * ------------------------------------------------------------------
 * ★★ 2026-08-26 に出典を「日別の結果ページ」から「勝ち上がり表のPDF」に替えた
 *
 *   それまで読んでいた `99_blank*.html` は**3回戦以降の15試合しか載せていない**
 *   （春秋は7試合）。**取りこぼしではなく出典がそこまでしか公開していない**
 *   ので `partial: true` を付けて、足りない側の検算を止めていた。
 *
 *   ★**「過去の試合結果」（`99_blank.html`）に勝ち上がり表のPDFが並んでいる。**
 *   **平成18年（2006）から3季ぶんずつ**あり、**1枚に全試合が載っている**
 *   （夏なら59チーム58試合）。**日別ページの4倍**が1枚で取れる。
 *
 *   ★**日別ページは捨てない。** 組み立てた枝の検算に使った（下の「検算」）。
 *
 * ------------------------------------------------------------------
 * ★ 紙の形（広島・三重と同じ「左右2段組のスロット格子型」）
 *
 *   出場校が左右に縦に並び、スロット番号の列（左 x≈120 ／ 右 x≈470）を
 *   はさんで回戦が中央へ伸びる。`orientPage()` で座標を入れ替えれば
 *   `assembleSlotBracket()` がそのまま使える。
 *
 *     ◎ 健 大 高 崎  1        30  桐 生 第 一 ○
 *              5                    (5ｺ)14
 *              0                     0
 *       大　　　泉  2        31  前 ・ 吉 ・ 長 ・ 嬬
 *
 * ------------------------------------------------------------------
 * ★★ この紙で踏んだ落とし穴（次に触る人へ）
 *
 *   1. ★**得点に括弧書きの注記が付く**（`8(7ｺ)` `(5ｺ)14` `(延10)9`）。
 *      `stripScoreNotes()` で落とす。**注記は左にも右にも付く**ので、
 *      **残った数字の断片内での位置を測り直さないと別の回戦の帯に落ちる。**
 *      ★**括弧が断片をまたいで割れている**こともある（`(7` / `ｺ` / `)9`）。
 *   2. ★★**決勝の2つの得点を半分ごとの組み立てに入れないこと。**
 *      決勝は中央に左右1つずつ置かれ、**境目のすぐ内側**にある。
 *      そのまま渡すと、**半分の準決勝の得点が決勝の得点にすり替わる**
 *      （2025年夏は準決勝が「12-0」「2-17」なのに「12-4」「2-3」になった）。
 *      **検算（チーム数−試合数=1・優勝校）はどちらも通ってしまう。**
 *      ★先に決勝（中央で境目をはさむ組のうちいちばん内側）を読み、
 *      **その x より外側だけ**を半分に渡す。
 *   3. ★**1回戦が1試合しかない紙がある**（`minFirstRound: 1`）。
 *      古い紙は左右の外側に「0回戦」が1〜2試合だけあり、既定の2試合ぶんを
 *      要求すると**その帯が飛ばされて1試合足りない**まま組み上がる。
 *   4. ★**準決勝の得点が中点ではなく連結線の両端に来る紙がある**（山口と同じ）。
 *      **中点（既定）で組めたらそれを採り、駄目なら `hitSpan` で組む。**
 *      ★**順番を逆にしないこと。** 窓が広いほうは別の帯まで拾えるので、
 *      **厳しいほうが通るならそれが紙の読み方。**
 *   5. ★**シード記号（◎○◇△□）が校名と同じ断片に入っている紙がある**
 *      （`健 大 高 崎 ○`）。**列で外せない**ので校名から前後の記号を落とす。
 *      **校名の途中に記号は来ない**ので、これは「文字で消す」危険には当たらない。
 *   6. ★**紙に試合ごとの日付が無い**（会期と、まれに1件だけ）。`date: null` で出す。
 *
 * ------------------------------------------------------------------
 * ★★ 検算（1つでも合わなければ **その大会を1試合も出さない**）
 *
 *   - スロット番号が欠けずに揃うか（`assembleSlotBracket` の中）
 *   - **半分ごとに チーム数 − 試合数 = 1**（勝ち抜き戦の算数）
 *   - **全体でも チーム数 − 試合数 = 1**
 *   - ★**紙の中央に刷ってある「優勝」の下の校名**と、組み立てた優勝校が一致するか。
 *     **枝から導いたのではない事実**なので、石川で通ってしまった
 *     「構造は合うのに決勝の相手が違う」を止められる
 *   - 校名にシード記号が残っていないか（残っていたら読み方が違う）
 *   - ★**`不戦勝` と書かれた紙は読まない。** 得点の無い枠が混ざると
 *     「その回戦の数字が試合数の2倍」が崩れ、**組めてしまうほうの壊れ方**をする
 *
 *   ★★**2026-08-26 に、日別の結果ページ（別の場所にある出典）と突き合わせた。**
 *   10大会104試合で**対戦の組み合わせは104/104が一致**した。
 *   ★**スコアだけ2件、連盟自身の2つの資料が食い違う**
 *   （2024夏3回戦 明和県央 9-2/9-1 渋川、2024秋準々決勝 前橋商 0-7/0-6 健大高崎。
 *   どちらも日別ページのイニング表のほうが内訳と合う）。**出典どうしの不一致**なので、
 *   ここでは引用元（勝ち上がり表）のまま出している。
 *
 * ------------------------------------------------------------------
 * ★ 読めなかった紙（2026-08-26 時点で 45 枚中 20 枚が成立）
 *
 *   - **不戦勝のある紙が7枚**（上記）
 *   - **平成22〜24年ごろの紙は帯が半分ずれる**（得点が注記の有無で別の x に置かれる）
 *   - **平成30年春・令和4年秋・令和5年春は「優勝」が刷られていない**
 *   - `h18-58-haru.pdf` は**0バイト**、`H28haru-kakka.pdf` は**文字が無い**（画像）
 *   ★**1年生強化試合・関東大会（地区大会）は対象外**なので読まない。
 */
const gunma = {
  slug: "gunma",
  district: "群馬",
  name: "群馬県高等学校野球連盟",
  siteUrl: "http://www.gunma-hbf.com/",
  politenessMs: 1500,
  /*
    3季とも同じ2ページから辿る。**取得は1回で済ませる**（`indexCache`）。
      `99_blank.html` … 「過去の試合結果」。平成18年からの勝ち上がり表PDF
      `index.html`    … 開催中の大会の「結果」PDF（過去の一覧にはまだ載らない）
  */
  seasons: {
    spring: "http://www.gunma-hbf.com/99_blank.html",
    summer: "http://www.gunma-hbf.com/99_blank.html",
    autumn: "http://www.gunma-hbf.com/99_blank.html",
  },
  indexCache: new Map(),
  SEASON_OF: { 春: "spring", 夏: "summer", 秋: "autumn" },
  /**
   * 一覧のリンクから「その紙が何年の何季か」を見当付ける。**取りに行く枚数を絞るためだけ**で、
   * 本当の年と季節は**紙に刷ってある大会名と年度**で決める（下の `readSheet`）。
   *
   *   `h24-夏` `h25ｰ夏` `ｈ２８－夏` `r元-夏` `Ｒ５-夏` `R8-春`
   *
   * ★**「1年」「関東」は対象外の大会**（1年生強化試合・地区大会）なので外す。
   */
  guess(label) {
    const t = normalize(label).replace(/[\s　]/g, "").replace(/[ｰ－‐―]/g, "-");
    if (/1年|１年|関東/.test(t)) return null;
    const m = t.match(/^([hHｈ]|[rRＲ])(元|\d+)-(春|夏|秋)$/);
    if (!m) return null;
    const n = m[2] === "元" ? 1 : Number(m[2]);
    return { year: (/[rRＲ]/.test(m[1]) ? 2018 : 1988) + n, season: this.SEASON_OF[m[3]] };
  },
  async collect({ fetchHtml, season, url, year }) {
    for (const page of [url, "http://www.gunma-hbf.com/index.html"]) {
      if (!this.indexCache.has(page)) this.indexCache.set(page, await fetchHtml(page));
    }
    const archive = this.indexCache.get(url);
    if (!archive) return [];

    /** 取りに行くPDF。**この年・この季節に見当が付いたものだけ** */
    const wanted = [];
    for (const a of archive.matchAll(/<a[^>]+href=["']([^"']+\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const g = this.guess(plain(a[2]));
      if (!g || g.season !== season || g.year !== year) continue;
      try {
        const u = new URL(a[1], url).toString();
        if (!wanted.includes(u)) wanted.push(u);
      } catch {
        /* リンクが壊れているだけ */
      }
    }
    /*
      ★**開催中の大会は「過去の試合結果」にまだ載らない。**
      トップの「結果」リンク（`R8-N108k14.pdf` のように日ごとに差し替わる）も候補にする。
      **どの大会かは紙を開いてから決める**ので、ここでは絞り込まない。
    */
    const top = year >= new Date().getFullYear() - 1 ? this.indexCache.get("http://www.gunma-hbf.com/index.html") : null;
    if (top) {
      for (const a of top.matchAll(/<a[^>]+href=["']([^"']+\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        if (normalize(plain(a[2])) !== "結果") continue;
        try {
          const u = new URL(a[1], "http://www.gunma-hbf.com/").toString();
          if (!wanted.includes(u)) wanted.push(u);
        } catch {
          /* 同上 */
        }
      }
    }
    if (!wanted.length) return [];

    for (const pdf of wanted.slice(0, 4)) {
      const parsed = await fetchPdfPages(pdf, { headers: UA });
      await sleep(this.politenessMs);
      if (!parsed?.length) continue;
      for (const raw of parsed) {
        const games = this.readSheet(raw, season, year);
        // null＝この紙は目当ての大会ではない（次の紙へ）／[]＝検算に落ちた
        if (games) return games;
      }
    }
    return [];
  },
  /** シード記号を落として空白を詰める。**校名の途中に記号は来ない** */
  clean(s) {
    return s
      .replace(/[\s　]+/g, "")
      .replace(/^[■-◿★☆※〇◯〓]+/, "")
      .replace(/[■-◿★☆※〇◯〓]+$/, "");
  },
  /**
   * ★★★**同じ字が二重に刷ってある紙がある**（2026-08-31。平成24年の選手権）。
   *
   *   `92.4|412.1|17` `151.1|417.5|0` `272.2|423.4|高崎商` … **1行が丸ごと2回**
   *
   * pdf.js は**同じ位置に同じ字が2回描かれていればそのまま2つ返す**ので、
   * ★**スロットが35個・1回戦の数字が奇数個**になり、そこで組み立てが落ちていた。
   * ★**位置も字も同じなら、それは同じインク。** 片方を落とす。
   * ★**別の試合が同じ得点を取ることはあっても、同じ x・同じ y には来ない。**
   */
  dedupe(page) {
    return {
      page: page.page,
      lines: page.lines.map((l) => {
        const seen = new Set();
        const items = l.items.filter((i) => {
          const key = `${i.x.toFixed(1)}\t${i.text}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        return { ...l, items, text: items.map((i) => i.text).join("\t") };
      }),
    };
  },

  slotColumns: (page) => findSlotColumns(page),
  /**
   * 校名の欄の**外端**。シード記号の列を読み込まないための境目。
   *
   * ★**校名は左右の端に揃えて組まれる**（2文字でも4文字でも同じ x から同じ x まで）ので、
   * **いちばん多く現れる x が校名の欄の端**になる。**記号の列はそれより外側。**
   */
  nameEdge(clipped, L, R, half, side) {
    const xs = new Map();
    for (const l of clipped.lines) {
      for (const i of l.items) {
        if (side === 0 ? i.x >= L.x - 3 || i.x > half : i.x <= R.x + 3 || i.x < half) continue;
        const k = [...xs.keys()].find((v) => Math.abs(v - i.x) <= 3) ?? i.x;
        xs.set(k, (xs.get(k) ?? 0) + 1);
      }
    }
    const top = [...xs].sort((a, b) => b[1] - a[1]).slice(0, 2).map((e) => e[0]);
    if (!top.length) return null;
    return side === 0 ? Math.min(...top) - 4 : Math.max(...top) + 4;
  },
  /** 1枚の勝ち上がり表を読む。null＝目当ての大会でない／[]＝検算に落ちた */
  readSheet(rawSheet, season, year) {
    // ★**同じ字が二重に刷ってある紙がある**（上の `dedupe` を読むこと）
    const raw = this.dedupe(rawSheet);
    const flat = raw.lines.map((l) => normalize(l.text.replace(/\t/g, "")).replace(/[\s　]/g, ""));
    const title = flat
      .map(
        (t) =>
          t.match(
            /第\d+回(?:全国高等学校野球選手権(?:記念)?群馬大会|(?:春|秋)季関東地区高等学校野球大会群馬県予選)/,
          )?.[0],
      )
      .find(Boolean);
    if (!title) return null;
    /*
      ★**年は「第N回」から出さず、紙に刷ってある年度から出す。**
      春季・秋季の回数は選手権とは別系列（春は+1948、秋は+1947）で、
      **記念大会などで系列が動くと静かに1年ずれる。**
    */
    const em = flat.map((t) => t.match(/(令和|平成)(元|\d+)年度/)).find(Boolean);
    if (!em) return null;
    const sheetYear = (em[1] === "令和" ? 2018 : 1988) + (em[2] === "元" ? 1 : Number(em[2]));
    const sheetSeason = /選手権/.test(title) ? "summer" : /春季/.test(title) ? "spring" : "autumn";
    if (sheetSeason !== season || sheetYear !== year) return null;
    /*
      ★**選手権の回数と年度が食い違ったら読まない。**
      **紙の中の2か所から来る数字**なので、連盟が別の年の紙を同じ名前で
      置いたときに気づける（栃木で踏んだ「今年の紙を過去年として読む」の歯止め）。
    */
    const nth = Number(title.match(/第(\d+)回/)[1]);
    if (sheetSeason === "summer" && nth + 1918 !== sheetYear) {
      console.log(`  ⚠️ 群馬: 「${title}」の回数と「${em[0]}」が合わない。1試合も出さない`);
      return [];
    }
    const tournament = `${em[0]}${title}`;
    const drop = (why) => {
      console.log(`  ⚠️ 群馬: ${tournament} は ${why}。1試合も出さない`);
      return [];
    };

    const cols = this.slotColumns(raw);
    if (!cols) return drop("スロット番号の列が2本見つからない");
    const [L, R] = cols;
    const half = (L.x + R.x) / 2;
    /*
      ★**スロットの行の範囲だけ残す。** 上の表題・会期と、下の連合チームの凡例・
      開始時刻の欄を入れたままにすると、**スロットの外側に数字が並んで帯が濁る。**
    */
    const ys = [...L.items, ...R.items].map((i) => i.y);
    const clipped = {
      page: raw.page,
      lines: raw.lines
        .filter((l) => l.y >= Math.min(...ys) - 4 && l.y <= Math.max(...ys) + 4)
        /*
          ★★**スロット番号の列を1本の x にそろえる**（2026-08-26）。

          1桁と2桁で左端が5〜7ポイントずれるので、**入れ替えたあと2つの行に割れる。**
          `assembleSlotBracket` は連番のいちばん長い行だけをスロット行とみなすので、
          **片割れが校名の側に落ちると校名の末尾に数字がくっつく**
          （`前橋工17` `吾妻中央18` …が実際に14件出た）。
          ★**同じ列の数字なので、そろえるのは読み替えではなく位置の補正。**
        */
        .map((l) => ({
          ...l,
          items: l.items.map((i) =>
            /^\d{1,2}$/.test(i.text.trim()) && (Math.abs(i.x - L.x) <= 10 || Math.abs(i.x - R.x) <= 10)
              ? { ...i, x: Math.abs(i.x - L.x) <= 10 ? L.x : R.x }
              : i,
          ),
        })),
    };
    /*
      ★★★**不戦勝のある紙は読まない**（2026-08-31 に確かめ直した）。

          長野原 16 |           | 50 前橋商
                    | 不戦勝    |
          伊勢崎 17 |           | 51 健大高崎

      ★**得点が無いので、勝った側が決まらない。**
      ★★**紙のどこにも書かれていない** —— 勝ち上がった学校を刷り直す形式ではなく、
      ○は**シード校の印**で勝者の印ではない。**次の回戦にも校名は出てこない。**
      ★**検算（チーム数 − 試合数 = 1）に不戦勝を数えれば数は合う**が、
      **その先の回戦の校名が決まらない**ので、当てると**別の学校の戦績になる。**
      ★**8枚がこれで落ちている**（平成19春・20春・23秋・24秋・令和3秋・4春・5秋・7春）。
      ★**読むなら、勝った側を別の出典から持ってくるしかない**
      （連盟の歴代記録に決勝までの勝ち上がりがある）。
    */
    if (clipped.lines.some((l) => /不戦/.test(l.text)))
      return drop("不戦勝の枠がある（勝った側が紙に書かれていない。上の説明を読むこと）");
    const page = stripScoreNotes(clipped);

    const a0 = this.nameEdge(clipped, L, R, half, 0);
    const a1 = this.nameEdge(clipped, L, R, half, 1);
    if (a0 === null || a1 === null) return drop("校名の欄の位置が読めない");

    /*
      ---- 決勝 ----
      中央で**境目をはさむ組のうちいちばん内側**（千葉と同じ `innermost`）。
      ★**ここで先に読むのは、半分ごとの組み立てから外すため**（上の落とし穴2）。
    */
    const mid = page.lines
      .map((l) => ({ y: l.y, items: l.items.filter((i) => Math.abs(i.x - half) < (R.x - L.x) * 0.16) }))
      .filter((r) => r.items.length);
    let fin = null;
    for (const r of mid) {
      const nums = r.items.filter((i) => /^\d{1,2}$/.test(i.text.trim()));
      const lft = nums.filter((i) => i.x < half).sort((a, b) => b.x - a.x)[0];
      const rgt = nums.filter((i) => i.x > half).sort((a, b) => a.x - b.x)[0];
      if (!lft || !rgt) continue;
      if (!fin || rgt.x - lft.x < fin.span)
        fin = { pair: [Number(lft.text), Number(rgt.text)], xL: lft.x, xR: rgt.x, span: rgt.x - lft.x };
    }
    if (!fin) return drop("決勝の得点が中央に見つからない");
    const cut = [Math.min(half - 1, fin.xL - 1), Math.max(half + 1, fin.xR + 1)];
    /*
      ★**中央の切り方を出す**（2026-09-01 その5）。
      「半分の組み立てに失敗した」の多くは、**決勝の得点を取り違えて
      準決勝の列まで切り落としている**ことが原因なので、ここが見えないと追えない。
    */
    if (process.env.BRACKET_DEBUG) {
      console.log(
        `  [debug] 中央 half=${half.toFixed(1)} 窓=±${((R.x - L.x) * 0.16).toFixed(1)}` +
          ` / 決勝とみた ${fin.pair[0]}@${fin.xL.toFixed(1)} - ${fin.pair[1]}@${fin.xR.toFixed(1)}（幅${fin.span.toFixed(1)}）` +
          ` / 切る位置 ${cut[0].toFixed(1)}〜${cut[1].toFixed(1)}`,
      );
    }

    /** 紙に刷ってある優勝校（「優勝」の**下**に横書きで1行）。**枝から導いた値ではない** */
    const champRow = mid.find((r) => /優\s*勝/.test(r.items.map((i) => i.text).join("")));
    let printed = null;
    if (champRow) {
      for (const r of mid.filter((r) => r.y < champRow.y && r.y > champRow.y - 40)) {
        const t = this.clean(r.items.map((i) => i.text).join(""));
        if (t.length >= 2 && !/[0-9０-９]/.test(t)) {
          printed = t;
          break;
        }
      }
    }
    if (!printed) return drop("紙に優勝校が刷られていない（枝の外から来る検算が無い）");

    const halves = [];
    for (const i of [0, 1]) {
      const oriented = orientPage(page, {
        slotAxis: "y",
        flip: i === 1,
        range: i === 0 ? [a0, cut[0]] : [cut[1], a1],
        rowTolerance: 6,
      });
      const options = (hitSpan) => ({
        roundLabels: ["準決勝", "準々決勝"],
        /*
          ★★★**スロットが縦の紙では、断片はスロット軸には広がらない**
          （2026-08-31。鹿児島で先に踏んだのと同じ形）。
          既定は**断片の中の文字の位置からスロットを見積もる**ので、
          **2桁の得点だけ 0.22 スロットずれる**（`11` が 11.24 ではなく 11.46 になる）。
          ★**中点が境目に乗らなくなり、その帯ごと捨てられていた。**
        */
        flatFragments: true,
        nameOrder: i === 0 ? "asc" : "desc",
        minFirstRound: 1,
        hitSpan,
        /*
          ★★★**深い回戦どうしの列の間隔が、浅いところより狭い紙がある**
          （2026-09-01 その5。平成23年度の春・夏ほか）。

              1回戦 166.0 → 2回戦 196.9 → 3回戦 222.6 → 準々決勝 253.6 → **準決勝 264.6**
                           （間隔 31）   （26）        （31）           （**11**）

          ★**既定のまとめ幅は「1つ前の帯との間隔の 0.45 倍」**なので、
          準々決勝のところで **13.95** になり、**11 しか離れていない準決勝の帯を
          飲み込む。** 数字は「中点から3スロット以内」で落ちるので準々決勝自体は
          正しく組めるが、**`lastY` が準決勝まで進んでしまい、次の段で
          「帯が見つからない」**になる（実測：左半分だけ落ちていた）。
          ★**上限を 8 に固定する。** 群馬の紙は列がきれいに分かれており、
          **8 を超えて帯をまとめる必要がある回戦は1つも無い**
          （全45枚を読み直して、既に読めていた20枚が1試合も変わらないことを確かめた）。
        */
        roundBandGap: 8,
      });
      // ★**中点（既定）で組めたらそれを採る。** 広いほう（`hitSpan`）は後回し
      const tried = [false, true].map((hitSpan) => assembleSlotBracket(oriented, options(hitSpan)));
      const built = tried.find((r) => r && r.teams - r.games.length === 1);
      /*
        ★**どちらの半分が・どう落ちたかを出す**（2026-09-01 その5）。
        「半分の組み立てに失敗した」だけでは、**組めなかったのか、
        組めたが数が合わなかったのか**が分からない。
      */
      if (process.env.BRACKET_DEBUG) {
        console.log(
          `  [debug] 半分${i}: ` +
            tried
              .map((r, k) => (r ? `${k ? "広" : "中"}=${r.teams}チーム/${r.games.length}試合` : `${k ? "広" : "中"}=組めない`))
              .join(" "),
        );
      }
      halves.push(built ?? null);
    }
    if (halves.some((h) => !h))
      return drop(`半分の組み立てに失敗した（${halves.map((h) => (h ? "○" : "×")).join("/")}）`);

    const built = halves.flatMap((h) => h.games).map((g) => ({ ...g, a: this.clean(g.a), b: this.clean(g.b) }));
    const [A, B] = halves.map((h) => this.clean(h.champion));
    const teams = halves.reduce((s, h) => s + h.teams, 0);
    if (built.some((g) => !g.a || !g.b || SEED_MARK.test(g.a) || SEED_MARK.test(g.b)))
      return drop("校名にシード記号が残っている（校名の欄の読み方が違う）");
    if (teams - (built.length + 1) !== 1)
      return drop(`${teams} チームに対し ${built.length + 1} 試合（${teams - 1} のはず）`);
    const champ = fin.pair[0] > fin.pair[1] ? A : B;
    if (!(champ === printed || champ.includes(printed) || printed.includes(champ)))
      return drop(`優勝校が紙の記載と合わない（紙「${printed}」/ 組み立て「${champ}」）`);

    built.push({ round: "決勝", a: A, b: B, sa: fin.pair[0], sb: fin.pair[1] });
    console.log(`  （${tournament}: ${built.length} 試合 / 優勝 ${printed} / ${teams} チーム・**日付なし**）`);
    if (process.env.BRACKET_DEBUG) {
      for (const g of built) console.log(`  [debug] ${g.round} ${g.a} ${g.sa}-${g.sb} ${g.b}`);
    }
    return built.map((g) => ({
      // ★**紙に試合ごとの日付が無い。推測で埋めない**（三重・大阪と同じ）
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
        /*
          ★★**昔の記事タイトルには回数も大会名も入っていない**（2026-08-25 追加）。
          **2010・2013・2016・2019 で確認**した形は `大会第13日(7/24)の結果`。
          ★**`第\d+回` を要求していたので、過去年は1記事も拾えていなかった。**
          **日付か「大会◯日」があれば拾い、大会名は下で本文から取る。**
        */
        const found = dailyLinks(archive, site, { hrefPattern: /\?p=\d+$/ }).filter((p) =>
          /\d{1,2}[/／]\d{1,2}|大会[^\s]*日/.test(p.label),
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
        /*
          ★★**タイトルに無ければ本文から取る**（2026-08-25 追加）。
          昔の記事はタイトルが `大会第13日(7/24)の結果` だけだが、
          **本文の見出しには `第９８回全国高等学校野球選手権佐賀大会` が入っている**
          （2016年の記事で確認）。★**大会名を年から組み立てないこと** ——
          7月の記事が必ず選手権予選とは限らず、推測すると嘘の大会名が付く。
        */
        const tournament =
          normalize(post.label).match(/第\d+回[^（(]*?大会/)?.[0] ??
          normalize(plain(html)).match(/第\d+回[^（(]*?大会/)?.[0] ??
          null;
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
          // ★**合計は「計」の列から**（中断した試合は空。上の `totalReader` を読むこと）
          const total = totalReader(rows);
          const a = total(homeRow);
          const b = total(awayRow);
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
  /**
   * 大会名（西暦でそろえる）。**出典が名前を書いているときはそれを使う。**
   * @param label 索引のリンクの文字 ／ @param heading ページの見出し
   */
  tournamentName(season, year, label, heading) {
    const src = normalize(label ?? "");
    if (season === "summer") {
      // ★**回数は出典から。** 索引に無ければ見出しから
      const round = (src.match(/第(\d+)回/) ?? normalize(heading ?? "").match(/第(\d+)回/))?.[1];
      if (round) return `${year}年 第${round}回全国高等学校野球選手権奈良大会`;
      /*
        ★**回数が無い年は選手権ではない**（2020年は中止で県独自の大会）。
        索引の文字から元号と年を落として、残った名前を使う。
      */
      const own = src.replace(/^(令和|平成)\s*[０-９\d元]+\s*年度?\s*/, "").replace(/[（(][^）)]*[）)]/g, "").trim();
      return own.includes("大会") ? `${year}年 ${own}` : `${year}年 奈良県の夏の大会`;
    }
    const word = season === "spring" ? "春季" : "秋季";
    return `${year}年 ${word}近畿地区高等学校野球大会奈良県予選`;
  },

  /**
   * ★★**索引のリンクの文字から年を出す**（2026-08-27）。
   *
   * それまでは `label.includes("2020年")` で見ていたが、
   * ★**西暦を書いていないリンクがある** ——
   * **2020年の夏は `令和２年度奈良県高等学校夏季野球大会`**（選手権が中止で県独自の大会）で、
   * 西暦がどこにも入らない。**そのページだけ一度も取れていなかった。**
   *
   *   `第104回（2022年）` `令和 ４年度（2022年)` … 西暦がある
   *   `令和２年度奈良県高等学校夏季野球大会`      … 元号だけ
   *
   * ★**元号は年度。** 春（4〜5月）・夏（7月）・秋（9〜10月）はどれも暦年と一致する。
   * ★**回数（`第104回`）からは出さない** —— 選手権でない年があるため。
   */
  labelYear(label) {
    const t = normalize(label ?? "");
    const seireki = t.match(/(\d{4})年/);
    if (seireki) return Number(seireki[1]);
    const gengo = t.match(/(令和|平成)\s*(元|\d+)\s*年/);
    if (gengo) {
      return (gengo[1] === "令和" ? 2018 : 1988) + (gengo[2] === "元" ? 1 : Number(gengo[2]));
    }
    return null;
  },

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

    /**
     * ★**索引で当たったリンクの文字**（`第104回（2022年）` `令和２年度奈良県高等学校夏季野球大会`）。
     * **過去のページには大会名の見出しが無い**ので、名前の手掛かりはここだけ。
     */
    let indexLabel = null;

    /** その年・その季節のページを1枚だけ選ぶ */
    const pageUrl = await (async () => {
      const archive = await get(`${this.siteUrl}kakonosiai.html`);
      if (archive) {
        const hit = dailyLinks(archive, this.siteUrl, { hrefPattern: /\.html?$/i }).find(
          (l) =>
            this.labelYear(l.label) === year &&
            new RegExp(url, "i").test(l.url) &&
            !/kinki/i.test(l.url),
        );
        if (hit) {
          indexLabel = hit.label;
          return hit.url;
        }
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
    /*
      ★★★**大会名は西暦でそろえる**（2026-08-27。運営者の指示）。

      ★**この県は名前の出どころが弱い**。過去のページには大会名の見出しが無く
      （あるのは `7月28日の結果 決勝 （佐藤薬品スタジアム）` のような日ごとの見出しだけ）、
      **297試合が `tournament: null`** だった。名前が無いと
      **2014・2021・2022年が1つの大会に潰れる**（年もURLも1つになる）。

      ★**見出しを拾う作りは、拾えたときも当てにならなかった** ——
      2015年の秋は `10月4日の3位決定戦結果 （佐藤薬品スタジアム）平城高校 近畿大会初出場`
      が大会名になっていた。

      ★**そこで「年（西暦）＋季節の決まった名前」に統一する。**
      元号（`令和7年度…`）は使わない —— **暦年で持っているデータと読み手がずれる。**
      ★**回数と、選手権でない年の名前は出典から取る**（索引のリンクの文字と見出し）。
        夏 … `第104回（2022年）`               → 2022年 第104回全国高等学校野球選手権奈良大会
        夏 … `令和２年度奈良県高等学校夏季野球大会` → 2020年 奈良県高等学校夏季野球大会
            ★**2020年は選手権が中止**で県独自の大会。**選手権の名前を付けないこと。**
        春秋 … `令和 ４年度（2022年)`           → 2022年 春季近畿地区高等学校野球大会奈良県予選
    */
    const heading =
      [...html.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi)]
        .map((m) => normalize(plain(m[1])))
        .find((t) => /大会|予選/.test(t)) ?? null;
    const tournament = this.tournamentName(season, year, indexLabel, heading);

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

      /*
        ★★**古いページは表の最後の行の `</tr>` を閉じていない**（2026-08-27）。
        そのままだと**後攻の行が丸ごと落ちて、試合ごと捨てられる**
        （2013年秋は42表のうち34表が消えていた）。`closeOptional` で受ける。
      */
      const rows = tableRows(t[0], { closeOptional: true });
      if (rows.length < 3) continue;
      const [headRow, homeRow, awayRow] = rows.slice(0, 3);
      // 1列目は「第1試合」などの見出しで、校名は2行目以降の先頭
      const home = homeRow[0];
      const away = awayRow[0];
      if (!home || !away) continue;
      /*
        ★★★**合計は「計」の列から読む**（2026-08-27。山梨で入れた規則と同じ）。

        `inningTotal` は**後ろから最初の数字**を合計とみなすので、
        **中断・不成立で「計」が空の表**では**最終回の得点を合計として拾う。**
        両チームの最終回が 0 だと **0対0 の幻の引き分け**ができる
        （実際に2件出た。うち1件は回戦も付いていなかった）。
        ★**「計」が空なら、その試合は出さない。**
      */
      const totalIdx = headRow.findIndex((c) => /^計$/.test(normalize(c ?? "")));
      /*
        ★★**「計」の無い表は飛ばす。**
        **延長戦は2つの表に分かれる** —— 前半（1〜10回）は見出しが  で終わり**「計」が無く**、
        後半（11〜13回）の表に本当の合計が入る。
        前半で「後ろから最初の数字」を拾うと**最終回の 0 が合計になり、0対0 の幻の引き分け**ができる
        （2016年春の 天理 vs 奈良大附。本当は**13回で 天理 3-1**）。
        ★**後半の表から正しく取れる**ので、前半を飛ばしても試合は落ちない。
      */
      const totalOf = (row) => {
        if (totalIdx < 1) return null;
        const v = normalize(row[totalIdx] ?? "");
        return v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
      };
      const a = totalOf(homeRow);
      const b = totalOf(awayRow);
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

    /*
      ★★**過去年度はトップからリンクされていない**（2026-08-25 追加）。
      トップも `taikai.html` も**今年度しか出さない**ので、
      **ディレクトリ名を組み立てて直接叩く。**

        2026年度 `2026_R08` ／ 2025 `2025_R07` ／ 2024 `2024_R06` ／ 2023 `2023_R05`
        ★**2022年度だけ `2021_R04`** —— 接頭辞の西暦が1年ずれている（出典の誤植）。

      ★**だから候補を2つ試す**（`${year}_R##` と `${year-1}_R##`）。
      ★**当たったページだけを使う**ので、外れの候補は404で静かに落ちる。
      ★**2021年度以前はスコアPDFが無く日別HTML**なので、ここでは取れない
      （読み手が別。取るなら別の実装が要る）。
    */
    if (!pages.length && year <= new Date().getFullYear()) {
      const reiwa = String(year - 2018).padStart(2, "0");
      /*
        ★**ディレクトリ一覧は403**なので、**中のHTMLの名前まで組み立てる。**
          夏 `natsu<選手権の回数>.html`（`natsu107.html` ＝ 第107回 ＝ 2025年）
          春 `haru<西暦>.html` ／ 秋 `aki<西暦>.html`
      */
      const fileOf = { haru: `haru${year}.html`, natsu: `natsu${year - 1918}.html`, aki: `aki${year}.html` };
      outer: for (const dir of [`${year}_R${reiwa}`, `${year - 1}_R${reiwa}`]) {
        for (const file of [fileOf[url], ""]) {
          const guess = `${this.siteUrl}taikai/kousiki/${dir}/${url}/${file}`;
          const html = await fetchHtml(guess);
          await sleep(this.politenessMs);
          if (!html || !/score/i.test(html)) continue;
          pages.push({ url: guess, label: dir });
          break outer;
        }
      }
    }

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
   * ★★★**過去大会のページは「年 × 春/夏/秋」の表**（2026-08-31 その5）。
   *
   *     <tr>
   *       <td>令和７年（2025年）</td>
   *       <td><p class="file_title">第152回</p><a …152haru…xlsx>全試合データ</a>…</td>  ← 春
   *       <td><p class="file_title">第107回</p><a …107natu…xlsx>全試合データ</a>…</td>  ← 夏
   *       <td><p class="file_title">第153回</p><a …153aki…xlsx>全試合データ</a>…</td>  ← 秋
   *     </tr>
   *
   * ★★**年・季節・回数が表から直に取れる。** それまでは**ファイル名に
   *   `haru`/`natu`/`aki` が入っているものを新しい順に3件**しか見ておらず、
   *   **2021年以前のファイル（`103kekka_all.xlsx` など）が1件も拾えていなかった。**
   * ★**表は2010年から48件ある**（`.xlsx` が21件・`.xls` が25件）。★**2026-08-31 その5 に `.xls` も読めるようにした**（`xlsx-rows.mjs`）。
   * ★**列の順は見出しの春・夏・秋と同じ。確かめてから使うこと。**
   */
  pastEntries(html) {
    if (!html) return [];
    const out = [];
    const head = html.split(new RegExp("<thead[^>]*>", "i"))[1]?.split(new RegExp("</thead>", "i"))[0] ?? "";
    const cols = [...head.matchAll(new RegExp("<th[^>]*>([\\s\\S]*?)</th>", "gi"))].map((m) =>
      normalize(plain(m[1])),
    );
    const order = ["spring", "summer", "autumn"];
    const want = ["春季", "夏季", "秋季"];
    const named = cols.filter((c) => /季大会/.test(c));
    if (named.length !== 3 || !named.every((c, i) => c.includes(want[i]))) {
      console.log("  ⚠️ 新潟: 過去大会の表の見出しが春・夏・秋の順でない。出典の作りが変わった可能性がある");
      return [];
    }
    for (const row of html.split(new RegExp("<tr[^>]*>", "i")).slice(1)) {
      const tds = row
        .split(new RegExp("<td[^>]*>", "i"))
        .slice(1)
        .map((t) => t.split(new RegExp("</td>", "i"))[0]);
      if (tds.length < 4) continue;
      const year = Number(normalize(plain(tds[0])).match(new RegExp("[（(](\\d{4})年[）)]"))?.[1]);
      if (!Number.isFinite(year)) continue;
      for (const [k, td] of tds.slice(1, 4).entries()) {
        const title = td.match(new RegExp('class="file_title"[^>]*>([\\s\\S]*?)<', "i"))?.[1] ?? "";
        const no = Number(normalize(title).match(new RegExp("第(\\d+)回"))?.[1]);
        const link = [
          ...td.matchAll(new RegExp('<a[^>]+href="([^"]+\\.xlsx?)"[^>]*>([\\s\\S]*?)</a>', "gi")),
        ].find((m) => /全試合データ|試合結果/.test(normalize(plain(m[2]))));
        if (!link || !Number.isFinite(no)) continue;
        out.push({ year, season: order[k], no, url: link[1] });
      }
    }
    return out;
  },
  /**
   * ★**過去大会の名前は回数と年から組み立てる**（表に正式名称が無いため）。
   * ★**回数は表から読んだもの**で、**年は開いたファイルの中の日付**。
   *   どちらも当て推量ではない（**回数から年を出さない**という前からの規則は守っている）。
   * ★**今年度の大会は今までどおり `tournamentlist/` の見出しから取る**
   *   （まだ過去大会の表に載らないため）。
   */
  nameOf(no, year, season) {
    if (season === "summer") return `第${no}回全国高等学校野球選手権新潟大会`;
    const label = season === "spring" ? "春季" : "秋季";
    /*
      ★★**元号は年度で切り替える**（2026-08-31 その5）。**令和は2019年度から。**
      ★**引き算1本にすると 2010年が `令和-8年度` になる**（実際になった）。
    */
    const era = year >= 2019 ? `令和${year - 2018}` : `平成${year - 1988}`;
    return `第${no}回北信越地区高等学校野球新潟県大会（${era}年度${label}）`;
  },
  /**
   * 県大会ではないシート。
   * ★**「本大会」を忘れないこと。** 春のファイルには北信越本大会のシートが
   * 入っており、外さないと**星稜・敦賀気比・佐久長聖が「新潟の地方大会」に出てくる。**
   */
  /*
    県大会ではないシート。
    ★**「本大会」を忘れないこと。** 春のファイルには北信越本大会のシートが
    入っており、外さないと**星稜・敦賀気比・佐久長聖が「新潟の地方大会」に出てくる。**
    ★★**「支部」も外す**（2026-08-31 その5）。古いファイル（.xls）は
    **秋季のシートが `支部１～３回戦` と `県1回戦・準々・準決・決勝` に分かれている。**
    支部予選は勝ち抜きの木ではないので取らない（千葉と同じ扱い）。
  */
  SKIP_SHEETS: /甲子園|神宮|選抜|北信越|本大会|支部/,
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

    /*
      ★★★**過去の大会は「年 × 春/夏/秋」の表から1つだけ選ぶ**（2026-08-31 その5）。
      表に年・季節・回数が書いてあるので、**開く前にどのファイルかが決まる**
      （出典に取りに行くのは1大会につき1ファイル）。
      ★**今年度の大会はまだ表に載らない**ので、そのときだけ今までどおり
      `tournamentlist/` の見出しから名前を取って、新しい順に3件まで開く。
    */
    const past = this.pastEntries(archive).find((e) => e.season === season && e.year === year);
    const candidates = past
      ? [{ url: past.url, tournament: this.nameOf(past.no, past.year, past.season) }]
      : links.slice(0, 3).map((l) => ({ url: l.url, tournament }));

    const games = [];
    /*
      **年が合うファイルだけを使う。** 表の年とファイルの中の日付は別の場所から来るので、
      **食い違えばそのファイルは使わない**（連盟が貼り違えていたらここで止まる）。
    */
    for (const link of candidates) {
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

          /*
            ★**古いファイルは平成**（`平成 28 年 7 月 8 日`）。
            ★**元号ごとに足す数が違う**ので、まとめて `(令和|平成)` にはしない。
          */
          const d =
            line.match(new RegExp("令和([0-9]+)年([0-9]{1,2})月([0-9]{1,2})日")) ??
            line.match(new RegExp("平成([0-9]+)年([0-9]{1,2})月([0-9]{1,2})日"));
          const era = /平成/.test(line) && !/令和/.test(line) ? 1988 : 2018;
          if (d) {
            const y = era + Number(d[1]);
            fileYear ??= y;
            date = `${y}-${d[2].padStart(2, "0")}-${d[3].padStart(2, "0")}`;
            continue;
          }
          /*
            ★★★**決勝の行だけ「第N試合」が無い紙がある**（2026-08-31 その5。2021年夏）。

                大会　第 13 日目  令和3年7月27日（火）
                | HARD OFF | 決勝戦 |          ← **第N試合が無い**

            ★**そのままだと `gameRow` が前の準決勝のままになり、
            決勝が「準決勝」として画面に出る**（実際に出ていた。準決勝が3試合になる）。
            ★**回戦の名前そのものが書いてある行も見出しとして扱う。**
          */
          if (
            cells.some(
              (c) =>
                new RegExp("^第[0-9]+試合$").test(c) ||
                new RegExp("^(決勝|準決勝|準々決勝|[0-9]+回戦)戦?$").test(c.replace(/[\s　]/g, "")),
            )
          ) {
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
          /*
            ★★★**古いファイル（.xls）は見出しの形が違う**（2026-08-31 その5）。

              新しい形（2020年度〜）
                校　名 | 1 | 2 | … | 9 | … | 計          ← **見出しの行がある**
                新潟青陵 | 0 | 0 | … | 0
              古い形（2010〜2019年度）
                ＜球場名＞ | ハードオフ | | | 第１試合 | | | 1 | 回戦   ← **見出しの行が無い**
                羽茂   | 0 | 0 | 1 | 0 | 0 | 0 | 0 | …(空) | 1 | 7 | 回コールド
                新潟西 | 1 | 3 | 0 | 0 | 3 | 1 | X | … | 8

            ★**古い形は「第N試合」の行の次の2行がそのまま両チーム**で、
            **合計は16列目**（実測。9回でも延長10回でも同じ位置。新しい形の「計」と同じ列）。
            ★**列が固定なので見出しが要らない。** 見つからなければ古い形として読む。
            ★**右にもう1試合並ぶことは古い形には無い**（実測。1行1試合）。
          */
          const OLD_TOTAL = 16;
          if (!heads.length) {
            if (!gameRow.length || !date) continue;
            const rowA = (sheet.rows[i] ?? []).map((c) => normalize(c));
            const rowB = (sheet.rows[i + 1] ?? []).map((c) => normalize(c));
            /*
              ★★★**古い形も、深い回戦は2試合が横に並ぶ**（2026-08-31 その5）。

                ＜球場名＞|ハードオフ|||第１試合|||準々決勝|…(14空)…|＜球場名＞|ハードオフ|…
                長岡商  |0|…|0（16列目が合計）|…            |巻    |0|…
                                                            ↑ 22列目から2試合目

              ★**左だけ読むと準々決勝が2試合・準決勝が1試合になる**（実際になった）。
              ★**`＜球場名＞` の列を全部拾って、それぞれを1試合として読む**
              （新しい形で「校名」の列を全部拾うのと同じ考え方）。
            */
            const starts = gameRow.flatMap((c, idx) => (/球場名/.test(c) ? [idx] : []));
            const blocks = starts.length ? starts : [0];
            let pushed = false;
            for (const [k, start] of blocks.entries()) {
              const end = blocks[k + 1] ?? Math.max(gameRow.length, rowA.length, rowB.length);
              const nameA = rowA[start] ?? "";
              const nameB = rowB[start] ?? "";
              const num = (v) => (new RegExp("^[0-9]+$").test(v ?? "") ? Number(v) : null);
              const sa = num(rowA[start + OLD_TOTAL]);
              const sb = num(rowB[start + OLD_TOTAL]);
              if (!nameA || !nameB || sa === null || sb === null) continue;
              // ★**校名の欄が校名でない行は飛ばす**（「バッテリー」の表など）
              if (new RegExp("^[0-9]").test(nameA) || /バッテリー|投|捕/.test(nameA)) continue;
              const head = gameRow.slice(start, end);
              found.push({
                date,
                season,
                tournament: link.tournament,
                /*
                  ★★**古い形は回戦が2つのセルに割れている**（`… | 4 | 回戦`）。
                  **空白でつなぐと `4 回戦` になって回戦として読めない。詰めてつなぐこと。**
                */
                round: pickRound(head.join("")),
                venue:
                  head.find(
                    (c) => c && !new RegExp("^第[0-9]+試合$").test(c) && !/回戦|決勝|球場名|＜|＞/.test(c),
                  ) ?? null,
                teams: [
                  { display: nameA, score: sa, won: sa > sb },
                  { display: nameB, score: sb, won: sb > sa },
                ],
              });
              pushed = true;
            }
            if (pushed) {
              gameRow = [];
              i += 1;
            }
            continue;
          }

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
              tournament: link.tournament,
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
      /*
        ★★★**1つのファイルに2つの年が入っていることがある**（2026-08-31 その5）。
        2023年春（第148回）の `1~2回戦` シートには **令和5年4月の行と令和6年4月の行**が
        両方あり、そのまま採ると**2024年の19試合が2023年の大会に混ざる。**
        ★**「ファイルの最後に見た日付」で丸ごと判定していた**ので気づけなかった。
        ★★**試合ごとに日付の年を見て、表が言う年と合うものだけ採る。**
        ★**日付の無い試合は採らない**（この出典は必ず日付を持つ）。
      */
      const ofYear = found.filter((g) => g.date && Number(g.date.slice(0, 4)) === year);
      if (ofYear.length !== found.length) {
        console.log(
          `  （新潟: ${link.tournament} は ${found.length} 試合のうち ${found.length - ofYear.length} 試合が` +
            `${year} 年の日付でないので採らない）`,
        );
      }
      /*
        ★★★**回戦の札が合わない大会は1試合も出さない**（2026-08-31 その5）。

        古いファイル（.xls）は**回戦が2つのセルに割れている**ことがあり、
        **読めなかった枠が前の見出しの回戦を引き継いでしまう。**
        実測で46大会中4大会が
        「2回戦が32試合」「準々決勝が5試合」「決勝が0試合」という形になっていた。

        ★★**回戦は画面に事実として出る。** 数が合わないなら**札のどれかが嘘**なので、
        **その大会ごと落とす**（このリポジトリ共通の構え）。
        ★**決勝1・準決勝2**は勝ち抜きなら必ず成り立つ。
        ★**落ちた大会は名前を出す**（次に触る人が紙を見に行けるように）。
      */
      const byTournament = new Map();
      for (const g of ofYear) {
        if (!byTournament.has(g.tournament)) byTournament.set(g.tournament, []);
        byTournament.get(g.tournament).push(g);
      }
      const sane = [];
      for (const [name, gs] of byTournament) {
        const f = gs.filter((g) => g.round === "決勝").length;
        const sf = gs.filter((g) => g.round === "準決勝").length;
        if (f === 1 && sf === 2) {
          sane.push(...gs);
          continue;
        }
        console.log(
          `  ⚠️ 新潟: ${name} は 決勝${f}試合・準決勝${sf}試合（1・2 のはず）。回戦の札が合わないので1試合も出さない`,
        );
      }
      if (sane.length) {
        games.push(...sane);
        break;
      }
    }
    return games;
  },
};

/**
 * 愛知県高等学校野球連盟（`www.aichi-kouyaren.com`）。
 *
 * ------------------------------------------------------------------
 * ★ 規約（2026-08-30 確認）
 *
 *   `robots.txt` は **404**。トップ・サイトマップ・日本学生野球憲章のページの
 *   本文を検索したが、**転載・無断・複製・営利・商用・著作権のどの掲示も無い。**
 *
 * ------------------------------------------------------------------
 * ★★ 出典を CATVase.jp から連盟に替えた（2026-08-30）
 *
 *   ★**替えた理由は過去年。** CATVase.jp（愛知県ケーブルテレビ協議会の応援サイト）は
 *   **大会が変わるとページごと作り替わる**ので、**今年の1大会しか取れなかった**
 *   （173試合）。連盟の「夏の大会」の索引には**第100回（2018年）から**並んでいる。
 *
 *   ★★**CATVase.jp は捨てていない。** 連盟の記事は**大会が終わってから**出るので、
 *   **開催中の大会は連盟に無い。** そこだけ CATVase から補う（`fillFromCatvase`）。
 *   ★**補ったぶんは `source` にそのサイト名を持たせる**（富山と同じ）。
 *   **連盟の名前で出さないこと。**
 *
 * ------------------------------------------------------------------
 * ★★★ 紙は「枝が線として描いてある」トーナメント表（富山と同じ型）
 *
 *   ★**座標から枝の形を推測する `slot-bracket.mjs` は使えない。**
 *   愛知の紙は**シードが2回戦・3回戦から登場する**ので、
 *   「毎回全員が組になる」を前提にしたあの組み立ては必ず落ちる
 *   （実際に「1回戦は6試合、2回戦は7試合」という形で落ちた）。
 *
 *   ★★**枝は `fill` の塗りつぶしで描かれている**（富山は `eoFill`）。
 *   `readFilledShapes` に `ops: ["fill"]` を渡すこと。**赤が勝った側。**
 *
 *   ★**夏は「ブロックごとに1ページ」の紙（8ページ）＋「準々決勝以降」の紙**の2枚組。
 *   1枚では優勝校に収束しないので、**枚をまたぐ検算**が要る（兵庫と同じ形）。
 *
 * ------------------------------------------------------------------
 * ★★ 紙の向きが2つある
 *
 *   ブロックの紙 … スロット番号が**縦**に並び、校名はその**左**、回戦は**右**へ
 *   準々決勝以降 … 年によって**縦**（2021年）と**横**（2022年以降）の両方がある
 *
 *   ★**横向きの紙は `assembleSlotBracket`**（スロットが横一列・回戦は上へ＝京都型）。
 *   ★**縦向きの紙は枝の線から読む**（ブロックの紙と同じ）。
 *   **どちらか一方に決め打ちしないこと。**
 *
 * ------------------------------------------------------------------
 * ★★ 踏んだところ（**次に触る人へ**）
 *
 *   1. ★★**シードの行にはスロット番号がなく、ブロックの記号（A〜H）が入る。**
 *      スロット番号の連番だけを見ると**その1校が丸ごと落ちる。**
 *      **番号の列の1つ上の行**にある `A`〜`H` も1チームとして数える。
 *   2. ★★**校名の左に「参加校番号」の列がある**（`43 星城`）。
 *      落とさないと校名が `43星城` になり、どの学校にも結び付かない。
 *   3. ★★**連合チームの校名はスロットの行の上下2行に組まれる**
 *      （`緑丘・東海学園` ／ `・春日井泉`）。**行ではなくスロットの高さでまとめる。**
 *      `vector-bracket.mjs` の「枝の横線が無い行は続き」では拾えない
 *      （**どちらの行にも横線が無い**）ので、**校名は呼ぶ側で作って渡す。**
 *   4. ★**日付と得点が1つの断片になっていることがある**（`7月18日 5`）。
 *      **断片を空白で割って、幅から位置を測り直す**（そうしないと得点が読めない）。
 *   5. ★★**不戦勝は得点が刷られていない**（`7月22日 不戦勝`）。
 *      **枠は使うが試合は行われていない**ので、**検算には数え、画面には出さない**
 *      （大阪・群馬と同じ扱い。0対0にしないこと）。
 */
const aichi = {
  slug: "aichi",
  district: "愛知",
  name: "愛知県高等学校野球連盟",
  siteUrl: "https://www.aichi-kouyaren.com/",
  politenessMs: 2000,
  seasons: {
    spring: "https://www.aichi-kouyaren.com/pastgame_spring/",
    summer: "https://www.aichi-kouyaren.com/pastgame_summer/",
    autumn: "https://www.aichi-kouyaren.com/pastgame_autumn/",
  },
  /**
   * ★★**季節ごとの「索引の場所・大会名・回数から年を出す足し算」。**
   *
   *   春季 `第76回愛知県高等学校優勝野球大会`   = 2026 → **+1950**
   *   夏   `第108回全国高等学校野球選手権愛知大会` = 2026 → **+1918**
   *   秋季 `第79回愛知県高等学校野球選手権大会`  = 2026 → **+1947**
   *
   * ★★**秋季の大会名にも「選手権」が入る。** 夏の選手権とは別物なので、
   * **季節ごとに大会名の形を持つこと**（`第\d+回.*選手権` のような緩い形にしない）。
   * ★**足し算は記事の掲載日と突き合わせて確かめてある**（36大会すべてで一致）。
   */
  formOf: {
    spring: { path: "pastgame_spring", round: /第(\d+)回愛知県高等学校優勝野球大会/, base: 1950 },
    summer: { path: "pastgame_summer", round: /第(\d+)回全国高等学校野球選手権/, base: 1918 },
    autumn: { path: "pastgame_autumn", round: /第(\d+)回愛知県高等学校野球選手権大会/, base: 1947 },
  },
  /** ★開催中の大会だけを補う出典（連盟の記事は大会が終わってから出る）。**夏だけ** */
  catvaseUrl: "https://catvase.jp/game/",
  catvaseName: "CATVase.jp（愛知県ケーブルテレビ協議会）",
  /**
   * ★**既定で読む大会の数。** 過去年は生成物に引き継がれるので、
   * 毎回ぜんぶ取りに行かない（自動更新は1日2回走る）。
   * **遡るときは `--year` で年を指定する。**
   */
  maxTournaments: 2,
  async collect({ fetchHtml, season, url, year }) {
    const index = await fetchHtml(url);
    if (!index) {
      console.log("  ⚠️ 愛知: 索引が取れない。出典の作りが変わった可能性がある");
      return [];
    }
    const form = this.formOf[season];
    const entries = [];
    const seen = new Set();
    const href = new RegExp(
      `<a[^>]*href="(https://www\\.aichi-kouyaren\\.com/${form.path}/entry-\\d+\\.html)"[^>]*>([\\s\\S]*?)</a>`,
      "gi",
    );
    for (const m of index.matchAll(href)) {
      const label = normalize(plain(m[2]));
      if (!label || label === "Permalink" || seen.has(m[1])) continue;
      seen.add(m[1]);
      const round = Number(label.match(form.round)?.[1]);
      /*
        ★**回数を名前に持たない記事は採らない** —— 2020年は選手権が中止で
        「夏季愛知県高等学校野球大会」という別の大会が開かれており、
        **年を導く根拠が名前に無い。**
      */
      if (!Number.isFinite(round)) continue;
      if (!isTargetTournament(label)) continue;
      entries.push({ url: m[1], label, year: round + form.base });
    }
    if (!entries.length) {
      console.log("  ⚠️ 愛知: 索引に大会が1つも無い。出典の作りが変わった可能性がある");
      return [];
    }
    entries.sort((a, b) => b.year - a.year);
    const wanted = year ? entries.filter((e) => e.year === year) : entries.slice(0, this.maxTournaments);

    const games = [];
    for (const entry of wanted) {
      const got = await this.readTournament({ fetchHtml, season, entry });
      if (got?.length) games.push(...got);
    }
    // ★CATVase.jp は選手権（夏）の応援サイトなので、春季・秋季では見に行かない
    if (season !== "summer") return games;
    /*
      ★★★**過去年を取りに行った実行では、CATVase から補わないこと**
      （2026-08-30。**実際にデータを上書きしてから入れた歯止め**）。

      `--year 2015` のように**その季節に大会が1つも当たらない年**を指定すると、
      `games` が空のまま `fillFromCatvase` が走り、**開催中の大会をまるごと足す。**
      すると引き継ぎの鍵（大会名＋年）が埋まり、
      **前の実行で連盟の紙から読んだ同じ大会が、CATVase のぶんに置き換わる**
      （実測：第108回の173試合が、球場名も並び順も違うものに入れ替わった）。
      ★★**検算はどれも通る**（中身は正しく、出所が変わるだけ）。
      **気づけたのは、コミット済みの生成物と1試合ずつ突き合わせたから。**

      ★**補うのは「いまの年を取りに行ったとき」だけ**にする。
    */
    if (year && year !== new Date().getFullYear()) return games;
    const extra = await this.fillFromCatvase({ fetchHtml, season, games });
    return [...games, ...extra];
  },

  /** 1大会（記事1本）を読む */
  async readTournament({ fetchHtml, season, entry }) {
    const html = await fetchHtml(entry.url);
    await sleep(this.politenessMs);
    if (!html) return [];
    /*
      ★★★**春季・秋季は大会名の頭に西暦を足す**（宮崎の春季・秋季と同じ）。

      この2つの紙には**試合の日付が1つも無い**ので、サイト側は**大会名から年を出す**
      （`yearOfTournament`）。その規則は `第N回…選手権…` を **N + 1918** と読むので、
      **秋季の `第78回愛知県高等学校野球選手権大会` が 1996年**になり、
      **春季は年が分からない大会**になる（実際にそうなっていた）。
      ★**夏は試合に日付があるので足さない**（足すと引き継ぎの鍵とURLが変わる）。
    */
    const tournament = season === "summer" ? entry.label : `${entry.year}年 ${entry.label}`;

    /*
      ★★**記事の本文が優勝校を書いている**（`優　勝　享栄高等学校（３１年ぶり１０回目）`）。
      **枝とは別の場所から来る事実**なので、石川で通ってしまった
      「構造の検算は通るのに決勝の相手が違う」を止められる。

      ★**書き方が年で違う。** 校名のうしろは括弧のことも数字のこともある。

          優勝享栄高等学校（３１年ぶり１０回目）   … 第108回
          優勝愛工大名電３年連続１５回目           … 第105回（括弧が無い）
          優勝：愛工大名電（３年ぶり１３回目）     … 第103回

      ★**そこで「校名のうしろは括弧か数字」で切る。**
      ★**準優勝は年によって区切りが無く、取れないことがある**
      （第105回は `準優勝中京大中京要項抽選会…` と本文が続く）。**取れたときだけ見る。**
      ★**書かれていない年もある**（第104回の記事には優勝校が無い）。
      **無いことを理由に大会を落とさない。** ★ただし**検算したかどうかは必ずログに出す。**
    */
    /*
      ★★**記事の本文だけを見ること。** ページの脇に他の大会へのリンクが並んでおり
      （`第76回愛知県高等学校優勝野球大会ベスト８`）、ページ全体から探すと
      **そのリンクの文字を優勝校として読む**（実際に第104回がそれで落ちた）。
      ★**記事の本体は「掲載日＋大会名」から始まる**（ページの上のほうにも大会名は
      出るが、そこには日付が付かない）。そこから次の掲載日までを見る。

      ★★**空白を潰さないこと。** 記事は必ず **`優　勝　◯◯`** と1字空けて組んでおり、
      脇のリンクの `…高等学校優勝野球大会ベスト８` は**空けていない。**
      潰すと見分けが付かず、**リンクの文字を優勝校として読む**（実際に第104回が落ちた）。
    */
    const whole = normalize(plain(html));
    const head = whole.match(new RegExp(`\\d{4}年\\d{2}月\\d{2}日\\s*${entry.label}`));
    const text = head
      ? whole.slice(head.index + head[0].length).split(/\d{4}年\d{2}月\d{2}日/)[0]
      : "";
    const name = /([^\s（(【\d]{2,12}?)(?:高等学校|高校)?(?=[\s（(\d])/;
    const printed = {
      champion: text.match(new RegExp(`優\\s+勝\\s*[：:]?\\s*${name.source}`))?.[1] ?? null,
      runnerUp: text.match(new RegExp(`準\\s*優\\s*勝\\s*[：:]?\\s*${name.source}`))?.[1] ?? null,
    };

    /*
      ★**記事の掲載日の年が、大会名から出した年と合うことを確かめる**（36大会で一致）。
      名前の回数を読み違えたら、ここで必ず捕まる。
    */
    const posted = Number(head?.[0].match(/(\d{4})年/)?.[1]);
    if (Number.isFinite(posted) && posted !== entry.year) {
      console.log(
        `  ⚠️ 愛知: ${tournament} の年（大会名から ${entry.year}）が記事の掲載日（${posted}年）と違う。1試合も出さない`,
      );
      return [];
    }

    const pdfs = [...new Set([...html.matchAll(/href="([^"]+\.pdf)"/gi)].map((m) => m[1]))];
    /*
      ★★**春季・秋季は1枚だけ**（左右2段組。`readTwoColumnSheet`）。
      夏の「ブロック8枚＋準々決勝以降1枚」とは紙の作りがまるで違うので、季節で分ける。
    */
    if (season !== "summer") {
      return await this.readTwoColumnTournament({ pdfs, season, tournament, printed });
    }
    const blocks = [];
    let finals = null;
    for (const pdfUrl of pdfs) {
      const bytes = await fetchPdfBytes(pdfUrl, { headers: UA });
      await sleep(this.politenessMs);
      if (!bytes) continue;
      let pages;
      try {
        pages = await pdfPages(bytes.slice());
      } catch {
        continue;
      }
      const title = (p) => normalize(p.lines[0]?.items.map((i) => i.text).join("") ?? "");
      // ★**ブロックの紙は表題に「◯ブロック」が入る**（要項・ドリームシートはここで外れる）
      if (pages.length > 1 && pages.every((p) => /ブロック/.test(title(p)))) {
        blocks.push({ bytes, pages });
        continue;
      }
      if (pages.length === 1 && /全国高等学校野球選手権/.test(title(pages[0])) && !finals) {
        finals = { bytes, pages };
      }
    }
    if (!blocks.length || !finals) {
      console.log(
        `  ⚠️ 愛知: ${tournament} の紙が揃わない` +
          `（ブロック${blocks.length}枚・準々決勝以降${finals ? 1 : 0}枚）。1試合も出さない`,
      );
      return [];
    }
    // ★**同じ紙が2つ貼られている年がある**（第106回）。ページ数がいちばん多いものを使う
    const block = blocks.sort((a, b) => b.pages.length - a.pages.length)[0];

    const out = [];
    const winners = [];
    let teams = 0;
    let byes = 0;
    for (const page of block.pages) {
      const read = await this.readVectorSheet(block.bytes, page, season, tournament);
      if (!read) {
        console.log(
          `  ⚠️ 愛知: ${tournament} の ${normalize(page.lines[0]?.items.map((i) => i.text).join("") ?? "")}` +
            ` を組み立てられない。1試合も出さない`,
        );
        return [];
      }
      out.push(...read.games);
      winners.push(read.champion);
      teams += read.teams;
      byes += read.byes;
    }

    const last = await this.readFinalSheet(finals, season, tournament);
    if (!last) {
      console.log(`  ⚠️ 愛知: ${tournament} の準々決勝以降を組み立てられない。1試合も出さない`);
      return [];
    }

    /*
      ---- 検算1: 枚をまたぐ突き合わせ ----
      ★★**準々決勝以降の紙に出てくる8校は、ブロックの紙の優勝校8校と1対1で対応する。**
      **1ブロックでも読み違えれば必ずどれかが余る**（兵庫と同じ、いちばん強い検算）。
    */
    const bare = (s) => normalizeSchoolName(String(s ?? "").replace(/[（(].*$/, ""));
    const fromBlocks = winners.map(bare).sort();
    const fromFinals = last.entrants.map(bare).sort();
    if (fromBlocks.length !== fromFinals.length || fromBlocks.some((n, i) => n !== fromFinals[i])) {
      console.log(
        `  ⚠️ 愛知: ${tournament} のブロック優勝校（${fromBlocks.join("・")}）が` +
          `準々決勝以降の出場校（${fromFinals.join("・")}）と合わない。1試合も出さない`,
      );
      return [];
    }
    out.push(...last.games);
    teams += 0;

    /*
      ---- 検算2: 勝ち抜きの算数 ----
      ★**不戦勝は枠を使うが試合は行われていない**ので、試合数には数えない。
    */
    if (teams - (out.length + byes) !== 1) {
      console.log(
        `  ⚠️ 愛知: ${tournament} は ${teams} チームに対し ${out.length} 試合` +
          `（不戦勝 ${byes}）。1試合も出さない`,
      );
      return [];
    }

    /*
      ---- 検算3: 記事の本文が書いている優勝校・準優勝校 ----
      ★**書かれていない年は飛ばす**（2022年の記事は本文に優勝校が無い）。
      ★**黙って飛ばさない** —— 検算したかどうかを必ずログに出す。
    */
    const final = out.filter((g) => g.round === "決勝");
    const champion = final.length === 1 ? final[0].teams.find((t) => t.won)?.display : null;
    const runnerUp = final.length === 1 ? final[0].teams.find((t) => !t.won)?.display : null;
    /*
      ★★**本文は正式名、枝は略称**（`愛知工業大学名電` に対し枝は `愛工大名電`）。
      **含むかどうかでは当たらない**（`業`『学』が抜けている）。
      ★**どちらかがもう一方の部分列なら同じ**とみなす（京都・兵庫で決めたやり方）。
      ★**緩めるのは校名の比べ方だけ** —— 枝のほうは「無敗が1校」と
      **枚をまたぐ突き合わせ**で決まっており、決勝の相手が違えばそこで食い違う。
    */
    const subsequence = (short, long) => {
      let i = 0;
      for (const c of long) if (c === short[i]) i++;
      return i === short.length;
    };
    const agrees = (a, b) => {
      if (!a || !b) return true;
      const [x, y] = [bare(a), bare(b)];
      return x.length <= y.length ? subsequence(x, y) : subsequence(y, x);
    };
    if (!agrees(printed.champion, champion) || !agrees(printed.runnerUp, runnerUp)) {
      console.log(
        `  ⚠️ 愛知: ${tournament} の優勝・準優勝が本文と合わない` +
          `（本文「${printed.champion}／${printed.runnerUp}」/ 組み立て「${champion}／${runnerUp}」）。1試合も出さない`,
      );
      return [];
    }

    console.log(
      `  （${tournament}: ${out.length} 試合 / 優勝 ${champion}` +
        `${printed.champion ? "（本文と一致）" : "（本文に記載が無く未検算）"} / ` +
        `${teams} チーム${byes ? `・不戦勝 ${byes} 件` : ""}）`,
    );
    return out;
  },

  /**
   * ★**スロット番号の列**（縦に 1,2,3… と並ぶ x）を、長い順に返す。
   *
   * ★**春季・秋季の紙は左右2段組**なので**列は2つある**（左 1〜25・右 26〜49）。
   * ★**先に `splitFragments` を通しておくこと** —— 秋季の紙は
   * **`京 ２位 12` のように、校名の最後の1文字・シード表記・スロット番号が
   * 1つの断片**になっており、割らないと**連番が途中で切れて列が見つからない**
   * （実測で左の列が 1〜11 までしか読めなかった）。
   */
  /**
   * @param tol 同じ列とみなす x の差。★**既定は 4。**
   *   春季・秋季の紙は**校名・シード表記・スロット番号が1つの断片**になっており
   *   （`愛 工 大 名 電 ２位 12`）、断片の中の位置は幅を文字数で割った見積もりしかない。
   *   **全角と半角が混じると 4 ポイントを超えてずれ、その番号だけ列から外れる**
   *   （実測で第75回春は 1〜12 が、第77回秋は 25 だけが外れた）。
   *   ★**得点の列は 40 ポイント以上離れている**ので、8 でも取り違えない。
   */
  slotColumns(page, { tol = 4 } = {}) {
    const ints = page.lines.flatMap((l) =>
      l.items
        .filter((i) => /^\d{1,3}$/.test(normalize(i.text).trim()))
        .map((i) => ({ x: i.x, y: l.y, v: Number(normalize(i.text)) })),
    );
    const byX = new Map();
    for (const it of ints) {
      const key = [...byX.keys()].find((k) => Math.abs(k - it.x) <= tol) ?? it.x;
      if (!byX.has(key)) byX.set(key, []);
      byX.get(key).push(it);
    }
    const found = [];
    for (const [x, list] of byX) {
      let best = [];
      let cur = [];
      for (const it of [...list].sort((a, b) => b.y - a.y)) {
        if (cur.length && it.v !== cur.at(-1).v + 1) {
          if (cur.length > best.length) best = cur;
          cur = [];
        }
        cur.push(it);
      }
      if (cur.length > best.length) best = cur;
      if (best.length >= 6) found.push({ x, rows: best });
    }
    return found.sort((a, b) => b.rows.length - a.rows.length);
  },
  /** いちばん長い1本だけ（ブロックの紙はこれで足りる） */
  slotColumn(page) {
    return this.slotColumns(page)[0] ?? null;
  },

  /**
   * ★**断片を空白で割って、幅から位置を測り直す。**
   * `7月18日 5` のように**日付と得点が1つの断片**になっている紙があり、
   * 割らないと**その試合の得点が読めない**（`vector-bracket.mjs` は
   * 断片ぜんぶが数字のものしか得点として見ない）。
   */
  /**
   * @param circled ★★**丸数字の前後でも割る**（春季・秋季の紙）。
   *   古い紙は**シード表記の丸数字とスロット番号がくっついている**（`①1` `26①`）。
   *   空白では割れないので**スロット番号の列が見つからず**、その大会が丸ごと落ちる。
   *   ★**夏のブロックの紙では使わない** —— あちらは球場が `春日井②` のように
   *   丸数字つきで、割ると**球場名が `②` になる。**
   */
  splitFragments(page, { circled = false } = {}) {
    return {
      page: page.page,
      lines: page.lines.map((l) => {
        const items = [];
        for (const it of l.items) {
          const parts = circled
            ? [...it.text.matchAll(/[①-⑳]+|[^\s①-⑳]+/g)].map((m) => m[0])
            : it.text.split(/\s+/).filter(Boolean);
          if (parts.length < 2 || !(it.width > 0)) {
            items.push(it);
            continue;
          }
          const per = it.width / it.text.length;
          let at = 0;
          for (const part of parts) {
            const start = it.text.indexOf(part, at);
            items.push({ x: it.x + start * per, width: part.length * per, text: part });
            at = start + part.length;
          }
        }
        items.sort((a, b) => a.x - b.x);
        return { y: l.y, items, text: items.map((i) => i.text).join("\t") };
      }),
    };
  },

  /**
   * 春季・秋季（左右2段組の紙が1枚）。
   *
   * ★**記事に貼ってあるPDFは1本とは限らない**（イニングスコアの束や、
   * 別の大会の案内が一緒に貼ってある年がある）。**開いて読めたものを使う。**
   */
  async readTwoColumnTournament({ pdfs, season, tournament, printed }) {
    let read = null;
    for (const pdfUrl of pdfs) {
      const bytes = await fetchPdfBytes(pdfUrl, { headers: UA });
      await sleep(this.politenessMs);
      if (!bytes) continue;
      let pages;
      try {
        pages = await pdfPages(bytes.slice());
      } catch {
        continue;
      }
      // ★**やぐら表は1ページ目にある**（2ページ目以降はイニングスコアの束）
      const got = await this.readTwoColumnSheet(bytes, pages[0], season, tournament);
      if (got?.games?.length) {
        read = got;
        break;
      }
    }
    if (!read) {
      console.log(`  ⚠️ 愛知: ${tournament} の組合せ表を組み立てられなかった。1試合も出さない`);
      return [];
    }

    // ---- 検算1: 勝ち抜きの算数 ----
    if (read.teams - read.games.length !== 1) {
      console.log(
        `  ⚠️ 愛知: ${tournament} は ${read.teams} チームに対し ${read.games.length} 試合。1試合も出さない`,
      );
      return [];
    }

    /*
      ---- 検算2: 負けは1校につき1回まで ----
      ★**紙の外の数字を使わない**ので、参照データの誤りに巻き込まれない。
    */
    const losses = new Map();
    for (const g of read.games) {
      const l = g.teams.find((t) => !t.won)?.display;
      losses.set(l, (losses.get(l) ?? 0) + 1);
    }
    const twice = [...losses].filter(([, n]) => n > 1);
    if (twice.length) {
      console.log(
        `  ⚠️ 愛知: ${tournament} で2回以上負けている学校がある（${twice.map(([n]) => n).join("・")}）。1試合も出さない`,
      );
      return [];
    }

    // ---- 検算3: 記事の本文が書いている優勝校・準優勝校 ----
    const bare = (s) => normalizeSchoolName(String(s ?? "").replace(/[（(].*$/, ""));
    const subsequence = (short, long) => {
      let i = 0;
      for (const c of long) if (c === short[i]) i++;
      return i === short.length;
    };
    const agrees = (a, b) => {
      if (!a || !b) return true;
      const [x, y] = [bare(a), bare(b)];
      return x.length <= y.length ? subsequence(x, y) : subsequence(y, x);
    };
    const final = read.games.filter((g) => g.round === "決勝");
    const champion = final.length === 1 ? final[0].teams.find((t) => t.won)?.display : null;
    const runnerUp = final.length === 1 ? final[0].teams.find((t) => !t.won)?.display : null;
    if (!agrees(printed.champion, champion) || !agrees(printed.runnerUp, runnerUp)) {
      console.log(
        `  ⚠️ 愛知: ${tournament} の優勝・準優勝が本文と合わない` +
          `（本文「${printed.champion}／${printed.runnerUp}」/ 組み立て「${champion}／${runnerUp}」）。1試合も出さない`,
      );
      return [];
    }

    /*
      ---- 検算4: **紙の中央に縦書きされた優勝校** ----
      ★★**2015・2016年の記事の本文には優勝校が書かれていない**ので、
      検算3が素通しになる。**枝の外から来る事実はこの縦書きしか無い。**
      ★**読み方は `readNoSlotSheet` の説明を読むこと**（「優勝の次が校名」とは読まない）。
      ★**縦書きが無い紙では何も要求しない**（スロット番号のある年は今までどおり）。
    */
    const onSheet = read.centerText && champion && read.centerText.includes(bare(champion));
    if (read.centerText && champion && !onSheet) {
      console.log(
        `  ⚠️ 愛知: ${tournament} の優勝校（組み立て「${champion}」）が` +
          `紙の中央の縦書き（「${read.centerText}」）に出てこない。1試合も出さない`,
      );
      return [];
    }

    console.log(
      `  （${tournament}: ${read.games.length} 試合 / 優勝 ${champion}` +
        `${printed.champion ? "（本文と一致）" : onSheet ? "（紙の中央の縦書きと一致）" : "（本文に記載が無く未検算）"} / ${read.teams} チーム・**日付なし**）`,
    );
    return read.games;
  },

  /**
   * ★★**春季・秋季の紙**（左右2段組の1枚。富山と同じ形）。
   *
   *   左半分 … スロット 1〜25、校名はその**左**、回戦は**右**へ
   *   右半分 … スロット 26〜49、校名はその**右**、回戦は**左**へ
   *   中央   … 決勝（左右から伸びた横線が出会う。`findFinal` が拾う）
   *
   * ★**校名は呼ぶ側で作って渡す。** この紙は**枠いっぱいに字を散らして組む**ので
   * （`愛 産 大 三 河`）、`vector-bracket.mjs` の既定の読み方だと
   * **`中部 大春日丘` のように区切りでない空白が残り、連合チームに見える。**
   * ★**スロット番号の列があるので、どの高さが1校ぶんかは読み取りで決まる。**
   */
  async readTwoColumnSheet(bytes, rawPage, season, tournament) {
    /*
      ★★**枝の塗り方は年で違う**（2026-08-30 その2）。
      2018年以降の紙は `fill`、**2015〜2017年の紙は `eoFill`**（富山と同じ）で描いてある。
      ★**`fill` だけを見る作りだと、古い紙は「縦線が1本も無い」で丸ごと落ちる。**
      ★**どちらかに決め打ちせず、縦線が取れたほうを使う**（紙を見て決めており推測ではない）。
    */
    let shapes = await readFilledShapes(bytes.slice(), { pageNumber: rawPage.page, ops: ["fill"] });
    let vert = shapes.filter((s) => s.w < 3 && s.h >= 4);
    if (!vert.length) {
      shapes = await readFilledShapes(bytes.slice(), { pageNumber: rawPage.page, ops: ["eoFill"] });
      vert = shapes.filter((s) => s.w < 3 && s.h >= 4);
    }
    if (!vert.length) return null;
    const page = this.splitFragments(rawPage, { circled: true });
    const cols = this.slotColumns(page, { tol: 8 }).slice(0, 2).sort((a, b) => a.x - b.x);
    if (process.env.AICHI_DEBUG) {
      console.log(
        `  [debug] 縦線${vert.length} スロット列 ${this.slotColumns(page, { tol: 8 }).map((c) => `x=${c.x.toFixed(0)}(${c.rows.length}個 ${c.rows[0].v}〜${c.rows.at(-1).v})`).join(" ")}`,
      );
    }
    /*
      ★★★**スロット番号の列が無い紙がある**（2026-09-01。2015・2016年）。
      **枝は `eoFill` で描いてあるので読めるのに、入口で落ちていた。**
      ★**校名の欄も中央も、枝の縦線の列から測れる** ——
      **いちばん外の列の ±6 が校名の欄、いちばん内側の列どうしの中点が中央。**
      ★**この道では校名を渡さない**（`teams: null`）。
      スロット番号が無い以上「どの高さが1校ぶんか」は読み取れないので、
      **枝の横線から見つける `vector-bracket.mjs` の既定に任せる**（富山と同じ）。
    */
    if (cols.length !== 2) return this.readNoSlotSheet(shapes, vert, page, season, tournament);
    const [left, right] = cols;

    /*
      ★★**シード表記を落とす。** スロット番号の列のすぐ内側にあり、
      落とさないと校名が `中京大中京2位` `誉①` になってどの学校にも結び付かない。
      ★**書き方は年で2つ** —— 新しい紙は `１位` `２位`、古い紙は**丸数字**（`①`）。
      ★**丸数字は校名の前に付くことも後ろに付くこともある**（`①東邦` と `至学館③`）。
    */
    const isSeedMark = (i) => /^(\d+位|[①-⑳]+)$/.test(normalize(i.text).trim());
    const nonNumeric = (i) => !/^\d+$/.test(normalize(i.text).trim()) && !isSeedMark(i);
    const nameXLeft = left.x - 6;
    const nameXRight = right.x + 6;

    /*
      ★★★**校名はスロット番号の列のどちら側にもありうる**（2026-08-31。2019年の秋季）。

        2018年以降の紙   ｜ 校名 ｜ 番号 ｜ 得点 …          校名は**外側**
        2019年の秋季     ｜ 番号 ｜ 校名 ｜ 得点 …          校名は**内側**（左右が逆）

      ★**外側と決め打ちしていたので、左half の校名が26件とも空**になり、
      その大会が丸ごと落ちていた。
      ★**数字でない断片が多いほうを校名の側とする**（ブロックの紙の `readVectorSheet`
      が前から同じやり方をしている）。**紙を見て決めており、当て推量ではない。**
      ★**内側を見るときは 90 ポイントで打ち切る** —— 校名の欄はそれより狭く、
      広げると日付や球場の断片を巻き込む。
    */
    const namesOutside = (col, side) => {
      const near = (out) =>
        page.lines.reduce(
          (n, l) =>
            n +
            l.items.filter((i) => {
              if (!nonNumeric(i)) return false;
              const d = side === "L" ? col.x - i.x : i.x - col.x;
              return out ? d > 6 : d < -6 && d > -90;
            }).length,
          0,
        );
      return near(true) >= near(false);
    };
    const outside = { L: namesOutside(left, "L"), R: namesOutside(right, "R") };
    if (process.env.AICHI_DEBUG) console.log(`  [debug] 校名の側 左=${outside.L ? "外" : "内"} 右=${outside.R ? "外" : "内"}`);

    const teamsOf = (col, side) => {
      const pitch = (col.rows[0].y - col.rows.at(-1).y) / (col.rows.length - 1);
      const pick = (l) =>
        l.items.filter((i) => {
          if (!nonNumeric(i)) return false;
          const d = side === "L" ? col.x - i.x : i.x - col.x;
          return outside[side] ? d > 6 : d < -6 && d > -90;
        });
      return col.rows.map((r) => ({
        y: r.y,
        side,
        name: page.lines
          .filter((l) => Math.abs(l.y - r.y) < pitch * 0.48 && pick(l).length)
          .sort((a, b) => b.y - a.y)
          .map((l) => pick(l).map((i) => i.text).join("").replace(/[\s　]/g, ""))
          .join("")
          // ★**校名と同じ断片に入っている丸数字**（`至学館③`）はここで落とす
          .replace(/[①-⑳]/g, ""),
      }));
    };
    const teams = [...teamsOf(left, "L"), ...teamsOf(right, "R")];
    /*
      ★★**枝の線と、スロット番号の行は 6.7 ずれる**（2026-08-30 その2。第67回春）。
      **ずれは紙の大きさに比例する** —— 2018年以降の紙（行の間隔 16）では 2.6 だが、
      2015〜2017年の紙（行の間隔 41.5）では **6.7** あり、既定の 5.5 では届かない。
      ★**そのままだと、ほとんどの試合が「校名が読めない」で壊れる**（実測 45/95）。
      ★**行の間隔から測る**（既定より狭めない）。0.3 倍なら隣の行は拾わない。
    */
    const rowPitch = (left.rows[0].y - left.rows.at(-1).y) / (left.rows.length - 1);
    const nameTol = Math.max(5.5, rowPitch * 0.3);
    if (process.env.AICHI_DEBUG) console.log(`  [debug] 校名 ${teams.length}件: ${teams.map((t) => t.name || "★空").join("・")}`);
    if (teams.some((t) => !t.name)) return null;

    const built = assembleVectorBracket({
      shapes,
      page,
      teams,
      nameXLeft,
      nameXRight,
      centerX: (left.x + right.x) / 2,
      nameTol,
      /*
        ★**得点が枝の線にちょうど載っている**（球場と得点が1つの断片で、
        断片の中の位置は幅を文字数で割った見積もりしかない）。
        ★**列の間隔は 30 ポイント以上**あるので、4 では隣の回戦を拾わない。
      */
      scoreBack: 4,
      // ★決勝の得点は、出会う点から伸びる縦線のわきに 16.8 離れている
      finalScoreReach: 22,
      /*
        ★★**2017年春の紙は決勝の横線が左右とも赤で、真ん中が刷られていない。**
        色でも接点でも勝った側が決まらないので、**垂れている縦線から読む**
        （`vector-bracket.mjs` の `finalByStem` の説明を読むこと）。
        ★**色で決まる年はこの道を通らない**ので、他の年は1バイトも変わらない
        （2018〜2026年を再生成して確かめてある）。
        ★★**当て推量ではないことは、下の検算3（記事の本文が書いている優勝校との
        突き合わせ）で確かめている** —— 本文は**紙とは別の場所から来る事実**なので、
        stem の読み違えはそこで必ず捕まる。
      */
      finalByStem: true,
      /*
        ★**この紙の決勝の得点は線から 27.9 離れている**（他の年は 22 で届く）。
        ★**既定（`finalScoreReach`）を広げないこと** —— 2026-08-30 に決勝の得点の窓を
        広げたら、**2024年春の決勝が別の数字に静かに入れ替わった。**
        stem で読んだ決勝にだけ効く値を渡す。
      */
      finalScoreReachStem: 30,
    });
    if (process.env.AICHI_DEBUG) {
      console.log(`  [debug] ${built.games.length}試合 / 壊れ${built.broken.length}`);
      for (const g of built.broken) console.log(`  [debug]   壊れ: ${g.roundName} ${g.winner} ${g.winnerScore}-${g.loserScore} ${g.loser}`);
      for (const g of built.games) console.log(`  [debug]   ${g.roundName} x=${(g.x??0).toFixed(0)} ${g.winner} ${g.winnerScore}-${g.loserScore} ${g.loser}`);
    }
    if (!built.games.length || built.broken.length) return null;

    /*
      ★★**3位決定戦は勝ち抜きの枝ではないので出さない**（宮崎・沖縄と同じ）。

      秋季の紙は**紙のいちばん下に3位決定戦**を、**半分のいちばん内側の列と同じ x**
      に描いている（紙には `3位決定戦` と刷ってある）。そのままだと
      **その半分の最深の列に試合が2つ**でき、**「チーム数 − 試合数 = 1」が崩れる**
      （第78回は 49チームに49試合になった）。
      ★**さらに、その試合の校名は当てにならない** —— 枝が中央から降りてくるので
      `nameAt` が辿れず、**近くのスロットの校名を拾ってしまう。**

      ★**見分けるのは構造** —— **半分のいちばん内側の列の試合は、決勝に出る1つだけ。**
      決勝に出ない勝者の試合は勝ち抜きの枝ではない。
      ★**紙の「3位決定戦」の文字は使っていない**（無い年でも同じ判断ができる）。
    */
    const finalGame = built.games.reduce((a, b) => (b.round > a.round ? b : a));
    const finalists = new Set([finalGame.winner, finalGame.loser]);
    const inner = { L: -Infinity, R: Infinity };
    for (const g of built.games) {
      if (!Number.isFinite(g.x)) continue;
      const side = g.x < (left.x + right.x) / 2 ? "L" : "R";
      inner[side] = side === "L" ? Math.max(inner[side], g.x) : Math.min(inner[side], g.x);
    }
    const kept = built.games.filter((g) => {
      if (!Number.isFinite(g.x)) return true;
      const side = g.x < (left.x + right.x) / 2 ? "L" : "R";
      if (Math.abs(g.x - inner[side]) > 2.5) return true;
      return finalists.has(g.winner);
    });
    if (process.env.AICHI_DEBUG && kept.length !== built.games.length) {
      console.log(`  [debug] 3位決定戦とみて外した ${built.games.length - kept.length} 試合`);
    }

    const games = kept.map((g) => ({
      // ★**この紙の日付は枝の外**（`4/12`）。`labelsFor` と同じ窓では拾えないので入れない
      date: null,
      season,
      tournament,
      round: g.roundName,
      venue: null,
      teams: [
        { display: g.winner, score: g.winnerScore, won: true },
        { display: g.loser, score: g.loserScore, won: false },
      ],
    }));
    return { games, teams: teams.length };
  },

  /**
   * ★★★**スロット番号の列が無い左右2段組の紙**（2015・2016年）。2026-09-01 に追加。
   *
   * ------------------------------------------------------------------
   * ★ この紙で分かったこと（実データ）
   *
   *   - **枝は `eoFill`**（2015〜2017年と同じ）。読める
   *   - **スロット番号の列が無い**ので、校名の欄も中央も**縦線の列から測る**
   *   - ★★**シード記号 `①` は校名の欄の外側**（左 x=23／右 x=562）。
   *     **落とさないとその行の校名が丸ごと無効になる**（`①知立東` が弾かれる）
   *   - ★★**`normalize()`（NFKC）を通すと `①` は `1` になる**ので、
   *     **丸数字は生の文字列で見分けること**
   *   - ★★★**決勝は左右とも勝ち色で、真ん中の 34.4 の空きに優勝校が縦書き**
   *     （`優勝 中京大中京`）。**色でも縦線でも勝った側が決まらない。**
   *     しかも**3位決定戦のほうは赤と黒が接している**ので、
   *     色で決まる探し方がそちらを決勝として拾う。
   *     → `finalByScore`（`vector-bracket.mjs` の説明を読むこと）
   *   - ★**決勝の得点は空きをまたいで置かれる**（x=252 と 339・空きは 281〜315）。
   *     既定の窓（34）では届かないので `finalScoreSpan: 55`
   *
   * ★**検算は今までどおり**（壊れ0・チーム数 − 試合数 = 1・記事の優勝校と一致）。
   * ★**3位決定戦を外す仕掛けも同じ**（半分のいちばん内側の列で、決勝に出ない勝者）。
   */
  async readNoSlotSheet(shapes, vert, page0, season, tournament) {
    // ★縦線を列にまとめる（`vector-bracket.mjs` と同じ許容）
    const cols = [];
    for (const v of vert) {
      let c = cols.find((c) => Math.abs(c.x - v.x1) < 2.5);
      if (!c) cols.push((c = { x: v.x1, n: 0 }));
      c.n += 1;
    }
    if (cols.length < 4) return null;
    cols.sort((a, b) => a.x - b.x);
    /*
      ★**中央は「1本しか無い列」たちの中点**。
      決勝と3位決定戦の縦線がそこに並ぶので、外れても半分の割り振りは変わらない。
    */
    const single = cols.filter((c) => c.n === 1);
    const centerX = single.length
      ? (single[0].x + single.at(-1).x) / 2
      : (cols[0].x + cols.at(-1).x) / 2;
    /*
      ★★**シード記号（丸数字）を落とす。** 校名の欄の外側にあり、
      残すとその行の校名が丸ごと無効になる。★**生の文字列で見分けること**
      （NFKC を通すと `①` は `1` になり、得点と見分けが付かなくなる）。
    */
    const page = {
      page: page0.page,
      lines: page0.lines.map((l) => {
        const items = l.items.filter((i) => !/^[①-⑳]+$/.test(i.text.trim()));
        return { y: l.y, items, text: items.map((i) => i.text).join("\t") };
      }),
    };
    const built = assembleVectorBracket({
      shapes,
      page,
      nameXLeft: cols[0].x - 6,
      nameXRight: cols.at(-1).x + 6,
      centerX,
      /*
        ★★★**この紙は得点を「列の外側」に刷る**（2026-09-01 その4。実測）。

            2016年春 左half  列 123.8 / 152.6 / 181.6 / 210.9 / 240.0
                             得点 119.7 / 148.8 / 177.6 / 205.4 / 234.4   ← **列より左**
            2016年秋 左half  列 125.8 …  得点 128.2 …                     ← **列より右**

        ★**紙によって左右どちらにも出る**（右揃えか左揃えかの違い）ので、
        **列をまたいで前後に見る。** 2桁は箱が広いぶん 9.1 まで外へ出る。
        ★**列の間隔は 29** なので、前へ 10・内へ 14 なら隣の回戦の得点は入らない。
        ★**既定（内へ 32）のままだと 2016年春の左half の得点が1つも窓に入らず、
        1つ内側の回戦の得点を拾っていた。**
      */
      scoreBack: 10,
      scoreAhead: 14,
      /*
        ★★★**1試合の2つの得点は合流点をはさんで同じだけ離して刷ってある**
        （2026-09-01 その4。`vector-bracket.mjs` の `scorePairs` を読むこと）。
        ★**準決勝の枝は決勝の行まで伸びる**ので、**決勝の得点が準決勝の窓に入り、
        しかも x がほとんど同じ**（2016年春: 準決勝 x=234.4／決勝の左 x=234.7）。
        ★**離れかたで見ると外れる**（決勝の得点は合流点から 20.4、相手側は 150.5）。
      */
      scorePairs: true,
      finalScoreReach: 22,
      // ★決勝は左右とも勝ち色で、真ん中が空いている（上の説明）
      finalByScore: true,
      finalScoreSpan: 55,
      /*
        ★★★**決勝が「勝ち色と負け色なのに真ん中が空いている」紙**（2015・2016年の春季）。
        `vector-bracket.mjs` の `finalColorGap` を読むこと。**空きは実測 33.2〜33.4。**
      */
      finalColorGap: 40,
      /*
        ★★**枝の線と校名の行のずれは紙で違う**（2015年春は 5.8 ある）。
        ★**既定の 4 のままだと、そのずれた行が「枝の線が無い行」＝連合チームの2行目と
        見なされ、前の学校にくっつく** —— 実際に**2016年秋の生成物に
        `西尾東・誠信` `津島・愛知啓成` という実在しない校名が出ていた**
        （`愛知啓成 10-2 津島・愛知啓成` と、**同じ学校どうしの試合**にまでなっていた）。
        ★**行の間隔（20.6）の半分より小さいこと。**
      */
      slotLineTol: 7,
      nameTol: 8,
    });
    if (process.env.AICHI_DEBUG) {
      console.log(
        `  [debug] スロット列なしの紙: 縦線の列 ${cols.map((c) => `${c.x.toFixed(0)}(${c.n})`).join(" ")}` +
          ` 中央=${centerX.toFixed(0)} → ${built ? `${built.games.length}試合 / ${built.teamCount}チーム / 壊れ${built.broken.length}` : "組めなかった"}`,
      );
    }
    if (!built?.games.length || built.broken.length) return null;
    /*
      ★**3位決定戦は勝ち抜きの枝ではないので出さない**（下の `readTwoColumnSheet` と同じ）。
      **半分のいちばん内側の列の試合は、決勝に出る1つだけ。**
    */
    const finalGame = built.games.reduce((a, b) => (b.round > a.round ? b : a));
    const finalists = new Set([finalGame.winner, finalGame.loser]);
    const inner = { L: -Infinity, R: Infinity };
    for (const g of built.games) {
      if (!Number.isFinite(g.x)) continue;
      const side = g.x < centerX ? "L" : "R";
      inner[side] = side === "L" ? Math.max(inner[side], g.x) : Math.min(inner[side], g.x);
    }
    const kept = built.games.filter((g) => {
      if (!Number.isFinite(g.x)) return true;
      const side = g.x < centerX ? "L" : "R";
      if (Math.abs(g.x - inner[side]) > 2.5) return true;
      return finalists.has(g.winner);
    });
    const games = kept.map((g) => ({
      date: null,
      season,
      tournament,
      round: g.roundName,
      venue: null,
      teams: [
        { display: g.winner, score: g.winnerScore, won: true },
        { display: g.loser, score: g.loserScore, won: false },
      ],
    }));
    /*
      ★★★**紙の中央に、優勝校が縦書きで刷ってある**（2026-09-01 その4）。

          2015年春  中 部 大 第 一 ／ 初 優 勝
          2016年春  優 勝 ／ 享 栄
          2016年秋  優勝 ／ 中 京 大 中 京 ／ 7年ぶり ／ 22回目 ／ 第三位 ／ 至学館

      ★★**この年代の記事の本文には優勝校が書かれていない**（`printed.champion` が null）ので、
      **枝の外から来る事実はここにしか無い。**
      ★★**書き方が年で違うので「優勝の次が校名」と読まないこと** ——
      **組み立てた優勝校が、この縦書きの中に出てくるか**だけを見る。
      **当て推量にならず、決勝を左右あべこべに読めば必ず落ちる。**
      ★**数字を含む断片は落とす**（`7年ぶり` `22回目` `②12時30分`）。
    */
    const band = { L: cols.filter((c) => c.x < centerX).at(-1)?.x, R: cols.find((c) => c.x > centerX)?.x };
    /*
      ★★**読むのは「1本の縦書きの列」だけ**（2026-09-01 その4）。
      ★**2017年秋の紙は、同じ帯に結果を横書きで刷っている**
      （`優勝：東邦` `準優勝：愛産大三河` `3位：中京大中京` `決勝戦`）。
      **帯の断片を順につなぐと「邦戦定戦桜」のような字の列になり、
      正しく組み立てた大会まで落ちる**（実際に落ちた）。
      ★**縦書きの列は「同じ x に3つ以上の断片が並ぶ」ことで見分けられる。**
      ★**見分けが付かない紙では何も要求しない**（他の検算はそのまま効く）。
    */
    const centerText = (() => {
      if (band.L == null || band.R == null) return "";
      const items = page.lines
        .slice()
        .sort((a, b) => b.y - a.y)
        .flatMap((l) => l.items.filter((i) => i.x > band.L && i.x < band.R))
        .map((i) => ({ x: i.x, t: normalize(i.text).replace(/[\s　]/g, "") }))
        .filter((i) => i.t && !/[0-9]/.test(i.t) && /^[一-龥ぁ-んァ-ヶー々]+$/.test(i.t));
      const columns = [];
      for (const i of items) {
        const c = columns.find((c) => Math.abs(c.x - i.x) <= 3);
        if (c) c.items.push(i);
        else columns.push({ x: i.x, items: [i] });
      }
      const best = columns.sort((a, b) => b.items.length - a.items.length)[0];
      return best && best.items.length >= 3 ? best.items.map((i) => i.t).join("") : "";
    })();
    return { games, teams: built.teamCount, centerText };
  },

  /**
   * 枝の線から1枚（1ブロック）を読む。
   * ★**校名は呼ぶ側で作って渡す**（連合チームが2行に組まれるため。上の説明を読むこと）。
   */
  async readVectorSheet(bytes, rawPage, season, tournament) {
    const shapes = await readFilledShapes(bytes.slice(), { pageNumber: rawPage.page, ops: ["fill"] });
    const vert = shapes.filter((s) => s.w < 3 && s.h >= 4);
    if (!vert.length) return null;
    const slot = this.slotColumn(rawPage);
    if (!slot) return null;
    const pitch = (slot.rows[0].y - slot.rows.at(-1).y) / (slot.rows.length - 1);
    if (!(pitch > 0)) return null;

    /*
      ★★**シードの行にはスロット番号が無く、ブロックの記号（A〜H）が入る。**
      番号の列の**1つ上の行**を見て、記号があればその行も1チームとして数える。
    */
    const letter = rawPage.lines.find(
      (l) =>
        Math.abs(l.y - (slot.rows[0].y + pitch)) <= pitch * 0.4 &&
        l.items.some((i) => Math.abs(i.x - slot.x) <= 7 && /^[A-HＡ-Ｈ]$/.test(i.text.trim())),
    );
    const rows = [...(letter ? [letter.y] : []), ...slot.rows.map((r) => r.y)];

    /*
      ★**校名はスロット番号の列のどちら側にもありうる。**
      ブロックの紙は左（参加校番号の右どなり）、2021年の準々決勝以降の紙は右。
      **数字でない断片が多いほうを校名の側**とする。
    */
    const nonNumeric = (i) => !/^\d+$/.test(normalize(i.text).trim());
    const near = (y) => rawPage.lines.filter((l) => Math.abs(l.y - y) < pitch * 0.48);
    /*
      ★★**枝でない縦線がある**（2021年の準々決勝以降の紙は、左右の端に囲みの線が1本ずつ）。
      いちばん左を素直に採ると x=64 になり、**校名の欄が幅0になって1校も読めない。**
      ★**枝の列には必ず2本以上（勝ち側と負け側）ある**ので、そこで見分ける。
    */
    const colCount = new Map();
    for (const s of vert) {
      const key = [...colCount.keys()].find((k) => Math.abs(k - s.x1) < 2.5) ?? s.x1;
      colCount.set(key, (colCount.get(key) ?? 0) + 1);
    }
    const bracketCols = [...colCount].filter(([, n]) => n >= 2).map(([x]) => x);
    if (!bracketCols.length) return null;
    const firstCol = Math.min(...bracketCols);
    /*
      ★★**日付・球場・開始時刻は、いちばん外の枝の列のすぐ左に刷ってある。**
      校名の欄をそこまで広げると、**球場名（`豊田`）が校名として読まれる**
      （校名と見分けが付かない）。実測すると、いちばん外の列から
      **ラベルは 62 ポイント以内・校名は 89 ポイント以上**離れている。**70 で切る。**
    */
    const nameRight = firstCol - 70;
    const leftCount = rows.reduce(
      (n, y) => n + near(y).flatMap((l) => l.items).filter((i) => i.x < slot.x - 6 && nonNumeric(i)).length,
      0,
    );
    const rightCount = rows.reduce(
      (n, y) =>
        n +
        near(y)
          .flatMap((l) => l.items)
          .filter((i) => i.x > slot.x + 6 && i.x < nameRight && nonNumeric(i)).length,
      0,
    );
    const onLeft = leftCount >= rightCount;
    const nameItems = (l) =>
      l.items.filter(
        (i) => nonNumeric(i) && (onLeft ? i.x < slot.x - 6 : i.x > slot.x + 6 && i.x < nameRight),
      );
    const teams = rows.map((y) => ({
      y,
      side: "L",
      name: near(y)
        .filter((l) => nameItems(l).length)
        .sort((a, b) => b.y - a.y)
        .map((l) => nameItems(l).map((i) => i.text).join("").replace(/[\s　]/g, ""))
        .join(""),
    }));
    if (teams.some((t) => !t.name)) return null;

    const page = this.splitFragments(rawPage);
    const built = assembleVectorBracket({
      shapes,
      page,
      teams,
      // ★スロット番号の列より外は見ない（参加校番号を校名に混ぜない）
      nameXLeft: onLeft ? slot.x - 6 : 1e9,
      nameXRight: 1e9,
      centerX: 1e9,
      /*
        ★**いちばん端の行だけ枝の線と校名が 6.4 ずれる紙がある**（第103回Bブロック）。
        行の間隔の 0.3 までなら隣の行は拾わない（`teamAt` はいちばん近い行を採る）。
      */
      nameTol: pitch * 0.3,
      roundNames: ["1回戦", "2回戦", "3回戦", "4回戦", "5回戦", "6回戦", "7回戦"],
    });
    if (!built.games.length) return null;

    /*
      ★★**不戦勝は得点が刷られていない**（紙に `不戦勝` と書いてある）。
      **枠は使うが試合は行われていない**ので、**画面には出さず、検算には数える。**
      ★**0対0にしないこと**（島根で踏んだ轍）。
    */
    const walkovers = [];
    for (const g of built.broken) {
      if (g.winnerScore != null || g.loserScore != null) return null;
      const lo = Math.min(g.winY, g.loseY) - 2;
      const hi = Math.max(g.winY, g.loseY) + 2;
      const marked = page.lines.some(
        (l) => l.y > lo && l.y < hi && l.items.some((i) => /不戦/.test(i.text) && i.x > g.x - 40 && i.x < g.x + 80),
      );
      if (!marked) return null;
      walkovers.push(g);
    }

    const games = [];
    for (const g of built.games) {
      if (walkovers.includes(g)) continue;
      const label = this.labelsFor(page, g);
      games.push({
        date: label.date ? this.isoOf(`${label.date.month}/${label.date.day}`, tournament) : null,
        season,
        tournament,
        round: g.roundName,
        venue: label.venue,
        teams: [
          { display: g.winner, score: g.winnerScore, won: true },
          { display: g.loser, score: g.loserScore, won: false },
        ],
      });
    }
    const champion = built.games.reduce((a, b) => (b.round > a.round ? b : a)).winner;
    return { games, champion, teams: teams.length, byes: walkovers.length };
  },

  /**
   * その試合の日付と球場。
   * ★**縦線のすぐ左（外側）に、日付・球場・開始時刻が刷ってある。**
   * 前の回戦の欄を拾わないよう、**列の間隔の内側だけ**を見る。
   */
  labelsFor(page, g) {
    /*
      ★**日付・球場は縦線のすぐ左に刷ってある。** 窓の広さは
      **列の間隔（ブロックの紙は39・準々決勝以降の紙は80）より狭く、
      いちばん遠いラベル（実測55）より広く**取る。
      ★**62 では 2021年の準々決勝以降の紙の日付（列から 63.6）が入らず、
      7試合が日付なしになる。**
    */
    const LABEL_REACH = 66;
    const lo = Math.min(g.winY, g.loseY) - 2;
    const hi = Math.max(g.winY, g.loseY) + 2;
    /*
      ★★**日付が1文字ずつの断片に割れている紙がある**（`7` `月` `29` `日`。2021年）。
      **断片1つで `M月D日` を探すと、その3試合だけ日付が付かない。**
      ★**行の中の断片をつないでから探す**（つないでも `豊田11:150` のように
      日付にならない行は当たらない）。
    */
    const md = page.lines
      .filter((l) => l.y > lo && l.y < hi)
      .map((l) =>
        normalize(
          l.items
            .filter((i) => i.x < g.x && i.x > g.x - LABEL_REACH)
            .map((i) => i.text)
            .join(""),
        ).match(/(\d{1,2})月(\d{1,2})日/),
      )
      .find(Boolean);
    // ★球場は「開始時刻の断片のすぐ左」。時刻が無ければ諦める（推測で埋めない）
    let venue = null;
    for (const l of page.lines) {
      if (l.y <= lo || l.y >= hi) continue;
      for (let k = 1; k < l.items.length; k++) {
        const it = l.items[k];
        if (!/^\d{1,2}[:：]\d{2}$/.test(normalize(it.text).trim())) continue;
        if (it.x >= g.x || it.x < g.x - LABEL_REACH) continue;
        const before = l.items[k - 1];
        if (/^[一-龥ぁ-んァ-ヶー]+[①-⑳]?$/.test(before.text.trim())) venue = before.text.trim();
      }
    }
    return { date: md ? { month: Number(md[1]), day: Number(md[2]) } : null, venue };
  },

  /**
   * 準々決勝以降の紙。
   * ★**向きが2つある** —— 横向き（京都型）は `assembleSlotBracket`、
   * 縦向き（2021年）は枝の線から読む。**先に横向きを試す。**
   */
  async readFinalSheet(sheet, season, tournament) {
    const raw = sheet.pages[0];
    /*
      ★★**ブロックの記号（A〜H）と、紙のいちばん下の注記を落とす。**
      落とさないと校名が **`E享栄（若番が１塁側）`** になり、どの学校にも結び付かない
      （**枚をまたぐ検算も落ちる** —— ブロックの紙の優勝校は `享栄` なので）。
      ★**1文字の A〜H が校名であることはない**ので、そのまま落としてよい。
    */
    const page = {
      page: raw.page,
      lines: raw.lines
        .map((l) => {
          const items = l.items.filter((i) => {
            const t = i.text.trim();
            if (/^[（(]/.test(t)) return false;
            if (/^[A-HＡ-Ｈ]$/.test(t)) return false;
            return true;
          });
          return { y: l.y, items, text: items.map((i) => i.text).join("\t") };
        })
        .filter((l) => l.items.length),
    };

    const built = assembleSlotBracket(page, {
      roundLabels: ["決勝", "準決勝", "準々決勝"],
      // ★準決勝・決勝の得点は連結線の両端に置かれる（中点では当たらない）
      hitSpan: true,
    });
    if (built?.games?.length) {
      const games = built.games.map((g) => ({
        date: g.date ? this.isoOf(g.date, tournament) : null,
        season,
        tournament,
        round: g.round,
        venue: g.venue ?? null,
        teams: [
          { display: g.a, score: g.sa, won: g.sa > g.sb },
          { display: g.b, score: g.sb, won: g.sb > g.sa },
        ],
      }));
      // ★出場校は「いちばん浅い回戦（＝準々決勝）に出ている校」
      const first = built.games.filter((g) => g.round === "準々決勝");
      return {
        games,
        entrants: (first.length ? first : built.games).flatMap((g) => [g.a, g.b]),
      };
    }

    // ---- 縦向きの紙（枝の線から読む） ----
    const read = await this.readVectorSheet(sheet.bytes, raw, season, tournament);
    if (!read) return null;
    const first = read.games.filter((g) => g.round === "1回戦");
    return {
      games: read.games.map((g) => ({
        ...g,
        round: { "1回戦": "準々決勝", "2回戦": "準決勝", "3回戦": "決勝" }[g.round] ?? g.round,
      })),
      entrants: (first.length ? first : read.games).flatMap((g) => g.teams.map((t) => t.display)),
    };
  },

  /** `M/D` を大会の年の ISO 日付にする */
  isoOf(md, tournament) {
    const year = Number(tournament.match(/第(\d+)回/)?.[1]) + 1918;
    const [m, d] = String(md).split("/").map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  },

  /**
   * ★★**開催中の大会だけ CATVase.jp から補う。**
   * 連盟の記事は大会が終わってから出るので、そこまでは連盟に何も無い。
   * ★**連盟が同じ大会を持っているときは何もしない**（二重に並ぶ）。
   */
  async fillFromCatvase({ fetchHtml, season, games }) {
    const have = new Set(games.map((g) => g.tournament));
    const html = await fetchHtml(this.catvaseUrl);
    if (!html) return [];
    const tournament = normalize(html).match(/第\d+回全国高等学校野球選手権愛知大会/)?.[0] ?? null;
    const round = Number(tournament?.match(/第(\d+)回/)?.[1]);
    if (!Number.isFinite(round) || have.has(tournament)) return [];
    const pageYear = round + 1918;
    if (pageYear > new Date().getFullYear()) return [];

    /*
      ★**ページに西暦が書かれていない**（日付は「7月28日 (火)」）。
      **曜日を併記している**ので、そこで年を検算する。合わなければその日は捨てる。
    */
    const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];
    const out = [];
    let date = null;
    const token =
      /<p class="game_day">([\s\S]*?)<\/p>|<a href="https:\/\/catvase\.jp\/game-\d+\/">([\s\S]*?)<\/a>/gi;
    for (const m of html.matchAll(token)) {
      if (m[1] !== undefined) {
        const d = normalize(plain(m[1])).match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*[(（]([日月火水木金土])/);
        date = null;
        if (!d) continue;
        const iso = `${pageYear}-${d[1].padStart(2, "0")}-${d[2].padStart(2, "0")}`;
        if (WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()] !== d[3]) {
          console.log(`  ⚠️ 愛知: ${iso} の曜日が出典（${d[3]}）と合わない。その日は採らない`);
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
      // ★まだ行われていない試合は点が空。`Number("")` は 0 なので数字かどうかで見る
      if (!home || !away || !/^\d+$/.test(sa) || !/^\d+$/.test(sb)) continue;
      const label = pick(/<p class="block">([\s\S]*?)<\/p>/);
      const a = Number(sa);
      const b = Number(sb);
      out.push({
        date,
        season,
        tournament,
        round: pickRound(label),
        venue: pick(/<span class="display_pc">([\s\S]*?)<\/span>/) || null,
        // ★**出典が連盟と違う。** 富山と同じで、その試合だけの出所を持たせる
        source: { name: this.catvaseName, url: this.catvaseUrl },
        teams: [
          { display: home, score: a, won: a > b },
          { display: away, score: b, won: b > a },
        ],
      });
    }

    /*
      ★**中断した試合は2回載る**（`試合打ち切り` と `継続試合`）。
      勝ち抜き戦なので同じ2校が2度当たることはない。**新しい日付のほうだけ残す。**
    */
    const byPair = new Map();
    for (const g of out) {
      const key = g.teams.map((t) => normalizeSchoolName(t.display)).sort().join("\t");
      const kept = byPair.get(key);
      if (!kept || g.date > kept.date) byPair.set(key, g);
    }
    if (byPair.size) {
      console.log(`  （${tournament}: ${byPair.size} 試合を ${this.catvaseName} から補った）`);
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
  /*
    ★★**春・夏・秋の3季**（春季・秋季は 2026-08-27 に追加）。
    ~~春季は表の形が違う~~ とあったのは誤りで、**2次戦の紙は夏と同じ京都型**
    （スロット番号が横一列・校名は縦書き・回戦は上へ）。

    ★**入口はどの季節も同じ「大会」のページ。** そこに並ぶ Drive のPDFを開いて、
    **表題で季節を見分ける**（春季近畿地区大会の紙も同じページにある）。

    ★★**過去年は取れない。** `/tournament/r07/` のような年度のページはあるが、
    **【組み合わせ・結果】のリンクが外されていて**PDFが1つも無い（2022〜2025年度とも）。
    **`--year` で過去年を取りに行っても0件**になる（紙の年と突き合わせて落とす）。
  */
  seasons: {
    summer: "https://kyoto-hsbf.sakura.ne.jp/khsbf/tournament/",
    spring: "https://kyoto-hsbf.sakura.ne.jp/khsbf/tournament/",
    autumn: "https://kyoto-hsbf.sakura.ne.jp/khsbf/tournament/",
  },
  /**
   * 季節ごとの表題。★**春季近畿地区大会の紙を拾わないこと**
   * （同じページにあり、`京都府高等学校野球大会` に当たらないので混ざらない）。
   */
  TITLES: {
    summer: /第\d+回全国高等学校野球選手権京都大会/,
    spring: /春季京都府高等学校野球大会/,
    autumn: /秋季京都府高等学校野球大会/,
  },
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
  async collect({ fetchHtml, season, url, year: want }) {
    const index = await fetchHtml(url);
    if (!index) return [];

    /*
      ★**IDを直書きせず、大会ページから拾う。** 同じページに春季・近畿大会の
      PDFも並んでいるので、**開いてみて目当ての季節の表だったものだけ使う。**
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
        const tournament = flat.map((t) => t.match(this.TITLES[season])?.[0]).find(Boolean);
        if (!tournament) continue;

        /*
          ★**年の出しかたが季節で違う**（2026-08-27）。
            夏 … 選手権の回数（年 − 1918）
            春秋 … 紙の**「令和N年度」**（春は4〜5月・秋は8〜10月なので年度＝暦年）
          ★**取りに行った年と食い違ったら1試合も出さない**
          （過去年のページにはPDFが無いので、そこへ来るのは前の年の紙を掴んだとき）。
        */
        const round = Number(tournament.match(/第(\d+)回/)?.[1]);
        const era = flat.map((t) => t.match(/(令和|平成)\s*(元|\d+)\s*年度/)).find(Boolean);
        const year = Number.isFinite(round)
          ? round + 1918
          : era
            ? (era[1] === "令和" ? 2018 : 1988) + (era[2] === "元" ? 1 : Number(era[2]))
            : null;
        if (year === null) {
          console.log(`  ⚠️ 京都: ${tournament} の年が読めない（回数も元号も無い）。1試合も出さない`);
          return [];
        }
        if (want && year !== want) {
          console.log(`  （京都: ${tournament} は ${year} 年の紙。${want} 年を取りに来ているので使わない）`);
          continue;
        }

        const venues = this.venueLegend(page);
        const built = assembleSlotBracket(page, {
          roundLabels: ["決勝", "準決勝", "準々決勝"],
          venueSymbols: new Set(venues.keys()),
          /*
            ★★**春季・秋季の紙は日付を `5月10日` と書く**（夏は `7/4`。2026-08-27）。
            組み立て側は `M/D` の形しか見ないので、**15試合すべてが日付なしで落ちていた。**
            ★**`M月D日` のときだけ `M/D` に直す**（当たらなければ既定の読み方に任せる＝夏は変わらない）。
          */
          parseLabel: (t) => {
            const m = normalize(String(t).trim()).match(/^(\d{1,2})月(\d{1,2})日$/);
            return m ? { date: `${m[1]}/${m[2]}` } : null;
          },
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

        /*
          ---- 検算2: 表に印字された優勝校 ----
          ★**行の先頭にあるとは限らない**（2026-08-27。春季の紙は
          `太陽が丘球場、京丹後夢球場 ⋮ 優勝 ⋮ 龍谷大学付属平安高等学校（９年ぶり29回目）`）。
          **行の途中の「優勝」も拾う。**
        */
        const printedChampion =
          flat.find((t) => /^優勝/.test(t))?.replace(/^優勝\s*/, "") ??
          flat.map((t) => t.match(/優勝\s*([^\s（(]+高等学校)/)?.[1]).find(Boolean);
        if (printedChampion) {
          const bare = normalizeSchoolName(printedChampion.replace(/[（(].*$/, "").replace(/高等学校$/, ""));
          /*
            ★★**紙は正式名、枝は略称**（2026-08-27。春季）。
            `龍谷大学付属平安高等学校` に対し枝は `龍谷大平安`（欄が狭いので略す）。
            **先頭一致では当たらない**（`学`『付属』が抜けている）。
            ★**枝の校名が紙の校名の「部分列」なら同じとみなす**（兵庫で決めたやり方）。
            ★**緩めるのは校名の比べ方だけ** —— 枝のほうは「無敗が1校」で決まっており、
            **決勝の相手が違えばそこで食い違う。**
          */
          const subsequence = (short, long) => {
            let i = 0;
            for (const c of long) if (c === short[i]) i++;
            return i === short.length;
          };
          const champ = normalizeSchoolName(built.champion ?? "");
          if (built.champion && !bare.startsWith(champ) && !subsequence(champ, bare)) {
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
/**
 * ★★**大会名の頭に西暦を足す**（2026-08-27。宮崎の春季・秋季のため）。
 *
 * ------------------------------------------------------------------
 * ★ なぜ要るのか
 *
 *   宮崎の春季・秋季は **`第158回九州地区高等学校野球大会宮崎県予選`** という名前で、
 *   **回数は九州地区大会の通し番号**（年とは無関係）。しかも**紙に日付が1つも無い。**
 *   そのままだと `yearOfTournament` が年を出せず、**「年の分からない大会」**として
 *   別枠に出る。★**同じ季節の2年ぶんが並ぶと、どちらが今年か分からない。**
 *
 *   ★**年は紙の「期日」から読んである**（推測ではない）ので、名前に足してよい。
 *   ★**書き方は奈良に合わせて西暦**（運営者の指示「西暦で統一したほうが分かりやすい」）。
 *
 * ★**夏（選手権）には足さない** —— `第N回…選手権` から年が出るので要らないし、
 * 他県の夏と名前の形をそろえておきたい。
 *
 * ★★**名前を変えると引き継ぎの鍵も変わる**（鍵は `大会名＋年`）。
 * **足した／変えたときは、生成物を消してから年ごとに走らせ直すこと** ——
 * そのまま遡ると、古い名前のぶんが引き継がれて**同じ大会が2つ入る**（実際に入った）。
 */
const withYear = (games, year) =>
  games?.map((g) => (g.tournament ? { ...g, tournament: `${year}年 ${g.tournament}` } : g)) ?? games;

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
     * ★★**回戦の帯をまとめる幅の上限**（2026-08-27。鹿児島のため）。
     * 渡さなければ今までどおり（`slot-bracket.mjs` の既定）。
     *
     * ★**深い回戦ほど帯の間隔が狭くなる紙**では、既定の「1つ前の回戦との間隔の 0.45 倍」が
     * 広すぎて**1つ深い回戦の得点を巻き込む**（鹿児島の秋季は準々決勝↔準決勝が 40 ポイント、
     * 準決勝↔決勝が 16 ポイント）。
     * ★★**この引数は前から `slot-bracket.mjs` にあったのに、ここから渡していなかった**
     * （他県は `assembleSlotBracket` を直に呼んでいるので気づかれていなかった）。
     */
    roundBandGap,
    /** ★**帯を断片の中の数字の位置でまとめる**（鹿児島）。`orientPage` の説明を読むこと */
    bandAtCenter,
    /** ★**コールドの丸数字がスコアの前に付く紙**（鹿児島の `⑥11`）。`slot-bracket.mjs` を読むこと */
    leadingInningMark,
    /** ★**断片がスロット軸に広がらない紙**（鹿児島）。`slot-bracket.mjs` を読むこと */
    flatFragments,
    /*
      ★★**決勝にだけ日付が刷られていない紙がある**（2026-08-27。鹿児島の第106回）。

      同じ県でも**年によって違う** —— 第108回は決勝の日付（`県25日10：05`）があり、
      第106回は**準決勝2つの `25日` までしか無い**（大会は7月27日まである）。
      ★**`datesExcludeFinal`（静岡）のように決め打ちで外すと、
      日付のある年の検算が1件ぶん緩む。**
      ★**決勝の日付が読めたかどうかで、要る枚数を決める。**
      枝の試合の検算はそのまま（1件も欠けたら落とす）。
    */
    finalDateOptional = false,
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
    /*
      ★★**中央の走査の下限**（2026-08-21。宮崎の春季のため）。

      `finalAt: "innermost"` は「境目をはさむ組のうちいちばん内側」を決勝とするが、
      ★**3位決定戦が決勝の下に縦に並ぶ表では、これが逆転することがある。**
      宮崎の春季（2026）は **決勝が幅16（x=287/303）／3位決定戦が幅15（x=287/302）**で、
      **3位決定戦のほうが内側**（秋は決勝15 対 3決41で、向きが逆）。
      ★**取り違えると画面に嘘の決勝スコアが出る。**

      ★**幅の大小では決められない**ので、紙の区画で決める。
      宮崎の春は中央に**【3位決定戦】のラベル**が刷ってあり、
      **その下が3位決定戦の区画**（両校名も縦書きでラベルの下にある）。
      **ラベルの y を渡して、それより下を中央の走査から丸ごと外す。**

      ★**渡さなければ今までどおり紙の全体を走査する**（他県は1行も変わらない）。
    */
    centerFloor,
    /*
      ★★★**スロット番号が下から上へ振ってある半分がある**（2026-09-01 その7。広島の2024年）。

        2026年の紙 … 左 1→43・右 43→85 で、**どちらも上から下へ増える**
        2024年の紙 … 左 1→43 は上から下だが、**右は 86→44**（下へ行くほど減る）

      ★**`assembleSlotBracket` は「上から順に 1,2,3…」を前提**にしているので、
      逆さの半分では**連番が1つも見つからず**「スロット番号が3個しか連番になっていない」
      で組み立てに入る前に落ちる。
      ★**向きを渡された半分だけ、入れ替える前に y を反転する**（`flip` は回戦の向きで別物）。
      ★**既定は両方 false**（既存の県は1行も変わらない）。
    */
    mirrorSlots = [false, false],
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
      orientPage(mirrorSlots[i] ? { page: page.page, lines: page.lines.map((l) => ({ ...l, y: -l.y })) } : page, {
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
        bandAtCenter,
      }),
      {
        roundLabels: LABELS,
        venueSymbols: symbols,
        nameOrder: nameOrder[i],
        roundBandGap,
        leadingInningMark,
        flatFragments,
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
  /*
    ★**`centerFloor` より下は中央の走査から外す**（3位決定戦の区画。宮崎の春季）。
    ここで外すので、決勝の探索だけでなく**日付・球場を拾う `nearest` にも効く。**
  */
  const mid = items.filter(
    (i) => Math.abs(i.x - half) < half * 0.2 && (centerFloor === undefined || i.y > centerFloor),
  );

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
  /*
    ★★**枝に日付が無い紙（`hasDates: false`）では、決勝にも日付を付けない**
    （2026-08-27。宮崎の2025年夏で踏んだ）。

    その紙は枝に日付を持たないのに、**中央にだけ決勝の日付が刷ってある**ことがある
    （`7/26`）。素直に拾うと**44試合のうち1試合だけが日付を持つ**大会になり、
    ★★**県のページが古い大会を出す** —— `latestSeasonGames` は
    **「試合の日付がいちばん新しい大会」を先に見る**ので、
    **日付を1つ持つ2025年の大会が、日付を1つも持たない2026年の大会に勝つ。**
    ★**検算も警告も通る。画面を見るまで気づけない壊れ方。**

    ★**日付そのものは紙に書いてあるので嘘ではない**が、
    **1試合だけ持つと害になる**ので落とす（`hasDates: true` の県は1行も変わらない）。
  */
  const finalDate =
    hasDates === false
      ? null
      : (fromLabel?.date ??
        finalPair?.date ??
        nearest(mid.filter((i) => /^\d{1,2}\/\d{1,2}[(（]?$/.test(i.t)))?.t.replace(/[(（]$/, ""));
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
    /*
      ★★★**決勝にだけ日付が刷られていない紙がある**（2026-08-27。鹿児島）。

      同じ県でも年で違う —— 第108回は決勝の日付があり（ラベル61件＝試合61件）、
      **第106回と第157回はラベルが試合より1件少ない。**

      ★★**このとき決勝に付いている日付は、別の試合のラベルを拾ったもの。**
      中央の窓は準決勝のラベルにも届くので、**放っておくと画面に嘘の日付が出る**
      （第157回は準決勝の 10/9 が決勝の日付になっていた）。
      ★**ラベルが1件足りないときは、決勝の日付を捨てて `null` で出す。**
      ★**枝の試合の検算は緩めない**（1件でも日付が読めなければ落とす）。
    */
    if (finalDateOptional && printed === built.length - 1 && built.at(-1).date) {
      console.log(
        `  ⚠️ ${district}: 紙の日付が試合より1件少ない。決勝の日付は刷られていないとみて捨てる` +
          `（拾っていたのは ${built.at(-1).date}）`,
      );
      built.at(-1).date = null;
    }
    /** ★★決勝の日付が紙に無い年もある（鹿児島）。**読めたときだけ1件ぶん数える** */
    const skipFinal = datesExcludeFinal || (finalDateOptional && !built.at(-1).date);
    const branches = skipFinal ? built.slice(0, -1) : built;
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
      const missing = branches.filter((g) => !g.date);
      console.log(
        `  ⚠️ ${district}: 日付の読めない試合が ${missing.length} 件ある。1試合も出さない` +
          `（${missing.slice(0, 3).map((g) => `${g.round} ${g.a} ${g.sa}-${g.sb} ${g.b}`).join(" / ")}）`,
      );
      return [];
    }
    // ★決勝の日付だけは、読めなくても推測で埋めずに null のまま出す
    if (skipFinal && !built.at(-1).date) {
      console.log(`  ⚠️ ${district}: 決勝の日付が紙から読めなかった。決勝だけ日付なしで出す`);
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
  /*
    ★★**夏だけ**（2026-09-01 その7 に春季・秋季を試して戻した）。

    ★**紙は同じページに並んでいて、大会名も読める**（下の `TITLES` に形が書いてある）が、
    **左右2段組ではなかった** —— 令和8年度春季の紙はスロット番号の連番が
    **左 9 個・右 16 個**で左右に割れておらず、`readTwoColumnBracket` の前提
    （半分ずつ組んで中央でつなぐ）に合わない。実際、両方の半分が組み立てに落ちる。
    ★**`seasons` に足すと、毎回の実行で警告だけが2本出る**ので戻してある。
    ★**次に触る人へ**: 春季・秋季は**1段の紙**として別の読み手が要る（README を読むこと）。
  */
  seasons: {
    summer:
      "https://hiroshima.hhbf1950.or.jp/%E5%A4%A7%E4%BC%9A%E9%96%A2%E9%80%A3/%E7%A1%AC%E5%BC%8F%E9%83%A8%E5%90%84%E7%A8%AE%E5%A4%A7%E4%BC%9A",
  },
  /**
   * 季節ごとの大会名と、年の出し方。
   *
   * ★**夏だけ「第N回」から年が出る**（N + 1918）。
   * ★★**春季・秋季は元号年度**（`令和８年度春季広島県高校野球大会（知事杯）…`）。
   *   **回数（第146回）は中国地区大会の通し番号**なので年には使えない
   *   （宮崎の「第158回」・福井の「第154回」と同じ）。
   * ★**「高校野球大会」と「高等学校野球大会」が季節で違う。** 寄せないこと。
   * ★**春季・秋季はいま `seasons` に入れていない**（上の説明）。
   *   **紙の題の形を測ってあるので、読み手ができたらそのまま使える。**
   */
  TITLES: {
    spring: {
      re: /令和\d+年度春季広島県高校野球大会/,
      year: (t) => 2018 + Number(normalize(t).match(/令和(\d+)年度/)[1]),
    },
    summer: {
      re: /第\d+回全国高等学校野球選手権広島大会/,
      year: (t) => Number(t.match(/第(\d+)回/)[1]) + 1918,
    },
    autumn: {
      re: /令和\d+年度秋季広島県高等学校野球大会/,
      year: (t) => 2018 + Number(normalize(t).match(/令和(\d+)年度/)[1]),
    },
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
  /*
    ★★★**過去の大会は「硬式部 各種大会」の中の「過去の大会」から**（2026-09-01 その7）。

    ★**トップページには入口が無い**（前のメモの「リンクが見つからない」はそのため）。
    **年度ごとに Google Sites が別に立っている**が、中の作りはいまの年と同じ
    （`drive.google.com/file/d/…` の組み合わせ表PDF）。

      大会関連 → 硬式部 各種大会 → 過去の大会
        https://sites.google.com/view/taikaikankei/大会関係過年度
          令和６(2024)年度 … /view/taikaikankei/大会関係過年度/令和年度   （PDFはこのページに直接ある）
          令和７(2025)年度 … /view/r7taikai/令和年度各種大会              （**子ページ「硬式部各種大会」にある**）

    ★★**「試合結果」のリンクはバーチャル高校野球と一球速報**なので**そこからは取らない。**
    取れるのは**組み合わせ表のPDFだけ**（大会が終わると結果が刷り込まれる）。
  */
  pastIndexUrl: "https://sites.google.com/view/taikaikankei/%E5%A4%A7%E4%BC%9A%E9%96%A2%E4%BF%82%E9%81%8E%E5%B9%B4%E5%BA%A6",
  /** 何枚まで開いて表題を見るか。**リンク名では大会を見分けられない**（下の説明） */
  maxSheets: 8,
  /**
   * ★**Google Sites のリンクは「外部へ飛ぶ」と `google.com/url?q=…` で包まれる。**
   * 包みを剥がさないと同じサイトの中かどうかも分からない。
   */
  unwrap(href) {
    const m = /^https:\/\/www\.google\.com\/url\?q=([^&]+)/.exec(href);
    return m ? decodeURIComponent(m[1]) : href;
  },
  /**
   * ★★**リンク名の入り方が年で違う**（2026-09-01 に実測）。
   *
   *   いまの年（2026）… `aria-label="組み合わせ表"`（`<a>` の中は画像だけ）
   *   令和6年度（2024）… **`aria-label` が無く、`<a>` の中の文字が
   *                        `組み合わせ表（PDF形式）`**
   *
   * ★**片方だけを見ていると、その年のPDFが1枚も拾えない**（実際に0枚だった）。
   */
  sheetIds(html) {
    const out = [];
    for (const m of html.matchAll(
      /<a\b[^>]*href="https:\/\/drive\.google\.com\/file\/d\/([\w-]{20,})\/view[^"]*"[^>]*>([\s\S]{0,300}?)<\/a>/g,
    )) {
      const label = (m[0].match(/aria-label="([^"]*)"/)?.[1] ?? m[2].replace(/<[^>]+>/g, ""))
        .replace(/\s+/g, " ")
        .trim();
      // ★「組み合わせ表（ベスト16）」は途中経過、「地区予選」は別の紙
      if (!/組\s*み?\s*合\s*わ?\s*せ\s*表/.test(label)) continue;
      if (/ベスト|地区予選|各地区/.test(label)) continue;
      if (!out.includes(m[1])) out.push(m[1]);
    }
    return out;
  },
  /** 年 → その年度のページ（複数）。**約束のまま持つ**（季節ごとに取り直さない） */
  _pastHtml: new Map(),
  pastPages(fetchHtml, year) {
    if (!this._pastHtml.has(year)) {
      this._pastHtml.set(
        year,
        (async () => {
          const index = await fetchHtml(this.pastIndexUrl);
          if (!index) return [];
          /*
            ★**年度の見分けは「(2024)」のような西暦**（`令和6年度` だけを見ない）。
            元号の計算をこちら側でやらずに済む。
          */
          let target = null;
          for (const m of index.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]{0,200}?)<\/a>/g)) {
            const label = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, "");
            if (!new RegExp(`[(（]${year}[)）]`).test(label)) continue;
            target = new URL(this.unwrap(m[1].replace(/&amp;/g, "&")), this.pastIndexUrl).toString();
            break;
          }
          if (!target) return [];
          const first = await fetchHtml(target);
          if (!first) return [];
          if (this.sheetIds(first).length) return [first];
          /*
            ★**年度によっては、その年のサイトの入口に飛ぶ**（令和7年度）。
            **組み合わせ表は子ページ「硬式部各種大会」にある**ので、そこまで辿る。
          */
          for (const m of first.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]{0,200}?)<\/a>/g)) {
            const label = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, "");
            if (!/硬式/.test(label)) continue;
            const child = await fetchHtml(
              new URL(this.unwrap(m[1].replace(/&amp;/g, "&")), target).toString(),
            );
            if (child && this.sheetIds(child).length) return [child];
          }
          return [];
        })(),
      );
    }
    return this._pastHtml.get(year);
  },
  async collect({ fetchHtml, season, url, year }) {
    /*
      ★★**過去年は「過去の大会」から**（上の説明）。
      ★**今年は今までどおり連盟のページ**（大会中はそちらのほうが早く出る）。
    */
    if (year !== new Date().getFullYear()) {
      const pages = await this.pastPages(fetchHtml, year);
      const games = [];
      for (const page of pages) games.push(...(await this.readSheets(this.sheetIds(page), season, year)));
      return games;
    }
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
    const ids = this.sheetIds(index);
    if (!ids.length) {
      console.log("  ⚠️ 広島: 大会ページに組み合わせ表のPDFが見つからない。出典の作りが変わった可能性がある");
      return [];
    }
    return this.readSheets(ids, season, year);
  },
  /** 候補のPDFを順に開いて、目当ての大会の紙が来たらそれを読む */
  async readSheets(ids, season, year) {
    for (const id of ids.slice(0, this.maxSheets)) {
      const parsed = await fetchPdfPages(`https://drive.google.com/uc?export=download&id=${id}`, { headers: UA });
      await sleep(this.politenessMs);
      if (!parsed?.length) continue;
      for (const raw of parsed) {
        const games = this.readSheet(raw, season, year);
        if (games) return games;
      }
    }
    return [];
  },
  /**
   * ★★**左右2段組の境目は紙から測る**（2026-09-01 その7）。
   *
   * 紙の大きさが年でまるで違う —— **いまの年は x が 42〜2,900、2024年は 42〜546**
   * （同じ内容を別の紙面に組んでいる）。
   * ★**決め打ちの 1400 のままでは、2024年の紙は右半分が丸ごと左に入って組めない。**
   * ★**スロット番号の列は「連番がいちばん長く並ぶ x」**なので、
   * **上位2つの列の中間**を境目にする（実測：いまの年 1,422／2024年 291.5）。
   */
  halfOf(page) {
    const cols = new Map();
    for (const l of page.lines) {
      for (const it of l.items) {
        const t = it.text.trim();
        if (!/^\d{1,3}$/.test(t)) continue;
        const k = Math.round(it.x);
        if (!cols.has(k)) cols.set(k, new Set());
        cols.get(k).add(Number(t));
      }
    }
    const runOf = (set) => {
      const ns = [...set].sort((a, b) => a - b);
      let best = 0;
      let cur = 0;
      for (let i = 0; i < ns.length; i++) {
        cur = i && ns[i] === ns[i - 1] + 1 ? cur + 1 : 1;
        best = Math.max(best, cur);
      }
      return best;
    };
    const ranked = [...cols.entries()]
      .map(([x, set]) => ({ x, run: runOf(set) }))
      .sort((a, b) => b.run - a.run);
    if (!ranked.length) return null;
    // ★**スコアの列を相方に選ばないこと。** 十分に離れていて、連番も長い列だけ
    const mate = ranked.slice(1).find((c) => Math.abs(c.x - ranked[0].x) > 50 && c.run >= 8);
    return mate ? (ranked[0].x + mate.x) / 2 : null;
  },
  /**
   * ★★**その半分のスロット番号が「下へ行くほど増える」か**（2026-09-01 その7）。
   *
   * 2024年の紙は**右半分だけ 86→44 と逆さ**で、
   * そのままでは `assembleSlotBracket` が連番を1つも見つけられない。
   * ★**紙から測る。決め打ちにしないこと**（年で向きが変わる）。
   *
   * @returns true なら逆さ（呼ぶ側が `mirrorSlots` に渡す）
   */
  slotsReversed(page, [lo, hi]) {
    const cols = new Map();
    for (const l of page.lines) {
      for (const it of l.items) {
        const t = it.text.trim();
        if (!/^\d{1,3}$/.test(t) || it.x < lo || it.x > hi) continue;
        const k = Math.round(it.x);
        if (!cols.has(k)) cols.set(k, []);
        cols.get(k).push({ y: l.y, v: Number(t) });
      }
    }
    let best = null;
    for (const [, list] of cols) {
      const uniq = new Set(list.map((o) => o.v)).size;
      if (!best || uniq > best.length) best = list;
    }
    if (!best || best.length < 8) return false;
    // ★上（yが大きい）から下（yが小さい）へ見て、番号が減っていれば逆さ
    const sorted = [...best].sort((a, b) => b.y - a.y);
    let down = 0;
    let up = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].v > sorted[i - 1].v) down += 1;
      else up += 1;
    }
    return up > down;
  },
  /** 1枚の組合せ表を読む。**組めなければ null**（呼び出し側は次のPDFへ） */
  readSheet(raw, season, year) {
    /*
      ★★**過去年は回数まで見て選ぶ**（2026-09-01 その7）。
      同じ年度のページに**複数の大会の紙**が並ぶので、
      `第\d+回` のままだと**別の年の紙を読んでしまう。**
    */
    const spec = this.TITLES[season];
    if (!spec) return null;
    /*
      ★★**過去年は年まで見て選ぶ**（2026-09-01 その7）。
      同じ年度のページに**複数の大会の紙**が並ぶので、
      季節の形だけで選ぶと**別の年の紙を読んでしまう。**
    */
    const titlePattern =
      year == null
        ? spec.re
        : season === "summer"
          ? new RegExp(`第${year - 1918}回全国高等学校野球選手権広島大会`)
          : new RegExp(spec.re.source.replace("令和\\d+年度", `令和${year - 2018}年度`));
    const half = this.halfOf(raw);
    if (half == null) return null;
    return readTwoColumnBracket(raw, {
      district: "広島",
      titlePattern,
      yearOf: spec.year,
      /*
        左右で分ける境目。**中央の決勝はどちらにも入れない。**
        ★**紙から測る**（`halfOf`。紙の大きさが年で違う）。
      */
      half,
      /*
        ★**入れ替えたあとは行の許容幅を広げる。** 右半分は数字が右揃えで、
        2桁のスコアだけ約29ポイント別の帯に落ちる。回戦の間隔（約141）より十分小さく。
        ★★**紙の大きさが年で違う**ので、**幅も紙に合わせて縮める**
        （2024年の紙はいまの年の 1/5 ほどの寸法。40 のままだと回戦の帯どうしがくっつく）。
      */
      rowTolerance: Math.max(6, Math.round((40 * half) / 1422)),
      // ★★スロット番号の向きは紙から測る（2024年の紙は右半分だけ逆さ）
      mirrorSlots: [
        this.slotsReversed(raw, [0, half]),
        this.slotsReversed(raw, [half, 1e6]),
      ],
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
/**
 * ★**三重のPDFは1回の実行で3季とも同じ一覧を見る**ので、取ったものを覚えておく。
 * 覚えないと**同じPDFを3回取りに行く**（この県は一覧に121件並んでいる）。
 * ★**プロセスの寿命だけ**。ディスクには残さない。
 */
/**
 * ★★**箱スコアの校名の空白は、2種類あって意味が違う**（2026-09-01。三重）。
 *
 *   `四 日 市 四 郷 ・ 石 薬 師` … **見た目をそろえるための字間**（落としてよい）
 *   `南伊勢 石薬師 四郷`         … **連合チームの区切り**（落とすと3校が1校に見える）
 *
 * ★**見分けは「空白で割った塊が全部1文字か」。**
 * 字間なら全部1文字、区切りなら2文字以上の塊が混ざる。
 * ★**区切りのほうは空白のまま残す** —— 空白区切りの連合チームは
 * `isCombinedTeam` が拾う（神奈川と同じ）。**「・」は補わない。**
 */
const cleanBoxScoreName = (items) => {
  const joined = normalize(items.map((i) => i.text).join(""));
  const tokens = joined.split(/[\s　]+/).filter(Boolean);
  if (!tokens.length) return "";
  return tokens.every((t) => [...t].length === 1) ? tokens.join("") : tokens.join(" ");
};

const miePdfCache = new Map();
/** 「大会結果 → 過去」の一覧（5ページ）。★**3季とも同じものを見る**ので1回だけ取る */
let mieIndexCache = null;
async function fetchMiePdf(url) {
  if (miePdfCache.has(url)) return miePdfCache.get(url);
  const parsed = await fetchPdfPages(url, { headers: UA });
  await sleep(mie.politenessMs);
  miePdfCache.set(url, parsed);
  return parsed;
}

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
  /*
    ★★★**春季・秋季は「詳細試合結果」の箱スコアから取る**（2026-09-01 に追加）。

    ★**夏はトーナメント表（`collectBrackets`）と箱スコアの両方**があるので、
    **大会ごとに試合数の多いほうを採る**（`collect` の下）。
    ★**箱スコアのほうが強い** —— 日付・球場・各回の得点があり、
    **各回の和＝印刷された合計**という**試合ごとの検算**ができる（石川と同じ）。
  */
  seasons: {
    spring: "https://mie-kouyaren.com/result_category/past/",
    summer: "選手権三重大会トーナメント表",
    autumn: "https://mie-kouyaren.com/result_category/past/",
  },
  async collect(ctx) {
    const box = await this.collectBoxScores(ctx);
    if (ctx.season !== "summer") return box;
    const bracket = await this.collectBrackets(ctx);
    /*
      ★★**同じ大会が二重に入らないようにする。**
      **トーナメント表は日付を持たず（`hasDates: false`）、箱スコアは日付を持つ**ので、
      重複の鍵（日付＋校名）が食い違って**両方残る。**
      ★**大会名で寄せて、試合数の多いほうを採る** ——
      箱スコアは大会の途中までしか上がっていない年があり
      （第107回は準々決勝以降の7試合だけ）、そこは表のほうが揃っている。
    */
    const byName = new Map();
    for (const list of [bracket, box]) {
      for (const g of list) {
        const k = g.tournament ?? "";
        if (!byName.has(k)) byName.set(k, []);
        byName.get(k).push(g);
      }
    }
    const out = [];
    for (const [name, games] of byName) {
      const fromBox = games.filter((g) => g.date);
      const fromBracket = games.filter((g) => !g.date);
      if (!fromBox.length || !fromBracket.length) {
        out.push(...games);
        continue;
      }
      const win = fromBox.length >= fromBracket.length ? fromBox : fromBracket;
      console.log(
        `  （三重: ${name} は詳細試合結果 ${fromBox.length} 試合・組合せ表 ${fromBracket.length} 試合。` +
          `${win === fromBox ? "詳細試合結果" : "組合せ表"}のほうを採る）`,
      );
      out.push(...win);
    }
    return out;
  },
  async collectBrackets({ fetchHtml, season, url }) {
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
    /*
      ★★**過去の大会は検索APIでは辿れない**（2026-08-25 追加）。
      **記事そのものが消されている**（2025年の夏は6/24〜8/19 に投稿が1本も無い）。
      代わりに**「大会結果 → 過去」のカテゴリ一覧**を見る。2022年度まで並んでいる。
      ★**記事の題ではなくPDFのリンクを拾い、中身の表題で大会を見分ける**
      （この県は元からその作り）。
    */
    /*
      ★**一覧ページに PDF が直接並んでいる**（記事を開く必要が無い）。
      記事URLの形（`/YYYY/MM/DD/`）を探しても1件も取れない。
    */
    const pastPdfs = [];
    for (let page = 1; page <= 5; page++) {
      const listUrl = `https://mie-kouyaren.com/result_category/past/${page > 1 ? `page/${page}/` : ""}`;
      const list = await fetchHtml(listUrl);
      await sleep(this.politenessMs);
      if (!list) break;
      for (const m of list.matchAll(/https?:\/\/[^"']*?\.pdf/g)) {
        if (!pastPdfs.includes(m[0])) pastPdfs.push(m[0]);
      }
    }

    if (!articles.length && !pastPdfs.length) {
      console.log("  ⚠️ 三重: 組合せ表の記事が見つからない");
      return [];
    }

    /*
      ★★**最初の記事で止めないこと**（2026-08-25）。
      以前は `if (pdfs.length) break;` で**いちばん新しい記事1本**しか見ておらず、
      過去大会の一覧を足しても1年ぶんしか取れなかった。
      ★**大会の見分けは紙の表題でやる**ので、集めすぎても混ざらない。
    */
    const pdfs = [];
    for (const article of articles.slice(0, 24)) {
      const html = await fetchHtml(article);
      await sleep(this.politenessMs);
      if (!html) continue;
      for (const m of html.matchAll(/https?:\/\/[^"']*?\.pdf/g)) {
        if (!pdfs.includes(m[0])) pdfs.push(m[0]);
      }
    }
    // 過去大会の一覧から拾ったぶんを後ろに足す（新しい年から見たいので後ろ）
    for (const u of pastPdfs) if (!pdfs.includes(u)) pdfs.push(u);
    if (!pdfs.length) {
      console.log("  ⚠️ 三重: 記事にPDFが無い");
      return [];
    }
    /** 大会名 → その大会の試合。**同じ大会の古い版で上書きしない** */
    const collected = new Map();
    for (const pdf of pdfs.slice(0, 40)) {
      const parsed = await fetchMiePdf(pdf);
      if (!parsed?.length) continue;
      for (const raw0 of parsed) {
        /*
          ★★**中央の潰れた数字を先にほどく**（2026-08-26）。
          2026年の紙は**決勝の2つの得点が `3 12` と1つの断片**になっており、
          そのままでは「数字だけの断片」として読めない。
          ★**滋賀と同じ `explodeNumberRuns`**（断片の幅を文字数で割って位置を出す）。
        */
        const raw = explodeNumberRuns(raw0);
        /*
          ★★**上下の境目は紙ごとに測る**（`findSlotColumns`）。
          決め打ちの 300 に対し、実測は **293.0（2025年）／293.1（2026年）**。
          中央の窓が 7ポイントずれるだけで**決勝の得点を取り違える。**
        */
        const cols = findSlotColumns(raw);
        const games = readTwoColumnBracket(raw, {
          district: "三重",
          // ★**「記念」が入る年がある**（第105回＝2023年。2026-08-25 に許した）
          titlePattern: /第\d+回全国高等学校野球選手権(?:記念)?三重大会/,
          half: cols ? (cols[0].x + cols[1].x) / 2 : 300,
          rowTolerance: 6,
          nameOrder: ["asc", "desc"],
          season,
          /*
            ★★★**決勝は「中央をはさむ組のうちいちばん内側」**（2026-08-26 に直した）。

            この紙は**決勝と準決勝の得点が中央の同じ行に4つ並ぶ**:

              3(x=259)  1(x=291) │ 0(x=299)  0(x=332)   ← 内側の2つが決勝
              1(x=259)           │           1(x=332)   ← 準決勝のもう片方

            ★**既定の `"middle"`（いちばん下の2つ）は準決勝の数字を拾う。**
            そのせいで**2025年（第107回）の決勝が `津商 3-2 津田学園` として
            画面に出ていた** —— 連盟自身の「決勝試合結果」PDFは
            **`津田学園 1-0 津商`**（津田学園が甲子園に出ている）。**勝者も点数も違っていた。**
            ★**`explodeNumberRuns` と対で入れること。**
            ほどかないと2026年の `3 12` が読めず、今度は2026年が準決勝を拾う。
          */
          finalAt: "innermost",
          // ★**日付を持たない**ので、日付での検算はできない
          hasDates: false,
        });
        if (!games?.length) continue;
        /*
          ★**同じ大会が何度も出てくる**（大会中に「7/21更新」「7/23更新」と
          同じ題で上がるため）。**最初に組めたものを採る** ——
          あとの版は途中経過なので、**新しい記事から見ている限りそれが最終結果。**
        */
        const name = games[0].tournament;
        if (collected.has(name)) continue;
        collected.set(name, games);
        break; // このPDFは読めた。次のPDFへ
      }
    }
    return [...collected.values()].flat();
  },

  /*
    ==================================================================
    ★★★ 「詳細試合結果」の箱スコア（2026-09-01。運営者がくれた出典）
    ==================================================================

    `result_category/past/` に**回戦ごとの箱スコアPDF**が並んでいる。
    **トーナメント表の組み立てが要らない**ので、いちばん強い形の出典。

        第７２回 春季東海地区高等学校野球三重県大会          ← 1ページ目の1行目
        １回戦  ４月１２日  津球場公園内野球場 （９：５９～１１：４１）
        チーム名 | 1 2 3 4 5 6 7 8 9 10 11 12 | 計
        相 可    | 0 0 0 0 0 0 0 0 3          | 3
        津       | 0 0 0 0 0 1 0 0 0          | 1

    ★★**検算は「各回の得点の和 ＝ 印刷された合計」**（試合ごと。石川と同じ）。
    **合わない試合はその1試合だけ落とす**（大会ごと落とさない ——
    箱スコアは試合が独立していて、1件の読み違いが他に伝播しない）。

    ------------------------------------------------------------------
    ★ 年は「お知らせの掲載日」から出す（静岡と同じ）

        <time datetime="2025.08.23">2025.8.23</time> の下に PDF が並ぶ

    ★**紙には `４月１２日` と月日しか無い。**
    ★★**大会名の回数から年を出さないこと** —— `第72回春季東海地区…` は
    **東海地区大会の通し番号**（宮崎の「第158回」と同じで年とは無関係）。
    ★**掲載日より後の試合はありえない**ので、そこを検算にする
    （1月に前年の秋を載せる形も、年を1つ戻して受ける）。

    ------------------------------------------------------------------
    ★ 収録するのは「三重県の大会」だけ

      - `三重大会` `三重県大会` を含まないものは外す
        （`第104回全国高等学校野球選手権大会` は**甲子園**、
         `第75回秋季東海地区高等学校野球大会` は**東海地区大会**そのもの）
      - `地区予選` `シード決め` は支部予選なので外す
      - 1年生大会・交流試合は `isTargetTournament` が外す
  */
  async collectBoxScores({ fetchHtml, season, year }) {
    const wanted = { spring: [3, 6], summer: [6, 8], autumn: [8, 11] }[season];
    if (!wanted) return [];
    /*
      ★**一覧は5ページ。掲載日つきで拾う。**
      `latest` はいま空で、過去のぶんは全部 `past` にある（2026-09-01 実測）。
    */
    let items = mieIndexCache;
    if (!items) {
      items = [];
      for (let page = 1; page <= 5; page++) {
        const listUrl = `https://mie-kouyaren.com/result_category/past/${page > 1 ? `page/${page}/` : ""}`;
        const list = await fetchHtml(listUrl);
        await sleep(this.politenessMs);
        if (!list) break;
        for (const block of list.matchAll(/<time datetime="([\d.]+)"[\s\S]{0,4000}?(?=<time datetime=|<\/ul>)/g)) {
          for (const a of block[0].matchAll(/<a href="([^"]+\.pdf)"[^>]*class="news-link">/g)) {
            items.push({ posted: block[1].replace(/\./g, "-"), url: a[1] });
          }
        }
      }
      // ★3季とも同じ一覧を見るので、1回だけ取る（5ページある）
      mieIndexCache = items;
    }
    /*
      ★**取りに行くのは指定された年に載ったぶんだけ。**
      **過去年は `--year` で1年ずつ積み上げる**（引き継ぎが前の生成物を残す）。
    */
    const targets = items.filter((i) => Number(i.posted.slice(0, 4)) === year);
    if (!targets.length) return [];

    const games = [];
    let dropped = 0;
    for (const it of targets) {
      const parsed = await fetchMiePdf(it.url);
      if (!parsed?.length) continue;
      for (const g of this.readBoxScores(parsed)) {
        if (!/三重県?大会/.test(g.tournament)) continue;
        if (/地区予選|シード決め/.test(g.tournament)) continue;
        if (!isTargetTournament(g.tournament)) continue;
        if (!g.round || !g.md) continue;
        const [mm, dd] = g.md;
        if (mm < wanted[0] || mm > wanted[1]) continue;
        /*
          ★**年は掲載年。ただし「掲載日より後の試合」はありえない**ので、
          そうなったら1年戻す（1月に前年の秋を載せる形）。
          ★**150日より前の試合も採らない**（別の年の紙を掴んだとき）。
        */
        const posted = Date.parse(it.posted);
        let y = Number(it.posted.slice(0, 4));
        let date = `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
        if (Date.parse(date) > posted) {
          y -= 1;
          date = `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
        }
        const days = (posted - Date.parse(date)) / 86400000;
        if (!(days >= 0 && days <= 150)) {
          dropped += 1;
          continue;
        }
        games.push({
          date,
          season,
          tournament: g.tournament,
          round: g.round,
          venue: g.venue,
          teams: [
            { display: g.teams[0].name, score: g.teams[0].score, won: g.teams[0].score > g.teams[1].score },
            { display: g.teams[1].name, score: g.teams[1].score, won: g.teams[1].score > g.teams[0].score },
          ],
        });
      }
    }
    if (dropped) console.log(`  ⚠️ 三重: 掲載日と日付が離れすぎている試合を ${dropped} 件落とした`);
    if (games.length) {
      const byName = new Map();
      for (const g of games) byName.set(g.tournament, (byName.get(g.tournament) ?? 0) + 1);
      for (const [name, n] of byName) console.log(`  （${name}: 詳細試合結果から ${n} 試合）`);
    }
    return games;
  },

  /**
   * 箱スコアのPDFを読む。**検算（各回の和＝合計）に落ちた試合は返さない。**
   *
   * ★★**列は見出し（`チーム名 … 計`）から測ること。** 紙によって校名の欄が
   * x=18〜58 だったり x=59〜124 だったりする。**`x < 150` の決め打ちは、
   * 別の紙で得点を校名に食い込ませる**（`海星200`）。
   *
   * ★★**校名が2行に折り返される紙がある**（連合チーム
   * `四日市四郷・石薬師` ／ `あけぼの学園`）。**得点の無い行は次の行の頭に付ける。**
   *
   * ★**コールドの注記（`（５回コールドゲーム）`）が回の欄に入る。**数字だけ残す。
   * ★**サヨナラは `2x`。**
   */
  readBoxScores(pages) {
    const flat = (l) => normalize((l?.text ?? "").replace(/\t/g, "")).replace(/[\s　]/g, "");
    const tournament = flat(pages[0]?.lines[0]);
    const ROUND = /(\d+回戦|準々決勝|準決勝|決勝|\d+位決定戦|代表決定戦|敗者復活戦)/;
    /*
      ★★**サヨナラの印は半角と全角が混ざる**（`2x` と `2ｘ`。同じ大会の同じ紙にある）。
      **NFKC で寄せてから見ないと、その回の得点が読めず**、
      「各回の和＝合計」が合わなくなって**その試合だけ静かに落ちる**
      （第75回秋季の準決勝が1試合になっていた）。
    */
    const cell = (s) => normalize(s).normalize("NFKC").trim();
    const SCORE = /^\d{1,2}[xX×✕]?$/;
    const val = (s) => Number(String(s).replace(/[xX×✕]/g, ""));
    const out = [];
    for (const p of pages) {
      for (let i = 0; i < p.lines.length; i++) {
        const line = p.lines[i];
        const head = flat(line);
        if (!/^チーム名/.test(head) || !/計$/.test(head)) continue;
        const first = line.items.find((it) => it.text.trim() === "1");
        const total = line.items.find((it) => it.text.trim() === "計");
        if (!first || !total) continue;

        const label = flat(p.lines[i - 1]);
        const round = label.match(ROUND)?.[1] ?? null;
        const md = label.match(/(\d+)月(\d+)日/);
        const venue =
          label.replace(ROUND, "").replace(/\d+月\d+日/, "").replace(/[（(].*$/, "").trim() || null;

        const teams = [];
        let carry = "";
        for (const row of p.lines.slice(i + 1, i + 6)) {
          const here = cleanBoxScoreName(row.items.filter((it) => it.x < first.x - 8));
          /*
            ★★**校名が2行に折り返される紙がある**（連合チーム）。
            **折り返しは学校の切れ目で起きている**が、**「・」は補わない**
            （どこが切れ目かは行が変わったことでしか分からない）。
            **空白でつなぐ** —— 空白区切りの連合チームは `isCombinedTeam` が拾う（神奈川と同じ）。
          */
          const name = carry ? (here ? `${carry} ${here}` : carry) : here;
          if (!name || /バッテリー|^【/.test(name)) break;
          const cells = row.items.filter((it) => it.x >= first.x - 8);
          if (!cells.length) {
            carry = name;
            continue;
          }
          carry = "";
          const tot = cells.find((it) => Math.abs(it.x - total.x) <= 15);
          const innings = cells
            .filter((it) => it !== tot && it.x < total.x - 15)
            .map((it) => cell(it.text))
            .filter((t) => SCORE.test(t));
          teams.push({ name, innings, total: tot ? cell(tot.text) : null });
          if (teams.length === 2) break;
        }
        /*
          ---- 検算: 各回の得点の和 ＝ 印刷された合計 ----
          ★**回数がずれていないことも見る**（コールドで先攻だけ1回多い形まで）。
        */
        const ok =
          teams.length === 2 &&
          teams.every((t) => t.total !== null && SCORE.test(t.total)) &&
          Math.abs(teams[0].innings.length - teams[1].innings.length) <= 1 &&
          Math.max(teams[0].innings.length, teams[1].innings.length) >= 4 &&
          teams.every((t) => t.innings.reduce((a, s) => a + val(s), 0) === val(t.total));
        if (!ok) continue;
        out.push({
          tournament,
          round,
          md: md ? [Number(md[1]), Number(md[2])] : null,
          venue,
          teams: teams.map((t) => ({ name: t.name, score: val(t.total) })),
        });
      }
    }
    return out;
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
 * ★★ 2026-08-27 に索引を「トップページ」から「大会記録」（`page8`）に替えた
 *
 *   それまではトップページに出ている**今年の紙1枚**しか見ていなかったので、
 *   **夏の1大会（61試合）しか無かった。**
 *
 *   ★**`page8`（大会記録）に 平成20年度〜令和7年度の一覧**があり、
 *   **令和2年度以降の16枚がPDFで取れる**（選手権5枚・九州地区県予選11枚）。
 *   **平成30年度以前は旧サイト `www4.synapse.ne.jp/k-b/`** で、いまは繋がらない。
 *
 *   ★★**開催中〜終わったばかりの大会は `page8` にまだ載らない**ので、
 *   **トップページも一緒に見る**（見ないと今年が消える）。
 *   ★**同じ紙が両方の索引に載る**ので URL で畳む。
 *
 *   ★**春季・秋季は「九州地区高等学校野球大会鹿児島県予選」。**
 *   **回数（第147回…）は通し番号で年とは関係が無い**（石川の北信越と同じ）。
 *   ★**年と季節は紙に刷ってある会期の行から決める。**
 *
 * ------------------------------------------------------------------
 * ★ この表がほかの3県と違うところ
 *
 *   1. **上下2段組**（広島・三重は左右）。`orientPage` の扱いは同じ
 *   2. ★**決勝のスコアが、半分ごとの準決勝と同じ帯の中央にある。**
 *      準決勝のスコアは連結線の**両端**に置かれ、中点に来るのが決勝の得点。
 *      `finalInCenter` で外して `centerScore` に取る
 *   3. ★**日付が `県12日9：00`**（球場記号＋日＋開始時刻が1断片）。
 *      月が書かれていないので、表の開催期間の行から月を決める
 *   4. ★★**スコアに丸数字（コールドの回数）が付く。前に付く紙と後ろに付く紙がある**
 *      （`10⑤` と `⑥11`、間に空白が入る `⑦ 8` も）。下の「読み方」を読むこと
 *   5. 連合チームの凡例が「連合①」と中身の2列組
 *   6. ★★**紙の縮尺が年でまるで違う**（スロット列の間隔は第107回が362、
 *      第155回が2041ポイント）。**`half` も `rowTolerance` も決め打ちにしないこと。**
 *      スロット番号の列を探して、そこからの相対で出す（群馬・石川と同じ）
 *   7. ★**球場の凡例は `県：…` の年と `県は…` の年がある**
 *
 * ------------------------------------------------------------------
 * ★★ この紙を読むのに要った3つ（2026-08-27。**どれも実データで突き止めた**）
 *
 *   1. ★★**`leadingInningMark`** …… `numbersOf` は**後ろの丸数字しか落とさない**ので、
 *      `⑥11` `⑦10` `⑧8` と刷る紙では**その試合のスコアが丸ごと読めない。**
 *      第153回は1回戦が **30個のところ25個**になり、
 *      **別の帯を1回戦と取り違えて大会ごと落ちていた**
 *      （欠けた5個は `⑦10` `⑧8` `⑤11` `⑥13` `⑤11` でぴったり一致した）。
 *   2. ★★**`bandAtCenter`** …… 帯を**断片の左端**でまとめると、桁数と丸数字の位置で
 *      **9〜11ポイントずれる**（`10⑩`(500.9) と `7`(509.9)、`⑦ 8`(410.8) と `1`(419.9)）。
 *      まとめ幅を広げて吸収しようとすると**深い回戦を巻き込む** ——
 *      第157回は**準々決勝↔準決勝が40ポイントなのに準決勝↔決勝は16ポイント**しかない。
 *      **断片の中の数字の位置で見ればずれは5ポイント以下**になる。
 *   3. ★★**不戦勝**（`walkovers`）…… 紙に
 *      `市来農芸が棄権の為伊集院が不戦勝` と**文で書いてある**試合には得点が無い。
 *      **その紙は組み立てられない**ので、**文を読んで件数を数え、1試合も出さない**
 *      （群馬の7枚と同じ。「数字が足りない」と言って落ちるより、理由が分かるほうがよい）。
 *
 * ------------------------------------------------------------------
 * ★ 検算（京都に次いで強い）
 *
 *   - ★★**紙の中央の縦書きに優勝校が刷ってある**（`championOf`）。
 *     **枝の外から来る事実**なので、石川で通ってしまった
 *     「構造は合うのに決勝の相手が違う」を止められる。
 *     ★**刷っていない紙はその大会を1試合も出さない**（下の「読めない紙」）
 *   - N チーム − 試合数 = 1
 *   - 表に書かれた日付の個数 = 試合数
 *
 * ------------------------------------------------------------------
 * ★★ 読めない紙（**根拠を実データで確かめ直してから外すこと**）
 *
 *   - ★★**第107回（2025年夏）・第155回（2024年秋）** … **優勝校が紙に無い。**
 *     第155回は**日付も `10/12(木)` 形式**でこの紙だけ書き方が違う
 *   - ★**第150回（2022年春）** … 校名（神村学園）は中央にあるが、
 *     **`優` の字がPDFの文字として出てこない**（`於（季ぶり回目）` と混ざる）。
 *     ★**校名だけを手掛かりにしないこと** —— 中央にはシード校の一覧も入っている
 *   - **2020鹿児島県夏季高校野球大会** … スロット番号の列が無い（別形式）
 *   - **第67回・第68回 鹿児島県選抜高校野球大会** … ★**収録範囲の外**
 *     （春季・夏・秋季とは別の大会。`isTargetTournament` と同じ線引き）
 *   - **第158回（2026年春）** … 組合せだけでスコアが1つも無い
 */
const kagoshima = {
  slug: "kagoshima",
  district: "鹿児島",
  name: "鹿児島県高等学校野球連盟",
  siteUrl: "http://www.kagoshima-kouyaren.jp/",
  politenessMs: 2000,
  /** 3季とも同じ2ページから辿る。**取得は1回で済ませる**（`indexCache`） */
  seasons: {
    spring: "http://www.kagoshima-kouyaren.jp/page8",
    summer: "http://www.kagoshima-kouyaren.jp/page8",
    autumn: "http://www.kagoshima-kouyaren.jp/page8",
  },
  indexCache: new Map(),
  TOP: "http://www.kagoshima-kouyaren.jp/",

  /**
   * 索引のリンクの文字から「その紙が何年の何季か」を見当付ける。
   * **取りに行く枚数を絞るためだけ**で、本当の年と季節は
   * **紙に刷ってある会期の行**で決める（下の `readSheet`）。
   *
   *   `第107回全国高等学校野球鹿児島大会`（page8）
   *   `第108回全国高等学校野球選手権鹿児島大会【勝ち上がり】`（トップ）
   *   `第156回九州大会県予選`（page8）
   *   `■第157回九州地区高校野球大会 鹿児島県予選大会【結果】`（トップ）
   *
   * ★★**「予選」の無い九州地区大会は取らない** —— そちらは**県外の学校が出る地区大会**で、
   * 同じトップページに並んでいる（`第157回九州地区高等学校野球大会【勝ち上がり】`）。
   * ★**軟式も同じ題で並ぶ**ので外す。
   */
  guess(label) {
    const t = normalize(label).replace(/[\s　]/g, "");
    if (/軟式/.test(t)) return null;
    const s = t.match(/^■?第(\d+)回全国高等学校野球(?:選手権)?(?:記念)?鹿児島大会/);
    if (s) return { season: "summer", year: Number(s[1]) + 1918 };
    /*
      ★**九州地区大会の回数は通し番号**（第147回＝2020年秋、第158回＝2026年春）。
      **春（偶数回）と秋（奇数回）が交互**なので `floor(N/2) + 1947` で年の見当が付く。
      ★**これは見当。紙と食い違ったらその紙は読まない**（`readSheet`）。
    */
    const k = t.match(/^■?第(\d+)回九州/);
    if (!k || !/予選/.test(t)) return null;
    const n = Number(k[1]);
    return { season: n % 2 === 0 ? "spring" : "autumn", year: Math.floor(n / 2) + 1947 };
  },

  async collect({ fetchHtml, season, url, year }) {
    for (const page of [url, this.TOP]) {
      if (!this.indexCache.has(page)) this.indexCache.set(page, await fetchHtml(page));
    }
    /** この年・この季節に見当が付いたPDF。**同じ紙が2枚の索引に載る**ので URL で畳む */
    const wanted = [];
    for (const page of [url, this.TOP]) {
      const html = this.indexCache.get(page);
      if (!html) continue;
      for (const a of html.matchAll(/<a[^>]+href=["']([^"']+\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const label = normalize(plain(a[2]));
        const g = this.guess(label);
        if (!g || g.season !== season || g.year !== year) continue;
        let u;
        try {
          u = new URL(a[1], page).toString();
        } catch {
          continue; // リンクが壊れているだけ
        }
        /*
          ★**「組合せ」だけの紙にはスコアが1つも無い**（抽選直後の版）。
          **「勝ち上がり」「結果」と書いてあるほうを先に見る。**
          ★同じ紙が2枚の索引にあるときは、**どちらかが結果版と書いていれば結果版**とする。
        */
        const done = /勝ち上がり|結果/.test(label);
        const hit = wanted.find((w) => w.url === u);
        if (hit) hit.done ||= done;
        else wanted.push({ url: u, done });
      }
    }
    wanted.sort((a, b) => Number(b.done) - Number(a.done));

    for (const w of wanted.slice(0, 4)) {
      const parsed = await this.fetchSheet(w.url);
      if (!parsed?.length) continue;
      for (const raw of parsed) {
        const games = this.readSheet(raw, season, year);
        if (games?.length) return games;
      }
    }
    return [];
  },

  /** 紙を1枚取る（`KAGO_CACHE` があればそこから読む。開発で何度も走らせるとき用） */
  async fetchSheet(url) {
    const dir = process.env.KAGO_CACHE;
    if (dir) {
      const file = path.join(dir, url.split("/").pop());
      if (existsSync(file)) return pdfPages(new Uint8Array(readFileSync(file)));
    }
    const parsed = await fetchPdfPages(url, { headers: UA });
    await sleep(this.politenessMs);
    return parsed;
  },

  /**
   * ★★**中央の縦書きに刷ってある優勝校を読む。**
   *
   * **枝の外から来る事実**なので、これがこの県のいちばん強い検算になる。
   *
   * ★**「優勝」と校名が同じ列にある紙と、別の列に分かれている紙がある。**
   * つないでしまうと `優勝（神2年村連学続園7高回等目部）` と混ざるので、
   * **中央の帯を x で列にまとめてから、列ごとの文字列を作る。**
   *
   * ★**シード校の一覧も中央の列に入っている**ので、**長い列は候補にしない。**
   * ★**日付・時刻の断片を先に落とす** —— `県4日12：30` から数字を除くと
   * `県日` になり、校名の候補に紛れる。
   *
   * ★**16枚のうち13枚で読める**（第107回・第150回・第155回は紙に無い）。
   */
  championOf(raw) {
    const items = raw.lines.flatMap((l) => l.items.map((i) => ({ x: i.x, y: l.y, t: i.text.trim() })));
    if (!items.length) return null;
    const xs = items.map((i) => i.x);
    /** ★**紙の縮尺は年で倍半分違う。** 窓はすべてこれに掛ける */
    const scale = (Math.max(...xs) - Math.min(...xs)) / 500;
    const words = items.filter((i) => !/\d/.test(i.t) || /^\d+$/.test(i.t));
    const found = [];
    for (const a of items.filter((i) => /優/.test(i.t))) {
      const box = words.filter(
        (i) =>
          i.x >= a.x - 10 * scale &&
          i.x <= a.x + 40 * scale &&
          i.y >= a.y - 170 * scale &&
          i.y <= a.y + 60 * scale,
      );
      const cols = new Map();
      for (const i of box) {
        const k = [...cols.keys()].find((v) => Math.abs(v - i.x) <= 3 * scale) ?? i.x;
        if (!cols.has(k)) cols.set(k, []);
        cols.get(k).push(i);
      }
      for (const [x, list] of cols) {
        const s = list
          .sort((p, q) => q.y - p.y)
          .map((i) => i.t)
          .join("")
          // 「（3年連続7回目）」「（四年ぶり六回目）」
          .replace(/[（(][^）)]*[）)]/g, "")
          .replace(/\d/g, "")
          .replace(/^優勝?/, "")
          .replace(/勝$/, "")
          .replace(/^(?:準?決勝|位決?)/, "")
          // 球場の記号が列の端に紛れる（`神村学園` の下に `県`）
          .replace(/[県市加]$/, "");
        if (/球場|スタジアム|ドーム|野球|大会|休養|シード/.test(s)) continue;
        if (/^[一-龥ぁ-んァ-ヶー]{2,12}$/.test(s)) found.push({ dx: Math.abs(x - a.x), s });
      }
    }
    if (!found.length) return null;
    found.sort((p, q) => p.dx - q.dx);
    return found[0].s;
  },

  /**
   * 1枚の組合せ表を読む。
   * **null**＝この紙は目当ての大会ではない（呼び出し側は次のPDFへ）／
   * **[]**＝検算に落ちた（その大会は1試合も出さない）。
   */
  readSheet(raw, season, year) {
    const flat = raw.lines.map((l) => normalize(l.text.replace(/\t/g, "")).replace(/[\s　]/g, ""));
    const TITLE = /第\d+回(?:全国高等学校野球選手権(?:記念)?鹿児島大会|九州地区高等学校野球大会鹿児島県予選)/;
    const title = flat.map((t) => t.match(TITLE)?.[0]).find(Boolean);
    if (!title) return null;

    /*
      ★**日付に月が書かれていない**（`県12日9：00`）。
      **7月と決め打ちしないこと。** 表の開催期間の行
      「令和８年７月４日（土）～７月２５日（土）」から月を決める。
      またいでいたら、日で振り分ける（開幕日以降は前の月）。

      ★★**年と季節もこの行から出す**（2026-08-27）。
      九州地区大会の回数は通し番号なので、**大会名からは年が出せない。**
    */
    const period = flat
      .map((t) => t.match(/(令和|平成)(元|\d+)年(\d{1,2})月(\d{1,2})日.*?[～~-].*?(\d{1,2})月(\d{1,2})日/))
      .find(Boolean);
    if (!period) {
      console.log(`  ⚠️ 鹿児島: ${title} の開催期間の行が読めない。年も日付の月も決められないので1試合も出さない`);
      return [];
    }
    const [, era, eraYear, m1s, d1s, m2s] = period;
    const [m1, d1, m2] = [m1s, d1s, m2s].map(Number);
    /** ★**会期の行に書いてあるのは開幕日の暦年**（年度ではない） */
    const sheetYear = (era === "令和" ? 2018 : 1988) + (eraYear === "元" ? 1 : Number(eraYear));
    /*
      ★**季節は大会の種類で決める。開催月だけでは決められない** ——
      第153回（秋季）は**8月22日開幕**なので、月で振ると夏になる。
    */
    const sheetSeason = /選手権/.test(title) ? "summer" : m1 <= 6 ? "spring" : "autumn";
    /*
      ★★**取りに行った年・季節と紙が食い違ったら読まない**（新潟でデータを壊した轍）。
      索引のリンクの文字から付けた見当が外れていても、ここで必ず止まる。
    */
    if (sheetYear !== year || sheetSeason !== season) return null;

    /*
      ★★**不戦勝のある紙は組み立てられない**（群馬の7枚と同じ）。

      紙は `市来農芸が棄権の為伊集院が不戦勝` と**文で書いている**が、
      **その試合の枠には得点が無い**ので、その回戦の数字が試合数の2倍にならない
      （第156回は1回戦が26個必要なところ22個）。
      ★**「数字が足りない」で落ちるのに任せず、理由が分かる形で先に落とす。**
    */
    const walkovers = flat.filter((t) => /不戦勝/.test(t)).length;
    if (walkovers) {
      console.log(
        `  ⚠️ 鹿児島: ${title} は不戦勝が ${walkovers} 件あり、その枠に得点が無い。` +
          "組み立てられないので1試合も出さない",
      );
      return [];
    }

    const monthOf = (day) => (m1 === m2 ? m1 : day >= d1 ? m1 : m2);
    const parseLabel = (t) => {
      const m = t.match(/^([^\d\s])(\d{1,2})日/);
      if (!m) return null;
      const day = Number(m[2]);
      return { date: `${monthOf(day)}/${day}`, venue: m[1] };
    };

    /*
      ★**紙の縮尺が年でまるで違う**ので、`half` も `rowTolerance` も
      **スロット番号の列を探してそこからの相対で出す**（群馬・石川と同じ）。
      決め打ちの 490 は第108回の紙の値で、**第107回の紙は 295**。
    */
    const cols = findSlotColumns(raw);
    if (!cols) {
      console.log(`  ⚠️ 鹿児島: ${title} のスロット番号の列が見つからない。1試合も出さない`);
      return [];
    }
    const [L, R] = cols;
    const half = (L.x + R.x) / 2;
    const span = R.x - L.x;

    /*
      ★★★**スロット番号の外側にある「地の文」を、行ごと落としてから組み立てる**
      （2026-08-27。第157回のため）。

      帯は**同じ x の断片をつないで**作られる。ところが会期の行
      `…〈雨天順延〉 於：平和リース球場・鹿児島市鴨池公園球場` は**幅206ポイント**もあり、
      その左端（x=489.5）が**準決勝の得点(484.4)と決勝の得点(476.9)のあいだ**に落ちる。
      ★**そこを踏み台にして2つの帯がつながらず、
      準決勝の2つの得点が別々の帯に割れていた**（「枝内1個」「枝内2個」で組めない）。

      ★**枝はスロット番号の内側にしかない**ので、外側の行は組み立てに要らない。
      ★**大会名の行だけは残す**（`readTwoColumnBracket` がここから大会名を読む）。
      ★**球場の凡例と会期の行も外側にある**ので、この2つは `raw` から読むこと。
    */
    const slotYs = [...L.items, ...R.items].map((i) => i.y);
    const topY = Math.max(...slotYs);
    const bottomY = Math.min(...slotYs);
    /** スロット1つぶん。**きっかりで切らない**（校名はスロット行の外へ少しはみ出す） */
    const pitch = (topY - bottomY) / Math.max(1, L.items.length + R.items.length - 2);
    const cropped = {
      page: raw.page,
      lines: raw.lines.filter(
        (l) =>
          (l.y <= topY + pitch * 2 && l.y >= bottomY - pitch * 2) ||
          TITLE.test(normalize(l.text.replace(/\t/g, ""))),
      ),
    };

    /*
      ★★**優勝校は紙の中央に刷ってある。** 読めなければその大会は1試合も出さない。
      **組み立てだけで出すと、石川の「構造は合うのに決勝の相手が違う」を繰り返す。**
    */
    const champion = this.championOf(raw);
    if (!champion) {
      console.log(`  ⚠️ 鹿児島: ${title} の紙に優勝校が刷られていない。検算できないので1試合も出さない`);
      return [];
    }

    /** 連合チームの凡例（「連合①」と中身が同じ行の2列に並ぶ） */
    const expand = new Map();
    for (const l of raw.lines) {
      const m = l.text.match(/(?:^|\t)(連合[①-⑳])\t([^\t]+)$/);
      if (m) expand.set(m[1], m[2].trim());
    }

    return readTwoColumnBracket(cropped, {
      district: "鹿児島",
      titlePattern: TITLE,
      /*
        上下で分ける境目。**中央の決勝はどちらにも入れない**……のだが、
        鹿児島の決勝は準決勝と同じ帯にあるので、`finalAt: "center"` で
        半分ずつの組み立てから取り出す。
      */
      half,
      /*
        ★**行の許容幅は紙の大きさに比例させる**（第108回で決めた 8 に合わせた比）。
        ★★**`bandAtCenter` と対で入れること** —— 数字の位置で寄せるのをやめると、
        丸数字のぶんのずれ（9〜11ポイント）を吸収するために幅を倍にする必要があり、
        **そうすると深い回戦を巻き込む。**
      */
      rowTolerance: span / 74,
      /*
        ★★**離れた「回」がスコアを消すのを止める**（宮崎と同じ罠）。
        中央の縦書き「（3年連続7回目）」の **`回` が、同じ行の 117 ポイント左にある
        1回戦のスコアを消していた**（第106回。その回戦の数字が30個のところ29個になり、
        奇数なので帯ごと捨てられて、2回戦が1回戦として読まれていた）。
        ★**この紙のコールドは丸数字**（`10 ⑤`）で「N回」とは書かないので、
        本物を巻き込む心配は無い。**それでも幅は紙に比例させる。**
      */
      inningMarkGap: (span / 74) * 3,
      bandAtCenter: true,
      leadingInningMark: true,
      flatFragments: true,
      /*
        ★**帯をまとめる幅の上限。** 既定（1つ前の回戦との間隔の 0.45 倍）は、
        **準決勝↔決勝が16ポイントしかない紙**では広すぎて決勝を準決勝に混ぜる。
        `rowTolerance` で割れた行はすでにまとまっているので、ここは狭くてよい。
      */
      roundBandGap: (span / 74) * 0.5,
      nameOrder: ["asc", "desc"],
      /*
        ★**校名に見た目をそろえるための空白が入る年がある**（第106回の
        「鹿児 島実 業」「鹿児 島城 西」）。**日本の校名に空白は入らない**ので落としてよい。
        ★**空白のない年（第108回）には効かない**ので、生成物は変わらない。
      */
      cleanName: (t) => t.replace(/[\s　]/g, ""),
      season,
      hasDates: true,
      finalDateOptional: true,
      finalAt: "center",
      parseLabel,
      expand,
      /** ★**九州地区大会の回数は通し番号。** 年は紙の会期から決めてある */
      yearOf: () => sheetYear,
      verify: { champion },
      // ★**凡例はスロット番号の外側にある**ので、切り落とす前の `raw` から読むこと
      venueLegend: () => {
        // 凡例「県：平和リース球場（鹿児島県立鴨池野球場）」「県は平和リース球場」
        const map = new Map();
        for (const l of raw.lines) {
          for (const m of l.text.matchAll(/(?:^|\t)([^\t\s])\s*[：:は]\s*([^\t]+?)(?=\t|$)/g)) {
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
  /*
    ★★**2026-08-26 に出典を「お知らせ一覧」から「過去データ」に替えた。**
    お知らせは今年ぶん16件しか残らないので**過去に遡れなかった**（夏だけ41試合）。
    `?page_id=29` は **1998年からの年ごとの一覧**で、各年に
    選手権石川大会・北信越地区石川県大会（春季・秋季）の試合結果PDFが並ぶ。
    ★3季とも同じページなので取得は1回で済ませる（`indexCache`）。
  */
  /*
    ★★★**春・夏・秋の3季**（春季・秋季は 2026-08-31 に追加）。

    ~~春季・秋季は準決勝以降が「打者ごとの成績まで入った箱スコア」に切り替わるので
    読み方が2つ要る~~ とあったのは**誤りだった。** 実際に紙を開いて確かめたところ、
    **県大会の紙は3季とも同じ形**（`◆球場 第N試合` の枠・各回の得点・合計・
    その下に正式な校名）で、**箱スコアは枠の右に足されるだけ。**
    ★**夏の読み手が 2026-08-31 に「210 で打ち切る」を入れて既に対応済み**
    （準々決勝以降は夏の紙でも箱スコアになる）。**足すだけで読めた。**
    ★**季節を見分ける仕掛けも `readSheet` に前から入っていた**
    （北信越の県大会は春も秋も同じ大会名なので、**紙の日付の月で決める**）。

    ★★**「読み方が2つ要る」と書いてあっても、紙を開いて確かめること。**
    滋賀の「スロット番号の行が無い」と同じで、**確かめずに書かれた見立て**だった。

    ★**同じ索引に北信越の『本大会』の紙も並ぶ**（`北信越地区高等学校野球大会`）。
    そちらは**他県の学校が出る**ので取らない —— `collect` の pattern が
    `北信越地区高等学校野球石川県大会` を求めているので混ざらない。
  */
  seasons: {
    spring: "https://ishikawa-hbf.jp/?page_id=29",
    summer: "https://ishikawa-hbf.jp/?page_id=29",
    autumn: "https://ishikawa-hbf.jp/?page_id=29",
  },
  indexCache: new Map(),
  /**
   * 「過去データ」を年の見出し（`<h1 class="entry-title2">2015年</h1>`）で切り、
   * その年の塊のリンクだけ返す。
   *
   * ★**年の見出しは暦年。** 春季（4〜5月）も秋季（8〜10月）も同じ暦年に入る。
   * ★**ここでの年は「取りに行く紙を絞る」ためだけ**で、
   * **本当の年は紙の日付から決める**（`readSheet`）。見出しが間違っていても出さない。
   */
  linksOfYear(html, base, year) {
    const parts = html.split(/<h1[^>]*class=["'][^"']*entry-title2[^"']*["'][^>]*>/i);
    const block = parts.find((p) => normalize(p.slice(0, 40)).startsWith(`${year}年`));
    if (!block) return [];
    const out = [];
    for (const a of block.matchAll(/<a[^>]+href=["']([^"']+\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      try {
        out.push({ url: new URL(a[1], base).toString(), label: normalize(plain(a[2])) });
      } catch {
        /* リンクが壊れているだけ */
      }
    }
    return out;
  },
  async collect({ fetchHtml, season, url, year }) {
    if (!this.indexCache.has(url)) this.indexCache.set(url, await fetchHtml(url));
    const index = this.indexCache.get(url);
    if (!index) return [];

    /*
      ★**その年・その季節の県大会のPDFだけ取りに行く。**
      同じ年の塊には甲子園・神宮・国スポ・一年生大会・研修会の資料も並ぶ。
      ★**「組合せ」だけのPDFも混ざる**（`97yagura.pdf`）。開いてスコアが無ければ
      次の候補に進むので、ここでは名前で外さない（年によって書き方が違うため）。
    */
    /*
      ★★★**索引の見出しは年で書き方がまるで違う**（2026-09-01 その2）。

        2013年〜 … 第107回全国高等学校野球選手権石川大会 ／ 第153回北信越地区高等学校野球石川県大会（秋季）
        2012年   … 第94回全国高校野球選手権石川大会      ／ 第126回北信越地区石川県大会（春）
        2010年   … 92回選手権石川大会（夏）              ／ 122回北信越石川県大会（春）
        2008年   … 90回選手権記念石川大会                ／ 118回北信越県大会(春)
        2007年   … 89選手権石川大会（夏）                ／ 116北信越石川県大会(春)
        2005年   … 第87回全国高校野球選手権石川大会

      ★**「全国高等学校野球選手権石川大会」で決め打ちしていたので、
        2005年と2007〜2012年が丸ごと落ちていた**
        （README に「2007〜2012年は出典に1本も無い」と書いてあったのは**誤り**）。
      ★**紙の中の大会名はどの年もそろっている**ので、
        索引の見出しは**「どのPDFを開くか」を決めるためだけ**でよい。
        本当の大会名も年も季節も、下の `readSheet` が紙から決める。

      ★★★**夏と春秋の見分けは `石川大会`（夏）と `県大会`（春秋）。**
        北信越の**本大会**（他県開催）は `第126回北信越大会（福井県開催）` で
        **`県大会` を含まない**（`福井県開催` は `県開` であって `県大` ではない）。
        ★**`118回北信越県大会(春)` と `118回北信越大会(春)` は「県」の1文字しか違わない。**
    */
    const pattern =
      season === "summer" ? /[0-9０-９].*選手権.*石川大会/ : /[0-9０-９].*北信越.*県大会/;
    const wanted = [];
    for (const link of this.linksOfYear(index, url, year)) {
      if (!pattern.test(link.label)) continue;
      /*
        ★**季節が名前に書いてある年は、そこで絞る**（`（春季）` `（秋季）`）。
        書いていない年もあるので、**書いていなければ落とさない**
        （紙の日付の月で決め直す。`readSheet`）。
      */
      /*
        ★**「季」が付かない年がある**（2007〜2012年は `（春）` `(秋)`）。
        ★**書いていなければ落とさない**のは今までどおり（紙の日付の月で決め直す）。
      */
      if (season !== "summer" && /[（(](春|秋)季?[）)]/.test(link.label)) {
        const s = /春/.test(link.label) ? "spring" : "autumn";
        if (s !== season) continue;
      }
      if (!wanted.some((w) => w.url === link.url)) wanted.push(link);
    }
    if (!wanted.length) return [];

    /*
      ★**お知らせの見出しは優勝校を持っている**
      （「第１０８回全国高等学校野球選手権石川大会 遊学館が優勝」）。
      紙とは別の場所から来る事実なので検算に足す。**今年ぶんしか残っていない**ので、
      無ければ紙の中の検算（イニングの和・勝ち上がり・チーム数）だけで判定する。
    */
    let announced = null;
    if (season === "summer" && year >= new Date().getFullYear() - 1) {
      const list = await fetchHtml("https://ishikawa-hbf.jp/?page_id=213");
      if (list) {
        for (const link of dailyLinks(list, "https://ishikawa-hbf.jp/", { hrefPattern: /\?p=\d+/ })) {
          const m = link.label.match(/第(\d+)回全国高等学校野球選手権石川大会\s*(\S+?)が優勝/);
          if (m && Number(m[1]) + 1918 === year) announced = m[2];
        }
      }
    }

    for (const pdf of wanted.slice(0, 4)) {
      const pages = await fetchPdfPages(pdf.url, { headers: UA });
      await sleep(this.politenessMs);
      if (!pages?.length) continue;
      const games = this.readSheet(pages, season, year, announced);
      if (games?.length) return games;
    }
    return [];
  },
  /**
   * スコア表を読む。**組めなければ空**（1試合も出さない）。
   *
   * @param year      取りに行った年。**紙の日付の年と一致しなければ読まない**
   * @param announced 連盟のお知らせが伝える優勝校（無ければ null）
   */
  readSheet(pages, season, year, announced) {
    const flat = pages.flatMap((p) => p.lines.map((l) => normalize(l.text.replace(/\t/g, ""))));
    /*
      ★**大会名は括弧の前まで**。紙によって `（令和７年度夏季）組み合わせ` や
      `試合結果` が続く。**年度と季節はこちらで付け直す**ので、ここでは本体だけ取る。
    */
    const core = flat
      .map(
        (t) =>
          t.match(/第\s*\d+\s*回\s*全国高等学校野球選手権石川大会/)?.[0] ??
          t.match(/第\s*\d+\s*回\s*北信越地区高等学校野球石川県大会/)?.[0],
      )
      .find(Boolean);
    if (!core) return null;
    const title = core.replace(/\s+/g, "");
    const isSummer = /選手権/.test(title);
    if (isSummer !== (season === "summer")) return null;

    const ROUNDS = new Set(["1回戦", "2回戦", "3回戦", "4回戦", "準々決勝", "準決勝", "決勝"]);
    /*
      ★★★**代表決定戦は勝ち抜きの枝ではないので出さない**（2026-08-31。秋季）。

        準決勝 → **代表決定戦** → 決勝   （紙の見出しがこの順で刷ってある）

      北信越の県大会は**3校が地区大会へ進む**ので、準決勝で負けた2校が
      **第3代表を決める試合**をする。★**紙が見出しで名指ししている**ので
      推測ではない（3位決定戦を出さない宮崎・沖縄・愛知・岐阜と同じ扱い）。

      ★**見出しを知らないままだと `round` が「準決勝」のまま**になり、
      **準決勝が3試合**になって「決勝に出ていない前の回戦の勝者がある（星稜）」で
      **その大会を丸ごと落としていた。**
      ★**「読めない」ではなく「読んだうえで出さない」**ので、件数はログに出す。
    */
    /*
      ★★**代表決定戦の見出しは紙によって書き方が違う**（2026-08-31 その3）。

        代表決定戦 ／ 第3代表決定戦 ／ **第3代表、第4代表決定戦**

      ★**「第3代表決定戦」だけを名指しすると、3つ目の書き方で落ちる**
      （2019年秋は `42チームに42試合` になっていた）。**末尾で見る。**
      ★**行が短いことも条件にする**（本文の一部を見出しと取り違えないため）。
    */
    const SKIP_ROUNDS = new RegExp("(代表決定戦|位決定戦)$");
    const isSkipHeading = (t) => t.length <= 16 && SKIP_ROUNDS.test(t);
    /*
      ★★**決勝の見出しは `決勝` と `決勝戦` の2通りある**（2026-08-31 その3）。
      ★**`決勝戦` を知らないと `round` が前の見出しのまま**になり、
      決勝が「第3代表決定戦」や「準決勝」として読まれて大会が落ちる。
      ★**`決定戦` は `決勝戦` ではない**ので、上の SKIP を先に見る。
    */
    const ROUND_ALIASES = new Map([
      ["決勝戦", "決勝"],
      ["準決勝戦", "準決勝"],
      ["準々決勝戦", "準々決勝"],
    ]);
    const SKIP = "__出さない__";
    /**
     * `6x` `X` `１２` を数にする。**`Number("6x")` は NaN なので直に渡さない**
     *
     * ★★**サヨナラの印は年で書き方が違う**（2026-09-01 その2）。
     * 2013年以降は `6x` と1つの断片だが、**2007〜2012年の紙は `1 ×`**
     * （半角空白＋全角の `×`）で、**そのイニングの得点が丸ごと読めず**
     * 「イニングの和が合計と合わない」で**大会が丸ごと落ちていた**（実測5年ぶん）。
     */
    const score = (t) => {
      const s = normalize(t.trim());
      const m = s.match(/^(\d{1,2})\s*[xX×✕]?$/);
      return m ? Number(m[1]) : null;
    };
    /**
     * ★★★**得点が1つの断片に潰れている紙がある**（2026-09-01 その2。2007〜2012年）。
     *
     *     明倫 … 1(367.9) 1(380.2) 2(392.4) 0(404.7) **`0 7x`(416.9 幅19)** 合計 `11x`
     *     寺井 … 8(87.4)  **`13 36 13`(97.6 幅33)** X(136.0)               合計 `70x`
     *
     * ★**潰れた断片は `score()` に当たらない**ので、そのイニングが和に入らず
     * 「イニングの和が合計と合わない」で**大会が丸ごと落ちていた**（実測6年ぶん）。
     * ★★**位置は「断片の幅を文字数で割る」**（滋賀の `explodeNumberRuns` と同じ考え方）。
     * **代表的な字送りで見積もらないこと** —— 紙によって字送りが違う。
     * ★**得点らしい並びだけを割る**（`13 36 13`・`0 7x`）。
     * 日付や球場名のように**得点でない字が混じる断片には触らない。**
     * ★**和が印刷された合計と一致することが検算**なので、割り方を誤れば必ず落ちる
     * （実際、寺井の `8+13+36+13` は印刷された合計 `70` とぴったり合う）。
     */
    const splitScoreRuns = (page) => ({
      page: page.page,
      lines: page.lines.map((line) => {
        const items = line.items.flatMap((it) => {
          const raw = normalize(it.text).trim();
          if (!/^\d{1,2}[xX×✕]?(?:[ 　]+\d{1,2}[xX×✕]?)+$/.test(raw) || !(it.width > 0)) return [it];
          const per = it.width / it.text.length;
          const lead = it.text.length - it.text.trimStart().length;
          const out = [];
          let seen = 0;
          for (const part of raw.split(/[ 　]+/)) {
            const at = raw.indexOf(part, seen);
            out.push({ ...it, x: it.x + (lead + at) * per, width: part.length * per, text: part });
            seen = at + part.length;
          }
          return out;
        });
        items.sort((a, b) => a.x - b.x);
        return { y: line.y, items, text: items.map((i) => i.text).join("\t") };
      }),
    });

    /** `平成27年7月11日` / `令和7年7月12日` → `{ year, month, day }` */
    const parseDate = (t) => {
      const d = t.match(/(令和|平成)(元|\d+)年(\d+)月(\d+)日/);
      if (!d) return null;
      const n = d[2] === "元" ? 1 : Number(d[2]);
      return { year: (d[1] === "令和" ? 2018 : 1988) + n, month: Number(d[3]), day: Number(d[4]) };
    };

    /*
      ★★★**紙の縮尺は「枠と枠の間隔」で測る**（2026-08-31 その3）。

        2026年夏 … 枠の間隔 192・合計は枠の左端から 167
        2025年秋 … 　　　　 194・　　　　　　　　　　 167
        2015年夏 … 　　　　 266・　　　　　　　　　　 231
        2004年秋 … 　　　　 379・　　　　　　　　　　 332

      **比はどの紙でも 0.87 前後**で、**合計の位置は枠の幅そのもの**である。
      ★★**それまでは「枠の左端から 120〜200 にある数字のいちばん右」で測っていた**が、
      **枠が広い紙では 120〜200 に各回の得点が入ってしまい、縮尺が 0.88 になる**
      （本当は 1.39）。**そのまま校名の窓を作るので「校名の行が読めない」で
      大会が丸ごと落ちていた**（2004〜2006・2013〜2015年）。
      ★**枠が2つ並ぶ行を探して測る。** 1つしか無い紙は今までどおりの測り方に戻す。
      ★**基準は 2026年の紙**（間隔 192・合計 166.8）。
    */
    let frameGap = null;
    for (const page of pages) {
      for (const line of page.lines) {
        const ms = line.items.filter((it) => it.text.trim().startsWith("◆"));
        if (ms.length >= 2) {
          frameGap = ms[1].x - ms[0].x;
          break;
        }
      }
      if (frameGap !== null) break;
    }

    const games = [];
    /** 不戦勝の枠。`{ round, won, pair }`。勝ち上がりの検算にだけ使う */
    const byes = [];
    /** 読んだが出さない試合（代表決定戦）。件数と中身を必ずログに出す */
    const skipped = [];
    // ★回戦と日付は**ページをまたいで続く**。ページごとに捨てないこと
    /** いまの回戦の帯。`[{ x, name }]`。1行に見出しが2つ並ぶ紙があるので配列で持つ */
    let roundBands = null;
    /** 枠の x にいちばん近い帯の回戦名 */
    const roundAt = (x) =>
      roundBands?.slice().sort((p, q) => Math.abs(p.x - x) - Math.abs(q.x - x))[0]?.name ?? null;
    let date = null;
    /** ★**1行に日付が2つ並ぶ紙のための帯**（下の説明を読むこと）。無ければ `date` を使う */
    let dateBands = null;
    /**
     * 枠の日付。★**日付の見出しは「そこから右の枠」に効く**ので、
     * **枠の左端より左にある最後の見出し**を採る（無ければいちばん左のもの）。
     * ★**「いちばん近い」ではない** —— 3枠2日付の紙で、3つ目の枠が
     * どちらの見出しに属するかが 1 ポイント差で決まってしまう。
     */
    const dateAt = (x) => {
      if (!dateBands) return date;
      const left = dateBands.filter((b) => b.x <= x + 5);
      return (left.length ? left.at(-1) : dateBands[0]).date;
    };
    let months = [];
    /** ★**紙の縮尺は1枚で一定。** 最初に測れた枠の値をそのまま使う */
    let scale = null;
    for (const [pi, page0] of pages.entries()) {
      // ★潰れた得点の断片をほどく（上の `splitScoreRuns` の説明を読むこと）
      const page = splitScoreRuns(page0);
      const lines = page.lines;
      /*
        ★★★**枠がページのいちばん下にあると、校名の行が次のページの頭にある**
        （2026-09-01。2006年夏の2回戦）。

            ページN の終わり … ◆枠／得点／得点／（7回コールド）
            ページN+1 の頭   … 金沢西  大聖寺  小松  七尾        ← 校名の行

        ★**ページごとに切って読んでいたので「校名の行が読めない」で大会が丸ごと落ちていた。**
        ★**校名を探すときだけ次のページの頭を継ぎ足す**（枠の走査は今までどおり
        ページ単位。継ぎ足したぶんを走査に入れると同じ試合を2回読む）。
        ★**校名の行は y を見ずに x だけで決める**ので、ページをまたいでも意味が壊れない。
      */
      const nameLines = pages[pi + 1] ? [...lines, ...splitScoreRuns(pages[pi + 1]).lines.slice(0, 6)] : lines;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const text = normalize(line.items.map((it) => it.text.trim()).join(""));
        const headingOf = (t) => {
          if (isSkipHeading(t)) return SKIP;
          const al = ROUND_ALIASES.get(t) ?? t;
          return ROUNDS.has(al) ? al : null;
        };
        const whole = headingOf(text);
        if (whole) {
          roundBands = [{ x: line.items[0].x, name: whole }];
          continue;
        }
        /*
          ★★★**回戦の見出しが1行に2つ並ぶ紙がある**（2026-08-31 その4。2021年夏）。

              ３回戦(x=188)            準々決勝(x=476)
              ◆(15) ◆(210)            ◆(404)          ← 枠は同じ行に3つ

          行をつないで見ると `3回戦準々決勝` になり、**どの見出しにも当たらない**ので
          `round` が前の見出しのまま**になり、3回戦と準々決勝が混ざっていた。**
          ★**見出しは自分の枠の group の中央に刷ってある**ので、
          **枠にいちばん近い見出しを当てる。**（実測：3回戦8試合・準々決勝4試合に分かれる）
          ★**断片が全部見出しのときだけ**この道を通る。
          1つしか無い紙は今までどおり（帯が1本なら必ずそれが選ばれる）。
        */
        if (line.items.length >= 2) {
          const each = line.items.map((it) => {
            const name = headingOf(normalize(it.text.trim()));
            return name ? { x: it.x, name } : null;
          });
          if (each.every(Boolean)) {
            roundBands = each;
            continue;
          }
        }
        const d = parseDate(text);
        if (d) {
          /*
            ★**紙の日付の年が、取りに行った年と違えば1試合も出さない。**
            「過去データ」の年の見出しと紙の中身は別々の場所から来るので、
            連盟が別の年の紙を貼っていたらここで止まる。
          */
          if (d.year !== year) {
            console.log(`  ⚠️ 石川: 紙の日付が ${d.year} 年（取りに行ったのは ${year} 年）。1試合も出さない`);
            return [];
          }
          const iso = (v) => `${v.year}-${String(v.month).padStart(2, "0")}-${String(v.day).padStart(2, "0")}`;
          date = iso(d);
          months.push(d.month);
          /*
            ★★★**1行に日付が2つ並ぶ紙がある**（2026-09-01 その4。2011年春の決勝）。

                平成23年5月8日(x=30.8)              平成23年5月9日(x=311.5)
                ◆石川県立野球場 第1試合(x=30.5)    ◆金沢市民野球場 再試合(x=311.2)
                金沢 3 - 3 遊学館（延長15回引き分け）  遊学館 6 - 5 金沢

            **引き分けとその再試合が左右に並んで刷られている。**
            ★**行をつないで最初の日付だけを採ると、再試合まで 5月8日**になり、
            「引き分けの再試合が紙に無い」（＝後日の同じ顔合わせを求める検算）で
            **大会が丸ごと落ちていた。**
            ★**日付も回戦と同じで、枠にいちばん近いものを当てる。**
            ★**断片が2つ以上とも日付のときだけ**この道を通る（1つの紙は今までどおり）。
          */
          const eachDate = line.items.map((it) => {
            const v = parseDate(normalize(it.text));
            return v && v.year === year ? { x: it.x, date: iso(v) } : null;
          });
          dateBands = eachDate.filter(Boolean).length >= 2 ? eachDate.filter(Boolean) : null;
          if (dateBands) for (const b of dateBands) months.push(Number(b.date.slice(5, 7)));
          continue;
        }
        let marks = line.items.filter((it) => it.text.trim().startsWith("◆"));
        /*
          ★★★**枠の見出しも同じ場所に2度描いてある紙がある**（2026-09-01 その4。2007年春）。
          **太字を重ね打ちしたPDF**で、`◆石川県立野球場` が同じ x に2つ返ってくる。
          ★**そのままだと枠が4つに見え**、**1つ目の枠の試合が2回出て、
          2つ目の枠の試合が丸ごと落ちる**（実測: 同じ試合が2件・3回戦が1試合欠けた）。
          ★**同じ位置の同じ見出しは1つ。**
        */
        marks = marks.filter(
          (m, k) => !marks.some((o, j) => j < k && Math.abs(o.x - m.x) < 0.5 && o.text === m.text),
        );
        if (!marks.length) continue;
        /*
          ★★**中止・順延の枠がある**（2026-08-26。2024年夏ほか）。

            ◆石川県立野球場 第1試合
            飯田 - 羽咋   雨天により中止、順延

          **枠はあるが試合は行われていない。** 読もうとすると
          「読めない枠がある」で**その大会を丸ごと落としていた**（実測4年ぶん）。
          ★**枠ごと飛ばす。** 順延先の日に同じ顔合わせが改めて載る。
        */
        /*
          ★★★**不戦勝も枠を使う**（2026-08-31 その3）。紙は枠の中に**文で**書く。

              北陸学院 と 鵬学園の試合は、鵬学園の不戦勝
              遊学館 と 星稜の試合は、遊学館の不戦勝

          **枠はあるが試合は行われていない**ので、**枠ごと飛ばす**
          （大阪・群馬・愛知と同じ扱い。**0対0にしない**）。
          ★**辞退した側はこの大会のどこにも出てこなくなる**が、
          **「チーム数 − 1 = 決着した試合」は崩れない**（出場も試合も1つずつ減るため）。

          ★★**注記の行は枠の3行下にあることもある**（2023年春の中止・順延）。

              金沢錦丘-金沢学院大附          ← +2
              天候不良により中止　順延      ← **+3**

          ★**+2 までしか見ていなかったので、その枠を読もうとして大会ごと落としていた。**
        */
        const notPlayed = /中止|順延|ノーゲーム|不戦勝|棄権/;
        /**
         * ★**この塊のどこかに「中止・順延」の注記があるか**（x を見ない）。
         * ★**枠のあいだに1つだけ刷られる紙がある**ので、下の枠ごとの絞り込み
         * （枠から 200 ポイント以内）では届かない。**数字が1つも無い枠にだけ効かせる。**
         */
        const groupNotPlayed = notPlayed.test(
          normalize(
            [line, lines[i + 1], lines[i + 2], lines[i + 3]]
              .filter(Boolean)
              .flatMap((l) => l.items.map((it) => it.text))
              .join(""),
          ),
        );
        marks = marks.filter((mark) => {
          const within = [line, lines[i + 1], lines[i + 2], lines[i + 3]].filter(Boolean).flatMap((l) =>
            l.items.filter((it) => it.x >= mark.x && it.x < mark.x + 200).map((it) => it.text),
          );
          const note = normalize(within.join("")).replace(/[\s　]/g, "");
          if (!notPlayed.test(note)) return true;
          /*
            ★★★**不戦勝は「上がった側」まで紙に書いてある**（2026-08-31 その4）。

                遊学館 と 星稜の試合は、遊学館の不戦勝

            ★**枠を飛ばすだけだと、勝ち上がりの検算が落ちる** ——
            前の回戦の勝者（星稜・遊学館）が次の回戦に出てこないため。
            ★**辞退した側は本当にもう出てこない**ので、検算のほうを直すのが正しい。
            ★**紙が名指ししている**ので推測ではない。**読めなければ何も足さない**
            （そのときは今までどおり検算に落ちて、その大会は1試合も出さない）。
          */
          /*
            ★**枠の見出し（`◆石川県立野球場第2試合`）を先に落とすこと。**
            残したまま当てると、いちばん外の `(.+?)` がそれを飲み込んで
            **1校目が `◆石川県立野球場第2試合遊学館` になる**（実際になった）。
          */
          const body = note.replace(new RegExp("^◆.*?第[0-9０-９]+試合"), "");
          /*
            ★**読点の有無は年で違う**（2026-09-01 その4）。

                2023年 … 遊学館 と 星稜の試合は、遊学館の不戦勝
                2007年 … 北陸大谷 と 金沢泉丘の試合は金沢泉丘の不戦勝です。   ← **読点が無い**

            ★**読点を必須にしていたので当たらず**、辞退した側も上がった側も
            「前の回戦の勝者が次の回戦にいない」で**大会が丸ごと落ちていた。**
          */
          const m = body.match(new RegExp("(.+?)と(.+?)の試合は、?(.+?)の不戦勝"));
          if (m) {
            const [, x1, x2, won] = m;
            if ([x1, x2].includes(won)) byes.push({ round: roundAt(mark.x), won, pair: [x1, x2] });
          }
          return false;
        });
        if (!marks.length) continue;
        if (!roundBands || !date) {
          console.log("  ⚠️ 石川: 回戦か日付が分からない試合がある。1試合も出さない");
          return [];
        }
        const rows = [lines[i + 1], lines[i + 2]];
        if (!rows[0] || !rows[1]) continue;

        /*
          ★★**枠の中の窓は紙によって縮尺が違う**（2026-08-26）。
          2019年以前の紙は**合計が枠の左端＋141.8**、2026年の紙は**＋166.8**で、
          校名の位置も少しずつ内側にある。決め打ちだと**合計が読めず、
          その大会を丸ごと落としていた**（実測6年ぶん）。

          ★**縮尺は「各回の得点の列の間隔」で測れる。**
          2026年は 8.15ポイント・2019年は 6.85ポイントで、
          比 0.84 を窓に掛けると 166.8×0.84＝140 ≒ 141.8、
          校名 40.8/106.1×0.84＝34.3/89.1 ≒ 33.9/88.9 と合う。

          ★**得点の行の「隣どうしの間隔の中央値」を使う。**
          行は「校名 → 各回の得点 → 合計」で、**間隔の数はイニングがいちばん多い**ので、
          中央値を取ればイニングの列の間隔になる（校名の広い隙間と、
          合計の手前の広い隙間は中央値に影響しない）。
          ★**枠の中の順番で読み替える案は試して戻した** ——
          **準々決勝以降は打者ごとの成績まで並ぶ「箱スコア」**になり、
          枠の右に数字が何十個も入るので、順番で読むと合計を取り違える。
        */
        /*
          ★★★**縮尺は「各回の列の間隔」ではなく「合計までの距離」で測る**
          （2026-08-31 に直した）。

          2016年の紙は**各回の列の間隔だけが広い**（8.4。2026年は 8.15）のに、
          **枠の幅は同じ**（合計まで 165.1 対 166.8）。間隔から測ると縮尺が 1.03 になり、
          **各回の窓の左端が 1回表の得点より右にずれて、その1点が和から抜ける** ——
          「イニングの和が合計と合わない」で**その大会が丸ごと落ちていた**（2016・2017年）。

          ★**合計の位置は枠そのものの幅**なので、窓を作る目的にはこちらが正しい。
          ★**候補は「枠の左端から 120〜200」の数字のいちばん右**
          （各回の得点は 145 より内側、次の枠は 190 より外側にある）。
          ★**見つからなければ今までどおり 1 倍**（紙が変わったときに黙って壊れない）。
        */
        if (scale === null) {
          const cands = rows.flatMap((row) =>
            row.items
              .filter((it) => score(it.text) !== null)
              .map((it) => it.x - marks[0].x)
              .filter((d) => d >= 120 && d <= 200),
          );
          // 2026年の紙が基準（枠の間隔 192・枠の左端から合計まで 166.8）
          scale = frameGap !== null ? frameGap / 192 : cands.length ? Math.max(...cands) / 166.8 : 1;
        }
        const win = (lo, hi) => [lo * scale, hi * scale];

        /*
          校名の行。**ラベル列（枠の左端から 10〜35）に何も無い**行で、
          先攻と後攻の2つが並ぶ。
          あいだに「（5回コールド）」の行が入ることがあるので、少し下まで探す。

          ★★★**校名の列は縮尺を掛けてもぴったり揃わない**（2026-08-31 その5）。
          40枚の紙で実測すると **1つ目 37〜56・2つ目 98〜124**（縮尺で割った値）。

              2026年夏 … 41 / 106      2004年春 … 47 / 118
              2015年夏 … 37 / 104      2001年夏 … 50 / 121

          ★**古い紙ほど外に出る。** 既定の 36〜50 / 100〜115 では
          **2000〜2006年の紙が「校名の行が読めない」で丸ごと落ちていた。**
          ★**実測の幅に合わせて広げてある。これ以上広げないこと** ——
          広げると「投手 ◯◯ ◯◯」の行を校名の行と取り違える。
        */
        /*
          ★★★**校名は「窓」ではなく「枠のあいだ」で拾う**（2026-09-01 に作り替えた）。

          それまでは ◆ からの距離（34〜130 に縮尺を掛けたもの）で拾っていたが、
          **◆ の位置は枠の中身と揃っておらず、しかも校名は枠の中で中央に組まれる**ので、
          **同じ紙の中で左端が 68〜98 とばらつく**（2004年春の実測）:

              ◆(59)  … 小松明峰(157)  輪島(302)
              ◆(457) … 日本航空第二(525)  大聖寺実業(665)   ← 6文字ぶん左から始まる

          ★**そのせいで「校名が1件しか無い」で大会が丸ごと落ちていた**（実測5年ぶん）。
          ★★**中央（左端＋幅の半分）で見ると、どの行も同じ位置に来る**
          （実測 178.9 / 313.3 / 558.1 / 692.5 が全行で一致）。
          ★**枠の境目で切って「その枠に属する校名がちょうど2つ」を求める。**
          窓の当て推量が要らず、紙ごとの縮尺にも左右されない。
        */
        /** 校名らしい断片か。★**注記・ラベル・罫線の「｜」・サヨナラの `x` は校名ではない** */
        const nameLike = (it) => {
          const t = it.text.trim();
          if (!t) return false;
          // ★校名に括弧・数字は入らない（`（5回コールド）` `8` を落とす）
          if (/[（）()【】]/.test(t) || /[0-9０-９]/.test(t)) return false;
          // ★**校名は必ず漢字か仮名を含む。** これで罫線の `｜` もサヨナラの `x` も落ちる
          return /[぀-ヿ㐀-鿿]/.test(t) && !/^(投手|捕手)$/.test(t);
        };
        const centreOf = (it) => it.x + (it.width || 0) / 2;
        /** 枠 `mi` の左右の境目。★**ゆるみは紙の縮尺に合わせる** */
        /*
          ★★★**いちばん右の枠にも右端が要る**（2026-09-01 その4。2010年夏の決勝）。

              ◆石川県立野球場(30.5)          ← 決勝は1枠だけ
              遊学館(84.8)  尾山台(182.8)  **遊学館高校は(388.0)**   ← 右に注記が刷ってある

          ★**右端が無いと注記まで校名として数えて「3つある」になり**、
          「校名の行が読めない枠がある」で**大会が丸ごと落ちていた。**
          ★**枠の幅は紙の中で一定**（`scale` はその幅から測ってある）ので、
          **次の枠が始まるはずの位置で切る。** 校名の2つ目は枠の左端から
          124（縮尺で割った値）までなので、192 で切っても届かない。
        */
        const spanOf = (mi) => [
          marks[mi].x - 20 * scale,
          marks[mi + 1] ? marks[mi + 1].x - 20 * scale : marks[mi].x + 192 * scale,
        ];
        /** 枠 `mi` に属する校名 */
        const namesIn = (row, mi) => {
          const [from, to] = spanOf(mi);
          return row.items.filter((it) => nameLike(it) && centreOf(it) >= from && centreOf(it) < to);
        };
        /*
          ★★★**校名の行は「枠ごと」に探す**（2026-09-01）。

          **左右の枠で校名の行が違う紙がある** —— 右の枠の校名が、
          左の枠のバッテリーの段と同じ行に刷られている:

              y=233                                    金沢商業  金沢二水   ← 右の枠の校名
              y=218   遊学館  七尾    投手 掛上 剛 …               ← 左の枠の校名＋右の枠の投手

          ★**「1つの行に全部の枠の校名が2つずつ」を求めると、この紙は読めない**
          （2000・2003・2005年秋がこれで丸ごと落ちていた）。
          ★**打ち切りの判定も枠ごとに**すること —— 上の例では、左の枠を探しているときに
          右の枠の「投手」で打ち切ってしまう。
        */
        const nameRowOf = (mi) => {
          const [from, to] = spanOf(mi);
          for (let k = i + 3; k < Math.min(i + 8, nameLines.length); k++) {
            const row = nameLines[k];
            /*
              ★**バッテリーの段まで来たら打ち切る。** 校名の行は必ずその手前にある。
              ★**打ち切らないと、投手の名前が2つ並んだ行を校名の行として拾う**
              （2005年秋は `剛 / 濱坂 / 拓生` を校名として読んでいた）。
            */
            const own = row.items.filter((it) => centreOf(it) >= from && centreOf(it) < to);
            if (own.some((it) => /^(投手|捕手)$|^【/.test(it.text.trim()))) break;
            if (namesIn(row, mi).length === 2) return row;
          }
          return null;
        };

        for (const [mi, mark] of marks.entries()) {
          /*
            ★★★**窓は「次の枠の手前」で打ち切る**（2026-08-31）。
            1行に枠が3つ並ぶ紙があり（`◆石川県立野球場 第1試合` が3回）、
            **次の枠の1回表・2回表が、この枠の合計の窓（110〜210）に入ってくる**
            （枠の幅が 164.8 しかない年がある）。
            ★**そのままだと隣の枠の得点を合計として読み**、和が合わずに大会が丸ごと落ちる。
          */
          const round = roundAt(mark.x);
          // ★**日付も枠ごと**（上の `dateBands` の説明を読むこと）
          const frameDate = dateAt(mark.x);
          const nextMark = marks[mi + 1];
          /*
            ★★**合計の窓も紙の縮尺に合わせる**（2026-08-31 その3）。
            それまで 110〜210 を素の値で使っていて、**枠の広い紙では合計が窓の外**
            （2015年の紙は合計が 231）。他の窓は最初から `win()` で縮尺を掛けている。
          */
          const [totalLo, totalHi] = win(110, 210);
          const frameEnd = nextMark ? Math.min(totalHi, nextMark.x - mark.x - 5) : totalHi;
          /*
            ★★★**合計の位置は枠ごとに違う**（2026-08-31 に直した）。

              ふつうの試合   … 校名 ｜ 9回ぶんの得点 ｜ 合計（枠の左端から 166.8）
              延長13回の試合 … 校名 ｜ 13回ぶんの得点 ｜ 合計（枠の左端から 150.2）

            ★**回が増えると合計も右へ動く**ので、**固定の窓では拾えない**
            （2017年は延長13回の試合で最終回が窓から外れ、大会ごと落ちていた）。
            ★**紙の縮尺も年で違う**（2017年は枠が狭く、合計まで 144.9）。

            ★★**枠の中の「110〜210 にある数字のいちばん右」を合計とする。**
            **各回の得点はそれより左**、**次の枠は 190 より右**にある。
            ★★**210 で打ち切るのが要**（2026-08-31）——
            **準々決勝以降は同じ行に打者ごとの箱スコアが続く**（`(捕) 高磯 空汰 5 0 0 4 0 …`）。
            **いちばん右の数字を素直に採ると、その打数を合計として読む。**
            箱スコアは枠の左端から 250 より右にしか出てこない。
            ★**各回の得点は「34 から合計の手前まで」。** 2桁の得点は1桁より左端が出るので
            下限に余裕を持たせてある（`12` は `1` より 1.2 ポイント左。福島・群馬と同じ形）。
          */
          const sides = rows.map((row) => {
            const cells = row.items
              .map((it) => ({ d: it.x - mark.x, v: score(it.text) }))
              .filter((c) => c.v !== null)
              .sort((a, b) => a.d - b.d);
            /*
              ★★★**同じ字が同じ場所に2度描いてある行がある**（2026-09-01 その4。2007年春）。

                  輪島実(42.4) 輪島実(42.4) 0(87.4) 0(87.4) 0(99.6) 0(99.6) … 5(273.8) 5(273.8)

              **太字を重ね打ちしたPDF**で、pdf.js は素直に2つ返す。
              ★**そのまま数えると各回が18個になり、和が倍になって大会が丸ごと落ちる**
              （実測 `0+0+0+0+0+0+0+0+5+5+0+0+0+0+0+0+0+0=10 合計5`）。
              ★**同じ位置に同じ数字は1つ。** 列は1つの値しか持たないので、取り違えようがない。
            */
            for (let k = cells.length - 1; k > 0; k--) {
              if (Math.abs(cells[k].d - cells[k - 1].d) < 0.5 && cells[k].v === cells[k - 1].v) {
                cells.splice(k, 1);
              }
            }
            const totalCell = cells.filter((c) => c.d >= totalLo && c.d <= frameEnd).at(-1) ?? null;
            /*
              ★★★**各回の得点の下限は「枠の左端から34」ではなく「枠の左端そのもの」**
              （2026-09-01 に直した）。

              **◆の位置は枠の中身とぴったり揃っていない紙がある。**
              2004年春（第110回）の1枚目は、同じ行の2つの枠で

                  ◆(59)  金沢商(77)  … 1回表(134)     ← ◆ より校名が 18 右
                  ◆(457) 金高専(456) … 1回表(514)     ← ◆ より校名が 1 **左**

              と 19 ポイントずれており、**縮尺 2 倍の紙では窓が 38 ポイント動く。**
              ★**その結果、右の枠だけ1回表が窓から外れて和に入らず**、
              「イニングの和が合計と合わない」で**大会が丸ごと落ちていた。**

              ★**下限はもともと「得点の始まるあたり」という目安でしかなく、
              何かを守っていたわけではない。** 上限（合計の手前）が
              **箱スコアを外す本体**で、そちらは触っていない。
              ★**校名は数字ではない**ので、下限を 0 にしても拾うものは増えない。
              ★**16年ぶん35大会を再生成して、生成物が1試合も変わらないことを確かめてある。**
            */
            /*
              ★★★**各回の欄は等間隔に並ぶ。その並びが途切れたら、そこから先は各回ではない**
              （2026-09-01 その4。2012年夏）。

                  金沢  1(59) 3(72) 0(85) 0(97) 3(110) 1(123) 0(135)  **8(237)**  8(253)
                                                                       ↑ここだけ余分

              **7回コールドの試合で、合計（253）と同じ数字がもう1つ 237 に刷ってある紙**があり、
              **それが各回に混ざって和が 16 になり**（合計8）、**大会が丸ごと落ちていた。**
              ★**その紙の他の枠はどれも 9回の欄が 160.8・合計が 252.9** で、
              **237 という欄はどこにも無い。**
              ★**欄の間隔（実測 12.7）の3倍を超えて空いたら、そこで打ち切る。**
              **1〜2回ぶん空欄でも打ち切らない**（コールドで途中から空くのはふつう）。
            */
            const inningCells = totalCell
              ? cells.filter((c) => c.d >= 0 && c.d < totalCell.d - 3)
              : [];
            const gaps = inningCells.slice(1).map((c, k) => c.d - inningCells[k].d).sort((a, b) => a - b);
            const pitch = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
            let end = inningCells.length;
            if (pitch > 0) {
              for (let k = 1; k < inningCells.length; k++) {
                if (inningCells[k].d - inningCells[k - 1].d > pitch * 3) {
                  end = k;
                  break;
                }
              }
            }
            const innings = inningCells.slice(0, end).map((c) => c.v);
            /*
              ★★★**読めない字の欄がある**（2026-09-01 その4。2008年春）。

                  寺井  #(95.0) 1(106.3) 2(117.6) 5(128.9) x(140.1) … 21x(262.5)

              **1回の得点が `#`** で、`score()` が null を返して欄ごと消えるため、
              **和が 8 にしかならず**（合計21）**大会が丸ごと落ちていた。**
              ★★**画面に出すのは合計だけ**（各回は検算にしか使っていない）ので、
              **1つ読めなくても試合の中身は正しく出せる。**
              ★**そのときは「読めた各回の和が合計を超えない」までにゆるめる**
              （読めない欄の値は合計から一意に決まる。当て推量ではない）。
              ★**ゆるめるのは、その行に読めない字の欄が本当にあるときだけ。**
            */
            const unreadable = row.items.some((it) => {
              const t = normalize(it.text).trim();
              if (!t || score(it.text) !== null) return false;
              if (!/^[#＃□■?？]$/.test(t)) return false;
              const d = it.x - mark.x;
              return d >= 0 && (totalCell ? d < totalCell.d - 3 : true);
            });
            return { innings, total: totalCell?.v ?? null, unreadable };
          });
          const nameRow = nameRowOf(mi);
          if (!nameRow) {
            /*
              ★**枠に数字が1つも無く、塊に中止・順延の注記があるなら試合は行われていない。**
              校名の行が無いのは当たり前なので、ここでは落とさず飛ばす。
            */
            if (sides.every((s) => s.total === null && !s.innings.length) && groupNotPlayed) continue;
            console.log(`  ⚠️ 石川: 校名の行が読めない枠がある（${round}・${frameDate}）。1試合も出さない`);
            /*
              ★**詰まったら `ISHIKAWA_DEBUG=1`**（2026-09-01）。
              候補の行と、枠ごとに何件を校名として拾ったかを出す。
              **紙の年代ごとに組み方が違う**ので、これが無いと当てずっぽうになる。
            */
            if (process.env.ISHIKAWA_DEBUG) {
              for (let k = i + 1; k < Math.min(i + 8, nameLines.length); k++) {
                console.log(
                  `  [debug]  y=${nameLines[k].y.toFixed(0)} [${marks.map((_, j) => namesIn(nameLines[k], j).length).join(",")}] ` +
                    nameLines[k].items.map((it) => `${it.x.toFixed(0)}:${it.text}`).join(" "),
                );
              }
            }
            return [];
          }
          const names = namesIn(nameRow, mi).map((it) => it.text.trim());
          /*
            ★★★**中止・順延の注記が枠の外に刷ってある紙がある**（2026-09-01。2004年春）。

                ◆石川県立野球場 第3試合(59)      ◆金沢市民野球場 第3試合(457)
                            ※雨天のため４月２０日に順延(344)      ← **枠のあいだに1つだけ**

            上の `notPlayed` の絞り込みは**枠から 200 ポイント以内**しか見ないので、
            ★**縮尺2倍の紙ではこの注記に届かず**、両方の枠を読もうとして
            「読めない枠がある」で**大会が丸ごと落ちていた。**
            ★**注記が同じ塊にあり、しかもこの枠に数字が1つも無いなら、試合は行われていない。**
            **0対0にせず、枠ごと飛ばす**（大阪・石川の不戦勝と同じ扱い）。
          */
          if (sides.every((s) => s.total === null && !s.innings.length) && groupNotPlayed) continue;
          if (names.length !== 2 || sides.some((s) => s.total === null || !s.innings.length)) {
            /*
              ★**何が読めなかったのかを出す**（2026-09-01）。
              「読めない枠がある」だけでは、**校名が拾えないのか合計が拾えないのか**が
              分からず、新しい年代の紙を足すたびに当てずっぽうになる。
            */
            console.log(
              `  ⚠️ 石川: 読めない枠がある（${round}・${frameDate}）。1試合も出さない` +
                `［校名 ${names.length} 件: ${names.join("/") || "なし"}／` +
                sides
                  .map((s) => `合計 ${s.total ?? "なし"}・各回 ${s.innings.length} 個`)
                  .join("／") +
                `］`,
            );
            return [];
          }
          /*
            ★**試合ごとの検算**: 各回の得点の和 == 印刷された合計。
            ★**読めない字の欄がある行だけ「和が合計を超えない」にゆるめる**（上の `unreadable`）。
          */
          const bad = sides.find((s) => {
            const sum = s.innings.reduce((x, y) => x + y, 0);
            return s.unreadable ? !(sum <= s.total) : sum !== s.total;
          });
          if (bad) {
            // ★**何が読めていないのかを出す**（2026-09-01 その2）。紙ごとに組み方が違う
            console.log(
              `  ⚠️ 石川: イニングの和が合計と合わない（${names.join(" vs ")}・${round}・${date}）。1試合も出さない` +
                `［${sides.map((s) => `${s.innings.join("+")}=${s.innings.reduce((x, y) => x + y, 0)} 合計${s.total}`).join(" ／ ")}］`,
            );
            return [];
          }
          /*
            ★**代表決定戦はここまで読んだうえで出さない**（上の `SKIP_ROUNDS`）。
            ★**読まずに飛ばさないこと** —— 枠の検算（イニングの和＝合計）は
            通しておきたいし、読めない枠があるなら大会ごと落としたい。
          */
          if (round === SKIP) {
            skipped.push(`${frameDate} ${names[0]} ${sides[0].total} - ${sides[1].total} ${names[1]}`);
            continue;
          }
          games.push({
            date: frameDate,
            season,
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
    if (process.env.ISHIKAWA_DEBUG) {
      console.log(`  [debug] ${title}: ${games.length}試合`);
      for (const g of games)
        console.log(
          `  [debug]   ${g.date} ${g.round} ${g.venue} ` +
            g.teams.map((t) => `${t.display} ${t.score}`).join(" - "),
        );
    }
    if (!games.length) return [];

    /*
      ★★**季節は「紙に書いてある月」で決める。**
      北信越地区の県大会は**春季も秋季も同じ大会名**（回数だけが違う通し番号）で、
      名前では見分けが付かない。★**通し番号から年や季節を出さないこと。**
      春季は4〜6月、秋季は8〜10月に開かれるので、月で決まる。
    */
    if (!isSummer) {
      const lo = Math.min(...months);
      const hi = Math.max(...months);
      const sheetSeason = hi <= 7 ? "spring" : lo >= 8 ? "autumn" : null;
      if (sheetSeason !== season) {
        console.log(
          `  ⚠️ 石川: ${title} の月（${lo}〜${hi}月）から季節が決まらない／要求と違う。1試合も出さない`,
        );
        return [];
      }
    } else {
      /*
        ★**選手権は回数と年が対応する**（年 − 1918）。
        紙の中の2か所（表題の回数と試合の日付）から来る数字なので、
        別の年の紙を読んでいたらここで気づける。
      */
      const no = Number(title.match(/第(\d+)回/)[1]);
      if (no + 1918 !== year) {
        console.log(`  ⚠️ 石川: ${title} の回数と日付の年（${year}）が合わない。1試合も出さない`);
        return [];
      }
    }
    /*
      ★**大会名に年度と季節を必ず付ける。**
      北信越の通し番号だけでは `yearOfTournament` が年を出せず、
      **県のページが「年の分からない大会」として別枠に出す。**
    */
    const era = year >= 2019 ? `令和${year - 2018}年度` : `平成${year - 1988}年度`;
    const tournament = `${title}（${era}${{ spring: "春季", summer: "夏季", autumn: "秋季" }[season]}）`;
    for (const g of games) g.tournament = tournament;

    /*
      ---- 勝ち上がりの検算 ----
      ★**組み立て型の県には無い検算。** 石川で以前すり抜けた
      「構造は合うのに対戦相手が違う」は、ここで必ず捕まる。
    */
    const ORDER = ["1回戦", "2回戦", "3回戦", "4回戦", "準々決勝", "準決勝", "決勝"];
    const played = ORDER.filter((r) => games.some((g) => g.round === r));
    const isDraw = (g) => g.teams[0].score === g.teams[1].score;
    let winners = null;
    for (const r of played) {
      const gs = games.filter((g) => g.round === r);
      // ★**不戦勝の枠に出ている2校も「その回戦に出た」に数える**（上の項）
      const byeAt = byes.filter((b) => b.round === r);
      const teams = gs.flatMap((g) => g.teams.map((t) => t.display)).concat(byeAt.flatMap((b) => b.pair));
      if (winners) {
        const missing = winners.filter((w) => !teams.includes(w));
        if (missing.length) {
          console.log(`  ⚠️ 石川: ${r} に出ていない前の回戦の勝者がある（${missing.join("・")}）。1試合も出さない`);
          return [];
        }
      }
      /*
        ★**引き分けた試合は勝者を出さない**（同じ回戦の後日に再試合がある）。
        ★**引き分けは上で「紙が引き分けと刷っている」ことを確かめてある。**
      */
      const decidedGs = gs.filter((g) => !isDraw(g));
      winners = decidedGs
        .map((g) => g.teams.find((t) => t.won)?.display)
        .filter(Boolean)
        // ★**不戦勝で上がった側も次の回戦にいるはず**
        .concat(byeAt.map((b) => b.won));
      if (winners.length !== decidedGs.length + byeAt.length) {
        console.log(`  ⚠️ 石川: ${r} に勝者の読めない試合がある。1試合も出さない`);
        return [];
      }
    }
    const champion = winners[0];
    const entries = new Set(games.flatMap((g) => g.teams.map((t) => t.display)));
    /*
      ★**引き分け再試合があるぶん試合数は多くなる**ので、
      **決着した試合が チーム数 − 1** になるはず（岐阜と同じ数え方）。
    */
    /*
      ★★★**引き分けは「同じ回戦で同じ顔合わせが後日にある」ことを要求する**
      （2026-08-31 その3）。

          2017年秋 3回戦  松任 4 - 4 飯田（延長15回引き分け） → 後日 松任 0 - 7x 飯田
          2014年夏 2回戦  金沢 6 - 6 小松（延長15回）        → 後日 再試合

      ★**高校野球の引き分けは再試合になる**ので、本物なら必ず対になる試合がある。
      ★★**紙の注記に頼らないこと** —— **「引き分け」と書く紙と、`(延長15回)` としか
      書かない紙がある**（同じ石川で両方あった）。**言葉ではなく、持っている試合で確かめる。**
      ★★**対の無い同点は認めない** —— 空欄を 0 と読んだ結果であることが多く
      （島根で87件・佐賀・熊本・栃木で踏んだ形）、**そのまま出すと嘘になる。**
    */
    /*
      ★★★**同じ枠が2度刷ってある紙がある**（2026-09-01 その4。2007年春）。

          ◆石川県立野球場 第1試合   向陽 0 - 小松明峰 10（5回コールド）
          ◆石川県立野球場 第2試合   向陽 0 - 小松明峰 10（5回コールド）   ← **投手まで同じ**

      **第1試合の枠が第2試合の場所にもう一度刷られており、本物の第2試合が紙に無い。**
      ★★**しかもこの大会は決勝の枠に `◆球場` が無くて読めておらず**、
      **「余分な1試合」と「足りない1試合」が打ち消し合って
      「チーム数 − 1 ＝ 決着した試合」を通ってしまう**（実際に通った）。
      ★**勝ち抜き戦では、1つの学校が負けるのは1度だけ。**
      **同じ顔合わせが同じ回戦に2度あるのは、紙が壊れているということ。**
      ★**引き分けは負けに数えない**（引き分け再試合があるため）。
    */
    const lost = new Map();
    for (const g of games) {
      if (isDraw(g)) continue;
      const l = g.teams.find((t) => !t.won)?.display;
      if (l) lost.set(l, (lost.get(l) ?? 0) + 1);
    }
    const twice = [...lost].filter(([, n]) => n > 1).map(([n]) => n);
    if (twice.length) {
      console.log(
        `  ⚠️ 石川: ${title} で2回以上負けている学校がある（${twice.join("・")}）。1試合も出さない`,
      );
      return [];
    }

    const drawnGames = games.filter(isDraw);
    for (const g of drawnGames) {
      const pair = new Set(g.teams.map((t) => t.display));
      const replay = games.some(
        (o) =>
          o !== g &&
          o.round === g.round &&
          String(o.date) > String(g.date) &&
          o.teams.every((t) => pair.has(t.display)),
      );
      if (!replay) {
        console.log(
          `  ⚠️ 石川: 引き分けの再試合が紙に無い（${g.teams.map((t) => t.display).join(" vs ")}・${g.round}・${g.date}）。1試合も出さない`,
        );
        return [];
      }
    }

    const draws = drawnGames.length;
    /*
      ★★**不戦勝は「行われなかった試合」なので、チーム数の勘定に入れる**
      （2026-08-31 その4）。

          出場校 − 1 ＝ 決着した試合 ＋ 不戦勝

      ★**辞退した側が1試合も戦っていない年もある**ので、
      **不戦勝の枠に出ている2校も出場校に数える**（そうしないと年ごとに式が変わる）。
      ★実測：2021年秋は辞退した側がどこにも出てこず、2021年夏は3回戦を戦っていた。
    */
    const allTeams = new Set([...entries, ...byes.flatMap((b) => b.pair)]);
    const playedCount = games.length - draws;
    if (allTeams.size - 1 !== playedCount + byes.length) {
      console.log(
        `  ⚠️ 石川: ${allTeams.size} チームに対し決着した試合 ${playedCount}` +
          `${byes.length ? `・不戦勝 ${byes.length}` : ""}（${allTeams.size - 1 - byes.length} 試合のはず）。1試合も出さない`,
      );
      return [];
    }
    /*
      ★**優勝校を紙の外と突き合わせる。**
      やぐら表の「優勝 ◯◯」（同じPDFの1ページ目）と、連盟のお知らせの見出し。
      ★**お知らせは今年ぶんしか残らない**ので、無ければ紙の中の検算だけで判定する。
    */
    /*
      ★★★**「優勝」の行は紙に2つある**（2026-08-31。秋季の紙で分かった）。

        優勝  9:00        ← 中央の枠の見出しで、隣は**試合開始時刻**
        優勝  小松大谷    ← こちらが優勝校

      ★**先に見つかったほうを採ると、優勝校が `9:00` になる**
      （実際に「優勝校が一致しない（表「9:00」）」で秋季が丸ごと落ちていた）。
      ★**落とすのは時刻と裸の数字だけ。** 「校名らしいほう」を選ばないこと
      —— それをやると、**決勝の勝者と突き合わせる検算が骨抜きになる。**
      ★★**残った候補が2つ以上あるなら、優勝校は読めなかったものとして扱う**
      （紙の中の検算だけで判定する。**当てない**）。
    */
    /*
      ★**開始時刻には「第何試合」の丸数字が付く年がある**（2026-09-01 その4。2011年秋）。

          優勝  ③14:00      ← 第3試合・14時開始
          優勝  9:00        ← 丸数字が付かない年

      ★**丸数字を落とさないと `③14:00` が優勝校の候補として残り**、
      決勝の勝者と食い違って**大会が丸ごと落ちていた。**
      ★**落とすのは「時刻」だけ。校名らしさでは選ばない**（上の項）。
    */
    const isClock = (v) =>
      new RegExp("^[①-⑳]?[0-9０-９]+[:：][0-9０-９]+$").test(v) || new RegExp("^[0-9０-９]+$").test(v);
    const printedCandidates = [
      ...new Set(
        flat
          .map((t) => t.match(/^優勝\s*(\S+)$/)?.[1])
          /*
            ★**「優勝」と「準優勝」が1行に組まれている紙がある**（春季の紙）——
            `優勝 小松工業 準優勝 金沢` が1行になり `小松工業準優勝金沢` と読める。
            ★**準優勝から後ろを落とす。** 同じ優勝校なのに候補が2つに割れて、
            せっかくの突き合わせを取りやめてしまうため。
          */
          .map((v) => (v ? v.split("準優勝")[0] : v))
          /*
            ★**先頭の区切り記号を落とす**（`優勝：小松大谷` と書く年がある）。
            落とさないと `：小松大谷` と `小松大谷` が別の候補になり、
            **同じ優勝校なのに突き合わせを取りやめてしまう**（令和3年度春季）。
          */
          .map((v) => (v ? v.replace(new RegExp("^[：:・]+"), "") : v))
          /*
            ★**括弧で始まる候補は校名ではない**（`優勝　（春は17回目）` と
            回数だけを別行に刷る紙がある。2013年春）。**校名は括弧では始まらない。**
          */
          .filter((v) => v && !isClock(v) && !new RegExp("^[（(]").test(v)),
      ),
    ];
    if (printedCandidates.length > 1) {
      console.log(
        `  ⚠️ 石川: 紙の「優勝」が2つ以上ある（${printedCandidates.join("・")}）。表との突き合わせはしない`,
      );
    }
    const printedChampion = printedCandidates.length === 1 ? printedCandidates[0] : null;
    const same = (a, b) => Boolean(a) && Boolean(b) && (a.includes(b) || b.includes(a));
    if ((announced && !same(announced, champion)) || (printedChampion && !same(printedChampion, champion))) {
      console.log(
        `  ⚠️ 石川: 優勝校が一致しない（お知らせ「${announced ?? "—"}」/ 表「${printedChampion ?? "—"}」/ ` +
          `決勝の勝者「${champion}」）。1試合も出さない`,
      );
      return [];
    }
    console.log(
      `  （${tournament}: ${games.length} 試合 / 優勝 ${champion} / ${entries.size} チーム・**スコア表から**` +
        (skipped.length ? ` / 代表決定戦 ${skipped.length} 件は出さない（${skipped.join("・")}）` : "") +
        (byes.length ? ` / 不戦勝 ${byes.length} 件（${byes.map((b) => `${b.won}`).join("・")}）` : "") +
        "）",
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
  /*
    ★★**春・夏・秋の3季**（春季・秋季は 2026-08-28 に追加）。
    **どの季節も同じ一覧から辿り、同じ「試合結果報告書」を読む。**
    ★**回数の起点が季節ごとに違う**（`SEASONAL`）。夏の「年 − 1918」を使い回さないこと。
  */
  seasons: {
    summer: "https://ghbf.asfsite.jp/event/schedule/",
    spring: "https://ghbf.asfsite.jp/event/schedule/",
    autumn: "https://ghbf.asfsite.jp/event/schedule/",
  },
  /**
   * 季節ごとの、一覧での見分け方と回数の起点。
   *   夏 … 第108回＝2026年（年 − 1918）
   *   春 … 第73回春季東海地区…岐阜県大会＝2026年（年 − 1953）
   *   秋 … 第79回秋季東海地区…岐阜県大会＝2026年（年 − 1947）
   * ★**題の頭に【大会】【結果】が付く記事は別物**（案内だけでPDFが無い）ので、
   * **題の全体で当てて外す。**
   */
  SEASONAL: {
    summer: {
      re: /^第(\d+)回全国高等学校野球選手権岐阜大会$/,
      offset: 1918,
      name: (no) => `第${no}回全国高等学校野球選手権岐阜大会`,
    },
    spring: {
      re: /^第(\d+)回春季東海地区高等学校野球岐阜県大会$/,
      offset: 1953,
      name: (no) => `第${no}回春季東海地区高等学校野球岐阜県大会`,
    },
    autumn: {
      re: /^第(\d+)回秋季東海地区高等学校野球岐阜県大会$/,
      offset: 1947,
      name: (no) => `第${no}回秋季東海地区高等学校野球岐阜県大会`,
    },
  },
  async collect({ fetchHtml, season, url, year }) {
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
    const seasonal = this.SEASONAL[season];
    if (!seasonal) return [];
    const entries = [];
    for (const m of index.matchAll(/"title":\s*"([^"]+)"\s*,\s*"url":\s*"([^"]+)"/g)) {
      const round = Number(normalize(m[1]).trim().match(seasonal.re)?.[1]);
      if (Number.isFinite(round)) entries.push({ url: m[2].replace(/\\\//g, "/"), round });
    }
    entries.sort((a, b) => b.round - a.round);
    if (!entries.length) {
      console.log("  ⚠️ 岐阜: 選手権岐阜大会のページが一覧に無い。出典の作りが変わった可能性がある");
      return [];
    }

    /*
      ★★**`--year` でその年の大会だけを取る**（2026-08-28）。
      選手権の回数は **年 − 1918** なので、一覧の題から年が出せる
      （**ページを開かずに選べる**ので、余計な取得をしない）。
      ★**渡さなければ今までどおり新しい2件**（開催中は前の年も見に行きたいため）。
    */
    const targeted = entries.filter((e) => e.round + seasonal.offset === year);
    /** 新サイトと旧サイトの両方から集める */
    const out = [];
    for (const entry of targeted.length ? targeted : entries.slice(0, 2)) {
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
        games.push(...this.readReport(pages, season, entry.round, round, seasonal));
      }
      if (games.length) out.push(...this.verify(games, seasonal.name(entry.round)));
    }

    /*
      ★★**旧サイトに過去年のHTMLスコア表がある**（2026-08-25 追加。2021〜2023）。

      新サイト（`ghbf.asfsite.jp`）の一覧には**第107回と第108回しか無い**が、
      **旧サイト `www.ghbf.jp` が生きていて**、年度別の索引から
      日別の結果ページに辿れる。**組み立ての要らないイニングスコア表**なので安全。

        http://www.ghbf.jp/schedule_result/schedule_result.html
          → senshuken_gifu/2023/r05senshuken_pref_0728.html
             「第105回 全国高等学校野球選手権記念岐阜大会 7/28(金) …
               長良川球場 決 勝 … 市岐阜商 0 0 0 2 0 0 0 0 1 3 / 大垣日大 … 4」

      ★**`pref` の付いたページだけ**を見る（`zenkoku` は甲子園の結果）。
      ★**2024年の日別結果はどちらのサイトにも無い**（穴。出典側の欠落）。

      ★★★**夏のときだけ見ること**（2026-08-28。春季・秋季を足したときに踏んだ）。
      辿るのは `senshuken_gifu`＝**選手権（夏）のページ**なのに、季節で分けていなかったので、
      **春・秋の収集でも同じ試合を読み、`season` だけ春・秋にして返していた** ——
      **2021〜2023年の夏199試合が、春と秋にも同じ大会名で入った**（実際に入った）。
      ★**検算は通ってしまう**（試合の中身は正しく、季節の札だけが違う）。
      ★**気づけたのは季節ごとの件数を数えたから。**
    */
    const old = season === "summer" ? await fetchHtml(this.oldIndexUrl) : null;
    await sleep(this.politenessMs);
    if (old) {
      const seen = new Set(out.map((g) => g.tournament));
      const days = [...old.matchAll(/href="(senshuken_gifu\/\d{4}\/[^"]*pref[^"]*\.html)"/g)].map(
        (m) => new URL(m[1], this.oldIndexUrl).toString(),
      );
      for (const day of days.slice(0, MAX_DAILY_PAGES * 2)) {
        const html = await fetchHtml(day);
        await sleep(this.politenessMs);
        if (!html) continue;
        const games = this.readOldDay(html, season);
        if (!games?.length) continue;
        if (seen.has(games[0].tournament)) continue;
        out.push(...games);
      }
    }
    return out;
  },
  /** 旧サイトの年度別索引。**新サイトに無い年はここから拾う** */
  oldIndexUrl: "http://www.ghbf.jp/schedule_result/schedule_result.html",
  /**
   * 旧サイトの日別ページ1枚を読む。
   * ★**1ページに複数試合**（球場ごと・第N試合ごと）が並ぶ。
   */
  readOldDay(html, season) {
    const text = normalize(plain(html).replace(/\s+/g, " "));
    const tournament = text.match(/第\d+回\s*全国高等学校野球選手権(?:記念)?岐阜大会/)?.[0]?.replace(/\s+/g, "");
    if (!tournament) return [];
    const year = Number(tournament.match(/第(\d+)回/)[1]) + 1918;
    const md = text.match(/(\d{1,2})\/(\d{1,2})/);
    if (!md) return [];
    const date = `${year}-${md[1].padStart(2, "0")}-${md[2].padStart(2, "0")}`;

    const games = [];
    for (const t of html.match(/<table[\s\S]*?<\/table>/gi) ?? []) {
      const rows = [...t.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((m) =>
        [...m[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => normalize(plain(c[1])).trim()),
      );
      // 見出しが「1 2 … 9 計」で、続く2行が両校
      const head = rows.findIndex((r) => r.join(" ").includes("計") && /\b1\b/.test(r.join(" ")));
      if (head < 0 || rows.length < head + 3) continue;
      const [a, b] = rows.slice(head + 1, head + 3);
      const name = (r) => r[0];
      /*
        ★★★**「計」が空の表がある**（2026-08-30 その2）。**雨で中断した試合。**

          ["第１試合","１","２","３","４","５","６","７","８","９","計"]
          ["揖斐","0","0","1","","","","","","",""]      ← 計が空（7/9に中断）
          ["岐阜城北","0","0","2","","","","","","",""]

        翌週に改めて行われ、そちらは計まで埋まっている（7/16 岐阜城北 11-1 揖斐）。
        ★★**`Number("")` は NaN ではなく `0`** なので、`Number.isFinite` では止まらず、
        **`揖斐 0-0 岐阜城北` という幻の引き分けが2件、画面に出ていた**
        （島根で87件・山梨で2件やっていたのと同じ形）。
        ★**0対0の引き分けそのものは実在する**（このリポジトリの `市岐阜商 0-0 県岐阜商`）ので、
        **「空かどうか」で見ること。「0かどうか」で見ると本物を捨てる。**
      */
      const total = (r) => {
        const c = String(r.at(-1) ?? "").trim();
        return c === "" ? NaN : Number(c);
      };
      if (!name(a) || !name(b) || !Number.isFinite(total(a)) || !Number.isFinite(total(b))) continue;
      games.push({
        date,
        season,
        tournament,
        /*
          ★**回戦は空白を落としてから見る。** 年によって「決 勝」「準 決 勝」と
          1文字ずつ空けて組まれており、そのままだと**決勝だけ取れない**
          （2023年の決勝が丸ごと落ちていた）。★球場名は空白を残したまま探す。
        */
        round: pickRound(text.replace(/[\s　]+/g, "")) ?? null,
        venue: text.match(/([^\s]+球場)/)?.[1] ?? null,
        teams: [
          { display: name(a), score: total(a), won: total(a) > total(b) },
          { display: name(b), score: total(b), won: total(b) > total(a) },
        ],
      });
    }
    return games;
  },
  /** 日別の報告書1本を読む */
  readReport(pages, season, no, round, seasonal) {
    // ★回数の起点は季節ごとに違う（`SEASONAL`）。夏は 年 − 1918
    const year = no + seasonal.offset;
    const tournament = seasonal.name(no);
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
  verify(games, tournamentName) {
    /*
      ★**校名の揺れを畳んでから数える。** 同じ学校が回戦で書き分けられる
      （中津商/中津商業 など5組）。`labelCandidates` と同じ畳み方にそろえる。
    */
    /*
      ★★**`実業` も畳む**（2026-09-01。2024・2025年の夏）。
      **`東濃実業`（1回戦）と `東濃実`（準々決勝）が別のチームとして数えられ**、
      63チームの大会が **64チーム**に見えて「決着した試合が1つ足りない」で落ちていた。
      ★**この畳み方は数えるためだけのもの**（画面に出す校名は紙のまま）。
    */
    const fold = (s) =>
      s.replace(/商業$/, "商").replace(/工業$/, "工").replace(/農業$/, "農").replace(/実業$/, "実").replace(/学園$/, "");
    const teams = new Set(games.flatMap((g) => g.teams.map((t) => fold(t.display))));
    if (process.env.GIFU_DEBUG) {
      console.log(`  [debug] ${tournamentName}: ${games.length}試合 / ${teams.size}チーム`);
      for (const g of [...games].sort((x, y) => String(x.date).localeCompare(String(y.date))))
        console.log(`  [debug]   ${g.date} ${g.round ?? "—"} ${g.venue ?? "—"} ${g.teams.map((t) => `${t.display} ${t.score}`).join(" - ")}`);
    }
    /*
      引き分け再試合があるぶん、試合数はチーム数−1より多くなる。
      **引き分けを除いた決着した試合が チーム数−1** になるはず。
    */
    let decided = games.filter((g) => g.teams[0].score !== g.teams[1].score);

    /*
      ★★★**3位決定戦を外す**（2026-08-31。春季で 24チームに 24試合になっていた）。

        4/25 準決勝  県岐阜商 7 - 岐阜城北 0 ／ 帝京大可児 2 - 大垣日大 6
        4/29        岐阜城北 3 - 帝京大可児 6   ← **両校ともすでに負けている**
        4/29 決勝    県岐阜商 2 - 大垣日大 3    ← どちらも負けていない

      ★**この出典は回戦を書いていない**（ファイル名の【準決勝】【決勝】だけ）ので、
      **紙から「3位決定戦」と読むことはできない。**
      ★★**代わりに勝ち抜きの性質から決める** —— 勝ち抜きでは、優勝校以外は
      **ちょうど1度だけ負ける。** だから**両校ともそれ以前に負けている試合**は
      勝ち抜きの枝ではない。★**当て推量ではなく、持っている試合から導ける。**

      ★**外すのは、外した数がちょうど辻褄を合わせるときだけ。**
      1つでも余れば今までどおり1試合も出さない（読み違えを見逃さないため）。
      ★**引き分けは負けに数えない**（引き分け再試合があるため）。
      ★**日付の無い試合は判定しない**（この出典は日付を必ず持つが、念のため）。
    */
    const excess = decided.length - (teams.size - 1);
    let extra = [];
    if (excess > 0) {
      const lostOn = new Map();
      for (const g of decided) {
        const loser = fold(g.teams[0].score < g.teams[1].score ? g.teams[0].display : g.teams[1].display);
        const prev = lostOn.get(loser);
        if (!prev || String(g.date) < prev) lostOn.set(loser, String(g.date));
      }
      const alreadyLost = (g, side) => {
        const d = lostOn.get(fold(side.display));
        return Boolean(d) && Boolean(g.date) && d < String(g.date);
      };
      extra = decided.filter((g) => g.teams.every((t) => alreadyLost(g, t)));
      if (extra.length === excess) {
        decided = decided.filter((g) => !extra.includes(g));
        games = games.filter((g) => !extra.includes(g));
        for (const g of extra) {
          console.log(
            `  （岐阜: ${tournamentName} の ${g.date} ${g.teams.map((t) => `${t.display} ${t.score}`).join(" - ")} は` +
              "両校ともすでに負けているので3位決定戦とみて出さない）",
          );
        }
      }
    }

    if (teams.size - decided.length !== 1) {
      console.log(
        `  ⚠️ 岐阜: ${teams.size} チームに対し決着した試合 ${decided.length}（${teams.size - 1} のはず）。1試合も出さない`,
      );
      return [];
    }
    const draws = games.length - decided.length;
    console.log(
      `  （${tournamentName}: ${games.length} 試合 / ${teams.size} チーム` +
        (draws ? ` / 引き分け再試合 ${draws}` : "") + "・**日別のスコア表から**）",
    );
    return games;
  },
};

/**
 * 千葉県高等学校野球連盟（`chbf.or.jp`）。
 * ★**このリポジトリでいちばん大きい大会**（148チーム・147試合。2026-08-15）。
 *
 * ------------------------------------------------------------------
 * ★★ 春・夏・秋の3季 ＋ `--year` で過去年（2026-08-27。147 → 1,089試合）
 *
 *   入口はどの季節も同じサイトマップ。**紙も同じやぐら型**だが、
 *   ★**大きさが違う**（夏148チーム／春・秋48〜64チーム）ので**座標は紙から測る**
 *   （`geometryOf`）。決め打ちのままでは**過去年の夏が1試合も出せなかった。**
 *
 *   ★★**同じ大会に記事が3つある**（本大会・予選・予選敗者復活戦）。
 *   **スラッグは途中で切れていて見分けられない**ので、**記事の題で見分ける。**
 *   ★**予選と敗者復活戦は支部ごとのブロック表**で、勝ち抜きの木ではない。取らない。
 *
 *   ★★**年は記事の名前から出す**（夏＝回数+1918／春秋＝回数+1947）。
 *   **紙の中の回数と元号でもう一度確かめる**（片方しか無い紙もある）。
 *
 *   ★ 入っている年（2026-08-27 時点）
 *     夏 … 2023・2024・2025・2026（第105〜108回）
 *     春 … 2022〜2026（第75〜79回）
 *     秋 … 2019・2021・2023・2024・2025（第72・74・76・77・78回）
 *   ★**入らなかった年は「組合せ表を組み立てられなかった」**か
 *   **中央から優勝校を読めなかった**もの（2017〜2022の一部）。**紙ごとに測り直しが要る。**
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
  /*
    ★★**春・夏・秋の3季**（春季・秋季は 2026-08-27 に追加）。
    どの季節も入口は同じサイトマップで、**紙も同じやぐら型**（下の「春季・秋季」の節）。
  */
  SITEMAP: "https://chbf.or.jp/wp-sitemap-posts-oshirase2-1.xml",
  seasons: {
    summer: "https://chbf.or.jp/wp-sitemap-posts-oshirase2-1.xml",
    spring: "https://chbf.or.jp/wp-sitemap-posts-oshirase2-1.xml",
    autumn: "https://chbf.or.jp/wp-sitemap-posts-oshirase2-1.xml",
  },
  /**
   * ★★**記事の名前から年を出す**（2026-08-27。`--year` で過去年を取るため）。
   *
   *   夏 … `第108回全国高等学校野球選手権千葉大会` → **回数 + 1918**
   *        ★**「記念」が入る年がある**（第105回記念千葉大会＝2023年）
   *   春 … `令和8年度第79回春季千葉県高等学校野球大会` → **回数 + 1947**
   *   秋 … `令和7年度第78回秋季千葉県高等学校野球大会` → **回数 + 1947**
   *
   * ★**春季・秋季の起点は選手権とは別**（第79回春季＝2026年・第72回秋季＝2019年で確かめた）。
   * ★**元号は使わない** —— **付いていない記事がある**（`第75回春季千葉県高等学校野球大会について`）。
   *   紙の中の元号との突き合わせは `readSheet` でやる。
   * ★**軟式は外す**（同じ一覧に「全国高等学校軟式野球選手権千葉大会」が並ぶ）。
   *
   * @returns その季節の大会なら年 ／ 違えば null
   */
  postYear(name, season) {
    const t = normalize(name);
    if (/軟式/.test(t)) return null;
    if (season === "summer") {
      const m = t.match(/第(\d+)回全国高等学校野球選手権(?:記念)?千葉大会/);
      return m ? Number(m[1]) + 1918 : null;
    }
    const word = this.SEASONAL[season]?.word;
    if (!word) return null;
    const m = t.match(new RegExp(`第(\\d+)回${word}千葉県高等学校野球大会`));
    if (m) return Number(m[1]) + 1947;
    /*
      ★**回数が入らない年がある**（2026-08-27）。
      2020年の秋は `令和２年度秋季千葉県高等学校野球大会`（**回数が無い**）。
      その年だけ**元号から出す**（春3〜5月・秋8〜10月はどちらも年度＝暦年）。
    */
    if (!new RegExp(`${word}千葉県高等学校野球大会`).test(t)) return null;
    const g = t.match(/(令和|平成)\s*(元|\d+)\s*年度/);
    return g ? (g[1] === "令和" ? 2018 : 1988) + (g[2] === "元" ? 1 : Number(g[2])) : null;
  },
  /** 春季・秋季の違い。**回数の起点（+1947）は共通** */
  SEASONAL: {
    spring: { word: "春季", label: "春" },
    autumn: { word: "秋季", label: "秋" },
  },
  async collect({ fetchHtml, season, url, year }) {
    /*
      ★**大会の記事はトップからは辿れない**（秋季に差し替わると消える）。
      サイトマップに残るので、そこから「第N回…千葉大会について」を探す。
      記事には**最新版のPDFだけ**が貼ってある（大会中は ①〜⑬ と更新される）。
    */
    const xml = await fetchHtml(url);
    if (!xml) return [];
    const posts = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((m) => ({ url: m[1], name: decodeURIComponent(m[1]) }))
      // ★**その年の大会の記事だけ**（`--year` で過去年を取るため）
      .filter((p) => this.postYear(p.name, season) === year);
    if (!posts.length) {
      // ★過去年を取りに行ったときは静かに終わる（その年の記事が無いだけ）
      if (year >= new Date().getFullYear()) {
        console.log(`  ⚠️ 千葉: ${year}年の${this.SEASONAL[season]?.label ?? "夏"}の記事がサイトマップに無い`);
      }
      return [];
    }
    for (const post of posts.slice(0, 3)) {
      const html = await fetchHtml(post.url);
      await sleep(this.politenessMs);
      if (!html) continue;
      /*
        ★★**同じ大会に記事が3つある**（本大会・予選・予選敗者復活戦。2026-08-27）。
        ★**URLの文字では見分けられない** —— スラッグは途中で切れていて、
        `…春季千葉県高等学校野球大会` が**予選の記事**だったりする。
        **記事の題（`<title>`）で見分けること。**
        ★**予選と敗者復活戦は別の大会**（支部ごとのブロック表で、1枚に代表が何校も出る）。
        **本大会だけを取る。**
      */
      const title = normalize(plain(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? ""));
      if (/予選|敗者復活|中止|抽選会|入場券/.test(title)) continue;
      const pdfs = dailyLinks(html, post.url, { hrefPattern: /\.pdf$/i })
        // ★**大会と関係ないPDFが同じ記事に貼ってある**（ガイドライン・視聴方法・担当者マニュアル）
        .filter((p) => !/ガイドライン|マニュアル|視聴方法|電話|Ver\d/i.test(decodeURIComponent(p.url)));
      for (const pdf of pdfs.slice(0, 4)) {
        const parsed = await fetchPdfPages(pdf.url, { headers: UA });
        await sleep(this.politenessMs);
        if (!parsed?.length) continue;
        for (const raw of parsed) {
          const games = this.readSheet(raw, season, year);
          if (games) return games;
        }
      }
    }
    return [];
  },
  /** 1枚のやぐら表を読む。**目当ての紙でなければ null**（呼ぶ側は次のPDFへ） */
  readSheet(raw, season, year) {
    const flat = raw.lines.map((l) => normalize(l.text.replace(/\t/g, "")));
    /*
      ★**題は季節で違う**（2026-08-27）。
        夏 … `第108回全国高等学校野球選手権千葉大会`（**記念が入る年がある**）
        春 … `第79回春季千葉県高等学校野球大会`
        秋 … `第78回秋季千葉県高等学校野球大会`
      ★★**「予選」を必ず外すこと** —— 同じ大会の予選の紙が
      `第78回秋季千葉県高等学校野球大会予選` という題で並んでおり、
      **支部ごとのブロック表**なので木にならない（読めても嘘になる）。
    */
    const word = this.SEASONAL[season]?.word;
    /*
      ★**回数が入らない紙がある**（2020年の秋は `令和２年度秋季千葉県高等学校野球大会`）。
      **回数のある形を先に探し、無ければ回数なしの形**で拾う（年は元号で確かめる）。
    */
    const titlePattern = word
      ? new RegExp(`第\\d+回${word}千葉県高等学校野球大会(?!予選)`)
      : /第\d+回全国高等学校野球選手権(?:記念)?千葉大会/;
    const looseTitle = word ? new RegExp(`${word}千葉県高等学校野球大会(?!予選)`) : null;
    const title =
      flat.map((t) => t.match(titlePattern)?.[0]).find(Boolean) ??
      (looseTitle ? flat.map((t) => t.match(looseTitle)?.[0]).find(Boolean) : undefined);
    if (!title) return null;

    /*
      ★★**回数から出した年が、取りに行った年と食い違ったら1試合も出さない**（2026-08-27）。
      **1つの記事に前の年の紙が残っていることがある**ので、ここで必ず突き合わせる。
      ★**春季・秋季は紙に元号も刷ってある**（`令和７年度 第７８回秋季…`）。
      **あれば両方が同じ年を指すことを求める**（片方だけでは取り違えに気づけない）。
    */
    const no = Number(title.match(/第(\d+)回/)?.[1]) || null;
    const sheetYear = no === null ? null : no + (word ? 1947 : 1918);
    if (sheetYear !== null && sheetYear !== year) {
      console.log(`  ⚠️ 千葉: 第${no}回（${sheetYear}年）の紙が ${year} 年の記事に付いている。1試合も出さない`);
      return [];
    }
    const era = flat.map((t) => t.match(/(令和|平成)\s*(元|\d+)\s*年度/)).find(Boolean);
    const eraYear = era ? (era[1] === "令和" ? 2018 : 1988) + (era[2] === "元" ? 1 : Number(era[2])) : null;
    if (eraYear !== null && eraYear !== year) {
      console.log(`  ⚠️ 千葉: 紙の「${era[1]}${era[2]}年度」は ${eraYear} 年だが ${year} 年を取りに来ている。1試合も出さない`);
      return [];
    }
    /*
      ★**回数も元号も紙に無ければ、年を確かめる術が無い**ので出さない
      （記事の名前だけを信じない。前の年の紙が残っている記事があるため）。
    */
    if (sheetYear === null && eraYear === null) {
      console.log("  ⚠️ 千葉: 紙に回数も元号も無く、年を確かめられない。1試合も出さない");
      return [];
    }

    /*
      表の中央に縦書きされた「優勝 ◯◯高等学校（…）」「準優勝 ◯◯高等学校」。
      **枝のスコアとは別の場所から来る事実**なので検算に使う。
      ★**春季・秋季は「高校」と書く**（夏は「高等学校」）。両方受ける。
    */
    /*
      ★★**座標は紙から測る**（2026-08-27。それまでは夏の2026年の紙で測った決め打ちだった）。
      ★**年でも季節でも紙の形が変わる** ——
      夏は148チームでスロット列が x≒86 と x≒506、春・秋は48チームで x≒108 と x≒482。
      決め打ちのままでは**過去年の夏が1試合も出せなかった**（第106回・第107回とも落ちていた）。
    */
    const geometry = this.geometryOf(raw);
    if (!geometry) return [];
    /*
      ★★**シード記号の列を落としてから読む**（`stripMarkColumns`）。
      春季はシード記号（◎）が**校名と同じ側**にあり、範囲では切り分けられない。
    */
    const sheet = this.stripMarkColumns(raw, geometry.leftX, geometry.rightX);
    const HALF = geometry.half;
    const centre = sheet.lines
      .flatMap((l) => l.items.map((i) => ({ x: i.x, y: l.y, t: i.text.trim() })))
      .filter((i) => Math.abs(i.x - HALF) <= 10)
      .sort((a, b) => b.y - a.y)
      .map((i) => i.t)
      .join("");
    /*
      ★★**「高校」「高等学校」を付ける年と付けない年がある**（2026-08-27）。

        2026年夏 … `優勝拓殖大紅陵高等学校（24年振り6回目）`
        2025年秋 … `優勝専修大松戸高校（３年振り２回目）`
        2024年秋 … `優勝千葉黎明（初優勝）`      ★**校名だけ**

      **`高校` で止める作りだと、付いていない年が1試合も出せない**（実際に落ちていた）。
      ★**括弧・数字・「準」まで**を校名として取り、**付いていれば「高校」を落とす。**
      ★**注記の `（初優勝）` に引きずられない** —— 括弧の手前で切っているため。
    */
    /*
      ★★**中央は正式名、枝は略称**という年がある（2026-08-27。2023年の春季）。
      中央 `優勝専修大学松戸高校` に対し、枝は `専修大松戸`（欄が狭いので略す）。
      **`同じ` の判定は「どちらかがもう一方を含む」なので、`大学` と `大` は当たらない。**
      ★**比べるときだけ `大学` を `大` に寄せる**（画面に出る校名は枝のほう）。
      ★**枝が `大学` と書く紙が出たら、この検算は落ちる**（黙って通さない）。
    */
    const nameOf = (m) =>
      m ? m[1].replace(/高(?:等学)?校$/, "").replace(/\s+/g, "").replace(/大学/g, "大") || null : null;
    const champion = nameOf(centre.match(/(?:^|[^準])優勝([^（）()0-9０-９：:準\s]+)/));
    const runnerUp = nameOf(centre.match(/準優勝([^（）()0-9０-９：:準\s]+)/));
    /*
      ★★**準優勝を刷っていない年がある**（2026-08-27。2022年以前は優勝だけ）。
      ★**優勝校だけでも検算になる** —— **決勝の相手が違えばどちらかが必ず食い違う**
      （山口と同じ考え方。石川で通ってしまった「構造は合うのに決勝の相手が違う」も止まる）。
      ★**優勝校が読めなければ1試合も出さない。**
    */
    if (!champion) {
      console.log("  ⚠️ 千葉: 表の中央から優勝校を読めなかった。検算できないので1試合も出さない");
      return [];
    }
    if (!runnerUp) {
      console.log(`  （千葉: 紙に準優勝の記載が無いので、優勝校「${champion}」だけで検算する）`);
    }

    const games = readTwoColumnBracket(sheet, {
      district: "千葉",
      titlePattern,
      half: HALF,
      rowTolerance: 3,
      // 左は上から、右は下から読む（スロットは縦、校名は横書き）
      nameOrder: ["asc", "desc"],
      season,
      // ★**日付が1つも書かれていない**ので、日付での検算はできない
      hasDates: false,
      finalAt: "innermost",
      /*
        ★★**中央の縦書きの「回」が、離れたスコアを消していた**（2026-08-27。宮崎と同じ罠）。
        `（３年振り２**回**目）` の `回`（x≒293）が、**同じ行の144ポイント左にある
        1回戦のスコア `12`（x≒149）**を「12回コールドの12」として落としていた。
        **その帯が16個必要なところ15個になり、1回戦を取り違えて組めなくなる。**
        ★**この紙のコールドは丸数字（⑤⑦）**なので、`N回` を見る必要がそもそも無い。
        ★★**夏の紙も同じだった**（2026-08-27）。2025年の夏は
        **3回戦の帯が16個必要なところ15個**になって組めていなかった。
        ★**2026年の夏はこれを入れても1バイトも変わらない**（確認済み）。
      */
      inningMarkGap: 20,
      /*
        ★**シード記号の列を範囲ごと外す**（2026-08-15 に実データで測った）。

          左 … 記号 x=31 ／ 校名 x=37〜78（74スロットすべて 37 から始まる）
          右 … 校名 x=513〜556 ／ 記号 x=561（556〜558 は空）

        **記号だけを文字で消す作りにしないこと。** 右の x=560 に
        記号でない「宣」が1つあり、`千葉東` が `千葉東宣` になっていた。
        文字で消す方式では、こういう字を取りこぼして**画面に誤った校名が出る**。
        ★**全角ラテン文字を無条件に落とすのも駄目**（「光英ＶＥＲＩＴＡＳ」が壊れる）。
        ★**春季・秋季は紙から測る**（`seasonalGeometry`）。
      */
      ranges: geometry.ranges,
      // 字間の空白を詰める（日本の校名に空白は入らない）
      cleanName: (s) => s.replace(/\s+/g, ""),
      verify: { champion, runnerUp },
    });
    /*
      ★★**春季・秋季は大会名に西暦を足す**（2026-08-27。宮崎と同じ）。
      `第78回秋季千葉県高等学校野球大会` は**回数が選手権とは別の系列**で、
      **紙に日付が1つも無い**ので、そのままだと `yearOfTournament` が年を出せず
      **「年の分からない大会」として同じ季節の何年ぶんかが並ぶ。**
      ★**年は回数と元号の両方から確かめてある**（上）ので、推測ではない。
      ★**夏は足さない**（`第N回…選手権` から年が出るし、他県の夏と形をそろえたい）。
    */
    return word ? withYear(games, year) : games;
  },

  /**
   * ★★**紙の座標を測る**（2026-08-27。夏・春・秋の3季とも）。
   *
   * ------------------------------------------------------------------
   * ★ 夏の紙とは別物なので、夏の決め打ちを流用しない
   *
   *   夏 … 148チーム。スロット列 x≒86 と x≒506、中央 294
   *   秋 … 48チーム。 スロット列 x≒105 と x≒486
   *   春 … 48チーム。 スロット列 x≒108 と x≒482
   *
   *   ★**チーム数が違えば列の位置も回戦の数も変わる。** 紙から測る。
   *
   * ------------------------------------------------------------------
   * ★★ 決勝の欄を範囲から外すのがいちばん難しい（宮崎と同じ考え方）
   *
   *   **準決勝の帯は数字が2つ**（左右の半分にそれぞれ1試合）で、
   *   **決勝は中央をはさんで片側1つずつ。**
   *   そこで**「中央に向かって、数字が2つ以上ある最後の列」が準決勝、
   *   その次の列が決勝**とし、**その中間で切る。**
   *
   *   ★**中央の縦書きの「（３年振り２回目）」は邪魔をしない** ——
   *   **全角の数字**なので `\d` に当たらない（半角のスコアとは別物）。
   *
   * ------------------------------------------------------------------
   * ★ 外側の端は校名の外に置く
   *
   *   ★**この紙にはシード記号の列が無い**（夏はある）。校名がそのまま端に来る。
   *   ★**万一記号が付いても、優勝・準優勝の突き合わせで落ちる**
   *   （校名に記号がくっつけば一致しない）。
   *
   * @returns `{ half, ranges }`／測れなければ null（**1試合も出さない**）
   */
  geometryOf(raw) {
    const items = raw.lines.flatMap((l) => l.items.map((i) => ({ x: i.x, y: l.y, t: normalize(i.text.trim()) })));
    // ---- 数字の列 ----
    const cols = new Map();
    for (const i of items.filter((i) => /^\d{1,2}$/.test(i.t))) {
      const k = [...cols.keys()].find((v) => Math.abs(v - i.x) <= 4) ?? i.x;
      if (!cols.has(k)) cols.set(k, []);
      cols.get(k).push(i);
    }
    const numbered = [...cols.entries()].map(([x, list]) => ({ x, n: list.length })).sort((a, b) => a.x - b.x);

    /*
      ★★**スロット番号の列は「1から順に並ぶ縦の列」で探す**（2026-08-27）。

      ~~数字がいちばん多い2つの列~~ では**夏の紙で取り違える** ——
      右のスロットは 75〜148 で、**3桁になると断片の左端が数ポイント動く**ので
      1つの列にまとまらず、**得点の帯（64個）に負ける。**
      ★**まとめ幅を広げる（8）のは番号を探すときだけ**にする
      （帯を探すときに広げると、隣り合う回戦の帯がくっつく）。
    */
    const runs = (() => {
      const wide = new Map();
      for (const i of items.filter((i) => /^\d{1,3}$/.test(i.t))) {
        const k = [...wide.keys()].find((v) => Math.abs(v - i.x) <= 8) ?? i.x;
        if (!wide.has(k)) wide.set(k, []);
        wide.get(k).push(i);
      }
      return [...wide.entries()]
        .map(([x, list]) => {
          const sorted = list.sort((a, b) => b.y - a.y).map((i) => Number(i.t));
          let n = 1;
          while (n < sorted.length && sorted[n] === sorted[0] + n) n++;
          return { x, from: sorted[0], length: n };
        })
        .filter((c) => c.length >= 8);
    })();
    const left = runs.find((c) => c.from === 1);
    const right = left ? runs.find((c) => c.from === left.length + 1) : null;
    if (!left || !right) {
      console.log(
        "  ⚠️ 千葉: スロット番号の列（左は1から、右はその続き）が見つからない。紙の形が変わった可能性がある",
      );
      return null;
    }
    const [leftX, rightX] = [left.x, right.x].sort((a, b) => a - b);

    /*
      ★★**決勝の得点は「同じ行で中央をはさんでいちばん近い2つ」**（2026-08-27）。

      ~~中央に向かって最後の列~~ では取れない。中央には
      `優勝専修大松戸高校（３年振り２回目）` が1文字ずつ縦に積まれていて、
      **注記の `３` `２` が決勝の得点より内側の「列」に見える**（実際に取り違えた）。
      ★**全角だから落とす、という作りにはしない** ——
      **読み手（`numbersOf`）は全角も数字として読む**ので、半角で刷られたら破れる。
      ★**縦書きの注記は「行をまたいで中央をはさむ」ことが無い**ので、
      **読み手の `finalAt: "innermost"` と同じ見方**（行ごとに左右の最も内側の2つを見て、
      いちばん狭い組を決勝とする）にすれば、そもそも候補にならない。
    */
    const byRow = new Map();
    for (const i of items.filter((i) => /^\d{1,2}$/.test(i.t) && i.x > leftX && i.x < rightX)) {
      const k = [...byRow.keys()].find((v) => Math.abs(v - i.y) <= 1) ?? i.y;
      if (!byRow.has(k)) byRow.set(k, []);
      byRow.get(k).push(i);
    }
    const mid = (leftX + rightX) / 2;
    let best = null;
    for (const row of byRow.values()) {
      const l = row.filter((i) => i.x < mid).sort((a, b) => b.x - a.x)[0];
      const r = row.filter((i) => i.x > mid).sort((a, b) => a.x - b.x)[0];
      if (!l || !r) continue;
      if (!best || r.x - l.x < best.r.x - best.l.x) best = { l, r };
    }
    if (!best) {
      console.log("  ⚠️ 千葉: 中央に決勝の得点が見つからない。1試合も出さない");
      return null;
    }
    const finalL = { x: best.l.x };
    const finalR = { x: best.r.x };
    /*
      ★**準決勝の帯＝決勝より外側で、数字が2つ以上ある最後の列。**
      その2つの中間で切れば、決勝の欄（と中央の縦書き）が半分の組み立てから外れる。
    */
    const semiL = [...numbered].reverse().find((c) => c.x > leftX && c.x < finalL.x - 2 && c.n >= 2);
    const semiR = numbered.find((c) => c.x < rightX && c.x > finalR.x + 2 && c.n >= 2);
    if (!semiL || !semiR) {
      console.log("  ⚠️ 千葉: 決勝の外側に準決勝の帯が見つからない。1試合も出さない");
      return null;
    }
    /*
      ---- 校名の外側の端 ----

      ★★**シード記号の列を外に置くために、「校名の1文字目の列」で測る**（2026-08-27）。

      ★**「いちばん外の文字」では測れない** —— 夏の紙は**右のシード記号の列（x≒561）に
      記号でない「宣」が1文字だけ紛れている**ので、そこまで含めてしまう
      （**`千葉商大付Ｃ` のような校名が画面に出る**。実際に出た）。

      ★**校名の1文字目の列はスロットの数だけ字がある**（夏74・春秋24）のに対し、
      **記号の列はシード校のぶんしか無い**（8つ・4つ）。**密な列で端を決める。**
    */
    const slotCount = left.length;
    /** スロット番号より外（校名の側）の列。**表題や球場の凡例は内側にあるので入らない** */
    const outerCols = (() => {
      const byX = new Map();
      for (const i of items) {
        if (!i.t || (i.x > leftX && i.x < rightX)) continue;
        const k = [...byX.keys()].find((v) => Math.abs(v - i.x) <= 2.5) ?? i.x;
        byX.set(k, (byX.get(k) ?? 0) + 1);
      }
      return [...byX.entries()].map(([x, n]) => ({ x, n })).sort((a, b) => a.x - b.x);
    })();
    if (outerCols.length < 2) {
      console.log("  ⚠️ 千葉: 校名の列が見つからない。紙の形が変わった可能性がある");
      return null;
    }
    /*
      ★**いちばん外の列が「まばら」ならシード記号の列**（スロットの数の半分も字が無い）。
      そのときは**その内側で切る。** 密なら校名の1文字目なので**その外側で切る。**
      ★**連合チームの校名は他より長く、密な列より外に字がある**ので、
      **「校名の列の外側」で切ってはいけない**（`八街` が `八` になった）。
    */
    const edgeOf = (col, side) =>
      col.n < slotCount * 0.5 ? col.x + side * 2 : col.x - side * 2;
    return {
      leftX,
      rightX,
      half: (finalL.x + finalR.x) / 2,
      ranges: [
        [edgeOf(outerCols[0], 1), (semiL.x + finalL.x) / 2],
        [(finalR.x + semiR.x) / 2, edgeOf(outerCols.at(-1), -1)],
      ],
    };
  },

  /**
   * ★★**シード記号の列を、校名の側から丸ごと落とす**（2026-08-27。春季・秋季）。
   *
   * 春季の紙は**◎が校名とスロット番号のあいだ**（x≒94 と x≒493）にあり、
   * 範囲では切り分けられない（**校名と同じ側**にあるため）。
   * 落とさないと **`専修大松戸◎` `◎千葉学芸` のような校名が画面に出る**
   * （実際に8校がそうなり、どれも学校に結び付かなかった）。
   *
   * ★★**記号を文字で消さないこと**（千葉で「宣」を巻き込んだ轍。上の説明を読むこと）。
   * **列ごと落とす。** 見分け方は
   * **「その列の断片が全部1文字で、漢字もかなも1つも無い」** ——
   * 校名の列には必ず漢字かかなが入る。
   * ★**`光英ＶＥＲＩＴＡＳ` は1断片7文字**なので巻き込まない（1文字の列だけを見る）。
   * ★**スロット番号より内側（得点の側）は見ない**（数字の列を落としてしまう）。
   */
  stripMarkColumns(raw, leftX, rightX) {
    const outside = (x) => x < leftX || x > rightX;
    const cols = new Map();
    for (const l of raw.lines) {
      for (const i of l.items) {
        const t = normalize(i.text.trim());
        if (!t || !outside(i.x)) continue;
        const k = [...cols.keys()].find((v) => Math.abs(v - i.x) <= 2.5) ?? i.x;
        cols.set(k, (cols.get(k) ?? []).concat(t));
      }
    }
    const marks = [...cols.entries()]
      .filter(([, ts]) => ts.every((t) => t.length === 1 && !/[一-龥ぁ-んァ-ヶ]/.test(t)))
      .map(([x]) => x);
    if (!marks.length) return raw;
    const drop = (i) => outside(i.x) && marks.some((x) => Math.abs(x - i.x) <= 2.5);
    let n = 0;
    const lines = raw.lines.map((l) => {
      const items = l.items.filter((i) => !drop(i));
      n += l.items.length - items.length;
      return { ...l, items, text: items.map((i) => i.text).join("\t") };
    });
    console.log(`  （千葉: 校名の外のシード記号の列（x≒${marks.map((x) => x.toFixed(0)).join("・")}）の ${n} 件を落とす）`);
    return { page: raw.page, lines };
  },
};

/**
 * ★★★**山形は 2026-08-29 に「一球速報の履歴API」へ出典を替えた**（運営者の判断）。
 *
 * ------------------------------------------------------------------
 * ★★**それまでは連盟が Google Drive に置くPDFを読んでいた**（312行の読み手）。
 * **夏しか無く、2025・2026年の75試合**しか取れていなかった。
 * 履歴API（`league_id=206`）は**2019年まで**あり、**1,198試合**になる。
 *
 * ★**連盟サイトの「history」ページ**（`/history/1?oyyear=2025`）が
 * 茨城・香川とまったく同じ作り。**同じ `omyuleagueschedulenew.action`。**
 *
 * ------------------------------------------------------------------
 * ★★★**替えるときの検算で、危うく取り違えるところだった。**
 *
 * 素朴に「日付＋校名＋得点」で突き合わせると**43試合が消えた**ように見え、
 * **一度は「決勝が欠ける」と判断して差し戻した。** 実際は違った:
 *
 *   34件 … **日付が1日ずれているだけ**（雨天順延。2026-07-10 ⇔ 07-11）
 *    6件 … **連合チームの表記違い**（`４校連合` ⇔ `高畠・南陽・長井工業・左沢`）
 *    1件 … `新庄神室` ⇔ `新庄神室産業`（**slug は同じ**）
 *    3件 … 本当に見当たらない
 *
 * ★★**出典を替えるときの突き合わせは、日付と表記に依存させないこと。**
 * **並び順・日付・略称のどれかが違うだけで「消えた」に見える。**
 * ★**学校の結び付きは `slug` で比べる**（`display` で比べると表記違いで誤検知する）。
 *
 * ------------------------------------------------------------------
 * ★★**連盟の紙と履歴APIで日付が食い違う試合が34件ある。**
 * **どちらが正しいかは断定できない**（紙が予定日、APIが実施日と見られる）。
 * **いまはAPI側の日付で出している。**
 * 群馬で「連盟自身の2つの資料が食い違ったら引用元のまま出す」とした前例に倣う。
 *
 * ------------------------------------------------------------------
 * ★**春季・秋季は `omyuKeeps` が落とす。**
 * 出典の大会名が「第72回春季東北地区高等学校野球大会」で**県名を含まない**ため。
 * ★**これは意図した保守側の挙動**で、東北地区大会（複数県）を山形の
 * ファイルに混ぜないための歯止め。**緩めるなら、県大会と地区大会を
 * 名前で見分ける方法を先に決めること**（2020年の秋は
 * 「…大会・地区予選〜県大会」と書かれており、県大会も同じ名前で来る）。
 */
const yamagata = omyuAdapter({
  slug: "yamagata",
  district: "山形",
  name: "山形県高等学校野球連盟",
  siteUrl: "https://www.yamagata-hbf.org/",
  leagueId: 206,
});

/**
 * ★★★**静岡は 2026-08-29 に「一球速報の履歴API」へ出典を替えた**（運営者の判断）。
 *
 * ------------------------------------------------------------------
 * ★★**それまでは連盟のPDFを読んでいた。** 2024〜2026年の434試合しか無かった。
 * 履歴API（`league_id=221`）は**2017年まで**あり、**重なる3年だけで836試合**
 * （現行の約2倍。春季の予選など、現行が持たない大会を含む）。
 *
 * ★★**生成物をいったん消してから作り直した**（山口と同じ）。
 * 大会名が現行と一致するため、消さずに重ねると**APIが上書きして
 * 現行だけにある試合が黙って消える。**
 *
 * ------------------------------------------------------------------
 * ★★**この切り替えで失った **30試合**（下は先頭12件）**（APIに無い。**将来ほかの出典で補うための記録**）
 *
 *   2026-07-04 1回戦 新居・佐久間 1 - 浜松大平台 6
 *   2026-07-11 2回戦 静岡北 1 - 浜松修学舎 2
 *   2026-07-05 1回戦 榛原 5 - 静岡大成 6
 *   2026-07-05 1回戦 静岡学園 5 - 小笠 4
 *   2026-07-05 1回戦 静岡西 5 - 浜松江之島 4
 *   2026-07-05 1回戦 焼津水産 5 - 藤枝西 6
 *   2026-07-12 2回戦 磐田西 6 - 掛川東 13
 *   2025-07-05 1回戦 天竜 5 - 富士宮北 4
 *   2025-07-12 2回戦 市立沼津 9 - 三島南 8
 *   2025-07-19 3回戦 ◎磐田南 5 - 藤枝明誠 6
 *   2025-07-19 3回戦 △浜名 3 - 市立沼津 4
 *   2025-07-06 1回戦 掛川東 2 - 富士市立 1
 *
 * ★**シード記号を落として照合し直しても残ったもの**（`◎磐田南` ⇔ `磐田南`）。
 * ★**決勝は含まれていない**（含まれていたら切り替えていない。宮崎はそれで見送った）。
 */
const shizuoka = omyuAdapter({
  slug: "shizuoka",
  district: "静岡",
  name: "静岡県高等学校野球連盟",
  siteUrl: "https://shizuoka-koyaren.jp/",
  leagueId: 221,
});

const yamaguchi = omyuAdapter({
  slug: "yamaguchi",
  district: "山口",
  name: "山口県高等学校野球連盟",
  siteUrl: "https://yamaguchi-hbf.com/",
  leagueId: 235,
});

const miyazaki = {
  slug: "miyazaki",
  district: "宮崎",
  name: "宮崎県高等学校野球連盟",
  siteUrl: "https://miyazaki-hbf.jp/",
  politenessMs: 2000,
  /*
    ★**春・夏・秋の3季**（春は 2026-08-21 に追加）。

    ★★**「春季は県大会＋県北・県央・県南の地区予選の4枚」という記録は誤りだった。**
    4枚あるのは**別の大会**（`第N回宮崎県高等学校野球選手権大会`。5〜6月）で、
    春季九州地区大会の県予選は**1枚に収束するやぐら表**（夏・秋と同じ左右2段組）。
    ★**4枚のほうはまだ取っていない**（地区予選の紙が3枚そろっており、
    県大会と合わせて別の季節として持つ形になる。**別の仕事**）。
  */
  seasons: {
    spring: "https://miyazaki-hbf.jp/",
    summer: "https://miyazaki-hbf.jp/",
    autumn: "https://miyazaki-hbf.jp/",
  },
  /** 連盟ごとの定数。`main.*.chunk.js` の `leagueId=245` */
  leagueId: 245,
  /*
    ★★**`--year` で過去年も取れる**（2026-08-27）。

    **夏・秋は「お知らせの掲載年」で選ぶ** —— 結果は大会が終わった当日〜翌週に載るので、
    掲載年＝大会の年になる。**お知らせは2025年4月まで残っている**（実測15件）。
    ★★**春だけは掲載年で選べない** —— **1件のお知らせに年ちがいの紙が何枚もぶら下がる**
    （`newsId=12`＝2025.04.11 に 2025春・2026春の2枚）ので、
    **紙の「期日」から出した年で選ぶ**（`collectSpring`）。
    ★**渡さなければ今年**（既定の `TARGET_YEAR`）。
  */
  async collect({ season, year }) {
    if (season === "autumn") return this.collectAutumn(year);
    if (season === "spring") return this.collectSpring(year);
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
      // ★**その年に載ったお知らせだけ**（`--year` で過去年を取るため。静岡と同じ）
      .filter((n) => String(n.createTime).startsWith(`${year}`))
      .sort((a, b) => String(b.createTime).localeCompare(String(a.createTime)));
    if (!posts.length) {
      // ★過去年を取りに行ったときは静かに終わる（その年のお知らせが無いだけ）
      if (year >= new Date().getFullYear()) console.log("  ⚠️ 宮崎: 選手権の結果のお知らせが見つからない");
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
      /*
        ★★**本文が空の年がある**（2025は「＊第107回…　PDFファイル」の1行だけ）。
        **落とさずに、紙の中央に縦書きされている優勝校で検算する**（`readSheet`）。
        ★**検算そのものを飛ばすわけではない。**
      */
      const text = normalize(plain(body));
      const champion = text.match(/(\S+?)(?:高等学校|高校)\s*優勝/)?.[1] ?? null;
      const teams = Number(text.match(/\d+校\s*(\d+)\s*チーム/)?.[1]) || null;
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
    /*
      ★★**スロット番号の列は紙から探す**（2026-08-27。それまでは `x > 110 && x < 122` の決め打ち）。
      ★**紙の形は年でまるごと変わる** —— 左のスロット列は **2026年が 116／2025年が 132**で、
      決め打ちのままでは**2025年の紙が1試合も出せない**（春季で先に踏んだのと同じ）。
    */
    const slots = this.slotColumn(raw);
    if (!slots) {
      console.log(
        "  ⚠️ 宮崎: 左のスロット番号（1から続く列）が見つからない。" +
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

    /*
      ★★**境目と読み取り範囲も紙から測る**（2026-08-27）。
      決め打ちの `half: 277` ／ `ranges: [[56, 258], [297, 498]]` は2026年の紙のものだった。
    */
    const geometry = this.summerGeometry(cropped);
    if (!geometry) return [];

    /*
      ★★**お知らせに優勝校が書かれていない年がある**（2025年は「PDFファイル」の1行だけ）。
      そのときは**紙の中央に縦書きされている優勝校**で代わりにする（秋季と同じ道具）。
      ★**どちらにも無ければ1試合も出さない**（検算できないものは出さない）。
    */
    const champion = verify.champion ?? this.championFromCenter(cropped);
    if (!champion) {
      console.log("  ⚠️ 宮崎: 優勝校がお知らせにも紙の中央にも無い。検算できないので1試合も出さない");
      return [];
    }
    if (!verify.champion) {
      console.log(`  （宮崎: お知らせに優勝校が無いので、紙の中央の「${champion}」で検算する）`);
    }

    return readTwoColumnBracket(cropped, {
      district: "宮崎",
      titlePattern: /第\d+回全国高等学校野球選手権宮崎大会/,
      half: geometry.half,
      // 2桁のスコアが1〜2ポイント左にずれる（右半分は 411／413）
      rowTolerance: 3,
      // 左は上から、右は下から読む（スロットは縦、校名は横書き）
      nameOrder: ["asc", "desc"],
      season,
      // ★**日付が1つも書かれていない。** 推測で埋めない（三重・千葉と同じ）
      hasDates: false,
      finalAt: "innermost",
      verify: { ...verify, champion },
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
        ★**シード記号の列と、決勝の欄を範囲ごと外す**（測り方は `summerGeometry`）。
          2026 … ☆ 51 ／ 校名 61〜114 ／ スロット 116 ／ 回戦 143〜251 ‖ 305〜413 ／ スロット 438 ／ 校名 450〜491 ／ ☆ 502
          2025 … ☆ 63 ／ 校名 72〜115 ／ スロット 132 ／ 回戦 172〜279 ‖ 307〜415 ／ スロット 453 ／ 校名 465〜510 ／ ☆ 523
      */
      ranges: geometry.ranges,
      // 字間の空白を詰める（日本の校名に空白は入らない）
      cleanName: (s) => s.replace(/\s+/g, ""),
    });
  },

  /**
   * ★**スロット番号の列（1から続く縦の並び）を紙から探す**（2026-08-27）。
   *
   * 左の列（1〜N）だけを返す。**日程表を落とす床（`floor`）を測るのに使う。**
   * ★**右の列（N+1〜）は見ない** —— 日程表の見出し（`日程 … 20 21`）と
   * 月日の行が右のスロット列と同じ x に来るため（春季で踏んだ罠）。
   * ★**左の列にはその位置に数字が1つも無い**（「日」「月」「曜」「試」「数」）。
   *
   * ★**列の全部が連番であることは求めない。** 上から1ずつ増える並びが切れたら、
   * そこから下は見ない（下のほうに日程表の数字が入り込む紙がある）。
   *
   * @returns `[{ y, v }]`（上から順）／見つからなければ null
   */
  slotColumn(raw) {
    // ★2桁の数字は1桁より左端が出るので、列をまとめる幅は 5 で取る
    const cols = new Map();
    for (const l of raw.lines) {
      for (const i of l.items) {
        const t = i.text.trim();
        if (!/^\d{1,2}$/.test(t)) continue;
        const k = [...cols.keys()].find((v) => Math.abs(v - i.x) <= 5) ?? i.x;
        if (!cols.has(k)) cols.set(k, []);
        cols.get(k).push({ y: l.y, v: Number(t) });
      }
    }
    for (const list of [...cols.values()].sort((a, b) => b.length - a.length)) {
      const sorted = list.sort((a, b) => b.y - a.y);
      if (sorted[0].v !== 1) continue;
      let n = 1;
      while (n < sorted.length && sorted[n].v === sorted[0].v + n) n++;
      if (n >= 8) return sorted.slice(0, n);
    }
    return null;
  },

  /**
   * ★★**左右の境目と、半分ごとの読み取り範囲を紙から測る**（2026-08-27。夏の紙）。
   *
   * ------------------------------------------------------------------
   * ★ なぜ決め打ちにできないか
   *
   *   **紙の形は年でまるごと変わる。**
   *
   *     2026 … ☆ 51 ／ スロット 116・438 ／ 準決勝 251・305 ／ 決勝 264・290
   *     2025 … ☆ 63 ／ スロット 132・453 ／ 準決勝 279・307 ／ 決勝 290・297
   *
   *   ★**縮尺は同じでも配りかたが違う**ので、比で伸縮させても当たらない
   *   （2025の準決勝は、2026の決勝より右にある）。
   *
   * ------------------------------------------------------------------
   * ★★ 決勝の欄を外すのがいちばん難しい
   *
   *   決勝の得点は**中央に左右1つずつ**置かれ、半分ごとの組み立てには渡さない
   *   （渡すと、いちばん深い帯が準決勝と決勝の2つに割れて組めなくなる）。
   *
   *   ★**準決勝の帯は数字が2つ**（スコアが連結線の両端に置かれるため）で、
   *   **決勝は片側1つずつ。** そこで
   *   **「境目に向かって、数字が2つ以上ある最後の列」が準決勝、その次の列が決勝**とし、
   *   **その2つの中間で切る。**
   *
   *   ★**中央の縦書きの数字（`（8年ぶり10回目）`）は邪魔をしない** ——
   *   2026はちょうど準決勝と同じ x に乗り、2025は準決勝より外（浅い側）に来る。
   *   どちらも「いちばん深い2つ以上の列」を動かさない。
   *
   * ------------------------------------------------------------------
   * ★ シード記号（☆）の列は範囲ごと外す
   *
   *   校名にくっつくため。**記号を文字で消さない**（千葉で「宣」を巻き込んだ轍）。
   *   ★**☆と校名の隙間は5ポイントしかない**ので、**その中間で切る。**
   *
   * @returns `{ half, ranges }`／測れなければ null（**1試合も出さない**）
   */
  summerGeometry(raw) {
    const items = raw.lines.flatMap((l) => l.items.map((i) => ({ x: i.x, y: l.y, t: i.text.trim() })));

    // ---- 数字の列（スロット番号の列も含む。境目を探すのに使う） ----
    const cols = new Map();
    for (const i of items.filter((i) => /^\d{1,2}$/.test(i.t))) {
      const k = [...cols.keys()].find((v) => Math.abs(v - i.x) <= 4) ?? i.x;
      if (!cols.has(k)) cols.set(k, []);
      cols.get(k).push(i);
    }
    const numbered = [...cols.entries()].map(([x, list]) => ({ x, n: list.length })).sort((a, b) => a.x - b.x);
    if (numbered.length < 6) {
      console.log("  ⚠️ 宮崎: 数字の列が少なすぎる（紙の形が変わった可能性がある）。1試合も出さない");
      return null;
    }

    /*
      ★**スロット番号の列（左右でいちばん数字の多い2つ）のあいだだけを見る。**
      その外側は校名と凡例で、境目とは関係がない。
    */
    const slotCols = [...numbered].sort((a, b) => b.n - a.n).slice(0, 2).map((c) => c.x).sort((a, b) => a - b);
    const [leftX, rightX] = slotCols;
    const mid = (leftX + rightX) / 2;
    const inner = numbered.filter((c) => c.x > leftX && c.x < rightX);

    // ★左半分でいちばん深い「2つ以上」の列＝準決勝。その次の列＝決勝
    const leftSide = inner.filter((c) => c.x < mid);
    const rightSide = inner.filter((c) => c.x > mid);
    const semiL = [...leftSide].reverse().find((c) => c.n >= 2);
    const semiR = rightSide.find((c) => c.n >= 2);
    const finalL = leftSide.filter((c) => semiL && c.x > semiL.x)[0];
    const finalR = [...rightSide].reverse().filter((c) => semiR && c.x < semiR.x)[0];
    if (!semiL || !semiR || !finalL || !finalR) {
      console.log(
        "  ⚠️ 宮崎: 中央に決勝の得点が見つからない（準決勝の帯の内側に列が無い）。1試合も出さない",
      );
      return null;
    }

    // ---- シード記号（☆）と校名の隙間 ----
    const stars = items.filter((i) => i.t === "☆").map((i) => i.x);
    const names = items.filter((i) => /[一-龥ぁ-んァ-ヶ]/.test(i.t)).map((i) => i.x);
    if (!stars.length || !names.length) {
      console.log("  ⚠️ 宮崎: シード記号（☆）か校名が見つからない。1試合も出さない");
      return null;
    }
    const starL = Math.min(...stars);
    const starR = Math.max(...stars);
    const nameL = Math.min(...names.filter((x) => x > starL));
    const nameR = Math.max(...names.filter((x) => x < starR));

    return {
      half: (finalL.x + finalR.x) / 2,
      ranges: [
        [(starL + nameL) / 2, (semiL.x + finalL.x) / 2],
        [(finalR.x + semiR.x) / 2, (nameR + starR) / 2],
      ],
    };
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
  async collectAutumn(year) {
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
      // ★**その年に載ったお知らせだけ**（`--year` で過去年を取るため。夏と同じ）
      .filter((n) => String(n.createTime).startsWith(`${year}`))
      .sort((a, b) => String(b.createTime).localeCompare(String(a.createTime)));
    if (!posts.length) {
      /*
        ★**ここは静かに終わる。** 秋は呼ぶ側が「0件なら前年をもう一度」と
        面倒を見る（`TARGET_YEAR - 1`）ので、今年の紙がまだ無い時期に
        警告を出すと毎回鳴る。
      */
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

    return withYear(
      readTwoColumnBracket(cropped, {
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
      }),
      year,
    );
  },

  /*
    ------------------------------------------------------------------
    ★ 春季（九州地区大会の宮崎県予選）。2026-08-21 に追加
    ------------------------------------------------------------------

    紙は秋と同じ**左右2段組のやぐら表1枚**で、優勝校1つに収束する。
    ★**お知らせは1件しかなく、そこに複数の年の紙がぶら下がる**
    （`newsId=12` に第156回＝2025春 と 第158回＝2026春 の2枚）。

    ★★**だから「お知らせの掲載年」を検算に使えない。**
    夏・秋は `年 ≠ お知らせの掲載年` なら落としているが、
    春は**2枚とも同じお知らせ（2025.04.11）に付いている**ので、
    そのまま持ってくると新しいほうの紙が必ず落ちる。
    ★**年は紙の「期日」だけから出し、いちばん新しい1枚を使う。**

    ------------------------------------------------------------------
    ★★ ここが春季のいちばんの難所 ── 決勝と3位決定戦の取り違え

    中央に**決勝と3位決定戦が縦に並ぶ。** `finalAt: "innermost"`
    （境目をはさむ組のうちいちばん内側）は、**どちらが内側かが年で入れ替わる。**

      2026春 … 決勝 3-4（x=287/303・幅16）／3位決定戦 1-6（x=287/302・**幅15**）
      2025春 … 決勝 3-4（x=290/297・幅7）／3位決定戦 4-3（x=290/297・**幅7**）
      （秋は 決勝15 対 3決41 で、**向きが逆**）

    ★**2026は3位決定戦のほうが内側、2025は同点で「先に見つかったほう」任せ。**
    どちらも**画面に嘘の決勝スコアが出る**（2026は実際に 1-6 が決勝として出た）。

    ★★**幅では決められないので、紙の区画で決める。**
    中央に**3位決定戦のラベル**が刷ってあり、**その下が3位決定戦の区画**
    （両校名も縦書きでラベルの下にある）。ラベルの y を `centerFloor` に渡して
    **それより下を中央の走査から丸ごと外す。**

      2026 … `【3位決定戦】`（1断片・x=279・y=412.8）。決勝 448.6 ＞ 412.8 ＞ 3決 392.4
      2025 … `3`(x=282) + `位`(x=293) の2断片・y=402.6。決勝 471.1 ＞ 402.6 ＞ 3決 381.1

    ★**断片は年によって割れ方が違う**ので、**中央の行の断片をつないでから
    「3位」を探す**（文字で消すのではなく、行の y を境目として使うだけ）。

    ------------------------------------------------------------------
    ★★ 検算 ── **優勝校が刷られていない年がある**

    2025春には中央に `優勝／宮崎商業高等学校` が縦書きされているが、
    ★**2026春は `（16季ぶり2回目）` だけで校名が無い。**
    お知らせの本文も「PDFファイル」の一覧だけで、優勝校もチーム数も書いていない。
    ★**秋で使っている「中央の縦書きから優勝校を読む」検算が、年によって使えない。**

    ★★**そこで「紙の下の日程表」を検算材料にした。**
    球場ごと・日ごとの**試合数**が刷ってあり、**枝とは別の場所から来る事実。**

      2026 … ｻﾝﾏﾘﾝ 25 ＋ ｱｲﾋﾞｰ 18 ＝ **43** ＝ 組み立て42 ＋ 3位決定戦1
      2025 … ｻﾝﾏﾘﾝ 25 ＋ ｱｲﾋﾞｰ 20 ＝ **45** ＝ 組み立て44 ＋ 3位決定戦1

    ★★**この検算は 2025春 で「優勝校の検算」と一緒に通した。**
    片方だけしか無い年（2026）に使う前に、**両方ある年で一致することを確かめてある。**

    ★**日ごとの数ではなく合計を見るのは、雨天順延に強いから。**
    順延は試合を日のあいだで動かすだけで**合計を変えない**
    （沖縄の「会期の最終日は落とす条件にしない」と同じ考え方だが、
    こちらは**日付ではなく個数**なので、順延しても要求を緩めなくてよい）。

    ★**`予`（予備日）`休``×` は数字ではないので自然に落ちる。**
    ★**日程表の見出し（`日程` `月日`）にも数字が並ぶ**ので、
    **球場名のある行だけ**を数える（見出しの行に球場名は無い）。

    ★ 検算（合わなければ**1試合も出さない**）

      - チーム数 − 試合数 = 1
      - ★**日程表の試合数の合計 = 組み立てた試合数 + 3位決定戦**
      - **中央に優勝校が刷ってあれば**、決勝の勝者と一致（無ければ飛ばし、**ログに出す**）
      - 紙の「期日」が3〜6月（秋の紙を春として読まないため）

    ★**3位決定戦は出さない**（秋と同じ）。勝ち抜きの枝ではないので
    「チーム数 − 試合数 = 1」に乗らず、足すと検算が緩む。
  */
  async collectSpring(year) {
    const news = await fetchOmyuNews(this.leagueId);
    if (!news) {
      console.log("  ⚠️ 宮崎: お知らせの一覧が取れない。出典の作りが変わった可能性がある");
      return [];
    }
    /*
      ★**「春季九州地区…宮崎県予選」だけを拾う。**
      **秋季**（`秋季九州地区…`）と**九州地区大会そのもの**（県予選でない）、
      **軟式**を外す。★**5〜6月の「宮崎県高等学校野球選手権大会」は別の大会**で、
      「九州地区」に当たらないので混ざらない。
    */
    const posts = news
      .map((n) => ({ ...n, title: normalize(n.title ?? "") }))
      .filter((n) => /春季/.test(n.title) && /九州地区/.test(n.title) && /宮崎県予選/.test(n.title))
      .filter((n) => /結果/.test(n.title) && !/軟式/.test(n.title))
      .sort((a, b) => String(b.createTime).localeCompare(String(a.createTime)));
    if (!posts.length) {
      console.log("  ⚠️ 宮崎: 春季（九州地区大会県予選）の結果のお知らせが見つからない");
      return [];
    }

    /*
      ★★**1件のお知らせに年ちがいの紙が何枚もぶら下がる。**
      **全部読んでから、紙の期日がいちばん新しい1枚だけを使う。**
      ★**落ちたらその季節は0件**（福岡で決めた線。前の年の紙に落ちない）。
    */
    const post = posts[0];
    await sleep(this.politenessMs);
    const body = await fetchOmyuNewsBody(this.leagueId, post.newsId);
    const urls = [...(body ?? "").matchAll(/https?:\/\/[^"'\s<>]+\.pdf/g)].map((m) => m[0]);
    if (!urls.length) {
      console.log(`  ⚠️ 宮崎: 「${post.title}」にPDFのリンクが無い`);
      return [];
    }

    const sheets = [];
    for (const url of urls) {
      const parsed = await fetchPdfPages(url, { headers: UA });
      await sleep(this.politenessMs);
      if (!parsed?.length) {
        console.log(`  ⚠️ 宮崎(春): ${url} が読めない`);
        continue;
      }
      for (const raw of parsed) {
        const dated = this.springSheetYear(raw);
        if (dated) sheets.push({ raw, ...dated });
      }
    }
    if (!sheets.length) {
      console.log("  ⚠️ 宮崎(春): 春季のやぐら表が1枚も見つからない");
      return [];
    }
    /*
      ★★**`--year` で選ぶ**（2026-08-27）。それまでは「いちばん新しい紙」だった。
      ★**掲載年では選べない**（1件のお知らせに年ちがいの紙が何枚もぶら下がる）ので、
      **紙の「期日」から出した年**と突き合わせる。
      ★**その年の紙が無ければ0件**（前の年の紙に落ちない。福岡で決めた線）。
    */
    sheets.sort((a, b) => b.year - a.year);
    const sheet = sheets.find((x) => x.year === year);
    if (!sheet) {
      console.log(
        `  （宮崎(春): ${year} 年の紙がお知らせに無い。ぶら下がっているのは ${sheets.map((x) => x.year).join("・")} 年）`,
      );
      return [];
    }
    if (sheets.length > 1) {
      console.log(`  （宮崎(春): ${sheets.length} 枚のうち ${year} 年の紙を使う）`);
    }
    return this.readSpringSheet(sheet.raw, sheet.year) ?? [];
  },

  /**
   * 春季の紙かどうかを見て、**紙の「期日」から年を出す**。
   * 春季でなければ null（呼ぶ側は次の紙へ）。
   */
  springSheetYear(raw) {
    const flat = raw.lines.map((l) => normalize(l.text.replace(/\t/g, "")));
    if (!flat.some((t) => /第\d+回九州地区高等学校野球大会宮崎県予選/.test(t))) return null;
    /*
      ★**回数から年を出せない**（秋と同じ。「第158回」は九州地区大会の通し番号）。
      ★**「令和N年」は暦年**（年度ではない）。春季は3〜4月なので暦年と一致する。
    */
    const m = flat.map((t) => t.match(/期\s*日\D{0,4}令和(\d+)年\s*(\d+)月/)).find(Boolean);
    if (!m) return null;
    const month = Number(m[2]);
    /*
      ★★**季節は「期日」の月で決める**（大分と同じ）。表題は春も秋も同じ形なので、
      月を見ないと**秋の紙を春として読む**（そのまま出すと画面に別の大会が並ぶ）。
    */
    if (month < 3 || month > 6) return null;
    return { year: 2018 + Number(m[1]) };
  },

  /** 春季のやぐら表を1枚読む。**組めなければ null**（＝この紙ではない） */
  readSpringSheet(raw, year) {
    /*
      ★**スロット番号の列を紙から探す**（秋のような決め打ちにしない）。
      **2025と2026で座標がまるごと違う**（左のスロット列は 121〜123 と 104〜106、
      右は 462 と 482）ので、決め打ちだと片方の紙しか読めない。
      ★**2桁の数字は1桁より左端が出る**ので、列をまとめる幅は 5 で取る。
    */
    const cols = new Map();
    for (const l of raw.lines) {
      for (const i of l.items) {
        const t = i.text.trim();
        if (!/^\d{1,2}$/.test(t)) continue;
        const k = [...cols.keys()].find((v) => Math.abs(v - i.x) <= 5) ?? i.x;
        if (!cols.has(k)) cols.set(k, []);
        cols.get(k).push({ y: l.y, v: Number(t), x: i.x });
      }
    }
    /*
      ★**上から順に1ずつ増える「並び」を取る**（列の全部が連番であることは求めない）。

      ★★**列の下のほうに日程表の数字が入り込む。** 2025春の右のスロット列（x≒462）は
      `24,25,…,45` のあとに **`20` と `8`** が続く ——
      日程表の見出し（`日程 … 20 21`）と月日の行（`… 8 9`）が同じ x に来るためで、
      **列ぜんぶに連番を求めると、この紙は1試合も出せない**（実際に落ちた）。
      ★**スロットは上から読むので、切れたところから下は見なくてよい。**
      ★**足りない番号があれば並びはそこで切れる**ので、
      左右の対応（右の先頭＝左の枚数＋1）と下の検算がその取りこぼしを捕まえる。
    */
    const runs = [...cols.entries()]
      .map(([x, list]) => {
        const sorted = list.sort((a, b) => b.y - a.y);
        let n = 1;
        while (n < sorted.length && sorted[n].v === sorted[0].v + n) n++;
        return { x, list: sorted.slice(0, n), from: sorted[0].v };
      })
      .filter((c) => c.list.length >= 8);
    const left = runs.find((c) => c.from === 1);
    const right = left ? runs.find((c) => c.from === left.list.length + 1) : null;
    if (!left || !right) {
      console.log(
        "  ⚠️ 宮崎(春): スロット番号の列（左は1から、右はその続き）が見つからない。" +
          "紙の形が変わった可能性がある。1試合も出さない",
      );
      return [];
    }
    const leftX = left.list[0].x;
    const rightX = right.list[0].x;

    /*
      ★**紙の下半分（開始時刻の凡例と日程表）を行ごと落とす**（夏・秋と同じ理由で、
      日程表の列は回戦の帯と同じ x に来るので範囲では切り分けられない）。
      ★**落とす前に日程表を読んでおく**（そこが検算材料）。
    */
    const gaps = left.list.slice(1).map((s, i) => left.list[i].y - s.y);
    const pitch = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    const floor = left.list.at(-1).y - pitch * 0.5;
    const scheduled = this.springScheduleGames(raw, floor);
    /*
      ★★**中央の縦書き「（2季ぶり14回目）」を列ごと落とす**（2026-08-21）。

      ★**この数字が準々決勝の帯に混ざる。** 2025春は中央の注記が **x=263**、
      左半分のいちばん深い帯が **x=251** で、**12ポイントしか離れていない。**
      帯をまとめる幅は「回戦の間隔の0.45倍」（＝12.6）なので**まとめられ**、
      準々決勝が「数字6個（必要4個）」になって組み立てが止まった。

      ★**夏・秋は `hitSpan` がたまたま落としていた**（注記がスロット1.7〜4.1に来て
      枝の張る範囲の外に出る）。★**2025春は注記が枝の内側に入る**ので効かない。
      ★**幅を詰めて逃げないこと** —— 本物の帯も6ポイントこぼれる紙があり、
      12との差が小さすぎて歯止めにならない。**注記そのものを落とす。**

      ★**文字で消すのではなく列ごと落とす**（山口の秋季と同じ道具）。
      **校名の列は「◯季ぶり◯回目」の形にならない**ので巻き込まない。

      ★★**日程表を落としてから列を作ること。** 縦書きの列は「同じ x の文字をつなぐ」ので、
      **紙のいちばん下の日程表の升目が同じ列に入る** ——
      切る前は `（2季ぶり14回目）6火22×○×` になり、**形が合わずに1件も落ちなかった**
      （沖縄で凡例が校名に吸われたのと同じ、「下端が列に入る」たぐいの罠）。
    */
    const cropped = stripVerticalNotes(
      { page: raw.page, lines: raw.lines.filter((l) => l.y > floor) },
      { patterns: [/^[（(][0-9０-９]+[季年]ぶり[0-9０-９]+回目[）)]$/] },
    );

    /*
      ★★**3位決定戦のラベルより下を、中央の走査から外す**（上の説明を参照）。
      ★**断片の割れ方が年で違う**ので、**中央の行をつないでから「3位」を探す。**
    */
    const centerFloor = this.thirdPlaceLabelY(cropped);
    if (centerFloor === null) {
      console.log(
        "  ⚠️ 宮崎(春): 中央に3位決定戦のラベルが見つからない。" +
          "決勝と取り違えるおそれがあるので1試合も出さない",
      );
      return [];
    }
    /*
      ★**優勝校は刷ってある年と無い年がある**（2025はある／2026は無い）。
      **無ければ検算を飛ばすが、飛ばしたことは必ずログに出す**
      （「通った」と「していない」が見分けられなくなるため）。
    */
    const champion = this.springChampionFromCenter(cropped, centerFloor);

    /*
      ★★**ラベルの行の「中央の断片」を落としてから組み立てる**（2026-08-21）。

      2025春のラベルは `3`(x=282) と `位`(x=293) の2断片で、
      ★**`3` が左半分の準決勝の帯（x=279）に3ポイントしか離れずに並ぶ。**
      そのまま渡すと準決勝が「数字3個（必要2個）」になって組み立てが止まった。
      （2026春は `【3位決定戦】` が1断片なので数字にならず、ここは通っていた。）

      ★**範囲（`ranges`）では切れない** —— 279 を入れて 282 を外す境目は
      3ポイントしか無く、紙が少し伸び縮みしただけで逆になる。
      ★**行の中央だけを落とす**（沖縄の凡例・山口の「◯◯会場」と同じ「行で落とす」）。
      ★**行ごと落とさないこと** —— この行には左右の校名とスロット番号も載っている。
      ★**中央には決勝も3位決定戦のスコアも無い**（どちらも別の行）ので、巻き込まない。
    */
    const sheet = {
      page: cropped.page,
      lines: cropped.lines.map((l) => {
        if (l.y !== centerFloor) return l;
        const items = l.items.filter((i) => !(i.x > 255 && i.x < 335));
        return { ...l, items, text: items.map((i) => i.text).join("\t") };
      }),
    };

    const games = readTwoColumnBracket(sheet, {
      district: "宮崎",
      titlePattern: /第\d+回九州地区高等学校野球大会宮崎県予選/,
      // ★回数は九州大会の通し番号。年は紙の期日から読んである
      yearOf: () => year,
      /*
        ★**左右の境目。** 2025は左の準決勝 279／決勝 290-297／右の準決勝 306、
        2026は左の準決勝 257／決勝 287-303／右の準決勝 331。
        **決勝の2つをまたぎ、準決勝はまたがない**幅は両年で (290, 297)。
      */
      half: 294,
      rowTolerance: 3,
      nameOrder: ["asc", "desc"],
      season: "spring",
      // ★**枝に日付が1つも書かれていない**（日程表は下に別にある）。推測で埋めない
      hasDates: false,
      finalAt: "innermost",
      centerFloor,
      ...(champion ? { verify: { champion } } : {}),
      // ★**スコアは連結線の両端に置かれる**（夏・秋と同じ）
      hitSpan: true,
      // 中央の縦書き「（16季ぶり2回目）」の「回」が離れたスコアを消さないように
      inningMarkGap: 30,
      /*
        ★**シード記号（☆）の列を範囲ごと外し、中央も外す。**
        ★**座標はスロット列からの相対で取る**（2025と2026で紙がまるごとずれている）。
          2025 … ☆ 51 ／ 校名 61〜116 ／ スロット 121 ／ 回戦 …279 ‖ 306… ／ スロット 462 ／ 校名 474〜529 ／ ☆ 532
          2026 … ☆ 31 ／ 校名 42〜99 ／ スロット 104 ／ 回戦 …257 ‖ 331… ／ スロット 482 ／ 校名 495〜553 ／ ☆ 556
        ★**右端は「いちばん右の校名の断片」より外**（縦に1文字ずつ割れた校名がある）
        **かつ ☆ より内**に取る。スロット列 +65 が両年でその間に入る。
      */
      ranges: [
        [leftX - 66, leftX + 163],
        [305, rightX + 65],
      ],
      cleanName: (s) => s.replace(/\s+/g, ""),
    });
    if (!games?.length) return games;

    /*
      ---- ★★日程表との突き合わせ ----
      **枝とは別の場所から来る事実**なので、優勝校が刷られていない年でも
      「スロットを丸ごと読み落とした」「余分に組んだ」を止められる。
    */
    if (scheduled === null) {
      console.log("  ⚠️ 宮崎(春): 日程表の試合数が読めない。検算できないので1試合も出さない");
      return [];
    }
    // 3位決定戦は組み立てない（出さない）が、日程表には入っている
    const expected = games.length + 1;
    if (scheduled !== expected) {
      console.log(
        `  ⚠️ 宮崎(春): 日程表の試合数は ${scheduled} 件だが、` +
          `組み立て ${games.length} ＋ 3位決定戦1 ＝ ${expected} 件。1試合も出さない`,
      );
      return [];
    }
    /*
      ---- ★★3位決定戦の出場校との突き合わせ ----

      ★**ラベルの下に、3位決定戦の両校名が縦書きで刷ってある**
      （2026は `小林西` と `宮崎学園`、2025は `富島` と `都城`）。
      **これは準決勝で負けた2校**なので、組み立てた準決勝と突き合わせられる。

      ★★**枝とは別の場所から来る事実**で、しかも**準決勝の相手が違えば必ず食い違う** ——
      石川で通ってしまった「構造は合うのに対戦相手が違う」を、
      **優勝校が刷られていない年でも**止められる。

      ★**読めなければ飛ばす**（校名が2つ揃って読めたときだけ検算する）。
      **飛ばしたことはログに出す。**
      ★**読めたのに合わなければ落とす**（1試合も出さない）。
    */
    const printed = this.springThirdPlaceTeams(cropped, centerFloor);
    const semis = games.filter((g) => g.round === "準決勝");
    const losers = semis.flatMap((g) => g.teams.filter((t) => !t.won).map((t) => t.display));
    let thirdPlaceNote = "★**3位決定戦の出場校が読めず未検算**";
    if (printed && semis.length === 2 && losers.length === 2) {
      /*
        ★**完全一致を求める。** どちらも同じ紙の同じ書き方なので略し方は揃う。
        ★**部分一致で緩めないこと** —— 2025春の表には `都城` と `都城東` が
        どちらも出ており、**含む／含まれるで比べると取り違える。**
      */
      const a = [...printed].sort();
      const b = [...losers].sort();
      if (a[0] !== b[0] || a[1] !== b[1]) {
        console.log(
          `  ⚠️ 宮崎(春): 3位決定戦の出場校は紙では「${printed.join("・")}」だが、` +
            `準決勝で負けたのは「${losers.join("・")}」。1試合も出さない`,
        );
        return [];
      }
      thirdPlaceNote = `3位決定戦の「${printed.join("・")}」＝準決勝の敗者とも一致`;
    }
    console.log(
      `  （宮崎(春): 日程表の ${scheduled} 試合と一致 ／ ` +
        (champion ? `優勝校「${champion}」とも一致` : "★**優勝校は紙に無く未検算**") +
        ` ／ ${thirdPlaceNote}）`,
    );
    return withYear(games, year);
  },

  /**
   * ★**3位決定戦の両校名を読む**（ラベルの下に縦書きで刷ってある）。
   *
   *   2026 … x≒278 `小 林 西` ／ x≒308 `宮 崎 学 園`
   *   2025 … x≒281 `富 島`   ／ x≒302 `都 城`
   *
   * ★**列の幅は3で取る。** 球場の凡例（`サ…ｻﾝﾏﾘﾝｽﾀｼﾞｱﾑ`）が
   * 2025では校名の5.6ポイント隣にあり、5で取ると巻き込む。
   * ★**数字（3位決定戦のスコア）と凡例は形で落ちる**
   * （スコアは1文字、凡例は `…` を含んで長い）。
   *
   * @returns 校名2つ / null（2つ揃って読めなかった。**検算は飛ばす**）
   */
  springThirdPlaceTeams(raw, centerFloor) {
    const items = raw.lines
      .flatMap((l) => l.items.map((i) => ({ x: i.x, y: l.y, t: i.text.trim() })))
      .filter((i) => i.x > 255 && i.x < 335 && i.y < centerFloor);
    const cols = new Map();
    for (const i of items) {
      const k = [...cols.keys()].find((v) => Math.abs(v - i.x) <= 3) ?? i.x;
      if (!cols.has(k)) cols.set(k, []);
      cols.get(k).push(i);
    }
    const names = [];
    for (const col of cols.values()) {
      const s = col.sort((a, b) => b.y - a.y).map((i) => i.t).join("");
      if (/^[^\d…]{2,10}$/.test(s)) names.push(s);
    }
    return names.length === 2 ? names : null;
  },

  /**
   * ★**紙の下の日程表から、球場ごとの試合数の合計を読む**（春季の検算材料）。
   *
   *   試 ｻﾝﾏﾘﾝｽﾀｼﾞｱﾑ  3 3 2 3 3 休 2 2 休 予 1 2 × × × × 2 2 ×
   *   合 ｱｲﾋﾞｰｽﾀｼﾞｱﾑ  2 3 2 3 3 休 2 2 休 予 1 予 × × × × × × ×
   *
   * ★**球場名のある行だけを数える。** 見出し（`日程` `月日`）にも
   * 1〜21 や 20,21,22… と数字が並ぶので、行を選ばずに数えると桁違いになる。
   * ★**`予`（予備日）`休``×` は数字ではないので自然に落ちる。**
   *
   * @param floor これより下が日程表（やぐら表の切り落とし位置）
   * @returns 合計 / null（球場名のある行が1つも無い）
   */
  springScheduleGames(raw, floor) {
    let total = 0;
    let rows = 0;
    for (const l of raw.lines) {
      if (l.y > floor) continue;
      /*
        ★**半角カナで刷られている年がある**（2026は `ｻ ﾝ ﾏ ﾘ ﾝ ｽ ﾀ ｼ ﾞ ｱ ﾑ` と
        1文字ずつ別の断片、2025は `ｻﾝﾏﾘﾝｽﾀｼﾞｱﾑ` で1断片）。
        **区切りを外してから NFKC** にしないと濁点が分かれたままになる。
      */
      const label = l.items.map((i) => i.text).join("").replace(/\s/g, "").normalize("NFKC");
      if (!/スタジアム|球場|ドーム|グラウンド|パーク/.test(label)) continue;
      rows++;
      for (const i of l.items) {
        const t = i.text.trim();
        if (/^\d{1,2}$/.test(t)) total += Number(t);
      }
    }
    return rows ? total : null;
  },

  /**
   * ★**中央の「3位決定戦」のラベルの y を返す**（`centerFloor`。春季）。
   *
   * ★**断片の割れ方が年で違う**（2026は `【3位決定戦】` の1断片、
   * 2025は `3` と `位` の2断片）ので、**中央の行の断片をつないでから探す。**
   * ★**文字を消すのではなく、行の y を境目として使うだけ**にしてある。
   */
  thirdPlaceLabelY(raw) {
    for (const l of raw.lines) {
      const mid = l.items.filter((i) => i.x > 255 && i.x < 335);
      if (!mid.length) continue;
      if (/3\s*位/.test(normalize(mid.map((i) => i.text).join("")))) return l.y;
    }
    return null;
  },

  /**
   * ★**中央の縦書きから優勝校を読む**（春季。刷ってある年だけ）。
   *
   *   x≒279 … 優 勝 宮 崎 商 業 高 等 学 校   ← 2025春
   *   x≒265 … （ 2 季 ぶ り 14 回 目 ）
   *
   * ★**秋の `championFromCenter` は使えない。** あちらは `優勝` が1つの断片に
   * なっている紙で、春は **`優` と `勝` が縦に別々**（1文字ずつ）。
   * ★**列をつないで「優勝◯◯高等学校」で始まる列**を選ぶ。
   *
   * @param centerFloor これより下（3位決定戦の区画）は見ない
   */
  springChampionFromCenter(raw, centerFloor) {
    const items = raw.lines
      .flatMap((l) => l.items.map((i) => ({ x: i.x, y: l.y, t: i.text.trim() })))
      .filter((i) => i.x > 255 && i.x < 335 && i.y > centerFloor);
    const cols = new Map();
    for (const i of items) {
      /*
        ★**列の幅は 5 で取る。** 「優勝」（x=279.2）と校名（x=282.4）で
        3ポイントずれる紙がある（字の大きさが違うため）。
      */
      const k = [...cols.keys()].find((v) => Math.abs(v - i.x) <= 5) ?? i.x;
      if (!cols.has(k)) cols.set(k, []);
      cols.get(k).push(i);
    }
    for (const col of cols.values()) {
      const s = col.sort((a, b) => b.y - a.y).map((i) => i.t).join("");
      /*
        ★**末尾で止めないこと**（秋と同じ）。列には準決勝のスコアなど
        別の断片も混ざる。**先頭からの一致だけを見て、校名の長さで歯止めをかける。**
      */
      const m = s.match(/^優\s*勝(.{2,10}?)(?:高等学校|高校)/);
      if (m) return m[1];
    }
    return null;
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
    /*
      ★★**「優勝」の割れ方が紙で違う**（2026-08-27。夏の紙を読むために足した）。
      秋・春は `優勝` が1断片だが、**夏は `優` と `勝` が縦に離れて置かれる**
      （2025年夏は `優` が y=669.5、`勝` が y=647.4 で、どちらも x=279.6）。
      ★**校名はその下**なので、**下にあるほう（`勝`）を目印にする。**
    */
    const mark =
      items.find((i) => i.t === "優勝") ??
      items.find(
        (i) =>
          i.t === "勝" &&
          items.some((j) => j.t === "優" && Math.abs(j.x - i.x) <= 6 && j.y > i.y && j.y - i.y <= 40),
      );
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
    /*
      ★★**「優勝」が行の先頭に無い年がある**（2026-09-01。2025年の紙）。

        2026年 … `優勝\t敦賀気比高校（２年連続１３回目）`
        2025年 … `セーレン…で実施\t優勝\t敦賀気比高校（３年ぶり１２回目）\t（敦）---…`

      ★**行の先頭で探していたので、2025年は「表に優勝校の記載が無い」で
      26試合が丸ごと落ちていた。** 断片で探して**次の断片**を採る。
      ★**`準優勝` を拾わないこと**（断片の完全一致で見る）。
    */
    let printed = null;
    for (const l of raw.lines) {
      const at = l.items.findIndex((i) => i.text.trim() === "優勝");
      if (at >= 0 && l.items[at + 1]) {
        printed = l.items[at + 1].text.trim();
        break;
      }
    }
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

    /*
      ---- 検算3: 日付 ----
      ★★**日付を1つも刷っていない紙がある**（2026-09-01。2025年の夏）。
      **枝に日付が無いだけ**なので、そこを理由に大会ごと落とさない
      （千葉・三重・宮崎と同じで `date: null` で出す。**推測で埋めない**）。
      ★**中途半端に欠けているときだけ落とす** —— 拾い漏らしはそこで分かる。
    */
    const dated = built.games.filter((g) => g.date);
    if (dated.length && dated.length !== built.games.length) {
      console.log(
        `  ⚠️ 福井: 日付の読めない試合が ${built.games.length - dated.length} 件。1試合も出さない`,
      );
      return [];
    }

    console.log(
      `  （${tournament}: ${built.games.length} 試合 / 優勝 ${built.champion} / ${built.teams} チーム` +
        `${dated.length ? "" : "・**日付なし**"}）`,
    );
    return built.games.map((g) => {
      const [mm, dd] = (g.date ?? "/").split("/");
      return {
        date: g.date ? `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}` : null,
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

    /*
      ★★**日付を1つも持たない大会は、大会名の頭に西暦を足す**
      （2026-09-01。宮崎・愛知・富山と同じ）。

      `第154回北信越地区高等学校野球大会福井県大会（春季）` の**回数は北信越大会の
      通し番号**なので、そのままだと `yearOfTournament` が年を出せず、
      **「年の分からない大会」**として県のページの別枠に落ちていた（実際に落ちていた）。
      ★**日付のある秋季には足さない**（足すと引き継ぎの鍵が変わるだけ）。
    */
    const name = dated ? tournament : `${py}年 ${tournament}`;
    console.log(
      `  （${name}: ${built.games.length} 試合 / 優勝 ${champ} / ${built.teams} チーム` +
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
        tournament: name,
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
/**
 * ★**和歌山の「大会履歴」から取る大会**（2026-09-01）。
 *
 * ★**新人戦は入れない**（AGENTS の「収録する大会の範囲」）。
 * ★**春季近畿大会・秋季近畿大会**は地区大会そのもので、和歌山県の大会ではない。
 * ★**選手権大会和歌山大会（夏）は `collectSummer` の担当。**
 *   夏だけ準決勝を抽選で組み直すので、お知らせの優勝・準優勝が要る。
 */
const HISTORY_GROUPS = [
  { name: "春季近畿大会県予選", season: "spring" },
  /*
    ★★**夏も「大会履歴」から取る**（2026-09-01 その4。運営者の判断）。
    ★**お知らせ（`news.html`）は大会が終わると新人戦に入れ替わり、
    勝ち上がりトーナメントのPDFが消える**ので、そこだけに頼ると過去年が取れない。
    ★★**検算は「優勝校だけ」に弱めてある** —— お知らせは優勝校と準優勝校を
    別々の見出しに書いているが、**大会履歴の紙に刷ってあるのは優勝校だけ。**
    ★**弱めたのはそこだけで、枝の検算（チーム数 − 試合数 = 1・
    準決勝に進んだ4校が準々決勝の勝者の並べ替えであること）はそのまま。**
    ★**2017〜2021年の紙は形がまるで違う**（やぐら型・`主催` の行も抽選の注記も無い）。
    **読めるのは2022年以降の5枚。**
  */
  { name: "選手権大会和歌山大会", season: "summer" },
  { name: "秋季近畿県一次予選", season: "autumn" },
  { name: "秋季近畿県二次予選", season: "autumn" },
];

/**
 * 校名の字として読んでよい断片か。**全角数字・丸数字・括弧だけの断片は校名ではない。**
 * （スロット番号・シード記号を校名に混ぜないため）
 */
const isNameText = (t) => /[^\x00-\x7F]/.test(t) && !/^[０-９①-⑳（）]+$/.test(t.trim());

/**
 * 校名の並びが同じか。**紙の別の場所どうしを突き合わせるためのもの。**
 *
 * ★**同じ紙の中で新字体と旧字体が混ざる**（枝は `智辯和歌山`・
 * 中央の優勝校は `智弁和歌山`）。`normalizeSchoolName` は旧字体を
 * 何でも寄せるわけではないので、ここで**弁だけ**足す。
 * ★**学校マスタとの照合には使わない**（あちらは `normalizeSchoolName`）。
 */
const sameSchoolText = (a, b) => {
  const key = (s) => normalizeSchoolName(s).replace(/[辯瓣辨]/g, "弁");
  return key(a) === key(b);
};

/** 表の見た目をそろえるための字間の空白を落とす（`智 辯 和 歌 山`） */
const cleanWakayamaName = (s) => s.replace(/[\s　]/g, "");

const wakayama = {
  slug: "wakayama",
  district: "和歌山",
  name: "和歌山県高等学校野球連盟",
  siteUrl: "https://www.whbf.jp/",
  politenessMs: 2000,
  /*
    ★★**春季・秋季は「大会履歴」（`history.html`）から取る**（2026-09-01 に追加）。
    夏だけは今までどおりお知らせ（`news.html`）から取る ——
    **夏は抽選で準決勝を組み直す**ので、お知らせの優勝校・準優勝校が要る
    （下の `readDrawnRounds` を読むこと）。
  */
  seasons: {
    spring: "https://www.whbf.jp/history.html",
    summer: "https://www.whbf.jp/news.html",
    autumn: "https://www.whbf.jp/history.html",
  },
  async collect(ctx) {
    if (ctx.season !== "summer") return this.collectHistory(ctx);
    /*
      ★★**夏はお知らせと大会履歴の両方を見る**（2026-09-01 その4）。
      **開催中はお知らせにしかPDFが無く、終わると大会履歴にしか残らない。**
      ★**同じ大会が両方から取れたら、試合数の多いほうを採る**（三重と同じ）。
    */
    const fromNews = await this.collectSummer(ctx);
    const fromHistory = await this.collectHistory({ ...ctx, url: "https://www.whbf.jp/history.html" });
    const best = new Map();
    for (const list of [fromNews, fromHistory]) {
      const byT = new Map();
      for (const g of list) {
        if (!byT.has(g.tournament)) byT.set(g.tournament, []);
        byT.get(g.tournament).push(g);
      }
      for (const [t, gs] of byT) {
        if (!best.has(t) || best.get(t).length < gs.length) best.set(t, gs);
      }
    }
    return [...best.values()].flat();
  },
  /*
    ~~★準決勝以降は抽選なので出さない。`partial: true` で警告を止める~~
    ★**2026-08-18 に外した。** 抽選の結果は紙に書いてあり、
    `readDrawnRounds()` で読めるようになったので**準々決勝4・準決勝2・決勝1が揃う。**
    `partial` を付けたままだと、**将来この読み取りが壊れて3試合が消えても
    警告が出ない**（それがいちばん困る）。**検査を効かせておく。**
  */
  async collectSummer({ fetchHtml, season, url }) {
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
    // ★**記念大会は大会名に `記念` が入る**（第105回・第100回）。入れないとその年だけ読めない
    const tournament = flat.map((t) => t.match(/第\d+回全国高等学校野球選手権(?:記念)?和歌山大会/)?.[0]).find(Boolean);
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
    /*
      ★**準優勝校を持たない出典がある**（大会履歴の紙は「優勝◯◯」しか刷っていない）。
      **持っているぶんだけ突き合わせる**（2026-09-01 その4。運営者の判断）。
    */
    for (const [label, name] of [
      ["優勝", verify.champion],
      ["準優勝", verify.runnerUp],
    ].filter(([, v]) => v)) {
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
    // ★**準優勝校は持っているときだけ見る**（上の項）
    if (!subseq(champ, verify.champion) || (verify.runnerUp && !subseq(runner, verify.runnerUp))) {
      console.log(
        `  ⚠️ 和歌山: 読んだ決勝（${champ} / ${runner}）が出典（${verify.champion} / ${verify.runnerUp ?? "—"}）と合わない。準決勝以降は出さない`,
      );
      return [];
    }
    return out;
  },

  /*
    ==================================================================
    ★★★ 春季・秋季 ── 「大会履歴」（`history.html`）から取る（2026-09-01）
    ==================================================================

    ★**運営者からもらった出典。** 年度×大会のPDFが硬式だけで64件並んでいる。

      左の「硬式」の箱     … 春季近畿大会県予選／選手権大会和歌山大会／新人戦／
                             秋季近畿県一次予選／秋季近畿県二次予選／春季近畿大会／秋季近畿大会
      右の「軟式」の箱     … ★**丸ごと対象外**

    ★**取るのは県の大会3つだけ**（`HISTORY_GROUPS`）。
      - **新人戦**は `isTargetTournament` の対象外（AGENTS の「収録する大会の範囲」）
      - **春季近畿大会・秋季近畿大会**は地区大会そのもの（和歌山県の大会ではない）
      - **選手権大会和歌山大会**（夏）は `collectSummer` の担当。
        ★**2017〜2021年の夏はやぐら型で読めない**ので、ここでは触らない

    ------------------------------------------------------------------
    ★ 紙の形は2つある。**どちらも「スロット格子型」で、スロットは縦・回戦は右へ**

      A型（2024〜2026年の春季・2024〜2025年の一次予選）
        校名（右揃え）│ スロット番号 │ 1回戦 │ 2回戦 │ … │ 決勝 │ 優勝校（縦書き）
        ★**校名がスロット番号の左**にあるので、そのまま `orientPage` に渡せる

      B型（2017〜2023年。二次予選は2017〜2025年）
        スロット番号 │ (校名) │ 1回戦 │ 2回戦 │ …
        ★**校名がスロット番号の右**にあり、`assembleSlotBracket` の前提
        （校名と回戦が反対側）に合わない。**兵庫と同じで、スロット番号の列を
        校名と得点のあいだへ動かしてから渡す**（`moveSlotColumn`）

    ★**どちらかは紙から決める**（`historyGeometry` の `namesRight`）。
    **スロット番号と同じ高さにある字が左右どちらに多いか**で見分ける。
    ★**「校名の列が左にあるか」で見分けないこと** —— B型の紙は左端に
    球場の凡例（`（紀三井寺公園野球場）`）が縦書きで入っており、
    字数だけならA型と見分けが付かない。

    ------------------------------------------------------------------
    ★ 踏んだところ（実データで突き止めたもの）

      1. ★★**得点とコールドの回数が1つの断片に潰れる**（`118` `1213` `195`）。
         **2桁の得点は「N回」の N と隣り合う**ので pdf.js がつなげてしまう
         （1桁の得点は42ポイント空くので割れない）。
         `splitMergedInnings()` が**「回」がすぐ右にあるときだけ**先頭2文字に切る。
         ★**残すのが2文字なのは、得点の欄が2桁ぶんの幅だから**（実測）。
      2. ★**「N回」が離れて置かれる**（得点の右100〜135ポイント）。
         `stripInningMarks` の `maxGap` を 250 にしてある（実測の最大は135）。
      3. ★**スロット番号と開き括弧が1つの断片になっている紙がある**（`11 (`）。
         **1桁のスロットは別々**なので、そのままだと**2桁のスロットが全部消える**
         （haru-2019 は 39 スロットのうち 1〜10 しか読めなかった）。
      4. ★**二次予選のスロット番号は丸数字と全角の混在**（`① ２ ③ ４ …`）。
         **1つの列にまとまっているときだけ**ふつうの数字に直す（`normalizeSlotMarks`）。
         ★**丸数字を無条件に数字へ直さないこと** —— 夏の紙では第何試合の印である。
      5. ★★**校名の欄の右端は「密な列」で測る**（千葉と同じ）。
         同じ帯に `８回コールド` `延長１１回` の注記が入っており、
         混ぜると右端が得点の列を追い越す。
      6. ★**得点は「連結線の両端」に置かれる**ので `hitSpan: true`
         （山口・宮崎・夏の和歌山と同じ）。

    ------------------------------------------------------------------
    ★ 検算（合わなければ**その大会は1試合も出さない**）

      1. **チーム数 − 試合数 = 勝ち上がる数**（勝ち抜き戦の算数）
      2. ★★**紙に刷ってある勝ち上がり校と、組み立てた勝者が順番まで一致する。**
         ★**一次予選は近畿県二次予選へ進む4校**が紙の右端に並んでおり、
         **4校ぶん・並び順まで**突き合わせられる（山口の秋季と同じ形の検算）。
         春季・二次予選は優勝校1校。
      3. **一覧の「◯◯年度」と、紙の元号から出した年が一致する**
      4. **日付のある紙は、月が季節の窓に入っている**

    ★★**春季に抽選は無い**（2026-08-31 に9枚とも開いて `抽選` の字が
    1つも無いことを確かめた）。夏だけが準決勝を抽選で組み直す。
    ★**だから春季・秋季は枝だけで組める。** 検算を弱めていない。

    ★★**不戦勝のある紙は組み立てられない**（大阪・石川と同じ）。
    得点の無い枠が混ざると「その回戦の数字が試合数の2倍」が崩れる。
    **件数をログに出してから落とす**（「数字が足りない」より原因が分かる）。

    ★**球場は出さない。** 紙は1文字の記号（`紀` `上` `田` `マ`）で書き、
    凡例は左端に縦書きで入っている。**読めるが、まだ読んでいない。**

    ★★**この紙は `Generated by E-league ©OmyuTech.` と刷ってある**（作図ソフト）。
    ★**取っているのは連盟のサイトに連盟名義で置かれたPDF**なので、
    2026-08-20 の方針（「連盟の公式サイト上で連盟名義で公開されている試合結果は、
    連盟の著作物として扱い、その数値を引用する」）のとおり。
    **一球速報のスコアAPIからは取っていない。**
  */
  async collectHistory({ fetchHtml, season, url, year }) {
    const html = await fetchHtml(url);
    if (!html) return [];
    /*
      ★**「軟式」の箱を必ず外す。** 左が硬式・右が軟式で、
      見出しの文字（`<h1>硬式`）ではなく**箱そのもの**で切る。
    */
    const hard = html.slice(html.indexOf('class="left-box"'), html.indexOf('class="right-box"'));
    if (hard.length < 100) {
      console.log("  ⚠️ 和歌山: 大会履歴の「硬式」の箱が見つからない");
      return [];
    }
    /** `<p class="ac1">大会名</p>` … `<a href=…pdf>YYYY年度</a>` */
    const links = [];
    let group = null;
    for (const m of hard.matchAll(
      /<p class="ac1">([^<]*)<\/p>|<a href="([^"]+\.pdf)">\s*(\d{4})年度/g,
    )) {
      if (m[1]) group = HISTORY_GROUPS.find((g) => g.name === normalize(m[1]).trim()) ?? null;
      else if (group && group.season === season) {
        links.push({ group, year: Number(m[3]), url: new URL(m[2], url).toString() });
      }
    }
    /*
      ★**取りに行くのは指定された年のぶんだけ。** 出典は小さな連盟のサイトで、
      1回の実行で64件を取りに行くのは行き過ぎ。
      **過去年は `--year` で1年ずつ積み上げる**（引き継ぎが前の生成物を残す）。
    */
    const wanted = links.filter((l) => l.year === year);
    if (!wanted.length) return [];

    const games = [];
    for (const link of wanted) {
      const parsed = await fetchPdfPages(link.url, { headers: UA });
      await sleep(this.politenessMs);
      if (!parsed?.length) {
        console.log(`  ⚠️ 和歌山: ${link.group.name} ${link.year}年度のPDFを読めなかった`);
        continue;
      }
      games.push(
        ...(season === "summer"
          ? this.readSummerHistorySheet(parsed[0], season, link)
          : this.readHistorySheet(parsed[0], season, link)),
      );
    }
    return games;
  },

  /**
   * ★★**夏の紙を「大会履歴」から読む**（2026-09-01 その4。運営者の判断）。
   *
   * ★**紙はお知らせに貼られるものと同じ**（2022年以降）。**読み手も同じ `readSheet`。**
   * ★**違うのは検算の材料だけ** —— お知らせは優勝校と準優勝校を別々の見出しに
   * 書いているが、**この紙に刷ってあるのは優勝校だけ。**
   *
   *   第１０８回 全国高等学校野球選手権和歌山大会
   *   組 み 合 わ せ
   *   主催：（一財）和歌山県高等学校野球連盟・朝日新聞社
   *   **智 辯 和 歌 山**        ← ここ（`主催` の次にくる、字だけの行）
   *   3年連続 / 29回目の / 優勝
   *
   * ★★**「優勝」の字の位置では探さないこと** —— 校名は `優勝` より**上**にあり、
   * あいだに `3年連続` `29回目の` が入る。**行の並びで決める。**
   * ★**当て推量にはならない** —— 読んだ校名は
   * **「準々決勝の勝者4校の中にいること」を `readSheet` が要求する**ので、
   * 別の行を拾えば必ずそこで落ちる。
   *
   * ★★**2017〜2021年の紙は形がまるで違う**（やぐら型。`主催` の行も抽選の注記も無く、
   * この規則で拾えるのは1校目の校名になってしまう）。
   * **`主催` の行が無ければ何も読まない**ので、その5枚はここで止まる。
   */
  readSummerHistorySheet(raw, season, link) {
    const label = `${link.group.name} ${link.year}年度`;
    const text = (l) => normalize(l.items.map((i) => i.text).join("")).replace(/[\s　]/g, "");
    const lines = raw.lines.map(text);
    const host = lines.findIndex((t) => t.includes("主催"));
    if (host < 0) {
      console.log(`  ⚠️ 和歌山: ${label} の紙に「主催」の行が無い（2021年以前のやぐら型）。1試合も出さない`);
      return [];
    }
    let champion = null;
    for (let i = host + 1; i < Math.min(host + 6, lines.length); i++) {
      const t = lines[i];
      if (t.length >= 2 && t.length <= 10 && /^[一-龥ぁ-んァ-ヶー々]+$/.test(t)) {
        champion = t;
        break;
      }
    }
    if (!champion) {
      console.log(`  ⚠️ 和歌山: ${label} の紙に優勝校が刷られていない。検算できないので1試合も出さない`);
      return [];
    }
    /*
      ★**一覧の年度と、大会名の回数（年 − 1918）が合うことを見る** ——
      新潟で「名前と中身が1年ずれる」を2度やっているので、ここは必ず見る。
    */
    const tournament = lines.map((t) => t.match(/第\d+回全国高等学校野球選手権(記念)?和歌山大会/)?.[0]).find(Boolean);
    const no = Number(tournament?.match(/第(\d+)回/)?.[1]);
    if (!Number.isFinite(no) || no + 1918 !== link.year) {
      console.log(
        `  ⚠️ 和歌山: ${label} の紙は「${tournament ?? "大会名が読めない"}」で一覧の年度と合わない。1試合も出さない`,
      );
      return [];
    }
    // ★**読み手はお知らせのときと同じ。** 準優勝校は持たないので null で渡す
    return this.readSheet(raw, season, { champion, runnerUp: null }) ?? [];
  },

  /** 大会履歴のPDFを1枚読む。**検算に落ちたら1試合も返さない** */
  readHistorySheet(raw, season, link) {
    const label = `${link.group.name} ${link.year}年度`;
    let page = stripInningMarks(raw, { maxGap: 250 });
    page = this.splitMergedInnings(page);
    // ★スロット番号と開き括弧が1つの断片になっている紙（`11 (`）
    page = splitLeadingMark(page, /^(\d{1,3})\s*([(（])$/);
    page = this.normalizeSlotMarks(page);

    const tournament = this.historyTitle(page);
    if (!tournament) {
      console.log(`  ⚠️ 和歌山: ${label} の大会名が読めない。1試合も出さない`);
      return [];
    }
    /*
      ---- 検算3: 一覧の年度と、紙の元号から出した年 ----
      ★**大会名は紙から・年は一覧から**取るので、食い違ったら**紙が別の年のもの**。
      新潟で「名前と中身が1年ずれる」を2度やっているので、ここは必ず見る。
    */
    const gengo = tournament.match(/(令和|平成)(元|\d+)年/);
    const printedYear = gengo
      ? (gengo[1] === "令和" ? 2018 : 1988) + (gengo[2] === "元" ? 1 : Number(gengo[2]))
      : null;
    if (printedYear !== null && printedYear !== link.year) {
      console.log(
        `  ⚠️ 和歌山: ${label} の紙は「${tournament}」（${printedYear}年）で一覧の年度と違う。1試合も出さない`,
      );
      return [];
    }

    /*
      ---- 検算2の材料: 紙に刷ってある勝ち上がり校 ----
      ★**読めなければ1試合も出さない。** 構造の検算（チーム数−試合数）だけでは
      「組めてしまうのに相手が違う」を止められない（石川で踏んだ轍）。
    */
    const printed = this.printedWinners(page);
    if (!printed) {
      console.log(`  ⚠️ 和歌山: ${tournament} に勝ち上がり校の記載が無い。検算できないので1試合も出さない`);
      return [];
    }
    const g = this.historyGeometry(page);
    if (!g) {
      console.log(`  ⚠️ 和歌山: ${tournament} のスロット番号の列が読めない。1試合も出さない`);
      return [];
    }
    let range;
    if (g.namesRight) {
      const moved = this.moveSlotColumn(page, g);
      if (!moved) {
        console.log(`  ⚠️ 和歌山: ${tournament} の校名の欄と得点の列を測れない。1試合も出さない`);
        return [];
      }
      page = moved.page;
      /*
        ★**スロット番号より左は丸ごと落とす。** B型の紙は左端に球場の凡例が
        縦書きで入っており、残すと**校名に「ス」「ポ」が混ざる**
        （実測で `ス市和歌山ポ`）。★**文字で消さない。列で外す。**
      */
      range = [moved.left, 1e6];
    }
    const oriented = orientPage(page, { slotAxis: "y", rowTolerance: 8, range });

    /*
      ★★**勝ち上がる数は紙によって違う**（春季・二次予選は1校、一次予選は4校）。
      **紙のどこにも書いていない**ので、1・2・4・8 を順に試し、
      **「チーム数 − 試合数 = その数」と「紙に刷ってある勝ち上がり校と一致」の
      両方を満たしたものだけ**を採る。**当て推量にはならない。**
    */
    for (const winners of [1, 2, 4, 8]) {
      const built = assembleSlotBracket(oriented, {
        // ★勝ち上がる数が1のときだけ決勝がある
        roundLabels: winners === 1 ? ["決勝", "準決勝", "準々決勝"] : [],
        flatFragments: true,
        hitSpan: true,
        nameOrder: "asc",
        // ★1回戦が1試合の紙がある（33チームの春季）。検算で担保している
        minFirstRound: 1,
        winners,
      });
      if (!built) continue;
      if (built.teams - built.games.length !== winners) continue;
      if (!sameSchoolText(built.champions.join(""), printed)) continue;
      return this.historyGames(built, { tournament, season, link, label });
    }
    const walkovers = raw.lines.filter((l) => /不戦勝/.test(l.text.replace(/\t/g, ""))).length;
    console.log(
      `  ⚠️ 和歌山: ${tournament} の組合せ表を組み立てられなかった` +
        (walkovers ? `（**不戦勝が ${walkovers} 件**。得点の無い枠は組み立てられない）` : "") +
        `（紙の勝ち上がり校「${printed}」）。1試合も出さない`,
    );
    return [];
  },

  /** 組み立て結果を試合の一覧にする。**日付の月が季節の窓から外れたら1試合も出さない** */
  historyGames(built, { tournament, season, link, label }) {
    const window = season === "spring" ? [3, 6] : [8, 11];
    const out = [];
    for (const g of built.games) {
      let date = null;
      if (g.date) {
        const [mm, dd] = g.date.split("/").map(Number);
        if (mm < window[0] || mm > window[1]) {
          console.log(
            `  ⚠️ 和歌山: ${tournament} に ${g.date} の試合がある（${season} は ${window[0]}〜${window[1]}月のはず）。1試合も出さない`,
          );
          return [];
        }
        date = `${link.year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
      }
      out.push({
        date,
        season,
        tournament,
        round: g.round,
        // ★球場は紙の1文字の記号のままなので出さない（凡例はまだ読んでいない）
        venue: null,
        teams: [
          { display: cleanWakayamaName(g.a), score: g.sa, won: g.sa > g.sb },
          { display: cleanWakayamaName(g.b), score: g.sb, won: g.sb > g.sa },
        ],
      });
    }
    console.log(
      `  （${tournament}: ${out.length} 試合 / ${built.teams} チーム / 勝ち上がり ${built.champions.map(cleanWakayamaName).join("・")}` +
        `${out.some((x) => x.date) ? "" : "・**日付なし**"}）[${label}]`,
    );
    return out;
  },

  /**
   * 大会名。**1行目、足りなければ2行目まで**（二次予選は `令和７年度 秋季…大会` と
   * `県二次予選組み合わせ表` の2行に割れている）。
   * ★**2行目を無条件につながないこと** —— 一次予選の2行目は校名である。
   */
  historyTitle(page) {
    const text = (l) => normalize(l.text.replace(/\t/g, "")).replace(/[\s　]/g, "");
    const first = page.lines[0] ? text(page.lines[0]) : "";
    const second = page.lines[1] ? text(page.lines[1]) : "";
    /*
      ★**1行目が `平成29年度` だけの紙がある**（二次予選）。
      ★**2行目を無条件につながないこと** —— 一次予選の2行目は校名である。
      **1行目に「予選」が無く、2行目にあるときだけ**つなぐ。
    */
    const title = (!/予選/.test(first) && /予選/.test(second) ? first + second : first)
      .replace(/(組み?合わ?せ表|全?結果)$/, "");
    return /大会|予選/.test(title) ? title : null;
  },

  /**
   * ★★**得点と「N回」が1つの断片に潰れているのを切り離す。**
   *
   * 2桁の得点は「N回」の N とほぼ接する（実測で 5 ポイント）ので、
   * pdf.js が `118`（11点・8回コールド）`1213`（12点・延長13回）と1つにする。
   * **1桁の得点は42ポイント空くので割れない。**
   *
   * ★**「回」がすぐ右（断片の右端から25ポイント以内・上下20ポイント以内）に
   * あるときだけ**先頭2文字に切る。得点の欄は2桁ぶんの幅しかない。
   * ★**「回」が無い断片には触らない**（3桁の得点はありえないが、当て推量はしない）。
   */
  splitMergedInnings(raw) {
    const marks = raw.lines.flatMap((l) =>
      l.items.filter((i) => i.text.trim() === "回").map((i) => ({ x: i.x, y: l.y })),
    );
    if (!marks.length) return raw;
    const lines = raw.lines.map((line) => {
      const items = line.items.map((it) => {
        const t = it.text.trim();
        if (!/^[0-9]{3,}$/.test(t) || !(it.width > 0)) return it;
        const end = it.x + it.width;
        if (!marks.some((m) => Math.abs(m.x - end) <= 25 && Math.abs(m.y - line.y) <= 20)) return it;
        return { ...it, width: (it.width / t.length) * 2, text: t.slice(0, 2) };
      });
      return { ...line, items, text: items.map((i) => i.text).join("\t") };
    });
    return { page: raw.page, lines };
  },

  /**
   * ★**スロット番号が丸数字と全角の混在で刷ってある紙**（秋季の県二次予選の `① ２ ③ ４ …`）。
   * ★**丸数字を無条件に直さないこと** —— 夏の紙では第何試合の印で、
   * 直すと**得点の帯に数字が紛れ込む。**
   * **1つの列に3個以上まとまっているときだけ**、その列に限って直す。
   */
  normalizeSlotMarks(raw) {
    const xs = raw.lines.flatMap((l) =>
      l.items.filter((i) => /^[①-⑳]$/.test(i.text.trim())).map((i) => i.x),
    );
    const cols = new Map();
    for (const x of xs) {
      const k = [...cols.keys()].find((v) => Math.abs(v - x) <= 5) ?? x;
      cols.set(k, (cols.get(k) ?? 0) + 1);
    }
    const best = [...cols].sort((a, b) => b[1] - a[1])[0];
    if (!best || best[1] < 3) return raw;
    const lines = raw.lines.map((line) => {
      const items = line.items.map((i) => {
        if (Math.abs(i.x - best[0]) > 10) return i;
        const t = i.text.trim();
        if (/^[①-⑳]$/.test(t)) return { ...i, text: String(t.charCodeAt(0) - 0x2460 + 1) };
        if (/^[０-９]{1,2}$/.test(t)) return { ...i, text: normalize(t) };
        return i;
      });
      return { ...line, items, text: items.map((i) => i.text).join("\t") };
    });
    return { page: raw.page, lines };
  },

  /**
   * ★★**紙の右端に刷ってある勝ち上がり校**（検算の柱）。
   * 得点の列より右にある字を**いちばん右の列だけ**上から読む。
   *
   * ★**いちばん右の列だけにするのは、B型の紙が回戦ごとに勝者を刷り直すから** ——
   * 全部の列を読むと準優勝校まで混ざる。
   * ★一次予選は**二次予選へ進む4校**がこの列に縦に並ぶので、
   * **4校ぶん・並び順まで**突き合わせられる。
   */
  printedWinners(raw) {
    const items = raw.lines.flatMap((l) => l.items.map((i) => ({ ...i, y: l.y })));
    const nums = items.filter((i) => /^\d{1,2}$/.test(i.text.trim()));
    if (!nums.length) return "";
    const maxScoreX = Math.max(...nums.map((i) => i.x + (i.width || 0)));
    const cand = items.filter(
      (i) => i.x > maxScoreX + 10 && isNameText(i.text) && !/^(回|有料)$/.test(i.text.trim()),
    );
    const cols = new Map();
    for (const i of cand) {
      const k = [...cols.keys()].find((v) => Math.abs(v - i.x) <= 5) ?? i.x;
      if (!cols.has(k)) cols.set(k, []);
      cols.get(k).push(i);
    }
    const last = [...cols].sort((a, b) => a[0] - b[0]).at(-1);
    return last ? last[1].sort((a, b) => b.y - a.y).map((i) => i.text.trim()).join("") : "";
  },

  /** スロット番号の列・得点の左端・校名がどちら側か。**紙から測る** */
  historyGeometry(raw) {
    const items = raw.lines.flatMap((l) => l.items.map((i) => ({ ...i, y: l.y })));
    const ints = items.filter((i) => /^\d{1,3}$/.test(i.text.trim()));
    const cols = new Map();
    for (const i of ints) {
      const k = [...cols.keys()].find((v) => Math.abs(v - i.x) <= 8) ?? i.x;
      if (!cols.has(k)) cols.set(k, []);
      cols.get(k).push(i);
    }
    let slot = null;
    for (const [x, list] of cols) {
      const ns = [...new Set(list.map((i) => Number(i.text)))].sort((a, b) => a - b);
      let run = 1;
      let cur = 1;
      for (let i = 1; i < ns.length; i++) {
        cur = ns[i] === ns[i - 1] + 1 ? cur + 1 : 1;
        run = Math.max(run, cur);
      }
      if (!slot || run > slot.run) slot = { x, run, list };
    }
    if (!slot || slot.run < 8) return null;
    const right = ints.filter((i) => i.x > slot.x + 20);
    if (!right.length) return null;
    const scoreX = Math.min(...right.map((i) => i.x));
    /*
      ★★**校名が左右どちらにあるかは「スロット番号と同じ高さの字」で決める。**
      ★**「左にどれだけ字があるか」では見分けられない** —— B型の紙の左端には
      球場の凡例が縦書きで入っており、字数だけならA型と変わらない。
    */
    let onLeft = 0;
    let onRight = 0;
    for (const s of slot.list) {
      for (const i of items) {
        if (!isNameText(i.text) || Math.abs(i.y - s.y) > 8) continue;
        if (i.x < s.x - 5) onLeft += 1;
        else if (i.x > s.x + 5 && i.x < scoreX - 5) onRight += 1;
      }
    }
    const ys = slot.list.map((i) => i.y);
    const pitch = (Math.max(...ys) - Math.min(...ys)) / Math.max(1, slot.run - 1);
    return {
      slot,
      scoreX,
      namesRight: onRight > onLeft,
      yLo: Math.min(...ys) - pitch,
      yHi: Math.max(...ys) + pitch,
    };
  },

  /**
   * ★**校名がスロット番号の右にある紙**（B型）は、
   * **スロット番号の列を校名と得点のあいだへ動かす**（兵庫と同じ）。
   * スロット軸は y なので、x を動かしても並び順は変わらない。
   */
  moveSlotColumn(raw, g) {
    const items = raw.lines.flatMap((l) => l.items.map((i) => ({ ...i, y: l.y })));
    const names = items.filter(
      (i) => i.x > g.slot.x + 5 && i.x < g.scoreX - 5 && i.y >= g.yLo && i.y <= g.yHi && isNameText(i.text),
    );
    if (!names.length) return null;
    /*
      ★★**校名の欄の右端は「密な列」で測る**（千葉と同じ考え方）。
      同じ帯には `８回コールド` `延長１１回` の注記も入っており、
      混ぜると**右端が得点の列を追い越して測れなくなる。**
      校名は1文字ずつ縦の列に並ぶので、**列ごとの個数**で見分けられる。
    */
    const cols = new Map();
    for (const i of names) {
      const k = [...cols.keys()].find((v) => Math.abs(v - i.x) <= 4) ?? i.x;
      if (!cols.has(k)) cols.set(k, []);
      cols.get(k).push(i);
    }
    const dense = [...cols.values()].filter((l) => l.length >= g.slot.run * 0.3).flat();
    if (!dense.length) return null;
    const nameEnd = Math.max(...dense.map((i) => i.x + (i.width || 0)));
    const newX = (nameEnd + g.scoreX) / 2;
    // ★得点の列から20ポイント以上離すこと（近いと1回戦の得点をスロット番号として拾う）
    if (newX - nameEnd < 10 || g.scoreX - newX < 25) return null;
    const lines = raw.lines.map((line) => {
      const its = line.items
        // ★校名を囲む括弧は落とす（`(田辺工業)` になってしまう）
        .filter((i) => !(/^[()（）]$/.test(i.text.trim()) && i.x > g.slot.x && i.x < g.scoreX))
        .map((i) =>
          Math.abs(i.x - g.slot.x) <= 8 && /^\d{1,3}$/.test(i.text.trim()) ? { ...i, x: newX } : i,
        );
      its.sort((a, b) => a.x - b.x);
      return { y: line.y, items: its, text: its.map((i) => i.text).join("\t") };
    });
    return { page: { page: raw.page, lines }, left: g.slot.x - 2 };
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
  /*
    ★★**2026-08-26 に過去年と秋季を足した。**

    それまでは新着一覧（トップ）だけを見ていたので**今年ぶんしか取れなかった。**
    `log.html`（過去大会記録）に**令和4年度からの3季ぶん**の紙が並んでいる。

    ★**見送っていた理由は「優勝校が取れない」だった。**
    トップの見出しには入っているが（`…結果【優勝：八幡商業高校】`）、
    **`log.html` の側は大会名だけ**で、紙の中の優勝校は球場の凡例の行に紛れる。

    ★★**それでも足したのは、この紙が「紙の中の別の場所から来る数字」を持っているから。**
    下端の注記に **`出場チーム：４７チーム`** と刷ってあり、
    `verify.teams` で突き合わせている。**スロットを1つ読み落とすと必ず落ちる**ので、
    「チーム数−試合数=1」だけの県（三重・広島）より検知力は高い。
    ★**優勝校が取れる年（今年）は今までどおりそれも見る。**
  */
  seasons: {
    spring: "http://www.biwa.ne.jp/~shigafed/",
    summer: "http://www.biwa.ne.jp/~shigafed/",
    autumn: "http://www.biwa.ne.jp/~shigafed/",
  },
  /** 季節ごとの、見出しの見分け方 */
  matcher: {
    summer: /第\d+回全国高等学校野球選手権滋賀大会|全国高校野球選手権記念滋賀大会/,
    spring: /春季近畿地区高等学校野球滋賀県大会|春季近畿地区高等学校硬式野球大会/,
    autumn: /秋季近畿地区高等学校野球滋賀県大会/,
  },
  indexCache: new Map(),
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
    const found = new Map();
    for (const l of page.lines) {
      for (const it of l.items) {
        /*
          ★**中の空白と、末尾の閉じ括弧に気をつける。**
          夏は `合：① 安曇川・湖南農業・…・長浜農業`、
          春は `合：① 安曇川・ 湖南農業・…・長浜農業）` と**書き方が揃っていない**
          （春は「安曇川・」の後ろに空白があり、末尾に `）` が付く）。
          空白を落として括弧を外してから、`・` でつながっているものだけを採る。
        */
        /*
          ★★**丸数字とコロンの順番が年で逆になる**（2026-09-02。令和5年度）。

            令和6年度 … `合：① 湖南農業・甲南・信楽・愛知・長浜農業` `② 高島・安曇川）`
            令和5年度 … `出場チーム：４９チーム（連合①：信楽･愛知・長浜農業・長浜北星`
                         `連合②：湖南農業・甲南）`

          ★**「丸数字のあとにコロンが来ない」と決めていたので、令和5年度は
          1件も読めず「連合チームの内訳が紙から読めない」で春が丸ごと落ちていた。**
          ★**丸数字のうしろのコロンは、あってもなくてもよい**ことにする。
        */
        const m = it.text.trim().match(/([①-⑳])\s*[：:]?\s*([^：:]+)$/);
        if (!m) continue;
        /*
          ★**中黒は全角とは限らない**（令和5年度は `信楽･愛知` と**半角の `･`** が混ざる）。
          ★**寄せておかないと、画面に出る校名の区切りが1件だけ半角になる。**
        */
        const names = m[2].replace(/[）)]\s*$/, "").replace(/\s+/g, "").replace(/[･·・]/g, "・");
        if (/・/.test(names)) found.set(m[1], names);
      }
    }
    /*
      ★**1つだけのときはスロットの校名も「連合」**（丸数字が付かない）。
      ★★**2つ以上あるときは「連合①」「連合②」と書き分けられている**
      （2026-08-26 に過去年で確かめた。実際に紙の縦書きが `連合①` `連合②`）。
      **どちらを当てるかは丸数字で決まるので、推測にはならない。**
      ★**丸数字が見つからない形が出てきたら、展開せずに空を返すこと** ——
      黙って最後のものを当てると**別のチームの内訳が画面に出る。**
      展開しなければ「連合」のまま残り、`readSheet` の検算で
      **1試合も出さずに止まる**（気づける壊れ方にする）。
    */
    if (found.size === 1) return new Map([["連合", [...found.values()][0]]]);
    return new Map([...found].map(([mark, names]) => [`連合${mark}`, names]));
  },
  async collect({ fetchHtml, season, url, year }) {
    const re = this.matcher[season];
    if (!re) return [];
    /*
      ★**新着（トップ）と「過去大会記録」の両方を見る。**
      トップは今年ぶん（見出しに優勝校が入る）、`log.html` は令和4年度からの過去年。
      3季とも同じ2ページなので取得は1回で済ませる（`indexCache`）。
    */
    const pages = [url, "http://www.biwa.ne.jp/~shigafed/log.html"];
    for (const p of pages) {
      if (!this.indexCache.has(p)) this.indexCache.set(p, await fetchHtml(p));
    }

    /*
      ★**優勝校は見出しに入っていることがある**（「…滋賀大会 結果【優勝：八幡商業高校】」）。
      **枝とは別の場所から来る事実**なので、あれば検算に使う。
      ★**`log.html` の見出しには入っていない**ので、**無くても拾う**
      （そのときは紙の中の「出場チーム数」で検算する。上の説明を読むこと）。
      ★**「抽選結果」は結果ではない**ので外す。
    */
    const links = [];
    for (const page of pages) {
      const html = this.indexCache.get(page);
      if (!html) continue;
      for (const m of html.matchAll(/<a[^>]+href=["']([^"']+\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const label = normalize(plain(m[2]));
        const href = new URL(m[1], page).toString();
        // ★軟式を外す。見出しとURLの両方で見る
        if (/軟式/.test(label) || /nan+shiki/i.test(href)) continue;
        if (/抽選/.test(label)) continue;
        if (!re.test(label)) continue;
        if (links.some((l) => l.href === href)) continue;
        const champion = label.match(/優勝[：:]\s*([^】\s]+?)(?:高等学校|高校)?\s*[】]/)?.[1] ?? null;
        links.push({ href, label, champion });
      }
    }

    if (!links.length) {
      console.log(`  ⚠️ 滋賀: ${season} の結果PDFへのリンクが見つからない`);
      return [];
    }

    /*
      ★**紙は全部は開かない。** 見出しの年度で目当ての年に絞る。
      ★**見出しから年が出せないものは開いて確かめる**（紙の大会名で弾く）。
    */
    const yearOfLabel = (label) => {
      const g = label.match(/令和(元|\d+)年度/);
      if (g) return 2018 + (g[1] === "元" ? 1 : Number(g[1]));
      const n = label.match(/第(\d+)回全国高(?:等学)?校野球選手権/);
      return n ? Number(n[1]) + 1918 : null;
    };
    const wanted = links.filter((l) => (yearOfLabel(l.label) ?? year) === year);
    if (!wanted.length) return [];

    for (const link of wanted.slice(0, 3)) {
      const parsed = await fetchPdfPages(link.href, { headers: UA });
      await sleep(this.politenessMs);
      if (!parsed?.length) {
        console.log(`  ⚠️ 滋賀: 「${link.label}」のPDFが読めない`);
        continue;
      }
      for (const raw of parsed) {
        const games = this.readSheet(raw, season, link.champion, year);
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
  readSheet(raw, season, champion, year) {
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
      .map((t) =>
        t.match(
          /第\d+回全国高(?:等学)?校野球選手権(?:記念)?滋賀大会|令和(?:元|\d+)年度(?:春|秋)季近畿地区高等学校(?:野球滋賀県|硬式野球)大会/,
        )?.[0],
      )
      .find(Boolean);
    if (!tournament) return null;
    /*
      ★★**紙の大会名から年を出して、取りに行った年と突き合わせる**（2026-08-26）。
      過去年を `log.html` から拾うようになったので、
      **別の年の紙を掴んでいないか**をここで止める（新潟で踏んだ轍の歯止め）。
      ★**春季・秋季は `令和N年度`、夏は `第N回…選手権`（+1918）。**
    */
    const g = tournament.match(/令和(元|\d+)年度/);
    const n = tournament.match(/第(\d+)回/);
    const sheetYear = g ? 2018 + (g[1] === "元" ? 1 : Number(g[1])) : n ? Number(n[1]) + 1918 : null;
    if (sheetYear === null) {
      console.log(`  ⚠️ 滋賀: 大会名「${tournament}」から年が出せない。1試合も出さない`);
      return [];
    }
    if (year !== undefined && sheetYear !== year) return null;
    // ★**季節も紙の名前で確かめる**（見出しと中身が食い違う紙を掴まない）
    const sheetSeason = /選手権/.test(tournament) ? "summer" : /春季/.test(tournament) ? "spring" : "autumn";
    if (sheetSeason !== season) return null;

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
      「構造は合うのに決勝の相手が違う」を止められる。
      見出しは「八幡商業高校」、表は「八幡商」なので**前方一致で見る**
      （点数と違い、校名は書き方が揃わない）。

      ★★**過去年（`log.html`）の見出しには優勝校が入っていない**（2026-08-26）。
      **無ければこの検算は飛ばす**が、**飛ばしたことは必ず知らせる** ——
      検算が1つ減ったことに気づけないと、次に壊れたときの原因が分からなくなる
      （上の「出場チーム数」と同じ扱い）。
    */
    if (!champion) {
      console.log(`  （${tournament}: 見出しに優勝校が無いので、優勝校の検算は未実施）`);
    } else {
      const built0 = normalizeSchoolName(built.champion ?? "");
      if (!built0 || !normalizeSchoolName(champion).startsWith(built0)) {
        console.log(
          `  ⚠️ 滋賀: 組み立てた優勝校が見出しと合わない（見出し「${champion}」/ 組み立て「${built.champion}」）。1試合も出さない`,
        );
        return [];
      }
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
  /*
    ★★**春・夏・秋の3季**（2026-08-31 その5）。入口は年度の索引。
    ★**2026年度だけスコアシートが無くPDF**なので、そこは `pdfUrl`（トップページ）から取る。
  */
  seasons: {
    spring: "http://www.hyogo-koyaren.or.jp/taikai/index.php",
    summer: "http://www.hyogo-koyaren.or.jp/taikai/index.php",
    autumn: "http://www.hyogo-koyaren.or.jp/taikai/index.php",
  },
  pdfUrl: "http://www.hyogo-koyaren.or.jp/index.php",
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
  async collect({ fetchHtml, season, url, year }) {
    /*
      ★**まずスコアシート**（2017〜2025年度）。無ければ夏だけPDF（2026年度）に落とす。
      ★**両方に同じ大会が入ることはない**（スコアシートのある年にPDFは無い）。
    */
    const fromSheets = await this.collectScoresheets({ fetchHtml, season, year, url });
    if (fromSheets.length) return fromSheets;
    if (season !== "summer") return [];
    return await this.collectPdf({ fetchHtml, season });
  },
  /**
   * ★★★**2017〜2025年度は「会場ごとのスコアシート（.xls）」から取る**
   * （2026-08-31 その5。運営者から `taikai/index.php` を教わった）。
   *
   *   `taikai/index.php` … 2004〜2026年度の索引
   *     → `taikai/koushiki/<年>/…index.php` … その年度の大会一覧
   *       → `haru<年>.php`（春季県大会）/ `<回>hyogo.php`（夏）/ `aki<年>.php`（秋季）
   *         → `homepagedata(R7)/scoresheets/*.xls`
   *
   * ★★**組合せ表はGIF画像**（`kenR7akiA.gif`）で**文字が1つも入っていない。**
   *   ★**スコアシートだけで足りる**ので、GIFは見ない。
   * ★★**`.xls` は旧形式（OLE2）。** `xlsx-rows.mjs` が SheetJS で読む
   *   （2026-08-31 その5 に足した。運営者の承認）。
   * ★**2026年度だけスコアシートが無くPDF**なので、そこは今までどおり `collectPdf`。
   * ★**2016年度以前は地区大会（支部予選）の `.xls` しか無い。**
   *
   * ★**地区大会（`district`）と軟式（`N` で始まる／`nanshiki`）は必ず外す。**
   */
  SEASON_PAGE: { spring: "haru", summer: "hyogo", autumn: "aki" },
  async collectScoresheets({ fetchHtml, season, year, url }) {
    const idx = await fetchHtml(url);
    if (!idx) return [];
    const yearUrl = [...idx.matchAll(new RegExp('<a[^>]+href="([^"]*koushiki/([0-9]{4})/[^"]*)"', "gi"))]
      .filter((m) => Number(m[2]) === year)
      .map((m) => new URL(m[1], url).toString())[0];
    if (!yearUrl) return [];
    const page = await fetchHtml(yearUrl);
    await sleep(this.politenessMs);
    if (!page) return [];

    const word = this.SEASON_PAGE[season];
    const pages = [
      ...new Set(
        [...page.matchAll(new RegExp('<a[^>]+href="([^"]+\.php)"', "gi"))]
          .map((m) => new URL(m[1], yearUrl).toString())
          .filter((u) => {
            const file = decodeURIComponent(u.split("/").pop() ?? "").toLowerCase();
            if (!file.includes(word)) return false;
            // ★近畿大会・軟式・地区大会・選抜・神宮は県大会ではない
            return !/kinki|nanshiki|district|sembatsu|meiji|index/.test(file);
          }),
      ),
    ];
    if (!pages.length) return [];

    /** スコアシートのURL。**同じファイルが複数のページから張られている**ので重複を外す */
    const files = new Set();
    for (const p of pages) {
      const html = await fetchHtml(p);
      await sleep(this.politenessMs);
      if (!html) continue;
      for (const m of html.matchAll(new RegExp('href="([^"]+\.xlsx?)"', "gi"))) {
        const u = new URL(m[1], p).toString();
        const file = decodeURIComponent(u.split("/").pop() ?? "");
        if (/district|nanshiki/i.test(u) || new RegExp("^N", "i").test(file)) continue;
        files.add(u);
      }
    }
    if (!files.size) return [];

    const games = [];
    for (const file of files) {
      const sheets = await fetchXlsxSheets(file, { headers: UA });
      await sleep(this.politenessMs);
      if (!sheets) {
        console.log(`  ⚠️ 兵庫: ${file.split("/").pop()} が開けない`);
        continue;
      }
      for (const sheet of sheets) games.push(...this.readScoresheet(sheet, season, year));
    }

    /*
      ★★★**回戦の札が合わない大会は1試合も出さない**（2026-08-31 その5。新潟と同じ構え）。
      **回戦はセルに割れていて空白も入る**ので、読めなかった枠が出ると
      **決勝が0試合・準決勝が3試合**のような形になる。
      ★**回戦は画面に事実として出る。数が合わないなら札のどれかが嘘。**
      ★**落ちた大会は名前を出す**（次に触る人が紙を見に行けるように）。
    */
    const byName = new Map();
    for (const g of games) {
      if (!byName.has(g.tournament)) byName.set(g.tournament, []);
      byName.get(g.tournament).push(g);
    }
    const sane = [];
    for (const [name, gs] of byName) {
      const f = gs.filter((g) => g.round === "決勝").length;
      const sf = gs.filter((g) => g.round === "準決勝").length;
      if (f === 1 && sf === 2) {
        sane.push(...gs);
        continue;
      }
      console.log(
        `  ⚠️ 兵庫: ${name} は 決勝${f}試合・準決勝${sf}試合（1・2 のはず）。回戦の札が合わないので1試合も出さない`,
      );
    }
    return sane;
  },
  /**
   * ★**1シート＝1会場1日。** 紙の形は3季とも同じ。
   *
   *     令和 7|年度 秋季兵庫県高校野球大会|…|第|1|日|2025|年|9|月|13|日 (|土|)
   *     場  所　｛||尼崎記念公園野球場（ベイコム野球場）|…|｝
   *     |1|回戦||第１試合||開 始||9:53|…
   *     学校名||一|二|…|十五|合計
   *     市立西宮||0|2|0|0|0|0|0|0|0|…|2
   *     兵庫工業||0|0|0|0|2|0|0|1|x|…|3
   *
   * ★★**「学校名」の行は2種類ある** —— イニングの表（`合計` がある）と
   *   投手・捕手の表（`投　手` がある）。**`合計` があるほうだけ**を見ること。
   * ★**合計の列は見出しから取る。** 延長のときは十五の欄に「延長14回 ﾀｲﾌﾞﾚｰｸ」と
   *   書かれることがあり、**位置を決め打ちすると拾えない。**
   * ★**大会名も日付も紙の1行目にある**（西暦つき）。**推測しない。**
   */
  readScoresheet(sheet, season, year) {
    const rows = sheet.rows.map((r) => r.map((c) => normalize(c)));
    const head = rows[0]?.join("") ?? "";
    const d = head.match(new RegExp("([0-9]{4})年([0-9]{1,2})月([0-9]{1,2})日"));
    if (!d) return [];
    // ★**紙の年が取りに行った年と違えば1試合も出さない**（索引と中身は別の場所から来る）
    if (Number(d[1]) !== year) return [];
    const date = `${d[1]}-${d[2].padStart(2, "0")}-${d[3].padStart(2, "0")}`;
    /*
      ★★★**大会名は「第」のセルの手前まで**（2026-08-31 その5）。

          第107回全国高等学校野球選手権 兵庫大会|||||||第|2|日|2025|年|7|月|6|日
                                                     ↑ ここで切る

      ★**`第[0-9]+日` で切ると落ちる** —— **日にちが別のセル**なので、
      つないだ文字列は `…兵庫大会第日2025年…`（数字が無い）になり、
      **大会名に日付がくっついたまま出る**（実際に6大会がそうなった）。
      ★★**空白は「セルの中の飾り」なので必ず落とす** ——
      元号の数字がセルに分かれており、`平成 2 9年度` のような名前になる。
      ★**同じ大会に2つの書き方がある**（`全国高校野球選手権` と
      `全国高等学校野球選手権`）。**片方に寄せないと1つの大会が2つに割れる。**
    */
    const cut = rows[0].findIndex((c, k) => k > 0 && c === "第");
    const tournament = (cut > 0 ? rows[0].slice(0, cut) : [head.split(String(d[1]) + "年")[0]])
      .join("")
      .split(" ")
      .join("")
      .split("　")
      .join("")
      .split("全国高校野球選手権")
      .join("全国高等学校野球選手権");
    if (!tournament) return [];

    let venue = null;
    let round = null;
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const line = rows[i].join("");
      const place = line.match(new RegExp("場[\s　]*所[\s　]*[｛{]([^｝}]+)[｝}]"));
      if (place) {
        venue = place[1].replace(new RegExp("[\s　]", "g"), "") || null;
        continue;
      }
      /*
        ★★**回戦もセルに割れていて空白が入る**（2026-08-31 その5）。

            |準々決|勝戦||第１試合…    → 準々決勝戦
            |準決|勝戦||第１試合…      → 準決勝戦
            |決 勝|戦||第１試合…       → **決 勝戦**（空白が残る）

        ★**空白を落とさないと決勝だけ回戦が付かない**（実測で12大会が「決勝0試合」）。
      */
      const r = pickRound(line.split(" ").join("").split("　").join(""));
      if (r && !rows[i].includes("学校名")) round = r;
      if (!rows[i].includes("学校名")) continue;
      const totalAt = rows[i].indexOf("合計");
      // ★**投手・捕手の表には「合計」が無い。** そちらは読まない
      if (totalAt < 0) continue;
      const a = rows[i + 1] ?? [];
      const b = rows[i + 2] ?? [];
      const num = (v) => (new RegExp("^[0-9]+$").test(v ?? "") ? Number(v) : null);
      const sa = num(a[totalAt]);
      const sb = num(b[totalAt]);
      if (!a[0] || !b[0] || sa === null || sb === null) continue;
      out.push({
        date,
        season,
        tournament,
        round,
        venue,
        teams: [
          { display: a[0], score: sa, won: sa > sb },
          { display: b[0], score: sb, won: sb > sa },
        ],
      });
      i += 2;
    }
    return out;
  },
  async collectPdf({ fetchHtml, season }) {
    const url = this.pdfUrl;
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
    /*
      ★★**春季・秋季も回数から辿れる**（2026-08-24 追加。夏2014・春秋2013 まで遡れる）。
      **春季・秋季の回数は 年 − 1947**（夏の 年 − 1918 とは別系列）。

        春季 県大会 `${n}sp-p.html` ／ 春季 地区予選 `${n}sp-a.html` ／ 秋季 `${n}au.html`

      ★★**今年のぶんだけ回数の無い固定名でも置かれている**（`spring-pref.html`）。
      ★**過去年のときに固定名を候補に残さないこと** —— 回数形が404だったときに
      **今年の紙を過去年として読んでしまう**（新潟でデータを壊したのと同じ形。
      しかも栃木の大会名からは年が導けないので、あの歯止めが効かない）。
    */
    const n = year - 1947;
    const isCurrent = year >= new Date().getFullYear();
    if (season === "spring") {
      return isCurrent
        ? ["spring-pref.html", "spring-area.html"]
        : [`${n}sp-p.html`, `${n}sp-a.html`];
    }
    return isCurrent ? ["autumn-pref.html"] : [`${n}au.html`];
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
        ★★★**「ノーゲーム」と書いてある試合は出さない**（2026-08-30 その2）。

          矢 板 | 0 | 0 | 0 | 0 | 雷雨のためノーゲーム | 0
          鹿 沼 | ３ | 0 | 0 | １ | 0
          備考  16:49 雷雨ノーゲーム

        **成立しなかった試合**なので、翌日に改めて行われる（この試合は翌日 鹿沼 7-0 矢板）。
        ★**そのまま読むと `矢板 0-0 鹿沼` という幻の引き分けになる** ——
        **出典が「0」と刷っている**ので、空欄を見るだけでは止められない。
        ★**出典自身が「ノーゲーム」と書いているのだから、それを読む。推測ではない。**
        ★甲子園の記事でも**ノーゲームは試合として出さない**と決めてある（AGENTS.md）。
      */
      if (/ノーゲーム/.test(normalize(plain(block)))) continue;
      /*
        ★**イニングスコアの表は `div.board` の中。**
        1行目は見出し（校名 1 2 3 … 計）なので、**`<th>` を持つ行のうち
        2行目・3行目**が両校。
      */
      const board = block.match(/<div class="board">([\s\S]*?)<\/div>/)?.[1] ?? "";
      const rows = [...board.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((r) => r[1]);
      const nameOf = (row) =>
        normalize(plain(row.match(/<th[^>]*>([\s\S]*?)<\/th>/)?.[1] ?? "")).replace(/\s+/g, "");
      /*
        ★★**`&#160;` を空白に直してからセルを読む**（2026-08-30 その2）。
        `plain()` が直すのは `&nbsp;` だけなので、**数実体のほうはそのまま残り**、
        `5&#160;` が数として読めずに合計が落ちる（2026年春の紙がこの書き方）。
      */
      const cellsOf = (row) =>
        [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((t) =>
          normalize(plain(t[1]).replace(/&#(?:160|xa0);/gi, " ")).replace(/\s+/g, ""),
        );
      /*
        ★★★**合計は「計」の列。見出し行から位置を取る**（2026-08-30 その2）。
        それまでは**行のいちばん最後の `<td>`** を合計としていたが、
        **末尾に空のセルが1つ余る紙がある**（2026年春）。
        **`Number("")` は NaN ではなく `0`** なので `Number.isFinite` では止まらず、
        **`宇都宮南 0-0 國學院栃木`（本当は 5-8）という幻の引き分け**になっていた。
      */
      const header = rows.find((r) => nameOf(r) === "校名");
      const totalAt = header ? cellsOf(header).findIndex((c) => c === "計") : -1;
      const teams = [];
      for (const row of rows) {
        const name = nameOf(row);
        if (!name || name === "校名") continue;
        /*
          ★★**出典のひな形の行がある**（2026-08-30 その2）。
          校名が `●●`、イニングが全部 0、合計も 0 という行が紙面に残っており、
          **`●● 0-0 ●●` という実在しない試合が2件、画面に出ていた。**
          ★**記号だけの校名は学校ではない。無条件に出さない。**
          ★**片方を落とせば「校名2つが揃わない」で試合ごと落ちる**（下の `teams.length !== 2`）。
        */
        if (/^[●○◯■□◆◇▲△▼▽★☆※〇〓・]+$/.test(name)) continue;
        const tds = cellsOf(row);
        /*
          ★**コールドの注記が `rowspan="2" colspan="8"` のセルとして割り込む**ので、
          **その行だけ見出しより短くなる**（`3 0 0 0 0 1 0 4 8回コールド 8`）。
          そのときは今までどおり**行のいちばん最後**を合計とする。
        */
        const at = totalAt >= 0 && totalAt < tds.length ? totalAt : tds.length - 1;
        /*
          ★★★**「計」の欄が空なら、その1つ手前を見る**（末尾に空セルが余る紙）。
          ★**そこも空なら合計が読めない** ——
          **中断した試合**（`足利 0 | | | … |`）がこれで、
          翌日に改めて行われる。**空欄を 0 と読むと幻の引き分けになる。**
          ★**0対0の引き分けそのものは実在する**ので、**「空かどうか」で見ること。**
        */
        const cell = tds[at] !== "" && tds[at] !== undefined ? tds[at] : (tds[at - 1] ?? "");
        const total = cell === "" ? NaN : Number(cell);
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
    /*
      ★★**過去年は「過去の大会結果と記録」から取る**（下の `collectArchive`）。
      ★**今年は速報の一覧のまま**（大会中はそちらのほうが早く出る）。
      ★**前年までは速報へ落ちる** —— 秋は「今年が空なら前年」を見に行く道があり、
      そこで前年を渡されたときに**速報にある大会を取り逃がさない**ため。
      ★★**それより前の年は速報を開かない。** 速報の一覧には**380ページの
      「大分県高校野球史」**が混ざっており、当たらないと分かっている紙を
      年ごとに8枚ずつ取りに行くことになる。**出典に優しくする。**
    */
    const now = new Date().getFullYear();
    if (year !== now) {
      const past = await this.collectArchive(fetchHtml, season, year);
      if (past.length || year < now - 1) return past;
    }
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
  /**
   * ★★**組み合わせ（まだ行われていない試合）**（2026-08-22。運営者の指示）。
   *
   * 速報の一覧に `第150回大分県高等学校野球選手権記念大会 組合せ` が
   * **結果より先に**上がる。★**結果の紙とは別のPDF**で、表題が `組合せ` で終わる。
   *
   * ------------------------------------------------------------------
   * ★ 紙の形（8チームのやぐら表・1枚）
   *
   *   スロット 1〜8 が横に並び（y≒215）、**その下に校名が縦書き**、
   *   さらに下に**支部の行**（`推薦` `大分` `県南豊肥` …）。
   *   回戦は上へ 1回戦（y≒380）→ 準決勝（y≒492）→ 決勝（y≒573）で、
   *   **各試合の上に日付・会場・第何試合が刷ってある。**
   *
   * ★**出すのは1回戦だけ。** 準決勝・決勝は**誰が上がるか決まっていない**ので、
   * 枠だけ作っても対戦相手を書けない。**推測で埋めない**（甲子園の準々決勝以降と同じ）。
   *
   * ------------------------------------------------------------------
   * ★ 検算（合わなければ**1試合も出さない**）
   *
   *   - スロットが 1〜8 で欠けずに並ぶ
   *   - 校名が8つ読める（**支部の行を字の大きさで落としてから**。春と同じ）
   *   - ★★**速報ページの本文に書かれている代表校と、8校が過不足なく一致**
   *     （`○県北・久大支部（2校）…柳ヶ浦高校、宇佐高校` …）。
   *     **枝とは別の場所から来る事実**なので、いちばん強い検算になる
   */
  async collectUpcoming({ fetchHtml }) {
    const html = await fetchHtml(this.seasons.autumn);
    if (!html) return [];
    const numbers = [...new Set([...html.matchAll(/img\/pdf_(\d+)\.pdf/gi)].map((m) => Number(m[1])))]
      .sort((a, b) => b - a);
    const text = normalize(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");

    for (const n of numbers.slice(0, this.maxSheets)) {
      const parsed = await this.pdf(n);
      if (!parsed?.length) continue;
      const raw = parsed[0];
      const flat = raw.lines.map((l) => normalize(l.text.replace(/\t/g, "")).replace(/\s+/g, ""));
      const title = flat.find((t) => /^第\d+回大分県高等学校野球選手権(記念)?大会組合せ$/.test(t));
      if (!title || flat.some((t) => /軟式/.test(t))) continue;
      const games = this.readDrawSheet(raw, flat, title.replace(/組合せ$/, ""), text);
      if (games) return games;
    }
    return [];
  },
  /**
   * ★**速報ページ本文から、その回の代表校を取る**（検算材料）。
   *
   *   ※第150回県大会の代表校決定！！
   *   ○県北・久大支部（２校）・・・柳ヶ浦高校、宇佐高校 ○別杵支部（１校）・・・明豊高校 …
   *
   * ★★**回数で場所を決めること。** 速報ページには**第149回の同じ並びも載っている**ので、
   * 「`・・・` の後ろ」を拾うだけだと**前の大会の代表校と混ざる**（実際に混ざった）。
   * ★**`○` から次の `○` までに区切る。** ページ全体に `・・・` は何度も出てくる。
   */
  representativesFrom(text, round) {
    const at = text.indexOf(`第${round}回県大会の代表校決定`);
    if (at < 0) return [];
    // 次の見出し（更新日）までを見る。無ければ十分な長さで打ち切る
    const rest = text.slice(at, at + 600);
    const stop = rest.search(/更新日/);
    return [...(stop > 0 ? rest.slice(0, stop) : rest).matchAll(/○[^○]*?[・･]{2,}\s*([^○]+)/g)]
      .flatMap((m) => m[1].split(/[、,]/))
      /*
        ★**空白のところで切る。** 一覧の最後（`○推薦出場…・・・大分商業高校`）の
        後ろには**次のお知らせの本文がそのまま続く**（`更新日` はさらに後ろなので
        区切りにならない）。**日本の校名に空白は入らない**ので、
        先頭の空白でないところまでを校名とする。
      */
      .map((s) => s.trim().match(/^[^\s&]+/)?.[0] ?? "")
      .map((s) => s.replace(/高等学校|高校/g, "").trim())
      .filter(Boolean);
  },
  /** 組合せの紙を1枚読む。**読めなければ null**（呼び出し側は次のPDFへ） */
  readDrawSheet(raw, flat, tournament, text) {
    const listed = this.representativesFrom(text, Number(tournament.match(/第(\d+)回/)?.[1]));
    // ---- 年と季節（春も秋も表題が同じなので、期間の月で決める。結果の紙と同じ） ----
    const days = new Map();
    let year = null;
    for (const t of flat) {
      const era = t.match(/令和(\d+)年/);
      if (era) year ??= 2018 + Number(era[1]);
      for (const m of t.matchAll(/(\d{1,2})月(\d{1,2})日/g)) days.set(Number(m[2]), Number(m[1]));
    }
    if (!year || !days.size) return null;
    const months = [...new Set([...days.values()])];
    const season = months.every((m) => m >= 3 && m <= 6)
      ? "spring"
      : months.every((m) => m >= 8 && m <= 11)
        ? "autumn"
        : null;
    if (!season) return null;

    // ---- スロットの行（1〜N が横に並ぶ） ----
    const slotLine = raw.lines
      .map((l) => ({
        line: l,
        ns: l.items
          .map((i) => ({ x: i.x, v: Number(normalize(i.text.trim())) }))
          .filter((i) => Number.isInteger(i.v) && i.v > 0),
      }))
      .filter((r) => r.ns.length >= 4 && r.ns.every((n, i) => n.v === i + 1))
      .sort((a, b) => b.ns.length - a.ns.length)[0];
    if (!slotLine) return null;
    const slots = slotLine.ns;

    /*
      ★★**校名は縦書き。支部の行を字の大きさで落とす**（結果の紙と同じ）。
      **行の隙間では切れない**（校名は縦に引き伸ばして組まれている）。
      **スロット行のすぐ下の行の幅**を「校名の大きさ」として、そこから離れた行を落とす。
    */
    const below = raw.lines.filter((l) => l.y < slotLine.line.y).sort((a, b) => b.y - a.y);
    const widthOf = (l) => {
      const ws = l.items.map((i) => i.width ?? 0).filter((w) => w > 0).sort((a, b) => a - b);
      return ws.length ? ws[Math.floor(ws.length / 2)] : 0;
    };
    const nameWidth = widthOf(below[0] ?? { items: [] });
    if (!nameWidth) return null;
    const nameLines = below.filter((l) => Math.abs(widthOf(l) - nameWidth) <= nameWidth * 0.2);

    /** スロットの x に近い文字を上から縦に読む */
    const half = slots.length > 1 ? Math.abs(slots[1].x - slots[0].x) / 2 : 20;
    const names = slots.map((s) =>
      nameLines
        .flatMap((l) => l.items.filter((i) => Math.abs(i.x - s.x) < half).map((i) => i.text.trim()))
        .join("")
        .replace(/\s+/g, ""),
    );
    if (names.some((n) => !n)) return null;

    /*
      ---- ★★検算: 速報ページ本文の代表校と過不足なく一致 ----
      **枝とは別の場所から来る事実。** 1つでも違えば1試合も出さない。
    */
    if (listed.length) {
      const a = [...names].sort();
      const b = [...listed].sort();
      const same = a.length === b.length && a.every((n, i) => n === b[i]);
      if (!same) {
        console.log(
          `  ⚠️ 大分(組合せ): 紙の8校と速報ページの代表校が合わない` +
            `（紙「${a.join("・")}」/ 本文「${b.join("・")}」）。1試合も出さない`,
        );
        return [];
      }
    } else {
      console.log("  ⚠️ 大分(組合せ): 速報ページに代表校の記載が無く未検算");
    }

    /*
      ---- 1回戦の対戦カード ----
      ★**隣どうしのスロットが1試合。** 日付・会場は各試合の上に刷ってある
      （スロットの中点にいちばん近いものを取る）。
    */
    const labelLines = raw.lines.filter((l) => l.y > slotLine.line.y);
    const nearest = (mid, re) => {
      const hits = labelLines.flatMap((l) =>
        l.items.filter((i) => re.test(normalize(i.text.trim()))).map((i) => ({ x: i.x, t: normalize(i.text.trim()) })),
      );
      if (!hits.length) return null;
      return hits.reduce((p, c) => (Math.abs(c.x - mid) < Math.abs(p.x - mid) ? c : p)).t;
    };
    const games = [];
    for (let i = 0; i + 1 < slots.length; i += 2) {
      const mid = (slots[i].x + slots[i + 1].x) / 2;
      const md = nearest(mid, /^\d{1,2}\/\d{1,2}$/);
      games.push({
        date: md ? `${year}-${md.split("/")[0].padStart(2, "0")}-${md.split("/")[1].padStart(2, "0")}` : null,
        season,
        tournament,
        round: "1回戦",
        venue: nearest(mid, /^[^\d\s]{2,10}$/),
        teams: [{ display: names[i] }, { display: names[i + 1] }],
      });
    }
    console.log(`  （${tournament}: 組み合わせ ${games.length} 試合 / 代表8校は速報ページと一致）`);
    return games;
  },
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
    /*
      ★★**元号は令和だけではない**（2026-09-01。過去年の紙は平成）。
      ★★**「日」だけの書き方がある**（`平成24年5月19日(土)・20日(日)`）。
      **直前に出た月を引き継ぐ** —— 引き継がないとその日が `days` に入らず、
      **日付の行が数字のまま残って1回戦の帯として通ってしまう。**
    */
    let lastMonth = null;
    raw.lines.forEach((l, i) => {
      if (l.y <= headTop) return;
      const era = flat[i].match(/(平成|令和)(\d+)年/);
      if (era) year ??= (era[1] === "令和" ? 2018 : 1988) + Number(era[2]);
      for (const m of flat[i].matchAll(/(?:(\d{1,2})月)?(\d{1,2})日/g)) {
        if (m[1]) lastMonth = Number(m[1]);
        if (lastMonth) days.set(Number(m[2]), lastMonth);
      }
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
        /*
          ★★**1試合の2つの得点が1つの断片に潰れ、しかも半角と全角が混ざる紙がある**
          （2026-09-01。2012年春の `11 ５`）。代表的な文字幅では 2 つの位置が
          0.84 スロット離れ、中点が境目から 0.50 ずれて**1回戦の帯ごと捨てられる。**
          ★**実測の幅から字送りを出す。** 速報の紙（2026年）は再生成して
          **1試合も変わらないことを確かめてある。**
        */
        fragmentWidth: true,
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

  /* ================================================================
     ★★★ 過去の大会（1998〜2015年）── 2026-09-01 その6
     ================================================================

     ★**速報の一覧（`/sokuho/`）には今年の紙しか無い。** それが 47試合・1年 という
     薄さの上限だった。トップの「過去の大会結果と記録」（`cgi/pgame_disp.cgi`）に
     **1998年度〜2023年度**の年別ページがあり、そこに大会結果のPDFが並んでいる。

     ★**年はフォームの `year` で選ぶ。** `method="post"` だが **GET のクエリでも同じものが返る**
     （実際に確かめた）ので、共通の `fetchHtml` がそのまま使える
     （文字コードは Shift_JIS。`decode()` が meta を見て直す）。

     ★**この一覧の「年度」は暦年**（第132回九州予選＝平成25年3月 が 2013 に載っている）。
     ★**紙のあるのは 1998〜2006年（夏）と 2012〜2015年（夏・春秋）。**
     **2007〜2011年のPDFは文字が1つも入っていない**（画像で作られている）。
     2016〜2022年は記事そのものが無い。**OCRは対象外**（京都の画像・兵庫のGIFと同じ線引き）。

     ------------------------------------------------------------------
     ★★ 紙は2種類ある

       ①**縦のやぐら表**（選手権大分大会・九州地区大分県予選）。
         スロット番号が**縦一列**（x≈483）に並び、校名はその右、回戦は**左へ**伸びる。
         ★**いまの速報の紙（京都型・スロットが横一列）とは向きが違う。**
       ②**横のやぐら表**（大分県高等学校野球選手権大会）。
         速報の春季・秋季とまったく同じ形なので `readPrefSheet` をそのまま使う。

     ------------------------------------------------------------------
     ★★★ ここで踏んだところ（①の紙。どれも実データで突き止めた）

       1. ★★**行にまとめる幅（`pdfPages` の 3 ポイント）が広すぎる。**
          この紙はスロットの間隔が **15.3 ポイント**しかなく、3 は **0.2 スロット**。
          まとめの鍵は「先に見つけた行の y」なので数珠つなぎにずれ、
          **得点の断片が 42.95 にあるのに行の y が 45.1**（0.15 スロットのずれ）になっていた。
          ★**本文は既定の幅で、枝は 0.6 で、と2回読む**（`pdfPages` に幅を渡せるようにした）。

       2. ★★★**1試合の2つの得点が1つの断片に潰れていることがある**（`11 10` `7 0` `4 14`）。
          ★**`explodeNumberRuns` は使えない** —— あれは断片が**スロット軸**に伸びる紙のためのもので、
          この紙の断片は**回戦の軸**に伸びる。ほどくと2つ目の数字が
          **隣の列（日付の列）へ飛ぶ。**
          ★**`flatFragments: true` で「断片は点」として読む**（鹿児島と同じ）。
          ★★**ただし潰れた断片は「下側の得点の位置」に刷ってある**ので、そのままだと
          中点が境目から **0.49** ずれ、許容 0.45 をわずかに超えて1回戦が読めない。
          ★**分かれている組の上下の間隔をその紙から測って、その半分だけ上へ戻す**
          （`liftMergedScores`）。**決め打ちの数字は使っていない。**

       3. ★★**日付の列は落としてから組み立てる。**
          日付は**その回戦の得点の列の 10 ポイント内側**に、**試合ごとに1つ**刷ってある。
          ★**日にちだけ（`14`）なので数字として読まれ、1回戦の帯として通ってしまう**
          （2つずつの中点が境目に乗る。滋賀・沖縄と同じ「組めてしまう」壊れ方）。
          実測では 0.47 ずれで**たまたま**落ちていた。**運に頼らない。**
          ★**見分けは値ではなく形で**：「数字だけの列」で、その 7〜13 ポイント外側に
          **ちょうど2倍の個数の数字を持つ列**があること。
          ★**落とすので日付は出さない**（`date: null`）。速報の夏の紙と同じ扱い。

       4. ★**校名は横書き。** 向きを入れ替えたあとは `nameOrder: "desc"` で読む
          （"asc" だと `柳ヶ浦` が `浦ヶ柳` になる）。

     ------------------------------------------------------------------
     ★★ 検算（合わなければその大会を1試合も出さない）

       1. **チーム数 − 試合数 = 1**
       2. ★★**紙に刷ってある優勝校と一致**（速報の紙と同じ検算）。
          ★**縦書きの1列に `優勝◯◯高校` と刷ってある**ので、
          **同じ x の断片を上から順につないで**読む（`archiveChampion`）。
          ★**`準優勝` の列を拾わないこと**（2015年秋の紙は両方刷ってある）。
       3. ★**紙に刷ってある「大会期間」の元号年が、取りに行った年と一致**
          （枝とは別の場所から来る事実。年を回数から導かないための根拠でもある）。

     ★★**季節は期間の最初の月で決める**（3〜6月＝春季／7〜8月＝夏／9〜11月＝秋季）。
     九州地区の県予選は **3月23日〜4月4日**・**9月15日〜10月4日**のように月をまたぐ。

     ★★**九州地区大分県予選は大会名の頭に西暦を足す**（宮崎・愛知・富山と同じ）——
     **回数（第137回）は九州地区大会の通し番号**で年が出せず、
     **日付も出さない**ので、足さないと「年の分からない大会」に落ちる。
     ★**選手権大分大会には足さない**（`第N回…選手権` から `+1918` で年が出る）。
  */
  ARCHIVE_URL: "https://www.oita-kouyaren.com/cgi/pgame_disp.cgi",
  /** 年 → その年のページ。**約束のまま持つ**（3季で3回取りに行かない） */
  _archive: new Map(),
  archiveHtml(fetchHtml, year) {
    if (!this._archive.has(year)) this._archive.set(year, fetchHtml(`${this.ARCHIVE_URL}?year=${year}.dat`));
    return this._archive.get(year);
  },
  /** `2015/pdf_11.pdf` → バイト列。**`pdfPages` は配列を手放すので毎回 `slice()` して渡すこと** */
  _archivePdf: new Map(),
  archivePdf(rel) {
    if (!this._archivePdf.has(rel)) {
      this._archivePdf.set(
        rel,
        (async () => {
          const data = await fetchPdfBytes(`https://www.oita-kouyaren.com/cgi/${rel}`, { headers: UA });
          await sleep(this.politenessMs);
          return data;
        })(),
      );
    }
    return this._archivePdf.get(rel);
  },
  async collectArchive(fetchHtml, season, year) {
    const html = await this.archiveHtml(fetchHtml, year);
    if (!html) return [];
    const out = [];
    const seen = new Set();
    // 記事は1つのテーブル。**題（<strong>）とPDFのリンクが同じテーブルの中にある**
    for (const block of html.split('<table width="570" border="0" cellspacing="0" cellpadding="0" align="center">').slice(1)) {
      const title = normalize(block.match(/<strong>([^<]*)<\/strong>/)?.[1] ?? "").replace(/\s+/g, "");
      const rel = block.match(/href="\.\/(\d+\/pdf_\d+\.pdf)"/)?.[1];
      if (!title || !rel || seen.has(rel)) continue;
      /*
        ★**必ず外すもの**:
          軟式 ／ 全支部予選（別の紙）／
          `第N回全国高等学校野球選手権大会 大会結果`（**甲子園そのもの**。`大分大会` が入らない）／
          `第N回九州地区高等学校野球大会（佐賀県開催）`（**九州地区大会そのもの**。他県の学校が出る）
      */
      if (/軟式|支部|錬成|21世紀|２１世紀/.test(title)) continue;
      const summer = /^第\d+回全国高等学校野球選手権(記念)?大分大会大会結果$/.test(title);
      const kyushu = /^第\d+回九州地区高等学校野球大会大分県予選大会結果$/.test(title);
      const pref = /^第\d+回大分県高(等学|)校野球選手権(記念)?大会大会結果$/.test(title);
      if (!summer && !kyushu && !pref) continue;
      seen.add(rel);
      const bytes = await this.archivePdf(rel);
      if (!bytes) continue;
      const name = title.replace(/大会結果$/, "");
      const got = pref
        ? await this.readArchivePref(bytes, name, season, year)
        : await this.readArchiveSheet(bytes, name, season, year, kyushu);
      out.push(...(got ?? []));
    }
    return out;
  },
  /**
   * ★**横のやぐら表（大分県高等学校野球選手権大会）は速報と同じ紙。**
   * 読み手も同じものを使う。**題だけは記事のほうから渡す**
   * （紙の見出しが `組合せ` になっている年があるため）。
   */
  async readArchivePref(bytes, name, season, year) {
    let parsed;
    try {
      parsed = await pdfPages(bytes.slice());
    } catch {
      return [];
    }
    if (!parsed?.[0]?.lines?.length) return [];
    const raw = parsed[0];
    const flat = raw.lines.map((l) => normalize(l.text.replace(/\t/g, "")).replace(/\s+/g, ""));
    const games = this.readPrefSheet(raw, flat, name, season) ?? [];
    /*
      ★**取りに行った年と、紙から読んだ年が食い違ったらその大会を1試合も出さない。**
      ★**一部だけ落とさないこと** —— 半分だけの大会は「読めた」より悪い。
    */
    const other = games.filter((g) => g.date && g.date.slice(0, 4) !== String(year));
    if (other.length) {
      console.log(
        `  ⚠️ 大分: ${name} の紙は ${other[0].date.slice(0, 4)} 年のもの（取りに行ったのは ${year} 年）。1試合も出さない`,
      );
      return [];
    }
    return games;
  },
  /**
   * ★★**潰れた得点（`11 10`）を、分かれている組の上下の間隔の半分だけ上へ戻す。**
   *
   * 間隔は**その紙の、その列で実測する**（分かれている組の上下の差のうち短いほう）。
   * ★**決め打ちの数字を使わないこと** —— 紙ごとに違う。
   */
  liftMergedScores(page) {
    const MERGED = /^\d{1,2}(\s+\d{1,2})+$/;
    const cols = new Map();
    for (const l of page.lines) {
      for (const it of l.items) {
        const t = it.text.trim();
        if (!/^\d{1,2}$/.test(t) && !MERGED.test(t)) continue;
        const k = Math.round(it.x);
        if (!cols.has(k)) cols.set(k, []);
        cols.get(k).push({ y: l.y, single: /^\d{1,2}$/.test(t) });
      }
    }
    const sep = new Map();
    for (const [k, list] of cols) {
      list.sort((a, b) => b.y - a.y);
      const ds = [];
      for (let i = 1; i < list.length; i++) if (list[i - 1].single && list[i].single) ds.push(list[i - 1].y - list[i].y);
      const small = ds.filter((d) => d > 0).sort((a, b) => a - b);
      // ★1つの組の中の差は「短いほうの群」。外れ値に引きずられないよう下から4分の1を採る
      if (small.length) sep.set(k, small[Math.floor(small.length / 4)]);
    }
    const lines = [];
    for (const l of page.lines) {
      const stay = [];
      for (const it of l.items) {
        const s = sep.get(Math.round(it.x));
        if (s && MERGED.test(it.text.trim())) lines.push({ y: l.y + s / 2, items: [it], text: it.text });
        else stay.push(it);
      }
      if (stay.length) lines.push({ ...l, items: stay, text: stay.map((i) => i.text).join("\t") });
    }
    lines.sort((a, b) => b.y - a.y);
    return { page: page.page, lines };
  },
  /**
   * ★★**日付の列を落とす**（上の 3）。
   * 「数字だけの列」で、**7〜13 ポイント外側にちょうど2倍の個数の数字を持つ列**があるもの。
   */
  dropDateColumns(page) {
    const MERGED = /^\d{1,2}(\s+\d{1,2})+$/;
    const cols = new Map();
    for (const l of page.lines) {
      for (const it of l.items) {
        const t = it.text.trim();
        const k = Math.round(it.x);
        if (!cols.has(k)) cols.set(k, { plain: 0, numbers: 0, other: 0 });
        const c = cols.get(k);
        if (/^\d{1,2}$/.test(t)) {
          c.plain += 1;
          c.numbers += 1;
        } else if (MERGED.test(t)) {
          c.numbers += t.split(/\s+/).length;
        } else c.other += 1;
      }
    }
    const drop = new Set();
    for (const [k, c] of cols) {
      if (c.other || !c.plain || c.plain !== c.numbers) continue;
      for (let d = 7; d <= 13; d++) {
        const s = cols.get(k - d);
        if (s && !s.other && s.numbers === c.numbers * 2) {
          drop.add(k);
          break;
        }
      }
    }
    if (!drop.size) return page;
    const lines = page.lines
      .map((l) => {
        const items = l.items.filter((i) => !drop.has(Math.round(i.x)));
        return { ...l, items, text: items.map((i) => i.text).join("\t") };
      })
      .filter((l) => l.items.length);
    return { page: page.page, lines };
  },
  /** ★**縦書きの1列に `優勝◯◯高校` と刷ってある**。同じ x の断片を上から順につなぐ */
  archiveChampion(page) {
    const cols = new Map();
    for (const l of page.lines) {
      for (const it of l.items) {
        const k = Math.round(it.x);
        if (!cols.has(k)) cols.set(k, []);
        cols.get(k).push({ y: l.y, t: it.text });
      }
    }
    for (const [, list] of cols) {
      if (list.length > 12) continue;
      const s = normalize(
        list
          .sort((a, b) => a.y - b.y)
          .map((i) => i.t)
          .join(""),
      ).replace(/\s+/g, "");
      /*
        ★`準優勝` を拾わないこと（同じ紙に両方刷ってある年がある）。
        ★★**校名に入らない字（括弧・句読点・コロン）を認めないこと**（2026-09-01）。
        2012年夏の紙は同じ列に `（初優勝）` と `【選手宣誓：別府鶴見丘高校` が並んでおり、
        緩いままだと **`）【選手宣誓：別府鶴見丘`** を優勝校として読む（実際に読んだ）。
      */
      const m = s.match(/(^|[^準])優勝([^\s：:（）()【】、。／/]{1,12}?)高(?:校|等学校)/);
      if (m) return m[2];
    }
    return null;
  },
  /** ★縦のやぐら表を1枚読む。**季節が違う紙なら空**（呼ぶ側は次の記事へ） */
  async readArchiveSheet(bytes, name, season, year, kyushu) {
    let coarse;
    let fine;
    try {
      coarse = await pdfPages(bytes.slice());
      // ★★枝を測るほうは細かく読む（上の 1）
      fine = await pdfPages(bytes.slice(), { rowTolerance: 0.6 });
    } catch {
      return [];
    }
    if (!coarse?.[0]?.lines?.length || !fine?.[0]?.lines?.length) {
      console.log(`  ⚠️ 大分: ${name} のPDFに文字が入っていない（画像で作られている）。1試合も出さない`);
      return [];
    }
    const flat = coarse[0].lines.map((l) => normalize(l.text.replace(/\t/g, "")).replace(/\s+/g, ""));

    // ---- 紙に刷ってある「大会期間」から年と月を読む ----
    let sheetYear = null;
    const months = [];
    for (const t of flat) {
      const era = t.match(/(平成|令和)(\d+)年(\d+)月/);
      if (era && sheetYear === null) {
        sheetYear = (era[1] === "令和" ? 2018 : 1988) + Number(era[2]);
        for (const m of t.matchAll(/(\d{1,2})月/g)) months.push(Number(m[1]));
      }
    }
    if (sheetYear === null || !months.length) {
      console.log(`  ⚠️ 大分: ${name} の紙から大会期間（元号・月）を読めない。1試合も出さない`);
      return [];
    }
    // ★★季節は「期間の最初の月」で決める（月をまたぐ大会があるため）
    const first = months[0];
    const kind = first >= 3 && first <= 6 ? "spring" : first <= 8 ? "summer" : first <= 11 ? "autumn" : null;
    if (kind !== season) return [];
    // ---- 検算3: 取りに行った年と紙の年が一致すること ----
    if (sheetYear !== year) {
      console.log(`  ⚠️ 大分: ${name} の紙は ${sheetYear} 年のもの（取りに行ったのは ${year} 年）。1試合も出さない`);
      return [];
    }

    const tournament = kyushu ? `${sheetYear}年 ${name}` : name;
    /*
      ★**向きを入れ替えて組み立てる。**
      この紙はスロット番号が**上ほど大きい**ので、**入れ替える前に y を反転**する
      （`orientPage` は「上から順に 1,2,3…」を前提にしている）。
      回戦は**左へ**伸びるので `flip: true`。
    */
    const prepared = this.liftMergedScores(this.dropDateColumns(fine[0]));
    const mirrored = { page: prepared.page, lines: prepared.lines.map((l) => ({ ...l, y: -l.y })) };
    const built = assembleSlotBracket(orientPage(mirrored, { slotAxis: "y", flip: true }), {
      roundLabels: ["決勝", "準決勝", "準々決勝"],
      // ★得点の列とコールドの注記の列が近い。速報の紙と同じ
      roundBandGap: 6,
      // ★★試合番号・注記の帯に負けないよう、窓を枝の張る範囲に広げる（速報の紙と同じ）
      hitSpan: true,
      // ★★断片は回戦の軸に伸びる＝スロット軸には点（上の 2）
      flatFragments: true,
      // ★校名は横書き。入れ替えたあとは降順で読む
      nameOrder: "desc",
    });
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
    // ---- 検算2: 紙に刷ってある優勝校 ----
    const printed = this.archiveChampion(coarse[0]);
    if (!printed) {
      console.log(`  ⚠️ 大分: ${tournament} に優勝校の記載が無い。検算できないので1試合も出さない`);
      return [];
    }
    const bare = normalizeSchoolName(printed);
    if (!built.champion || !normalizeSchoolName(built.champion).startsWith(bare.slice(0, 2))) {
      console.log(
        `  ⚠️ 大分: ${tournament} の優勝校が表と合わない（表「${printed}」/ 組み立て「${built.champion}」）。1試合も出さない`,
      );
      return [];
    }

    console.log(
      `  （${tournament}: ${built.games.length} 試合 / 優勝 ${built.champion} / ${built.teams} チーム・**日付なし**）`,
    );
    return built.games.map((g) => ({
      // ★日付の列は落としてある（上の 3）。速報の夏の紙と同じで日付は出さない
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
  /**
   * ★★**過去の大会は `kako/` の索引にある**（2026-08-24 追加）。
   *
   *   春2008・夏2009・秋2007 まで並んでいて、**約19年ぶん**。
   *   ★**ファイル名が年ごとにまるでバラバラ**（`H21natsu_t.pdf` `100t.pdf`
   *   `t2020.pdf` `71harut.pdf` `75t.pdf` …）なので、
   *   **URLを推測せず、必ずこの索引からリンクを拾うこと。**
   */
  kakoOf: {
    spring: "http://www.kouyaren-okinawa.jp/kako/haru/haru.html",
    summer: "http://www.kouyaren-okinawa.jp/kako/natu/natu.html",
    autumn: "http://www.kouyaren-okinawa.jp/kako/aki/aki.html",
  },
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
    const sheets = [...found.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([p]) => `http://www.kouyaren-okinawa.jp/${p}`)
      .slice(0, this.maxSheets);

    /*
      ★**過去の索引からも足す。** 今年の紙は `yoko/` にあり、
      過去の紙は `kako/` にある（同じ大会が両方にあることもある）。
      ★**`kako/` は `t.pdf` で終わらない名前が混ざる**ので、
      拡張子だけで拾って**開いて表題で見分ける**（この県の元からの作り）。
    */
    const kakoUrl = this.kakoOf[season];
    const kako = await fetchHtml(kakoUrl);
    await sleep(this.politenessMs);
    if (kako) {
      const base = kakoUrl.replace(/\/[^/]*$/, "/");
      const past = [];
      for (const m of kako.matchAll(/href="([^"]+\.pdf)"/gi)) {
        past.push(new URL(m[1], base).toString());
      }
      // 新しいものから見たいので、索引の並び（古い順）を反転する
      sheets.push(...past.reverse());
    }
    if (!sheets.length) {
      console.log(`  ⚠️ 沖縄: ${season} のやぐら表へのリンクが見つからない`);
      return [];
    }

    /*
      ★★**1枚で止めずに全部読む**（2026-08-24）。過去の紙が19年ぶんあるので、
      **見つけた大会を積み上げる。**
      ★**一度取れば生成物に残る**（季節ごとの引き継ぎ）ので、
      次からは出典が新しい紙を出したぶんだけ増える。
    */
    const out = [];
    const seenTournaments = new Set();
    for (const sheetUrl of sheets) {
      const parsed = await fetchPdfPages(sheetUrl, { headers: UA });
      await sleep(this.politenessMs);
      if (!parsed?.length) continue;
      const page = parsed[0];
      const flat = page.lines.map((l) => normalize(l.text.replace(/\t/g, "")));
      const title = flat.map((t) => this.titleOf[season].exec(t)?.[0]).find(Boolean);
      // その季節の紙でなければ飛ばす（九州地区大会・要項・軟式が混ざる）
      if (!title) continue;
      // 同じ大会が `yoko/` と `kako/` の両方にあることがある
      if (seenTournaments.has(title)) continue;
      seenTournaments.add(title);
      const games = this.readSheet(page, season, html);
      if (games?.length) out.push(...games);
    }
    return out;
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
  /**
   * ★★**紙の見出しの近くに、優勝校が横書きで刷ってある**（2026-08-29 に使い始めた）。
   *
   *     糸@502 満@523 ３年ぶり４度目の優勝@567
   *     嘉@384 手@412 納@439 （初優勝）@451
   *
   * ★**枝とは別の場所から来る事実**なので、石川で通ってしまった
   * 「構造の検算は通るのに決勝の相手が違う」を止められる。
   * ★**トップページの本文（`printedChampion`）は、いま開催中の大会にしか出ない。**
   * 過去年の紙は22大会が「未検算」のままだったので、こちらで埋める。
   *
   * ★**校名は1文字ずつ字間を空けて組まれている**ので、
   * **「優勝」の断片の左どなりから、間が空きすぎるまで**さかのぼって拾う。
   * 実測すると校名の中の間は 20〜60 ポイント、無関係な文字（共催社名など）とは
   * 240 ポイント以上あく。★**100 で切ればどちらにも当たらない。**
   *
   * ★**「度目」だけの行を拾わないこと** —— `興南高校２季振り２６度目の九州大会出場`
   * のような**九州大会の出場回数**の行があり、優勝校ではない。**「優勝」の語で見る。**
   * ★**組合せ表だけの紙・書き方の違う紙では取れない**（43枚中26枚で取れた）。
   * **取れないことを理由に大会を落とさない。**
   */
  championOnSheet(raw) {
    for (const l of raw.lines) {
      for (let k = 1; k < l.items.length; k++) {
        if (!l.items[k].text.includes("優勝")) continue;
        const chars = [];
        for (let j = k - 1; j >= 0; j--) {
          const gap = l.items[j + 1].x - l.items[j].x;
          const t = l.items[j].text.trim();
          if (gap > 100 || !/^[一-龥ぁ-んァ-ヶー]{1,4}$/.test(t)) break;
          chars.unshift(t);
        }
        const name = chars.join("");
        if (name.length >= 2) return name;
      }
    }
    return null;
  },
  /** やぐら表を1枚読む */
  readSheet(raw, season, html = "") {
    const flat = raw.lines.map((l) => normalize(l.text.replace(/\t/g, "")));
    const tournament = flat.map((t) => t.match(this.titleOf[season])?.[0]).find(Boolean);
    const printedChampion = this.printedChampion(html, tournament) ?? this.championOnSheet(raw);

    /*
      ---- 会期 ----
      「令和８年６月１３日（土）～７月２０日（月）」。**年はここから出す**（回数からは出さない）。
    */
    /*
      ★★**古い紙は平成**（2026-08-25 追加）。`kako/` の索引には
      **春2008・夏2009・秋2007** まで並んでいて、そこは元号が平成。
      ★**令和しか見ていなかったので、過去年が全部「会期が読めない」で落ちていた。**
      **平成1年 = 1989年 ／ 令和1年 = 2019年。**
    */
    /*
      ★★**書き方が紙によって3つ違う**（2026-08-29。過去年を読んで分かった）。

        令和８年６月１３日（土）～７月２０日（月）   … 揃っている紙
        平成24年 3月21日（水）～4月2日（月）      … ★**年のうしろに空白**
        令和元年６月２２日（土）～７月２１日（日）   … ★**「元年」**（＝1年）

      ★**どれか1つでも見落とすとその大会を丸ごと落とす**（実際に3大会・180試合が
      「会期が読めない」で落ちていた）。**年は会期からしか出さない**ので、
      ここが読めないと検算も日付も作れない。
    */
    const term = flat
      .map((t) => t.match(/(令和|平成)\s*(元|\d+)年[\s　]*(\d+)月(\d+)日[^~～〜]*[~～〜](\d+)月(\d+)日/))
      .find(Boolean);
    if (!term) {
      console.log(`  ⚠️ 沖縄: ${tournament} の会期が読めない。検算できないので1試合も出さない`);
      return [];
    }
    const era = term[1];
    // ★「元年」は1年。`Number("元")` は NaN になるので、ここで1に直す
    const ge = term[2] === "元" ? 1 : Number(term[2]);
    const [m1, d1, m2, d2] = term.slice(3).map(Number);
    const startYear = ge + (era === "令和" ? 2018 : 1988);
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
    /**
     * ★★**1回戦の試合番号の行**（2026-08-29）。落とすだけでなく、
     * **`assembleSlotBracket` に渡して1回戦の位置を決めるのに使う。**
     *
     * ★**古い紙はシード校のスロットにも得点欄と同じ数字が刷られている**
     * （不戦を `-1` `-2` と書くいまの紙と違う）。帯を2つずつ順に組む既定の
     * 探し方では**そこから先が1つずつずれて帯ごと捨てられる。**
     * 紙が「何番の試合がどこにあるか」を書いているので、そこから読む。
     *
     * ★**1回戦のものは「1から始まる連番」。** 深い回戦の試合番号
     * （`25 26 … 40`）も同じ形の行だが、1から始まらないので混ざらない。
     */
    let gameNumberRow = null;
    /**
     * ★★**試合番号は紙の全体を通して 1 から続く**（2026-08-29。第72回秋で踏んだ）。
     *
     * 元は「4個以上の連番の行」だけを落としていたので、**深い回戦の
     * `55 56` や決勝の `57` が残っていた。** `roundBandGap` で
     * スコアの帯と分ける建て付けだったが、**決勝の `57` は
     * スコアの帯のちょうど 4 ポイント下**にあり、まとめられて
     * **「数字3個（必要2）」で大会ごと落ちていた。**
     *
     * ★**紙は 1 から順に番号を振っている**ので、**下から順に「続きになっているか」**
     * を見れば、**1個しか無い行でも試合番号だと分かる。**
     * ★**最初の行（1から始まるもの）だけは4個以上を求める** ——
     * `1 2` のような2個の行はスコアと見分けが付かない。
     *
     * ★★**「行が数字だけ」を条件にしないこと。** 深い回戦の試合番号の行には、
     * **別の場所の縦書きの1文字が同じ高さで載っている**（第72回秋の `55 56` の行に
     * コールドの `ー`、決勝の `57` の行に「朝日新聞社」）。
     * ★**落とすのは行ではなく数字の断片**にして、ほかの文字はそのまま残す。
     * ★**不戦の印の `0` も一緒に落とす**（スロットの位置にあるので、
     * 残すと帯の数字として拾われる）。
     */
    /** 行 → その行から落とす断片 */
    const dropItems = new Map();
    {
      let next = 1;
      for (const l of [...raw.lines].filter((l) => l.y > slotLine.y).sort((a, b) => a.y - b.y)) {
        const nums = l.items.filter((i) => /^\d+$/.test(normalize(i.text).trim()));
        const ns = nums.map((i) => Number(normalize(i.text))).filter((n) => n !== 0);
        if (!ns.length) continue;
        // ★**その行の数字が、ちょうど番号の続きになっていること**（一部だけでは足りない）
        if (ns[0] !== next || !ns.every((n, i) => i === 0 || n === ns[i - 1] + 1)) continue;
        if (next === 1 && ns.length < 4) continue;
        if (next === 1) gameNumberRow = { ...l, items: nums };
        dropItems.set(l, new Set(nums));
        next = ns.at(-1) + 1;
      }
    }
    const page = {
      page: raw.page,
      lines: raw.lines
        .map((l) => {
          // ★**試合番号の断片だけを抜く**（行そのものは残す。上の説明を読むこと）
          const drop = dropItems.get(l);
          if (!drop) return l;
          const items = l.items.filter((i) => !drop.has(i));
          return { ...l, items, text: items.map((i) => i.text).join("\t") };
        })
        .filter((l) => {
        const texts = l.items.map((i) => i.text.trim()).filter((t) => t && t !== "・");
        if (!texts.length) return true;
        // 凡例の行（`【…】` と `＊…` の断片しか無い行）
        if (texts.every((t) => /^[【＊*]/.test(t))) return false;
        /*
          ★★**「0 しか無い行」を落とす**（2026-08-29。第68回秋で踏んだ）。

          コールドや延長の注記の欄は、**注記が無いスロットにも `0` が刷られる**
          （そういう字が置かれているのか、フォントの都合でそう出るのかは分からないが、
          **紙の見た目には無い**）。第68回秋はその行が**スロット行の 15.6 ポイント上**にあり、
          `assembleSlotBracket` が**スロット行と同じ高さ**とみなして
          （`SLOT_ROW` は 20 ポイント）**連番のあいだに 0 が割り込み、
          「スロット番号が 3 個しか連番になっていない」で大会ごと落ちていた。**

          ★**全部が 0 の行が得点であることはありえない**（1回戦が全部 0 対 0 になる）。
          ★**0 が混ざっているだけの行は落とさない**（本物の 0 点がある）。
        */
        if (l.y > slotLine.y && texts.length >= 4 && texts.every((t) => /^0+$/.test(t))) return false;
        // 試合番号の行。**スロット行より上にしかない**
        if (l.y <= slotLine.y) return true;
        if (!texts.every((t) => /^\d+$/.test(t))) return true;
        const ns = numbersIn(l);
        /*
          ★**2〜3個の行は落とさない。** 深い回戦のスコアは
          「4 3」「7 0 12 2」のように少ないので、**本物のスコアと見分けが付かない。**
          ★**番号の続きになっているものは上で断片ごと抜いてある。**
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
        ★★**1回戦は紙が刷っている試合番号の位置から読む**（2026-08-29）。
        これが無いと、**シード校のスロットに刷られた数字**（古い紙）や
        **コールドの注記の空欄（`0` として出る）**のせいで1回戦を取り違える。
      */
      gameNumberRow,
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
      ---- 検算2: 紙に刷ってある優勝校 ----
      ★**枝とは別の場所から来る事実。** 石川で通ってしまった
      「構造の検算は通るのに決勝の相手が違う」はここで止まる。
      ★**出所は2つ**（`printedChampion`）── **開催中の大会はトップページの本文**、
      **過去年は紙の見出しの近くの横書き**（`championOnSheet`）。
      ★**校名は完全一致では比べられない**（枝「エナジック」／本文
      「エナジックスポーツ高等学院」、枝「浦添商」／紙「浦添商業」）。
      **どちらかがもう一方を含めば同じ**とみなす。
    */
    if (printedChampion) {
      const bare = printedChampion.replace(/高等学校$|高等学院$|高校$/, "");
      const got = built.champion ?? "";
      if (!bare || !(bare.includes(got) || got.includes(bare))) {
        console.log(
          `  ⚠️ 沖縄: ${tournament} の優勝校が紙の記載と合わない` +
            `（紙「${printedChampion}」/ 組み立て「${built.champion}」）。1試合も出さない`,
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

      ★★**会期は「予定」なので、ぴったり一致することを求めない**（2026-08-29 に緩めた）。

      ★**紙自身が会期の外の日付を刷っている。** 過去年を読めるようにして分かった。

          第61回春（2014）… 会期 3/21〜4/2 だが、**決勝の欄に `4/3`**
          第58回秋（2008）… 会期 9/13〜10/5 だが、**決勝の欄に `10/11`**（6日ずれ）
          第99回夏（2017）… 会期 6/17 開始だが、**初戦は 6/18**（初日は開会式だけ）

      ★★**「初日と一致する」を落とす条件にしていたのは誤りだった。**
      1回戦が必ず初日に始まるとは限らない（開会式だけの日がある）。
      3大会・180試合が、正しく組めているのに捨てられていた。

      ★**残す条件は「会期より前に試合は無い」だけ。** これは動かない事実で、
      元号の読み違い（全部が別の年になる）はここで必ず捕まる。
      ★**うしろ側は「ひと月を超えたら落とす」**。順延は数日〜1週間で、
      **ひと月を超えるのは順延ではなく読み違い**（月を取り違えたたぐい）。
      ★**ずれたときは必ず警告を出す**（黙って通すと、順延と読み違いが見分けられない）。
    */
    const pad = (m, d) => `${startYear}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const [from, to] = [pad(m1, d1), pad(m2, d2)];
    const limit = new Date(`${to}T00:00:00Z`);
    limit.setUTCDate(limit.getUTCDate() + 31);
    const latest = limit.toISOString().slice(0, 10);
    if (dates[0] < from || dates.at(-1) > latest) {
      console.log(
        `  ⚠️ 沖縄: ${tournament} の日付が会期から離れすぎている` +
          `（会期 ${from}〜${to} / 組み立て ${dates[0]}〜${dates.at(-1)}）。1試合も出さない`,
      );
      return [];
    }
    if (dates[0] !== from || dates.at(-1) !== to) {
      console.log(
        `  ⚠️ 沖縄: ${tournament} の日程が会期（${from}〜${to}）とずれている` +
          `（組み立て ${dates[0]}〜${dates.at(-1)}）。開会式だけの日・順延・日程短縮なら正しい。` +
          `紙の決勝の欄の日付と突き合わせること`,
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
        `${printedChampion ? "（紙の記載と一致）" : "（紙に記載が無く未検算）"} / ` +
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
        // ★イニングの側も持っておく（下の「合計が 0 なのに点が入っている」の見分けに使う）
        if (r) rows.push({ name: r[1], innings: r[2], score: Number(r[3]) });
        if (rows.length === 2) break;
      }
      if (rows.length !== 2 || !rows[0].name || !rows[1].name) continue;
      const [a, b] = rows;
      /*
        ★★★**`=` の右の合計が打ち間違えられている記事がある**（2026-08-30 その2）。

          盛岡工 000 000 0=0
          一関学院 031 012 X=0   ← イニングは 7 点入っているのに合計が 0

        そのまま出すと **`盛岡工 0-0 一関学院` という幻の引き分け**になる
        （実際に画面に出ていた。7回コールドなので引き分けではない）。
        ★★**0対0の引き分けは実在する**ので消してよいのは**この形だけ** ——
        **本物の 0対0 ならイニングもすべて 0。**
        ★**イニングから合計を組み立て直さない**（丸数字で書かれる回があり、推測になる）。
        **その試合を出さない。**
      */
      const scored = (t) => /[1-9①-⑳]/.test(String(t.innings ?? ""));
      if (a.score === 0 && b.score === 0 && (scored(a) || scored(b))) {
        console.log(
          `  ⚠️ 岩手: ${a.name} と ${b.name} は合計が両方 0 なのにイニングに点がある。この試合は出さない`,
        );
        continue;
      }
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
      /*
        ★**その紙の暦年は、引きに行った「年代」から決まる**（下の `parse` で使う）。
        春・夏は 年代＝暦年、**秋だけ 年代＝暦年+1**（`keysOf` と同じ規則）。
      */
      games.push(...this.parse(html, season, season === "autumn" ? era - 1 : era));
    }
    return games;
  },
  /**
   * 1つの大会のページを読む。
   * `expectedYear` … その紙の暦年（`collect` が年代から出す）。省くと年の検査をしない。
   */
  parse(html, season, expectedYear = null) {
    const tournament = normalize(plain(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "")).trim() || null;
    const out = [];
    let skipped = 0;
    let repaired = 0;
    let badDates = 0;
    /*
      日付のかたまり（`div.taikai-nittei`）ごとに切る。
      ★**1日に複数の球場がある**ので、球場と試合の並びを順に読んで
      **直前の球場を持ち回る**（球場ごとに `h1.kaizyo` → `div.siaikekka` が来る）。
    */
    for (const block of html.split(/<div class="taikai-nittei">/).slice(1)) {
      /*
        ★★**`datetime` の年が出典側で打ち間違えられている日がある**（2026-08-25 に修正）。

          2023年春季島根県大会 … 4月21日の `datetime` が **2022**-04-21（7試合）
          2024年度春季島根県大会 … 4月28日〜5月4日が **2023**-…（8試合）
          2020年秋季島根県大会 … 9月26日・27日が **2020**-…（正しくは2019年。4試合）

        ★**画面に出ている見出し（`<time>4月21日</time>`）には年が無い**ので、
        **人が読むぶんには正しく、機械で読むところだけが間違っている。**

        ★**落とすと本物の19試合が消える。**
        1回戦だけ・決勝だけが欠けた大会になり、トーナメント表も組めなくなる。
        ★**年はこの紙の外から決まっている** —— どの年代のページを引きに行ったかで
        決まるので、**推測ではない。** 月日は見出しに刷ってあるものをそのまま使う。

        ★**直すのは年だけ。** 見出しの月日と `datetime` の月日が食い違う日は
        **打ち間違い以上のことが起きている**ので、直さずに落とす。
      */
      const ymd = block.match(/datetime="(\d{4})-(\d{2})-(\d{2})"/);
      let date = ymd ? `${ymd[1]}-${ymd[2]}-${ymd[3]}` : null;
      if (ymd && expectedYear != null && Number(ymd[1]) !== expectedYear) {
        const shown = normalize(plain(block.match(/<time[^>]*>([\s\S]*?)<\/time>/)?.[1] ?? "")).match(
          /(\d{1,2})月(\d{1,2})日/,
        );
        if (shown && Number(shown[1]) === Number(ymd[2]) && Number(shown[2]) === Number(ymd[3])) {
          date = `${expectedYear}-${ymd[2]}-${ymd[3]}`;
          repaired += 1;
        } else {
          badDates += 1;
          continue;
        }
      }
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

          ★★**`Number.isFinite` では止まらなかった**（2026-08-25 に修正）。
          **`Number("")` は NaN ではなく `0`** なので、得点の空いた枠が
          **すべて 0対0 の引き分けとして画面に出ていた**（1,285試合のうち87件）。

            <li class="point"></li> … 雨天順延・未実施
            <h1 class="siaikekka-biko-rain">雨天順延</h1>

          ★**順延した試合は、順延した日にも改めて載る**ので、
          **同じ顔合わせが「0対0の引き分け」と「本当の結果」の2件になっていた。**
          第93回・第99回の選手権で**準決勝が4試合**になっていたのはこれ
          （出典の拾い過ぎではなかった）。

          ★**0対0の引き分けそのものは実在する**（引き分け再試合）ので、
          **「空かどうか」で見ること。**「0かどうか」で見ると本物を捨てる。
        */
        const scored = /^\d+$/.test(points[0]) && /^\d+$/.test(points[1]);
        if (!a || !b || !scored || !Number.isFinite(s1) || !Number.isFinite(s2)) continue;
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
    /*
      ★**直した件数・落とした件数は必ず出す。**
      黙って直すと「出典が直った」と「こちらで直している」が見分けられない。
    */
    if (repaired) {
      console.log(
        `  ⚠️ 島根: 出典の datetime の年が違う日が ${repaired} 日ぶん。` +
          `見出しの月日はそのままに、${expectedYear} 年として出す`,
      );
    }
    if (badDates) {
      console.log(
        `  ⚠️ 島根: 年が ${expectedYear} 年ではなく、見出しの月日とも食い違う日が ${badDates} 日ぶん。その日は出さない`,
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

/*
  ★**古い `omyuleagueschedule.action` を読む関数は 2026-08-29 に消した。**
  直近の年しか持っておらず、`fetchOmyuScheduleHistory` が上位互換
  （過去年も取れ、2025年夏の決勝のように**古いほうが落としていた試合も入る**）。
*/

/**
 * ★★★**過去年まで取れる新しいエンドポイント**（2026-08-29 に切り替えた）。
 *
 * ------------------------------------------------------------------
 * ★★**古い `omyuleagueschedule.action` は直近の年しか持っていない。**
 *
 * 実測（茨城 league_id=208）で、**2023年以前は3季とも0件**だった。
 * `--year 2023` で走らせても1試合も取れず、「前の内容を残す」歯止めだけが働く。
 * ★**「取れない＝出典に無い」と結論する前に、別のエンドポイントを疑うこと。**
 *
 * ------------------------------------------------------------------
 * ★★**連盟サイトの「過去の記録」ページが使っているのはこちら。**
 *
 *   https://www.ibaraki-hbf.com/history?oyyear=2015
 *
 * ★**ミニファイされたJSからは辿れない。** ブラウザで1回開いて
 * `performance.getEntriesByType("resource")` を見るのがいちばん速い。
 *
 * ------------------------------------------------------------------
 * ★**パラメータの意味**（実データで1つずつ確かめた）
 *
 *   year      … 西暦（`20151` のような季節つきではない）
 *   cup_attr  … **1 で固定。** 2・3 は「その他」が返り0件
 *   season    … **HR=春季 / HN=夏季 / HA=秋季。** ここで季節が決まる
 *   from      … **空でよい**（連盟サイトは自分のslugを入れているが、要らなかった）
 *
 * ★**応答が自己記述的**で、`year_list`（年×季節の一覧）と
 * `section_list`（その季節の中の大会）を持っている。
 * ★**茨城は 2012年度まで**（`year_list` が44件）。
 */
/**
 * ★★★**連盟のお知らせAPI**（`other-api.omyutech.com`）。
 *
 * ★★**2026-09-04 その4 に復活させた。**「山形を履歴APIに替えて2019年まで遡る」の回に
 * **定義だけ消えていて、呼び出しは6か所残っていた** ——
 * **宮崎の連盟アダプタが毎回 `fetchOmyuNews is not defined` で落ち、
 * 3季とも「前の内容を残す」で凍っていた**（画面は正しく見えるので気づけない）。
 * ★**消すときは呼び出しが残っていないか必ず確かめること。**
 *
 * ★**スコアAPI（`baseballapi`）ではない。** ここから取るのは
 * **連盟が自分で書いたお知らせと、その添付の置き場所**だけ（2026-08-16 の運営者判断）。
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

async function fetchOmyuScheduleHistory(leagueId, year, seasonCode, sectionId = "") {
  const url =
    `https://baseball.omyutech.com/json/omyuleagueschedulenew.action` +
    `?from=&league_id=${leagueId}&year=${year}&cup_attr=1` +
    `&season=${seasonCode}&section_id=${sectionId}`;
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

/** 季節 → 出典の季節コード */
const OMYU_SEASON_CODE = { spring: "HR", summer: "HN", autumn: "HA" };

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
      /*
        ★★**過去年の取れるエンドポイントに切り替えた**（2026-08-29）。
        古いほうは直近の年しか持っていない（`fetchOmyuScheduleHistory` の説明）。
        ★**季節はURLの `season` で決まる**ので、`year` に季節の数字を足す
        古い作り（`20151`）と `byYearOnly` の出し分けは要らなくなった。
      */
      const seasonCode = OMYU_SEASON_CODE[season];
      const cacheKey = `${year}\t${seasonCode}`;

      let base = this.sectionCache.get(cacheKey);
      if (base === undefined) {
        base = await fetchOmyuScheduleHistory(this.leagueId, year, seasonCode);
        this.sectionCache.set(cacheKey, base);
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
          s.section_Id === ""
            ? base
            : await fetchOmyuScheduleHistory(this.leagueId, year, seasonCode, s.section_Id);
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
 *   ★★★**そこへは広げないこと。** **連盟が断っているものを別経路で取るかどうかは運営者の判断**で、
 *   **6県については「取らない」ままである。**
 *
 *   ★★**2026-09-02 に 鹿児島・愛媛・長崎・高知 を足した**（運営者の判断）。
 *   **この4県の連盟は取得を断っていない** —— 断っていないが、
 *   **連盟からはこれ以上取れなかった**（`kagoshimaHsb` の説明に県ごとの理由がある）。
 *   ★**「連盟が断っている県へ広げる」のとは別の話**なので、上の線は動いていない。
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
/*
  ★★★**県ごとの違いは4つだけ**（2026-09-02 に共通化した。それまで福岡だけの作りだった）。

    slug / district / host（`<host>.hsbflash.jp`）/ summer2020

  ★**中身の作りはどの県も同じ**（索引 → 過去の大会 → トーナメント表のSVG）。
  ★**`summer2020` は「2020年に選手権の代わりに開かれた県独自の大会」の題**。
    **名指しで拾うこと** —— 「◯◯大会」を広く夏に寄せると1年生大会や招待試合まで入る。
    ★**県ごとに題がまるで違う**ので、規則では拾えない（下の一覧を見ること）。
*/
const HSB_BASE = {
  name: "HSB flash",
  politenessMs: 2000,
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
    /*
      ★★**2020年は選手権が中止で、県独自の大会が代わりに開かれた**
      （2026-08-28 に足した）。**夏として収める**
      （奈良の「令和2年度奈良県高等学校夏季野球大会」と同じ扱い）。
      ★**名指しで拾う。** 「◯◯大会」を広く夏に寄せると、1年生大会や招待試合まで入る。
      ★★**県ごとに題がまるで違う**（`summer2020`。規則では拾えない）:

        福岡   … `2020年がんばれ福岡2020高等学校野球大会`
        鹿児島 … `2020鹿児島県夏季高等学校野球大会`
        愛媛   … `令和2年度愛媛県高等学校夏季野球大会`
        高知   … `2020高知県高等学校夏季特別野球大会`
        長崎   … `令和2年度長崎県高等学校野球大会`   ← ★**「夏季」の字が無い**
    */
    if (this.summer2020?.test(title)) return "summer";
    return null;
  },
  async collect({ fetchHtml, season, year }) {
    const get = (url) => this.page(url, fetchHtml);
    const base = this.base;

    // ---- 1. 索引（開催中/直近の大会）----
    const index = await get(`${base}/`);
    if (!index) {
      console.log("  ⚠️ ${this.district}: 索引が取れない。出典の作りが変わった可能性がある");
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
    /*
      ★**索引には西暦が無い。** 選手権は「第N回 − 1918」で出せる。
      春季・秋季には回数が無いので、**開催中は暦年**とみなす
      （春3〜4月・秋8〜10月なので年をまたがない）。
      ★**未来の日付が出たら1試合も出さない**ので、取り違えればそこで止まる。
    */
    const n = Number(cur.title.match(/第(\d+)回/)?.[1]);
    const curYear =
      season === "summer" && Number.isFinite(n) ? n + 1918 : new Date().getFullYear();
    /*
      ★★★**索引に載っているのは「開催中／直近の大会」だけ**（2026-09-02 に直した）。

      `--year` で別の年を頼まれているのに、ここで索引の大会を返していた ——
      **どの年を指定しても、夏はいつも同じ（いちばん新しい）大会が返っていた**
      （鹿児島を2019年まで遡ったら、7年ぶん全部が `第108回…鹿児島大会` になった）。
      ★**同じ大会名なので生成物は壊れない**が、**目当ての年の夏が永遠に入らない。**
      ★**警告も出ない。** 気づけたのは、遡るたびのログに同じ大会名が並んだから。
      ★**春季・秋季にも同じ危うさがある** —— 索引の大会に**頼まれた年の札を貼って**しまう。
    */
    if (this.seasonOf(cur.title) === season && cur.title && curYear === year) {
      const games = await this.readTournament(get, {
        ...cur,
        season,
        year: curYear,
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

      ★★**`--year` で過去年を取れるようにした**（2026-08-28。25大会・2018年まで）。
      ★**春季・秋季は題が毎年まったく同じ**（`春季九州地区高校野球 福岡県大会`）なので、
      **年は開いてみないと分からない。** 上から順に開いて、**年が合った1件だけ**を使う。
      ★**「合わなければ次を試す」ではない** —— 目当ての年の大会が落ちたら**0件**にする
      （上に書いた「古い大会が今の季節として出る」を繰り返さないため）。

      ★★★**同じ年・同じ季節に大会が2つあることがある**（2026-09-04 に大阪で見つけた）——
      **第100回の記念大会は1県から2校が出る**ので、
      `第100回全国高等学校野球選手権記念 南大阪大会` と `… 北大阪大会` が並んでいる。
      **1件見つけたところで止めていたので、北大阪の86試合が永久に入らなかった**（警告も出ない）。
      ★**年が合うものは全部読む。** 一覧は**新しい順**なので、
      **目当ての年より古いものが出たらそこで止める**（出典に余計な負担をかけない）。
    */
    const wanted = [];
    for (const link of links) {
      const html = await get(link.url);
      if (!html) continue;
      /*
        ★**過去大会のページには西暦入りの大会期間がある**
        （`大会期間 2026年3月20日(金) 〜 4月6日(月)`）。**回数から年を出さない。**
      */
      const period = normalize(plain(html).replace(/^.*大会期間/s, "").slice(0, 60));
      const y = Number(period.match(/(\d{4})年/)?.[1]);
      if (!Number.isFinite(y)) {
        console.log(`  ⚠️ ${this.district}: 「${link.title}」の大会期間から西暦を読めない`);
        continue;
      }
      if (y !== year) {
        if (y < year) break;
        continue;
      }
      wanted.push({ link, html, period, y });
    }
    const collected = [];
    for (const { link, html, period, y } of wanted) {
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
      collected.push(...games);
    }
    return collected;
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
      console.log(`  ⚠️ ${this.district}: 「${info.title}」のトーナメント表が取れない`);
      return [];
    }
    /*
      ★★**「ブロック大会」として受けてよいのは、出場校の一覧があるときだけ**（2026-09-04）。
      一覧と1対1で突き合わせられないと、**読み違えと見分けが付かない**
      （`svg-bracket.mjs` の「いちばん上の山が2つ以上」を読むこと）。
    */
    const built = readHsbBracket(html, { district: this.district, blocks: Boolean(info.entries) });
    if (!built) return [];

    /*
      ---- 検算B: 勝ち抜きの算数 ----
      ★★**不戦勝は枠を使うが試合は行われていない**（2026-09-02）ので、そのぶんを数に入れる。
      **入れる前は、不戦勝が1件あるだけで大会がまるごと落ちていた**
      （鹿児島・愛媛・長崎・高知で何大会も落ちていた）。
      ★**画面には出さない**（0対0にしない。大阪・石川・群馬と同じ）。
    */
    const byes = built.byes ?? 0;
    /*
      ★★**ブロック大会は「山の数」だけ勝ち残る**（2026-09-04）。
      8ブロックなら 74チーム・66試合で `74 − 66 = 8`。**式は同じで、右辺が山の数になるだけ。**
    */
    const wantLeft = built.blocks ?? 1;
    if (built.slots.length - built.games.length - byes !== wantLeft) {
      console.log(
        `  ⚠️ ${this.district}: ${info.title} は ${built.slots.length} チームに対し ${built.games.length} 試合` +
          `${byes ? `・不戦勝 ${byes}` : ""}（${built.slots.length - wantLeft - byes} のはず）。1試合も出さない`,
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
      /*
        ★★★**一覧が多いのは「勝ち抜き表がその大会の全部ではない」から**
        （2026-09-02 その2 に見つけ、**2026-09-04 に受けようとして取り消した**）。

        紙の勝ち抜き表の**下に「順位決定戦」がある**（`built.placement`）——
        四国大会へ進む枠を決める試合で、**日付と両校名だけが刷ってあり得点が無い。**

            高知2026春  表の決勝 高知商業 - 高知中央 ／ 順位決定戦 高知商業 - **高知農業**
                        一覧の優勝・準優勝は 高知商業・高知農業
            高知2025春  表の決勝 高知 - 高知中央     ／ 順位決定戦 高知 - **明徳義塾**
                        一覧の優勝・準優勝は **明徳義塾**・高知   ← ★**表の勝者は優勝校ではない**

        ★★★**2025年が決め手。** 一覧に余る学校は**その試合から入ってくる学校**で、
        **勝てばその学校が優勝校になる。**
        つまり**勝ち抜き表の最後の試合は大会の決勝ではない。**
        ★**「回戦は事実として画面に出る」ので、決勝でないものを決勝と書けない。**
        ★★**受けようとして取り消した。1試合も出さない**（緩めるなら、
        **順位決定戦の得点を持っている別の出典**が要る）。
      */
      if (info.entries.length !== built.slots.length) {
        console.log(
          `  ⚠️ ${this.district}: ${info.title} の出場校が ${info.entries.length} 校、表は ${built.slots.length} スロット` +
            (built.placement
              ? `（紙の下に「${built.placement.label}」がある: ${built.placement.teams.join(" - ")}。` +
                `**表の勝者は大会の優勝校とは限らない**）`
              : "") +
            "。1試合も出さない",
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
          `  ⚠️ ${this.district}: ${info.title} のスロット ${bad + 1} が一覧と合わない` +
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
    /*
      ★★★**ブロック大会には決勝が無い**ので、代わりに
      **「記載の優勝校が、どれかの山の勝ち残りであること」**を確かめる（2026-09-04）。
      ★**出典は山が8つでも `優勝` を1つだけ書く**（京都2020は8ブロックの1つの優勝校）。
      **その1校がどの山の勝ち残りでもなければ、紙を読み違えている。**
      ★**記載が無いときは受けない**（一覧との1対1だけでは、枝の読み違いは止まらない）。
    */
    if ((built.blocks ?? 1) > 1) {
      const winners = (built.topWinners ?? []).filter(Boolean);
      if (!info.champion || !winners.some((w) => same(w, info.champion))) {
        console.log(
          `  ⚠️ ${this.district}: ${info.title} はブロック大会（山が ${built.blocks} つ）だが、` +
            `記載の優勝校「${info.champion ?? "（記載なし）"}」がどの山の勝ち残りでもない` +
            `（山の勝ち残り: ${winners.join("・") || "-"}）。1試合も出さない`,
        );
        return [];
      }
      console.log(
        `  ℹ️ ${this.district}: ${info.title} はブロック大会（山が ${built.blocks} つ）。` +
          `**決勝・準決勝という回戦名は出さない**（大会の決勝が行われていない）`,
      );
    }
    const final = built.games.find((g) => g.round === "決勝");
    if (info.champion && final) {
      const won = built.champion;
      const lost = won === final.a ? final.b : final.a;
      /*
        ★★~~紙に「順位決定戦」があるときは準優勝を突き合わせない~~（2026-09-04 に入れて取り消した）——
        **一覧の準優勝はその試合の結果**で、勝ち抜き表の決勝で負けた学校ではない
        （高知2026春: 表の決勝 高知商業 - 高知中央／一覧の準優勝は **高知農業**）。
        ★★**取り消した理由は上の検算Cにある** —— **表の勝者が優勝校とは限らない**ので、
        準優勝だけ緩めても「決勝でない試合が決勝として出る」ことは止まらない。
      */
      const wantRunnerUp = info.runnerUp;
      if (!same(won, info.champion) || (wantRunnerUp && !same(lost, info.runnerUp))) {
        console.log(
          `  ⚠️ ${this.district}: ${info.title} の決勝が記載と合わない` +
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
      console.log(`  ⚠️ ${this.district}: ${info.title} の大会期間が読めない（${info.period ?? ""}）。1試合も出さない`);
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
        console.log(`  ⚠️ ${this.district}: ${info.title} に未来の日付（${date}）がある。1試合も出さない`);
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
        /*
          ★★**春季・秋季は題が毎年まったく同じ**（`春季九州地区高校野球 福岡県大会`。2026-08-28）。
          **年を足さないと、何年ぶんかが画面で1つの大会に潰れる**
          （`listTournaments` は「季節＋大会名」でまとめるため）。
          ★**年は大会期間の西暦**（紙とは別の場所から来る事実）。宮崎・千葉と同じ西暦の付け方。
          ★**夏は足さない**（`第N回…選手権` で年ごとに違う名前になる）。
        */
        tournament: /選手権/.test(info.title) ? info.title : `${info.year}年 ${info.title}`,
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
      `  （${info.title}: ${out.length} 試合 / ` +
        ((built.blocks ?? 1) > 1
          ? `${built.blocks} ブロック（大会の優勝校は無し）`
          : `優勝 ${built.champion}${info.champion ? "（記載と一致）" : "（記載が無く未検算）"}`) +
        ` / ${built.slots.length} チーム` +
        `${undated ? ` ・日付の付かない試合 ${undated} 件` : ""}）`,
    );
    return out;
  },
};

/**
 * HSB flash のアダプタを1県ぶん作る。
 *
 * ★★**`_pages` は県ごとに新しく持つこと。** 共有すると
 * **1県目の索引を2県目が使ってしまう**（同じURLに見えないので実害は出ないが、
 * 取得の使い回しが県をまたぐのは筋が悪い）。
 */
function hsbAdapter({ slug, district, host, summer2020 }) {
  const base = `https://${host}.hsbflash.jp`;
  return {
    ...HSB_BASE,
    slug,
    district,
    siteUrl: `${base}/`,
    base,
    seasons: { spring: `${base}/`, summer: `${base}/`, autumn: `${base}/` },
    summer2020,
    _pages: new Map(),
  };
}

/**
 * ★★★**「連盟が持っていない年・季節だけ」を HSB flash から足すアダプタ**（2026-09-03）。
 *
 * ------------------------------------------------------------------
 * ★★ なぜ切り替えではなく「足す」なのか
 *
 *   **愛知（2015年〜）・兵庫（2017年〜）・富山（2014年〜）・和歌山（2017年〜）は、
 *   連盟のほうが古い年を持っている。** HSB flash はどの県も 2019年から。
 *   ★**切り替えると、その古い年が丸ごと消える。**
 *   ★**そのまま両方を登録すると、同じ大会が2つの名前で並ぶ**（引き継ぎの鍵は大会名）。
 *
 * ------------------------------------------------------------------
 * ★★ 仕組み（**主・副の2本立て**）
 *
 *   - **主**は連盟のアダプタ。**先に走って生成物を書く。**
 *   - **副**（これ）は**そのあとに走り**、生成物を読んで
 *     ★**「主が1試合でも持っている 年×季節」は返さない。**
 *   - ★**県の出典表示（`sourceName`）は主のまま**にする（`name` / `siteUrl` を主から借りる）。
 *   - ★★**副が足した試合には `source` を付ける**（愛知の CATVase と同じ形）。
 *     **転記した経路が別ならその経路が本当の出所**（AGENTS.md）。
 *
 *   ★**この2本立ては「切り替え」より弱い** —— 主が薄い年でも、
 *   **1試合でもあれば副は入らない。** 混ざって二重になるより取りこぼすほうを選んでいる。
 */
function hsbFillAdapter({ slug, district, host, summer2020, primary }) {
  const base = `https://${host}.hsbflash.jp`;
  return {
    ...HSB_BASE,
    slug,
    district,
    // ★**県の出典は主（連盟）のまま。** 足したぶんは試合ごとの `source` で示す
    name: primary.name,
    siteUrl: primary.siteUrl,
    base,
    seasons: { spring: `${base}/`, summer: `${base}/`, autumn: `${base}/` },
    summer2020,
    /** ★**主が持っていない 年×季節 だけ返す**（下の `add` が見る） */
    fillGapsOnly: true,
    /** ★**足した試合に付ける出所。** これが「主のもの」と見分ける印にもなる */
    gameSource: { name: "HSB flash", url: `${base}/` },
    _pages: new Map(),
  };
}

const fukuoka = hsbAdapter({
  slug: "fukuoka",
  district: "福岡",
  host: "fukuoka",
  summer2020: /がんばれ福岡\s*2020/,
});

/*
  ★★★**2026-09-02 に 鹿児島・愛媛・長崎・高知 も HSB flash へ切り替えた**（運営者の判断）。

  ★**連盟からはこれ以上取れなかった**（README の引き継ぎメモに、県ごとの理由がある）:
    鹿児島 … 紙が16枚あるのに3枚しか読めない（年ごとに組み方が違う・不戦勝・優勝校が無い）
    高知・長崎 … 連盟の日程APIが直近の年しか持っていない
    愛媛 … スコアPDFは2022年度から。それ以前は日別HTMLで別の読み手が要る

  ★★**切り替えであって、足すのではない。** 連盟の大会名と HSB flash の大会名は
  **空白の有無だけが違う**ことがあり（`第107回全国高等学校野球選手権鹿児島大会` と
  `第107回全国高等学校野球選手権 鹿児島大会`）、**両方を登録すると同じ大会が2つ並ぶ。**
  ★**生成物を消してから取り直すこと**（引き継ぎの鍵は大会名なので、そのまま走らせると古い名前が残る）。

  ★**連盟のアダプタは消していない**（`RETIRED_ADAPTERS`）。**戻すならそこを `ADAPTERS` に移す。**
*/
const kagoshimaHsb = hsbAdapter({
  slug: "kagoshima",
  district: "鹿児島",
  host: "kagoshima",
  summer2020: /^2020鹿児島県夏季/,
});

const ehimeHsb = hsbAdapter({
  slug: "ehime",
  district: "愛媛",
  host: "ehime",
  summer2020: /令和2年度愛媛県高等学校夏季野球大会/,
});

const nagasakiHsb = hsbAdapter({
  slug: "nagasaki",
  district: "長崎",
  host: "nagasaki",
  // ★★長崎だけ「夏季」の字が無い。**規則では拾えないので名指しにしてある**
  summer2020: /令和2年度長崎県高等学校野球大会/,
});

const kochiHsb = hsbAdapter({
  slug: "kochi",
  district: "高知",
  host: "kochi",
  summer2020: /^2020高知県高等学校夏季特別野球大会/,
});

/*
  ★★★**2026-09-02 その2 に 福島・広島・京都・福井 も HSB flash へ切り替えた**（運営者の判断
  「高野連サイトでは追えない部分については、他のサイトも調べて」）。

  ★**4県とも「1〜2年ぶんしか無い薄い県」で、連盟からはこれ以上取れないと確かめてある**:
    福島 … 連盟の「過去の大会記録」のPDFは**4本とも文字が1行も入っていない**（画像）
    広島 … 過去年の入口は作ったが、**2024年の紙に7試合ぶんの記載が無い**（紙のほうが足りない）。
           春季・秋季は**1段の紙**で別の読み手が要る
    京都 … 過去年は**組み合わせ表がJPG画像**か、**組み合わせ表そのものが無い**
    福井 … 添付の一覧が2024年5月ごろまでしか無く、**2025年の春は結果PDFそのものが無い**

  ★**どの県の連盟も取得を断っていない**（規約で外している6県へ広げたのではない）。
  ★★**切り替えであって、足すのではない**（大会名が空白の有無だけ違って二重に並ぶ）。
  **生成物を消してから取り直すこと。**
  ★**連盟のアダプタは `RETIRED_ADAPTERS` に置いてある**（どの紙がどう読めなかったかの記録）。
*/
const fukushimaHsb = hsbAdapter({
  slug: "fukushima",
  district: "福島",
  host: "fukushima",
  summer2020: /^令和2年度福島2020夏季高等学校野球大会/,
});

const hiroshimaHsb = hsbAdapter({
  slug: "hiroshima",
  district: "広島",
  host: "hiroshima",
  summer2020: /^2020夏季広島県高等学校野球大会/,
});

const kyotoHsb = hsbAdapter({
  slug: "kyoto",
  district: "京都",
  host: "kyoto",
  /*
    ★★京都の2020年は**ブロックに分けて**開かれた（`令和2年度夏季京都府高校野球ブロック大会`）。
    **1枚の勝ち抜きの木ではない**ので検算に落ちる見込みだが、
    **名指ししておけば「季節が決まらないので取らない」ではなく「検算で落ちた」と分かる。**
  */
  summer2020: /^令和2年度夏季京都府高校野球ブロック大会/,
});

const fukuiHsb = hsbAdapter({
  slug: "fukui",
  district: "福井",
  host: "fukui",
  summer2020: /^令和2年度夏季福井県高等学校野球大会/,
});

/*
  ★★★**2026-09-02 その3 に 大阪 も HSB flash へ切り替えた**（運営者の「作業続けて」）。

  ★**連盟からは5年ぶん（2021〜2025年）しか取れていなかった** ——
  15大会2,231試合。**2026年の紙はまだ出ていない。**
  ★**HSB flash は 2019〜2026年の25大会**を持っており、**1大会が約150校**（大阪は加盟校が多い）。
  ★★**季節ごとの大会数も年も減らない**ことを、切り替える前の生成物と突き合わせて確かめた。

  ★**長野は切り替えていない** —— HSB flash の春季は16校・秋季は24校（**支部予選のあとの県大会だけ**）で、
  **連盟の63大会1,123試合のほうが厚い。**
*/
const osakaHsb = hsbAdapter({
  slug: "osaka",
  district: "大阪",
  host: "osaka",
  // ★出典は全角の「令和２年」。**照合は `normalize` を通したあと**なので半角で書く
  summer2020: /^令和2年大阪府高等学校野球大会/,
});

/*
  ★★★**2026-09-02 その3 に 千葉 も HSB flash へ切り替えた。**

  ★**連盟からは14大会1,089試合**（2019〜2026年。**2020年が丸ごと無く、春も秋も飛び飛び**）。
  ★**HSB flash は 2019〜2026年の25大会**（夏147校・春48校・秋48校）。
  ★★**季節ごとの大会数も年も減らない**ことを、切り替える前の生成物と突き合わせて確かめた。

  ★**連盟の支部予選は元から取っていない**（ブロック表で勝ち抜きの木ではないため）。
  **切り替えで失うものは無い。**
*/
const chibaHsb = hsbAdapter({
  slug: "chiba",
  district: "千葉",
  host: "chiba",
  summer2020: /^2020夏季千葉県高等学校野球大会/,
});


/*
  ★★★**2026-09-02 その2 に 岩手・岐阜・滋賀・岡山・三重・徳島 も HSB flash へ切り替えた**
  （運営者の判断。上の4県と同じ回）。

  ★**6県とも「連盟から取り切れていない」県で、HSB flash のほうが収録年が広い**
  （どの県も過去の大会が 8年ぶん・22〜24大会ある）。**切り替えて減る年は1つも無いことを、
  切り替える前の生成物と突き合わせて確かめてある。**

    岩手   … 連盟は写真・記事の無断転載を禁じており、**出典は個人ブログ**（白球ペンギン.com）だった。
             ★**HSB flash のほうが掲示が狭く**（記事・写真のみ）、**収録も 1年 → 8年**になる
    岐阜   … 連盟の新サイトの一覧に第107回と第108回しか無く、**2024年は出典側の欠落**
    滋賀   … 令和5年度の夏（50チームに48試合）・秋（組み立てられない）が読めない
    岡山   … 連盟の日程は直近3年ぶんしか持っていない
    三重   … 箱スコアは `result_category/past/` にある年ぶんだけ
    徳島   … 連盟の日程からは季節と年が飛び飛びにしか取れない

  ★★**切り替えであって、足すのではない**（大会名が空白の有無だけ違って二重に並ぶ）。
  **生成物を消してから取り直すこと。**
  ★**連盟のアダプタは `RETIRED_ADAPTERS` に置いてある**（どの紙がどう読めなかったかの記録）。
*/
const iwateHsb = hsbAdapter({
  slug: "iwate",
  district: "岩手",
  host: "iwate",
  summer2020: /^令和2年夏季岩手県高等学校野球大会/,
});

/*
  ★★★**岐阜の夏は「ブロック＋決勝トーナメント」の紙**（2026-09-02 その2）。

  ★**同じ日の前半では読めず、切り替えを見送っていた**（「スロット番号の列が 0 本」）。
  **1枚に山が5つ（Ａ〜Ｄブロックと決勝トーナメント）縦に並ぶ紙**で、
  **左右2段組ではない**ため入口で落ちていた。
  ★**`svg-bracket.mjs` に1段の紙を足して読めるようにした**（そこの説明を読むこと）。
  ★**2020年の代替大会も同じ形**（広島・京都・岩手・岡山も同時に読めるようになった）。
*/
const gifuHsb = hsbAdapter({
  slug: "gifu",
  district: "岐阜",
  host: "gifu",
  summer2020: /^2020夏季岐阜県高等学校野球大会/,
});

const shigaHsb = hsbAdapter({
  slug: "shiga",
  district: "滋賀",
  host: "shiga",
  summer2020: /^令和2年度夏季滋賀県高等学校野球大会/,
});

const okayamaHsb = hsbAdapter({
  slug: "okayama",
  district: "岡山",
  host: "okayama",
  summer2020: /^2020夏季岡山県高等学校野球大会/,
});

/**
 * ★★★**岡山の「地区予選」だけを連盟から足す**（2026-09-04）。
 *
 * ------------------------------------------------------------------
 * ★★ なぜ主・副の2本立て（`hsbFillAdapter`）では足りないのか
 *
 *   あちらは**「主が1試合も持っていない 年×季節」**だけを足す仕組み。
 *   岡山は**主（HSB flash）が本大会を全部の年で持っている**ので、
 *   **同じ年・同じ季節にある地区予選が永久に入らない。**
 *   ★**2026-09-02 に HSB flash へ切り替えたとき、地区予選 268試合を失った**のはこれ。
 *
 * ------------------------------------------------------------------
 * ★★ 仕組み ── 「主に無い大会」だけを名前で選んで足す
 *
 *   ★**連盟のアダプタ（`okayama`。`RETIRED_ADAPTERS` にあるもの）をそのまま呼び、
 *     大会名に `地区予選` が入っているものだけ返す。**
 *   ★**本大会は1試合も返さない。** これが無いと**同じ試合が2つ入る** ——
 *     連盟と HSB flash は校名の書き方が違う（`倉敷天城` / `倉敷天城高校`）ので、
 *     **重複を落とす鍵（日付＋校名）を通り抜ける**（実測で第108回が 54 → 97試合になった）。
 *   ★★**大会名も両者で違う**（連盟`令和8年度 春季岡山県高等学校野球大会` /
 *     HSB`2026年 春季中国地区高校野球 岡山県大会`）ので、
 *     **本大会を混ぜると同じ大会が2つ並ぶ。** 地区予選の名前は主と重ならない。
 *   ★**県の出典表示は主（HSB flash）のまま**にし、
 *     **足した試合には連盟の `source` を付ける**（`hsbFillAdapter` と同じ形）。
 *
 * ★**`sectionCache` は必ず新しく持つこと**（`okayama` と共有すると取得が県をまたぐ）。
 */
const okayamaTrials = {
  ...okayama,
  // ★県の出典は主のまま。足したぶんは試合ごとの `source` で示す
  name: okayamaHsb.name,
  siteUrl: okayamaHsb.siteUrl,
  /*
    ★★★**3季とも見に行くこと。** 地区予選があるのは春季と秋季だけだが、
    **書き出しは季節ごと**なので、**見に行かなかった季節は生成物から丸ごと消える**
    （夏を外したら**主が取っていた446試合が消えた**）。
    ★**0件のときは前の内容が残る**（季節ごとの歯止め）。
    ★**`addsOnly` を立てて、そこで ⚠️ ではなく ℹ️ を出す**（夏は毎回0件なのが普通）。
  */
  addsOnly: "この出典は地区予選だけを足す",
  sectionCache: new Map(),
  async collect(ctx) {
    const games = await okayama.collect.call(this, ctx);
    const source = { name: okayama.name, url: okayama.siteUrl };
    return games
      .filter((g) => /地区予選/.test(g.tournament ?? ""))
      .map((g) => ({ ...g, source: { ...source } }));
  },
};

const mieHsb = hsbAdapter({
  slug: "mie",
  district: "三重",
  host: "mie",
  // ★出典は全角の「２０２０年」。**照合は `normalize` を通したあと**なので半角で書く
  summer2020: /^2020年三重県高等学校野球夏季大会/,
});

const tokushimaHsb = hsbAdapter({
  slug: "tokushima",
  district: "徳島",
  host: "tokushima",
  // ★徳島だけ「夏季」も西暦も入っていない（`徳島県高等学校優勝野球大会`）
  summer2020: /^徳島県高等学校優勝野球大会$/,
});

/**
 * ★**過去の大会を何年ぶん辿るか**（2026-08-24）。
 *
 * 連盟のサイトは年ごとのお知らせを残しているので、遡れば過去の大会が読める。
 * ★**増やしすぎないこと** —— 1年ぶんにつきPDFを1本取りに行くので、
 * 自動更新（1日2回）のたびに出典へ余計な負荷をかける。
 * ★**紙の形は年で変わる。** 読めない年は検算で弾かれて入らないだけで、
 * **「取れなかった」ことは警告に出る。**
 */
// ★2026-08-27 に 3 → 5（索引を3ページ見るようにしたので、2022年の大会まで届く）
const MAX_PAST_TOURNAMENTS = 5;

/**
 * 富山県高等学校野球連盟。**枝の線から読む最初の県**（2026-08-24）。
 *
 * ------------------------------------------------------------------
 * ★★ 「トーナメント表は出典にしない」の例外だが、理由が他と違う
 *
 *   京都・広島・三重・鹿児島・滋賀・和歌山・兵庫・沖縄は
 *   `slot-bracket.mjs` で**座標から枝の形を推測して**組み立てている。
 *   富山はその条件を満たさない（**スロット番号の行が無い**）ので、
 *   長いあいだ「取れない県」に置いてあった。
 *
 *   ★**この紙は枝が線として描いてある。** 赤が勝った側で、
 *   **どの枝とどの枝が1試合になるかを紙が書いている**（`vector-bracket.mjs`）。
 *   推測しないので、**石川で踏んだ「構造は合うのに相手が違う」が起きない。**
 *
 * ------------------------------------------------------------------
 * ★★ 入っているのは準々決勝まで
 *
 *   連盟はこの紙を**大会中に上書き更新**しているが、2026-08-24 時点で
 *   **準決勝・決勝は枝が黒のまま**（＝結果が入っていない）。
 *   ★**足りないぶんを推測で埋めないこと。** 連盟が更新すれば自動で入る。
 *   ★**手で入れた準決勝・決勝は `src/lib/content/regional-supplements.ts` にある**
 *   （出典が連盟ではないので生成物に混ぜない）。
 *
 * ------------------------------------------------------------------
 * ★★ 日付が無い
 *
 *   この紙には**準決勝（23日）・決勝（25日）以外に日付が1つも無い。**
 *   `date: null` で出す（`RegionalGame.date` は null を許す）。
 *   ★**推測で埋めないこと。**
 *
 * ------------------------------------------------------------------
 * ★ 規約
 *
 *   `robots.txt` は404。転載・複製・営利を制限する掲示は無い
 *   （`data/federation-sites.json` の `terms: []`。2026-08-24 に本文も確認した）。
 */
const toyama = {
  slug: "toyama",
  district: "富山",
  name: "富山県高等学校野球連盟",
  siteUrl: "https://www.toyama-hbf.jp/",
  politenessMs: 2000,
  /*
    ~~★**夏だけ。** 春季・秋季は紙の形が違うかもしれないので、測ってから足すこと~~
    → ★★**2026-09-01 その5 に測って足した。紙の形は3季ともまったく同じ**
    （石川と同じで、「違うかもしれない」は開いてみたら違わなかった）。

    ★★**春季・秋季は「年度ページ」から取る**（`?page_id=NNNN`）。
    トップに **２０１２年度〜２０２４年度**の年度ページへのリンクが並んでおり、
    各ページにその年の全部の大会のPDFが貼ってある。
    ★**夏は今までどおりお知らせの一覧（`?cat=5`）から取る** ——
    **既に読めている2大会を動かさないため**（年度ページからも取れるが、
    そちらに寄せると引き継ぎの鍵が変わる）。
  */
  seasons: {
    spring: "https://www.toyama-hbf.jp/",
    summer: "https://www.toyama-hbf.jp/?cat=5",
    autumn: "https://www.toyama-hbf.jp/",
  },
  /**
   * ★**季節ごとの大会名の形と、回数から年を出す足し算。**
   *
   *   春季 `第96回春季富山県高等学校野球大会`       = 2024 → **+1928**
   *   夏   `第107回全国高等学校野球選手権富山大会`   = 2025 → **+1918**
   *   秋季 `第77回秋季富山県高等学校野球大会`        = 2024 → **+1947**
   *
   * ★**足し算は2018〜2024年の紙で確かめてある**（春7枚・秋7枚とも一致）。
   * ★**年によっては後ろに `兼第◯回北信越地区…富山県予選` が付く**（2018〜2020年）。
   * **頭で見るので当たる。**
   */
  formOf: {
    spring: { re: /第\d+回春季富山県高等学校野球大会/, base: 1928 },
    summer: { re: /第\d+回全国高等学校野球選手権(?:記念)?富山大会/, base: 1918 },
    autumn: { re: /第\d+回秋季富山県高等学校野球大会/, base: 1947 },
  },
  async collect(ctx) {
    return ctx.season === "summer" ? this.collectSummer(ctx) : this.collectYearPage(ctx);
  },
  /**
   * ★★**年度ページから春季・秋季を取る**（2026-09-01 その5）。
   *
   * ★**トップに `<a href="?page_id=NNNN">２０２４年度</a>` が並ぶ**（全角の数字）。
   * ★**必ず外すもの**（同じページに並んでいる）:
   *   **軟式**（`第68回全国高等学校軟式野球選手権富山大会`）と
   *   **北信越地区大会**（`第151回北信越地区高等学校野球大会`。**他県の学校が出る**）。
   * ★**大会名はPDFの中の表題で決める**ので、ページの文字は「どれを開くか」だけに使う。
   */
  async collectYearPage({ fetchHtml, season, url, year }) {
    const top = await fetchHtml(url);
    if (!top) {
      console.log("  ⚠️ 富山: トップページが取れない。出典の作りが変わった可能性がある");
      return [];
    }
    let pageUrl = null;
    for (const a of top.matchAll(/<a[^>]+href="([^"]*\?page_id=\d+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const label = normalize(plain(a[2])).replace(/[\s　]/g, "");
      if (label === `${year}年度`) {
        pageUrl = new URL(a[1], url).toString();
        break;
      }
    }
    // ★**その年の年度ページが無いのはふつう**（2011年以前・当年）。黙って何も返さない
    if (!pageUrl) return [];

    const html = await fetchHtml(pageUrl);
    await sleep(this.politenessMs);
    if (!html) return [];
    /*
      ★★**リンクの文字はどれも「こちら」**なので、**リンクの手前の文**から大会名を拾う。
      ★**いちばん近い（最後の）大会名を採る**（1つの段落に複数の大会が並ぶ）。
    */
    const flat = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
    const form = this.formOf[season];
    const wanted = [];
    for (const m of flat.matchAll(/<a[^>]+href="([^"]+\.pdf)"[^>]*>/gi)) {
      const before = normalize(plain(flat.slice(Math.max(0, m.index - 400), m.index))).replace(/[\s　]/g, "");
      const names = [...before.matchAll(/第\d+回[^。・]{0,40}?大会/g)].map((x) => x[0]);
      const name = names.at(-1) ?? "";
      if (!form.re.test(name) || /軟式|北信越/.test(name)) continue;
      if (!isTargetTournament(name)) continue;
      try {
        const u = new URL(m[1], pageUrl).toString();
        if (!wanted.includes(u)) wanted.push(u);
      } catch {
        /* リンクが壊れているだけ */
      }
    }
    if (!wanted.length) return [];

    for (const pdf of wanted.slice(0, 3)) {
      const bytes = await fetchPdfBytes(pdf, { headers: UA });
      await sleep(this.politenessMs);
      if (!bytes) continue;
      const games = await this.readBracket(bytes, season, year);
      if (games?.length) return games;
    }
    return [];
  },
  async collectSummer({ fetchHtml, season, url }) {
    /*
      ★★**索引はページ送りされる**（2026-08-27）。
      1ページ目に載るのは**新しい3大会だけ**で、
      **第104回（2022年）・第105回（2023年）は2ページ目**にある。
      ★**1ページ目しか見ていなかったので、そこで打ち止めになっていた。**
      ★**増えなくなったら止める**（お知らせが尽きたら空振りを続けない）。
    */
    const posts = [];
    for (let page = 1; page <= 3; page += 1) {
      const index = await fetchHtml(page === 1 ? url : `${url}&paged=${page}`);
      if (!index) break;
      const found = dailyLinks(index, url, { hrefPattern: /\?p=\d+/ }).filter((l) =>
        /全国高等学校野球選手権富山大会/.test(l.label),
      );
      // ★**同じお知らせが各ページの「最近の投稿」欄にも出る**ので URL で畳む
      const before = posts.length;
      for (const f of found) if (!posts.some((q) => q.url === f.url)) posts.push(f);
      if (posts.length === before) break;
    }
    if (!posts.length) {
      console.log("  ⚠️ 富山: 選手権のお知らせが見つからない。出典の作りが変わった可能性がある");
      return [];
    }

    /*
      ★★**過去の年も取る**（2026-08-24）。連盟は「夏の大会」の一覧に
      **年ごとのお知らせを残している**（第108回・第107回・第106回…）ので、
      新しい順に辿れば過去の大会が読める。
      ★**読めなかった年は黙って飛ばす**（下の `readBracket` が検算で弾く）。
      **1年が読めないだけで他の年まで落とさない。**
    */
    const out = [];
    for (const post of posts.slice(0, MAX_PAST_TOURNAMENTS)) {
      const html = await fetchHtml(post.url);
      await sleep(this.politenessMs);
      if (!html) continue;
      const pdfs = dailyLinks(html, post.url, { hrefPattern: /\.pdf$/i });
      for (const pdf of pdfs.slice(0, 3)) {
        const bytes = await fetchPdfBytes(pdf.url, { headers: UA });
        await sleep(this.politenessMs);
        if (!bytes) continue;
        const games = await this.readBracket(bytes, season);
        if (games?.length) {
          out.push(...games);
          break; // その年は読めた。次の年へ
        }
      }
    }
    return out;
  },

  /**
   * 紙1枚を読む。**検算に1つでも落ちたら空**（1試合も出さない）。
   * ★`want` を渡したときは、**紙から出した年がそれと一致することも要求する**
   *   （年度ページから取るときの歯止め。新潟で「名前と中身が1年ずれる」を2度やっている）。
   */
  async readBracket(bytes, season, want = null) {
    const pages = await pdfPages(bytes.slice());
    if (!pages?.length) return null;
    const page = pages[0];
    const flat = page.lines.map((l) => normalize(l.text.replace(/\t/g, "")));

    // ★大会名の形と「回数 → 年」の足し算は季節ごと（上の `formOf`）
    const form = this.formOf[season];
    const tournament = flat.map((t) => t.match(form.re)?.[0]).find(Boolean);
    if (!tournament) return null;
    const year = Number(tournament.match(/第(\d+)回/)[1]) + form.base;
    // ★先の年の紙を掴まない（栃木で入れた歯止めと同じ。この紙は日付が無いので年で見る）
    if (year > new Date().getFullYear()) {
      console.log(`  ⚠️ 富山: 大会の年（${year}）が未来。1試合も出さない`);
      return [];
    }
    if (want != null && year !== want) {
      console.log(`  ⚠️ 富山: ${tournament} は ${year} 年で、${want} 年度のページと合わない。1試合も出さない`);
      return [];
    }

    const shapes = await readFilledShapes(bytes.slice());
    const { games, teamCount, broken } = assembleVectorBracket({
      shapes,
      page,
      // ★左右の校名は**同じ行に並ぶ**ので、列で分けて読ませる
      nameXLeft: 100,
      nameXRight: 495,
      centerX: 280,
      /*
        ★★★**得点は「列にいちばん近いもの」を採る**（2026-09-01 その5）。

        この紙は**回戦の列の間隔が 22 しかない**ので、得点を探す既定の窓（内側へ 32）が
        **隣の回戦の列まで届く。** 高さで先に選ぶと**隣の回戦の得点のほうが
        「枝の中ほど」に近いことがあり、そちらを拾っていた** ——
        **公開中の第107回に2件あった**:

            3回戦 高岡商業 3 - **5** 高岡        （紙は 3 - 1。5 は準々決勝の列から）
            3回戦 南砺福野 **0 - 0** 不二越工業  （紙は 7 - 0。5回コールドの試合）

        ★**窓を締める案は捨てた** —— 得点が列から離れている試合が読めなくなる
        （紙によって離れかたが違い、実測で壊れが 0 → 7 に増えた）。**選び方のほうを変える。**
      */
      scoreNearestColumn: true,
      /*
        ★**決勝が「勝ち色と負け色なのに真ん中が空いている」紙がある**（2024年春季）。
        `vector-bracket.mjs` の `finalColorGap` を読むこと。
        ★**接している紙（夏）はそちらが優先される**ので、いまの年は変わらない。
      */
      finalColorGap: 40,
    });
    if (!games.length) return null;
    if (broken.length) {
      console.log(`  ⚠️ 富山: 校名かスコアが読めない試合が ${broken.length} 件。1試合も出さない`);
      return [];
    }

    /*
      ★★★ 検算0: **勝った側の得点のほうが多い**（2026-09-01 その5 に足した）。

      ★**この紙は「勝った側」を枝の色から、「得点」を枝のわきの数字から読む** ——
      **別々の場所から来る**ので、**食い違ったらどちらかを読み違えている。**

      ★★**入れる前、公開中の第107回に2件あった**:

          3回戦  高岡商業 3 - 5 高岡        ← 勝った側の得点のほうが少ない
          3回戦  南砺福野 0 - 0 不二越工業  ← **5回コールドの試合が 0対0**

      **紙は 高岡商業 3 - 1 高岡／南砺福野 7 - 0 不二越工業。**
      ★**得点を探す窓（既定で列の内側へ 32）が、間隔 22 の隣の回戦の列まで届く**のが原因。
      ★**窓を締めると今度は別の試合の得点が読めなくなる**（紙によって得点の位置がばらつく）ので、
      **読み方はまだ直っていない。** ここは**誤りを画面に出さないための歯止め**。
      ★**引き分けも認めない** —— この紙は引き分けを持たない形なので、
      **同点は「読めていない」の印**（`Number("")` が 0 になる形。島根で踏んだのと同じ）。
    */
    const wrong = games.filter(
      (g) => g.winnerScore != null && g.loserScore != null && g.winnerScore <= g.loserScore,
    );
    if (wrong.length) {
      console.log(
        `  ⚠️ 富山: 勝った側の得点のほうが少ない（か同点の）試合が ${wrong.length} 件` +
          `（${wrong.map((g) => `${g.roundName} ${g.winner} ${g.winnerScore}-${g.loserScore} ${g.loser}`).join("・")}）。1試合も出さない`,
      );
      return [];
    }

    /*
      ★★ 検算1: **勝ち抜きの不変条件** —— 負けは1校につき1回まで。
      **紙の外の数字を使わない**ので、参照データの誤りに巻き込まれない。
    */
    const losses = new Map();
    for (const g of games) losses.set(g.loser, (losses.get(g.loser) ?? 0) + 1);
    const twice = [...losses].filter(([, n]) => n > 1);
    if (twice.length) {
      console.log(`  ⚠️ 富山: 2回以上負けている学校がある（${twice.map(([n]) => n).join("・")}）。1試合も出さない`);
      return [];
    }

    /*
      ★★ 検算2: **回戦ごとの試合数の算数。**
      1回戦に出た校数から、以降の回戦の試合数が一意に決まる。
      （富山2026は 39校・1回戦7試合 → 2回戦16・3回戦8・準々4）
    */
    const byRound = new Map();
    for (const g of games) byRound.set(g.round, (byRound.get(g.round) ?? 0) + 1);
    let remaining = teamCount - (byRound.get(1) ?? 0);
    for (const r of [...byRound.keys()].sort((a, b) => a - b)) {
      const played = byRound.get(r);
      if (r > 1 && played * 2 !== remaining) {
        console.log(
          `  ⚠️ 富山: ${r}回戦の試合数（${played}）が残りチーム数（${remaining}）と合わない。1試合も出さない`,
        );
        return [];
      }
      remaining = r === 1 ? remaining : remaining - played;
    }

    /*
      ★★★**春季・秋季は大会名の頭に西暦を足す**（2026-09-01 その5。宮崎・愛知と同じ）。

      **この紙は試合の日付を1つも持たない**ので、大会名から年が出せないと
      `yearOfTournament` が「年の分からない大会」として別枠に出す
      （実測：足す前は7大会が全部そこへ落ちた）。
      ★**春季・秋季の回数は県の通し番号**で、`第N回…選手権`（+1918）の規則に当たらない。

      ★**夏は足さない** —— `第107回全国高等学校野球選手権富山大会` から
      **年が導ける**ので、足すと引き継ぎの鍵とURLが変わるだけになる。
      ★★**名前を変えたら、生成物からその大会を消してから走らせ直すこと**
      （引き継ぎの鍵が大会名なので、そのままだと同じ大会が2つ入る）。
    */
    const named = season === "summer" ? tournament : `${year}年 ${tournament}`;
    return games.map((g) => ({
      // ★**この紙には日付が無い。** 推測で埋めない
      date: null,
      season,
      tournament: named,
      round: g.roundName,
      venue: null,
      teams: [
        { display: g.winner, score: g.winnerScore, won: true },
        { display: g.loser, score: g.loserScore, won: false },
      ],
    }));
  },
};

/**
 * 大阪府高等学校野球連盟（`ohbl.sakura.ne.jp`）。**41県目**（2026-08-25）。
 *
 * ------------------------------------------------------------------
 * ★ 規約（2026-08-25 確認）
 *
 *   - `robots.txt` は **404**
 *   - **転載・無断・複製・営利・著作・引用のいずれの掲示も無い**
 *   - ★★**フレーム構成なので、外側だけ見ても中身が読めない。**
 *     `menu.html` / `toppage.html` / `2-taikaikankei/*.html` /
 *     `4-kako-kiroku/*.html` を**中のフレームまで開いて**確かめた。
 *     （`data/federation-sites.json` の `terms: []` は今回は正しかったが、
 *     大分・栃木・福島では誤っていたので原文まで降りること）
 *
 * ------------------------------------------------------------------
 * ★★ 「やぐら表」——「勝ち上がりがそのまま刷ってある」表
 *
 *   `4-kako-kiroku/kako-5nen.html` に**過去5年ぶん×3季の「全試合」PDF**が並ぶ。
 *   `taikai-record/<西暦><spr|sum|aut>[-_]yagura.pdf`。
 *
 *   ★**枝を推測しない。** この紙は**勝った学校を次の列にもう一度刷る**ので、
 *   どの学校がどこまで勝ったかが紙に書いてある。組み立ては
 *   `scripts/lib/yagura-bracket.mjs` にあり、**要るのは「同じ列の隣どうしが対戦相手」だけ。**
 *
 *   ★**`slot-bracket.mjs`（座標から組む）とも `vector-bracket.mjs`（線を読む）とも別物。**
 *
 * ------------------------------------------------------------------
 * ★★ 検算は4つ。**うち2つが枝の外から来る事実**
 *
 *   1. **勝った学校は次の列にいる／負けた学校はいない**（紙の外の数字を使わない不変条件）
 *   2. 列の件数が偶数（いちばん内側を除く）
 *   3. ★**紙に刷ってある「チーム数」== 組み立てた出場校数**、かつ **試合数 = チーム数 − 1**
 *   4. ★★**連盟自身の歴代表**（`sensyuken-osaka.html` / `haru-osaka.html` /
 *      `aki-osaka.html`）が**優勝校・準優勝校・決勝スコア・準決勝進出校**を持っている。
 *      **枝とは別の場所から来る事実**なので、石川で通ってしまった
 *      「構造は合うのに決勝の相手が違う」を止められる。
 *
 *   実測（2026-08-25）:
 *     2025年夏 … 167(152) 東大阪大柏原 6-5 大阪桐蔭／準決勝 東海大仰星・履正社 → **4つとも一致**
 *     2025年春 … (147)    大阪桐蔭 6-2 履正社／準決勝 大体大浪商・関大北陽   → **4つとも一致**
 *
 * ------------------------------------------------------------------
 * ★★ いま出せるのは2大会だけ（2025年の春と夏）
 *
 *   ★**紙の形が年で変わる。** 15枚を実測して、**検算を全部通ったのは2枚。**
 *   落ちている13枚の壊れ方は3通りで、**どれも「読めていない」がはっきり出る**:
 *
 *     - 2021〜2024年の**夏** … 出場校が実際の1.6〜1.9倍に膨らむ（見出し以外にも
 *       試合でない数字が入っている）
 *     - 2021〜2024年の**春・秋** … 左右の列数が食い違う（列の束ね方が合わない）
 *     - 2023年秋 … 勝者の印 `〇` が校名に食い込む（`箕面学園〇箕面学園`）
 *
 *   ★**「だいたい合っている表」を出さない**（石川と同じ轍）。
 *   ★**落ちた大会は1試合も出さず、落ちたことをログに出す。**
 *   ★**次に触る人へ**: 紙を1枚ずつ測り直すこと。**年ごとに測ること**
 *     （このリポジトリで何度も踏んでいる）。
 *
 * ------------------------------------------------------------------
 * ★ この紙に日付は無い
 *
 *   会期（`（7月5日～7月27日）`）は刷ってあるが、**試合ごとの日付は無い。**
 *   `date: null` で出す（**推測で埋めない**。日付の無い出典は他にもある）。
 */
const osaka = {
  slug: "osaka",
  district: "大阪",
  name: "大阪府高等学校野球連盟",
  siteUrl: "http://www.ohbl.sakura.ne.jp/",
  politenessMs: 1500,
  seasons: {
    spring: "http://www.ohbl.sakura.ne.jp/4-kako-kiroku/kako-5nen.html",
    summer: "http://www.ohbl.sakura.ne.jp/4-kako-kiroku/kako-5nen.html",
    autumn: "http://www.ohbl.sakura.ne.jp/4-kako-kiroku/kako-5nen.html",
  },
  /** 季節 → ファイル名の中の綴り */
  tagOf: { spring: "spr", summer: "sum", autumn: "aut" },

  async collect({ fetchHtml, season, url, year }) {
    const index = await fetchHtml(url);
    if (!index) return [];
    /*
      ★**URLを組み立てない。** 一覧に載っているリンクだけを辿る。
      **区切りが年で違う**（`2021sum-yagura.pdf` と `2022sum_yagura.pdf`）ので、
      規則で当てにいくと片方の年が404になる。
    */
    const tag = this.tagOf[season];
    const want = new RegExp(String(year) + tag + "[-_]yagura\\.pdf$", "i");
    const href = [...index.matchAll(/href="([^"]+\.pdf)"/gi)]
      .map((m) => new URL(m[1], url).toString())
      .find((u) => want.test(u));
    // その年の紙が一覧に無ければ静かに飛ばす（過去5年ぶんしか置いていない）
    if (!href) return [];

    const bytes = await fetchPdfBytes(href, { headers: UA });
    await sleep(this.politenessMs);
    if (!bytes) return [];
    return this.readBracket(bytes, season, year);
  },

  /** 紙1枚を読む。★**検算に1つでも落ちたら1試合も出さない。** */
  async readBracket(bytes, season, year) {
    const pages = await pdfPages(bytes.slice());
    if (!pages?.length) return [];
    const page = pages[0];
    const head = pages[0].lines
      .slice(0, 4)
      .map((l) => normalize(l.text.replace(/\t/g, "")))
      .join(" ");

    /*
      大会名は紙の見出しから取る。
      ★**回数から年を組み立てないこと** —— 紙に西暦か元号が刷ってある。
        夏 `第１０７回全国高等学校野球選手権大阪大会〔令和7(2025)年〕`
        春 `令和７年度春季近畿地区高等学校野球大会大阪府予選`
        秋 `令和７年度 秋季近畿地区高校野球大会 大阪府予選`
    */
    /*
      ★**見出しの行に「主催 大阪府高等学校野球連盟」が同居している年がある**（2023年）。
      そのままだと大会名が
      `令和5年度春季近畿地区高等学校野球大会大阪府予選主催大阪府高等学校野球連盟`
      になり、画面にもURLの元にもそれが出る。**主催・後援から先を落とす。**
    */
    const tournament =
      normalize(page.lines[0]?.text.replace(/\t/g, "") ?? "")
        .replace(/\s*(主催|後援)\s*.*$/, "")
        .trim() || null;
    if (!tournament) return [];

    /*
      ★**チーム数の書き方が2通りある。**
        夏 `（参加校数 167　チーム数 152 ）`
        春 `(参加校163校　147チーム）`  ← ★**「チーム数」ではなく「147チーム」**
      片方だけ見ていて、春の検算が「紙にチーム数が無い」で飛んでいた。
    */
    const printed = head.match(/チーム数[^0-9]*(\d+)/) ?? head.match(/(\d+)\s*チーム/);
    const teamCount = printed ? Number(printed[1]) : null;

    const drop = (why) => {
      console.log("  ⚠️ 大阪: 「" + tournament + "」は " + why + "。**この大会は1試合も出さない**");
      return [];
    };

    /*
      ★★**紙に刷ってある年が、取りに行った年と一致するか。**
      ファイル名で選んでいるので普通は一致するが、**連盟が別の年の紙を
      その名前で置いたら気づけない**（栃木で「今年の紙を過去年として読む」を踏んでいる）。
      ★**この紙には試合ごとの日付が無い**ので、共通の「大会名の年と試合の年が
      食い違ったら捨てる」検算が効かない。**ここで見るしかない。**
    */
    const label = normalize(tournament);
    // 夏 `〔令和7(2025)年〕` は西暦がそのまま／春秋 `令和7年度` は元号（＋2018）
    const seireki = label.match(/[(（](\d{4})[)）]\s*年/);
    const reiwa = label.match(/令和\s*(\d+)\s*年/);
    const named = seireki ? Number(seireki[1]) : reiwa ? Number(reiwa[1]) + 2018 : null;
    if (named && named !== year) return drop(`紙の年が ${named} 年（取りに行ったのは ${year} 年）`);
    if (!named) console.log("  ⚠️ 大阪: 「" + tournament + "」から年が読めず、年の検算は未実施");

    const built = assembleYaguraBracket(page.lines);
    if (built.errors.length)
      return drop(built.errors.length + " 件の検算に落ちた（" + built.errors[0] + " ほか）");
    /*
      ★★**紙に刷ってあるチーム数と突き合わせる。**
      勝ち抜き戦なので **試合数 = チーム数 − 1** が必ず成り立つ。

      ★**不戦勝まわりの3つを足し引きする。どれも「枠はあるが試合ではない」もの。**

        `byes`              相手の欄が空の不戦勝。**枠を1つ使う**ので試合数に足す。
                            **1回戦なら出場校を1つ隠している**が、2回戦より先は
                            下の `doubleWithdrawals` で空いた枠なので隠していない
        `doubleWithdrawals` 両校が出場を取りやめた組。その先の枠が1つ空く
        `unreadable`        字が壊れて得点が読めない試合（枠も試合も在る）

      ★**刷っていない紙なら飛ばす**（無いことを理由に大会を落とさない）が、
      **飛ばしたことは必ずログに出す**（沖縄で決めた作法）。
    */
    const byes = built.byes ?? 0;
    const empties = built.doubleWithdrawals ?? 0;
    if (teamCount == null) {
      console.log("  ⚠️ 大阪: 「" + tournament + "」の紙にチーム数が無く、その検算は未実施");
    } else if (
      built.entrants + byes - empties !== teamCount ||
      built.games.length + byes !== teamCount - 1
    ) {
      return drop(
        "紙のチーム数 " + teamCount + " に対し 出場 " + built.entrants + "・試合 " + built.games.length +
          "（不戦勝 " + byes + "・両校取りやめ " + empties + "）",
      );
    }

    /*
      回戦の名前。★**内側から数える**（決勝・準決勝・準々決勝）。
      外側から数えると、シードの有無で1回戦の位置が年ごとに動く。
    */
    const last = Math.max(...built.games.map((g) => g.round));
    const nameOf = (r) => {
      const back = last - r;
      if (back === 0) return "決勝";
      if (back === 1) return "準決勝";
      if (back === 2) return "準々決勝";
      return r + "回戦";
    };

    /*
      ★★**不戦勝の試合は出さない**（2026-08-25）。

      得点の欄が `○`／`×` の試合は**行われていない**（不戦勝）。
      **枝の上では1試合ぶんの枠を使う**ので上の検算には数えるが、
      ★**得点が無いものを 0対0 として出さないこと**（島根で87件やっていた轍）。
      ★**飛ばした数はログに出す**（「出典に無い」と「こちらで外した」を見分けるため）。
    */
    if (built.walkovers || byes) {
      console.log(
        `  大阪: 「${tournament}」の不戦勝 ${built.walkovers + byes} 試合は、` +
          "得点が無いので出しません（枝の検算には数えています）",
      );
    }
    /*
      ★**字が壊れて得点が読めない試合も出さない**（2023年春に1件）。
      **勝ったのがどちらかは次の列から分かる**が、**点は分からない。**
      ★**分からないものを画面に出さない。**
    */
    if (built.unreadable) {
      console.log(
        `  大阪: 「${tournament}」の ${built.unreadable} 試合は、` +
          "紙の得点の字が壊れていて読めないので出しません",
      );
    }

    return built.games
      .filter((g) => !g.a.mark && !g.b.mark && !g.a.unknown && !g.b.unknown)
      .map((g) => ({
        // ★**この紙に試合ごとの日付は無い。** 推測で埋めない
        date: null,
        season,
        tournament,
        round: nameOf(g.round),
        venue: null,
        teams: [
          { display: g.a.name, score: g.a.score, won: g.a.score > g.b.score },
          { display: g.b.name, score: g.b.score, won: g.b.score > g.a.score },
        ],
      }));
  },
};

/*
  ★★★**連盟が持っていない年だけ HSB flash から足す4県**（2026-09-03。`hsbFillAdapter` の説明を読むこと）。

  ★**この4県は連盟のほうが古い年を持っている**ので、切り替えると年が減る:

      愛知 2015年〜 ／ 兵庫 2017年〜 ／ 富山 2014年〜 ／ 和歌山 2017年〜

  ★**HSB flash はどの県も 2019年から。** 主（連盟）が1試合も持っていない
  **年×季節だけ**を足すので、**二重にはならない。**
  ★**`ADAPTERS` では必ず主のうしろに置くこと**（主が先に生成物を書いてから読む）。
*/
const aichiHsbFill = hsbFillAdapter({
  slug: "aichi",
  district: "愛知",
  host: "aichi",
  summer2020: /^令和2年夏季愛知県高等学校野球大会/,
  primary: aichi,
});

const hyogoHsbFill = hsbFillAdapter({
  slug: "hyogo",
  district: "兵庫",
  host: "hyogo",
  summer2020: /^令和2年度夏季兵庫県高等学校野球大会/,
  primary: hyogo,
});

const toyamaHsbFill = hsbFillAdapter({
  slug: "toyama",
  district: "富山",
  host: "toyama",
  // ★富山だけ題に「夏」も「野球大会」の前の年度も無い（`TOYAMA2020高校野球大会`）
  summer2020: /^TOYAMA2020高校野球大会/,
  primary: toyama,
});

const wakayamaHsbFill = hsbFillAdapter({
  slug: "wakayama",
  district: "和歌山",
  host: "wakayama",
  summer2020: /^2020夏高校野球和歌山大会/,
  primary: wakayama,
});

/*
  ★★**同じ2本立てを、連盟が飛び飛びの県にも広げた**（2026-09-03 その2）。
  ★**主（連盟）が1試合でも持っている 年×季節 には入らない**ので、**足すだけで減らない。**
  ★**`summer2020` は2020年の代替大会の題**（県ごとにまるで違う。**名指しで拾う**）。
*/
const oitaHsbFill = hsbFillAdapter({
  slug: "oita",
  district: "大分",
  host: "oita",
  summer2020: /^2020大分県高等学校野球大会/,
  primary: oita,
});

const shimaneHsbFill = hsbFillAdapter({
  slug: "shimane",
  district: "島根",
  host: "shimane",
  summer2020: /^令和2年度島根県高等学校夏季野球大会/,
  primary: shimane,
});

const sagaHsbFill = hsbFillAdapter({
  slug: "saga",
  district: "佐賀",
  host: "saga",
  // ★佐賀の2020年は `SAGA2020SSP杯佐賀県高校スポーツ大会`（野球の字が無い）
  summer2020: /^SAGA2020SSP杯佐賀県高校スポーツ大会/,
  primary: saga,
});

const kagawaHsbFill = hsbFillAdapter({
  slug: "kagawa",
  district: "香川",
  host: "kagawa",
  summer2020: /^令和2年度香川県高等学校野球大会/,
  primary: kagawa,
});

const yamagataHsbFill = hsbFillAdapter({
  slug: "yamagata",
  district: "山形",
  host: "yamagata",
  summer2020: /^山形県高等学校野球大会2020/,
  primary: yamagata,
});

const miyazakiHsbFill = hsbFillAdapter({
  slug: "miyazaki",
  district: "宮崎",
  host: "miyazaki",
  summer2020: /^宮崎県高等学校野球大会2020/,
  primary: miyazaki,
});

const okinawaHsbFill = hsbFillAdapter({
  slug: "okinawa",
  district: "沖縄",
  host: "okinawa",
  summer2020: /^2020沖縄県高等学校野球夏季大会/,
  primary: okinawa,
});

const naraHsbFill = hsbFillAdapter({
  slug: "nara",
  district: "奈良",
  host: "nara",
  summer2020: /^令和2年度奈良県高等学校夏季野球大会/,
  primary: nara,
});

const niigataHsbFill = hsbFillAdapter({
  slug: "niigata",
  district: "新潟",
  host: "niigata",
  summer2020: /^令和2年度新潟県高等学校夏季野球大会/,
  primary: niigata,
});

const gunmaHsbFill = hsbFillAdapter({
  slug: "gunma",
  district: "群馬",
  host: "gunma",
  summer2020: /^2020年群馬県高等学校野球大会/,
  primary: gunma,
});

/*
  ★**残りの県にも同じ2本立てを広げた**（2026-09-03 その2）。
  ★**穴が「年×季節」の単位で空いているところにだけ入る**ので、**足すだけで減らない。**
*/
const ibarakiHsbFill = hsbFillAdapter({
  slug: "ibaraki",
  district: "茨城",
  host: "ibaraki",
  summer2020: /^2020年夏季茨城県高等学校野球大会/,
  primary: ibaraki,
});

const tochigiHsbFill = hsbFillAdapter({
  slug: "tochigi",
  district: "栃木",
  host: "tochigi",
  // ★栃木の2020年は「交流試合」（勝ち抜きではない）。**題を名指しして夏に入れる**
  summer2020: /^2020年栃木県高校野球交流試合/,
  primary: tochigi,
});

const saitamaHsbFill = hsbFillAdapter({
  slug: "saitama",
  district: "埼玉",
  host: "saitama",
  summer2020: /^2020夏季埼玉県高等学校野球大会/,
  primary: saitama,
});

const kanagawaHsbFill = hsbFillAdapter({
  slug: "kanagawa",
  district: "神奈川",
  host: "kanagawa",
  summer2020: /^令和2年度神奈川県高等学校野球大会/,
  primary: kanagawa,
});

const ishikawaHsbFill = hsbFillAdapter({
  slug: "ishikawa",
  district: "石川",
  host: "ishikawa",
  summer2020: /^令和2年度夏季石川県高等学校野球大会/,
  primary: ishikawa,
});

const yamanashiHsbFill = hsbFillAdapter({
  slug: "yamanashi",
  district: "山梨",
  host: "yamanashi",
  summer2020: /^2020年夏季山梨県高等学校野球大会/,
  primary: yamanashi,
});

const naganoHsbFill = hsbFillAdapter({
  slug: "nagano",
  district: "長野",
  host: "nagano",
  summer2020: /^2020年度夏季高等学校野球長野県大会/,
  primary: nagano,
});

const shizuokaHsbFill = hsbFillAdapter({
  slug: "shizuoka",
  district: "静岡",
  host: "shizuoka",
  summer2020: /^2020夏季静岡県高等学校野球大会/,
  primary: shizuoka,
});

const kumamotoHsbFill = hsbFillAdapter({
  slug: "kumamoto",
  district: "熊本",
  host: "kumamoto",
  summer2020: /^2020夏季熊本県高等学校野球大会/,
  primary: kumamoto,
});

const yamaguchiHsbFill = hsbFillAdapter({
  slug: "yamaguchi",
  district: "山口",
  host: "yamaguchi",
  summer2020: /^2020メモリアルカップ夏季高等学校野球大会/,
  primary: yamaguchi,
});

const ADAPTERS = [
  nagano,
  naganoHsbFill,
  kanagawa,
  kanagawaHsbFill,
  saitama,
  saitamaHsbFill,
  yamanashi,
  yamanashiHsbFill,
  kumamoto,
  kumamotoHsbFill,
  gunma,
  gunmaHsbFill,
  saga,
  sagaHsbFill,
  nara,
  naraHsbFill,
  niigata,
  niigataHsbFill,
  aichi,
  aichiHsbFill,
  ishikawa,
  ishikawaHsbFill,
  yamagata,
  yamagataHsbFill,
  shizuoka,
  shizuokaHsbFill,
  yamaguchi,
  yamaguchiHsbFill,
  miyazaki,
  miyazakiHsbFill,
  wakayama,
  wakayamaHsbFill,
  hyogo,
  hyogoHsbFill,
  // ★2026-08-20 に方針を変えて足した5県（omyuAdapter の説明を読むこと）
  ibaraki,
  ibarakiHsbFill,
  kagawa,
  kagawaHsbFill,
  // ★連盟ではなく個人運営のサイトが出典（埼玉・神奈川・愛知と同じ）
  shimane,
  shimaneHsbFill,
  // ★規約で外していたのは誤りだった（oita / tochigi の説明を読むこと）
  oita,
  oitaHsbFill,
  tochigi,
  tochigiHsbFill,
  // ★連盟が結果を画像でしか出していないので、連盟以外から取る（fukuoka の説明を読むこと）
  fukuoka,
  /*
    ★★**2026-09-02 に HSB flash へ切り替えた4県**（運営者の判断。上の `kagoshimaHsb` の説明を読むこと）。
    ★**連盟のアダプタは `RETIRED_ADAPTERS` に置いてある。戻すならそこから移す。**
  */
  kagoshimaHsb,
  ehimeHsb,
  nagasakiHsb,
  kochiHsb,
  /*
    ★★**2026-09-02 その2 に HSB flash へ切り替えた4県**（上の `fukushimaHsb` の説明を読むこと）。
    ★**どれも「1〜2年ぶんしか無い薄い県」で、連盟からはこれ以上取れないと確かめてある。**
    ★**連盟のアダプタは `RETIRED_ADAPTERS` に置いてある。戻すならそこから移す。**
  */
  fukushimaHsb,
  hiroshimaHsb,
  kyotoHsb,
  fukuiHsb,
  /*
    ★★**同じ回に切り替えた6県**（上の `iwateHsb` の説明を読むこと）。
    ★**どれも連盟から取り切れておらず、HSB flash のほうが収録年が広い。**
  */
  iwateHsb,
  gifuHsb,
  osakaHsb,
  chibaHsb,
  shigaHsb,
  okayamaHsb,
  // ★**地区予選だけを連盟から足す**（`okayamaTrials` の説明を読むこと）。**必ず主のうしろ**
  okayamaTrials,
  mieHsb,
  tokushimaHsb,
  // ★「スロット番号の行が無い」という記録が誤りだった（okinawa の説明を読むこと）
  okinawa,
  okinawaHsbFill,
  /*
    ★★**富山は「枝の線から読む」最初の県**（2026-08-24）。
    座標から推測して組み立てる `slot-bracket.mjs` の条件を満たさないので
    長く「取れない県」に置いてあったが、**枝が線として描いてあった。**
    福岡（SVG）と同じ考え方の、PDF版。**toyama の説明を読むこと。**
  */
  toyama,
  toyamaHsbFill,
];

/**
 * ★★★**使うのをやめたアダプタ**（2026-09-02）。**消していない。**
 *
 * ★**14県とも HSB flash に切り替えた**（`kagoshimaHsb` / `fukushimaHsb` / `iwateHsb` の説明を読むこと）。
 * ★★**戻すときは、ここから `ADAPTERS` へ移して、生成物を消してから取り直すこと**
 * （大会名が違うので、そのまま走らせると同じ大会が2つ並ぶ）。
 * ★**中の説明は捨てない。** どの紙がどう読めなかったかは、ここにしか残っていない。
 */
const RETIRED_ADAPTERS = [
  kagoshima,
  ehime,
  kochi,
  nagasaki,
  // ★2026-09-02 その2 に切り替えた10県
  fukushima,
  hiroshima,
  kyoto,
  fukui,
  iwate,
  gifu,
  shiga,
  osaka,
  okayama,
  mie,
  tokushima,
  chiba,
];
if (process.env.REGIONAL_RETIRED) ADAPTERS.push(...RETIRED_ADAPTERS);

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
  /*
    ★★**HSB flash は連盟と書き方が違う**（2026-09-02 その2）。**どれも当て推量ではない** ——
    **同じ2026年夏の同じ試合を、連盟の紙（前の出典）と HSB flash の表で突き合わせて確かめた**
    （日付・回戦・相手・スコアが1件も違わない）:

      連盟「広島商」  = HSB「広島商業」   … 広島**県立**広島商業（市立にも同名がある）
      連盟「広島工」  = HSB「広島工業」   … 広島**県立**広島工業
      連盟「広島市工」= HSB「広島市工」   … 広島**市立**広島工業（上の行と同じ表で書き分けられている）
      連盟「福山」    = HSB「市立福山」   … 福山**市立**福山（決勝 広島商 3-4 福山 ＝ 広島商業 3-4 市立福山）
      連盟「呉」      = HSB「市立呉」     … 呉**市立**呉（準決勝の相手・スコアまで一致）
      連盟「広島商船高専」= HSB「広島商船」… 広島商船高専（国立。同名は無い）

    ★**「広島商業」を県立に寄せられるのは、この突き合わせがあるからである。**
    **HSB flash 自身は県立と市立を書き分けていない**ので、
    **突き合わせの根拠が無くなったら、この行を消して結び付けないほうへ倒すこと。**
  */
  "広島\t広島商業": "hiroshimashogyo",
  "広島\t広島工業": "hiroshimakogyo",
  "広島\t市立福山": "fukuyama",
  "広島\t市立呉": "kure",
  "広島\t広島商船": "hiroshimashosen",
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
    ★**HSB flash は同じ学校を2通りに書く**（2026-09-02 その2）。
    **どちらの形も同じ生成物の中にあり、片方は規則で結び付いている**ので、
    **短いほうをここで受ける**（`庄原実` を広島で受けているのと同じ形）。

      東濃実 … `東濃実業` が8か所（結び付いている）／`東濃実` が9か所（結び付かない）
               ★`labelCandidates` が畳むのは 商業→商・工業→工・農業→農 だけで、**実業は畳まない**
  */
  "岐阜\t東濃実": "tonojitsugyo",
  /*
    徳島（2026-09-02 その2）。★**同じ出典が2通りに書く**のは岐阜と同じ:

      徳島科技 … `徳島科学技術` が3か所（結び付いている）／`徳島科技` が25か所
                 ★**切り替える前の連盟の生成物と、日付・相手・スコアで12試合が一致した**
      阿南工専 … `阿南高専` が5か所（結び付いている）／`阿南工専` が2か所
      池田辻   … 学校マスタは「池田高校辻校」。**分校を名指しできる校名は他に無い**
                 （和歌山の `日高中津` と同じ形）
  */
  "徳島\t徳島科技": "tokushimakagakugijutsu",
  "徳島\t阿南工専": "anankogyo",
  "徳島\t池田辻": "ikedatsuji",
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
  /*
    大阪（2026-08-25。41県目）。★**やぐら表は校名を大きく畳む。**

    - `工業高専` … 府内の高専は **大阪公立大学工業高専の1校だけ**なので指す先は一意
      （学校マスタで確認。`prefectural` / `kosen`）
    - `大阪教育センター附` と `府教育センター附` … **同じ1校を年で書き分けている。**
      ★**同じ大会には出ていない**ことを確かめてある（春＝前者・夏＝後者）
    - `堺市立堺` … 市立の堺高校。★**同じ紙に府立の `堺西` `堺東` も出ている**ので、
      畳めていないと取り違えかねない

    ★★**`大教大池田` と `大教大天王寺` は結び付けない。**
    大阪教育大学附属は池田・天王寺・平野のキャンパスごとに別チームで出ており、
    **同じ大会に両方が出ている**（実測）。学校マスタは
    `大阪教育大学附属高校` の1件しか持っていないので、
    **どちらを当てても「2チームが1校になる」。**
    ★**結び付けないほうが正しい**（誤った戦績を作らない）。
  */
  "大阪\t工業高専": "osakakoritsudaigakukogyo",
  "大阪\t大阪教育センター附": "kyoikusentafuzoku",
  "大阪\t府教育センター附": "kyoikusentafuzoku",
  "大阪\t堺市立堺": "osaka-sakai",
  /*
    ★`岸和田産` … **市立の岸和田市立産業高校。**
    ★**同じ紙に府立の `岸和田` も出ていて、そちらは規則で当たる**ので、
    出典が書き分けている（＝推測ではない）。
  */
  "大阪\t岸和田産": "kishiwadashiritsusangyo",
  /*
    ★過去年（2021〜2024）を足して出てきたぶん（2026-08-25）。

    - `府大工業高専` … **2022年に改称した**（大阪府立大学工業高専 → 大阪公立大学工業高専）。
      **同じ1校で、古い紙が古い名前で刷っているだけ。**
    - `市立堺` … `堺市立堺` と同じ市立の堺高校。**紙によって書き方が違う。**
    - `四条畷` … マスタは**旧字の「四條畷」**。規則の旧字体寄せに `條` が無いので当たらない。
    ★★**`千里星雲` は出典の誤植。** 大阪府立**千里青雲**高校（`senriseiun`）のこと。
      **「千里星雲」という学校は実在しない**（マスタにも無い）。同じ紙の他の年は
      `千里青雲` と正しく刷っている。**読み替える先が一意に決まるので結び付ける。**

    ★**結び付けなかったもの**（マスタに無い＝統廃合で現存しない）:
    `美原`・`かわち野`・`大阪市立`。**推測で近い名前に寄せないこと。**
  */
  "大阪\t府大工業高専": "osakakoritsudaigakukogyo",
  "大阪\t市立堺": "osaka-sakai",
  "大阪\t四条畷": "shijonawate",
  "大阪\t千里星雲": "senriseiun",
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
    /*
      ★★**生成物は JSON**（2026-08-24 に `.ts` から移した）。

      ★**ここを直し忘れて、実際にデータを失った。**
      `.ts` を読んだままだったので「前の生成物が無い」と判断され、
      **季節の引き継ぎが丸ごと効かなくなった** ——
      過去年を取った神奈川・島根・栃木が**その年だけになり、今年が消えた。**
      ★**引き継ぎは静かに効かなくなる。** 警告も例外も出ない。
      **生成物の形を変えるときは、ここを必ず一緒に直すこと。**
    */
    const file = path.join(OUT_DIR, `${slug}.json`);
    if (existsSync(file)) out = JSON.parse(readFileSync(file, "utf8"));
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
  /*
    ★★**生成物は JSON**（2026-08-24 に `.ts` から移した）。

    ★**TypeScript のリテラルにすると型検査が通らなくなる。**
    過去年を遡って集めたら**熊本2,350件・埼玉2,513件**になり、
    どちらも **TS2590**（"union type that is too complex to represent"）で落ちた。
    ★**甲子園（2,972件）と神宮で先に踏んで JSON にしてあったのと同じ限界。**
    **県ごとの上限ではなく、1ファイルの要素数の問題**なので、
    遡るほど必ずどの県も当たる。

    ★**型は読む側で1回だけ与える**（`src/lib/data/regional/loaders.ts`）。
    ★**JSONにはコメントが書けない**ので、「生成物・直接編集しない」の注記は
    `loaders.ts` の側に置いてある。
  */
  // `allGames` はベストNを数えるための作業用。生成物には出さない
  const file = `${JSON.stringify(d, null, 2)}\n`;
  const out = path.join(OUT_DIR, `${d.slug}.json`);
  writeFileSync(out, file, "utf8");
  console.log(`  書き出した: ${path.relative(ROOT, out)}（${Math.round(file.length / 1024)}KB）`);
  return true;
}

/**
 * ★★**`main()` の中から出した**（2026-08-27）。`writeCoverage` からも使うため。
 * ★**規則は `src/lib/regional-tournaments.ts` の `yearOfTournament` と同じ。**
 * **スクリプトは .mjs なので TS を import できない。変えるときは両方直すこと。**
 */
/*
  ★★**大会の年を出す。日付が無い大会があるため。**

  ★**日付だけに頼ると、前年の大会を「今季」として出す**（宮崎は秋の紙が
  前年ぶんしか無く、しかも**日付が1つも書かれていない**ので、
  「窓で切る」が効かずに**去年の決勝を『終了』として出していた**）。
  ★**日付の無い季節は珍しくない**（実測：夏7県・春3県・秋1県）ので、
  「日付が無ければ捨てる」だけでは夏に7県が地図から消える。

  順に見る。**推測はしない。決められなければ null**（＝地図に出さない）。
    1. その大会の試合に日付があれば、その年（いちばん確か）
    2. `第N回…選手権…大会` は **N + 1918**（`build-live-results.mjs` と同じ）
    3. `令和N年度` / `令和N年` は **2018 + N**
  ★**九州地区大会の「第157回」のような通し番号から年を出さないこと**
  （選手権の回数とは別の系列で、年とは関係がない）。
*/
const yearOfTournament = (name, gamesOfTournament) => {
  const dated = gamesOfTournament.map((g) => g.date).filter(Boolean).sort();
  if (dated.length) return Number(dated.at(-1).slice(0, 4));
  const t = normalize(name ?? "");
  /*
    ★★**大会名に西暦がそのまま入る形がある**（2026-08-25。大阪）。
    `令和5(2023)年度 秋季近畿地区高校野球大会 大阪府予選`。
    **`令和(\d+)年` は当たらない**（`令和5` の次が `(` なので）。
    ★**括弧の中の西暦をいちばん先に見る。** これを入れる前、大阪の2023年秋だけ
    「年が分からない大会」になっていた。
  */
  const seireki = t.match(/[(（](\d{4})[)）]/);
  if (seireki) return Number(seireki[1]);
  /*
    ★★**西暦がそのまま頭に付く形もある**（2026-08-27。宮崎の春季・秋季）。
    `2026年 第158回九州地区高等学校野球大会宮崎県予選`。
    ★**回数は九州地区大会の通し番号**で年とは関係が無く、**日付も1つも無い**ので、
    ここを見ないと**年の分からない大会**になる（同じ季節の2年ぶんが並ぶと見分けが付かない）。
    ★**括弧つきより後に見る**（`令和5(2023)年度` は括弧の中が正しい）。
    ★**規則は `src/lib/regional-tournaments.ts` にも同じものがある。両方直すこと。**
  */
  const bare = t.match(/(?:^|[^\d])(\d{4})年/);
  if (bare) return Number(bare[1]);
  /*
    ★★★**「第N回…選手権」は全国の選手権とは限らない**（2026-09-01。大分）。
    大分の県大会は `第149回大分県高等学校野球選手権大会` で、
    **149 + 1918 = 2067年**という無い年になる。
    ★**ありえない年になったら、その規則は当たっていない。** 使わずに次を見る。
    ★**規則は `src/lib/regional-tournaments.ts` にも同じものがある。両方直すこと。**
  */
  const senshuken = t.match(/第(\d+)回.*選手権/);
  if (senshuken) {
    const y = Number(senshuken[1]) + 1918;
    if (y >= 1915 && y <= new Date().getFullYear() + 1) return y;
  }
  /*
    ★**元号は「令和」だけではない**（2026-08-26。群馬の平成18年〜）。
    ★**「令和元年度」は `令和(\d+)年` に当たらない**ので `元` も受ける。
    群馬の春季・秋季は回数が選手権とは別系列なので、**ここが唯一の手掛かり**。
    ★**元号は年度。** 春（4〜5月）・夏・秋（9〜10月）はどれも暦年と一致する。
  */
  const gengo = t.match(/(令和|平成)(元|\d+)年/);
  if (gengo) return (gengo[1] === "令和" ? 2018 : 1988) + (gengo[2] === "元" ? 1 : Number(gengo[2]));
  return null;
};

/**
 * ★★**収録状況の一覧を書き出す**（2026-08-27。運営者の指示）。
 *
 * **どの県に何年ぶんのデータが入っているか**を、走らせるたびに `収録状況.md` に書き直す。
 *
 * ★★**生成物ではなく「生成物を読んだ結果」を書く。**
 * `--pref` で1県だけ走らせたときでも、**41県ぶんのJSONを読み直して**全体を出す
 * （そうしないと、1県の実行のたびに一覧がその県だけになる）。
 *
 * ★★**タイムスタンプを入れないこと。** 3時間おき・1日2回のCIが
 * **中身の無いコミットを積み続ける**（生成物にタイムスタンプを入れないのと同じ理由）。
 *
 * ★**年は暦年。** 高校野球の「年度」とは秋がずれる（`yearOfTournament` と同じ規則）。
 */
function writeCoverage() {
  /**
   * 47都道府県をJISコードの順に並べたもの。
   * ★**一覧の並びと、「収録していない県」を出すために要る。**
   * `src/lib/constants.ts` に同じ並びがあるが、**このスクリプトは .mjs なので
   * TypeScript を import できない**（`labelCandidates` と同じ事情）。
   */
  const ALL_DISTRICTS = [
    "北海道", "青森", "岩手", "宮城", "秋田", "山形", "福島",
    "茨城", "栃木", "群馬", "埼玉", "千葉", "東京", "神奈川",
    "新潟", "富山", "石川", "福井", "山梨", "長野", "岐阜", "静岡", "愛知",
    "三重", "滋賀", "京都", "大阪", "兵庫", "奈良", "和歌山",
    "鳥取", "島根", "岡山", "広島", "山口",
    "徳島", "香川", "愛媛", "高知",
    "福岡", "佐賀", "長崎", "熊本", "大分", "宮崎", "鹿児島", "沖縄",
  ];
  const SEASON_LABEL = { spring: "春", summer: "夏", autumn: "秋" };
  const SEASON_ORDER = ["spring", "summer", "autumn"];

  /** 県ごとに「年 → その年に入っている季節」を作る */
  const rows = [];
  for (const file of readdirSync(OUT_DIR).filter((f) => f.endsWith(".json"))) {
    let district;
    let games;
    try {
      const json = JSON.parse(readFileSync(path.join(OUT_DIR, file), "utf8"));
      district = json.district;
      games = json.games ?? [];
    } catch {
      continue; // 壊れた生成物は一覧から外すだけ（ここで実行を止めない）
    }
    const byTournament = new Map();
    for (const g of games) {
      const k = g.tournament ?? "";
      if (!byTournament.has(k)) byTournament.set(k, []);
      byTournament.get(k).push(g);
    }
    /** 年 → 季節の集合 */
    const years = new Map();
    let undated = 0;
    for (const [name, gs] of byTournament) {
      const year = yearOfTournament(name, gs);
      if (year === null) {
        undated += 1;
        continue;
      }
      if (!years.has(year)) years.set(year, new Set());
      for (const g of gs) years.get(year).add(g.season);
    }
    rows.push({ district, games: games.length, tournaments: byTournament.size, years, undated });
  }
  const byDistrict = new Map(rows.map((r) => [r.district, r]));

  /**
   * 年の一覧を短く書く。
   * ★**春夏秋がそろっている年は年だけ**、欠けている年は `2025(夏秋)` と季節を付ける。
   * ★**続き年で中身も同じなら `2010-2026` とまとめる**（佐賀は17年ぶんある）。
   */
  const formatYears = (years) => {
    const list = [...years.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([year, seasons]) => {
        const has = SEASON_ORDER.filter((s) => seasons.has(s));
        return { year, tag: has.length === 3 ? "" : `(${has.map((s) => SEASON_LABEL[s]).join("")})` };
      });
    const out = [];
    for (let i = 0; i < list.length; ) {
      let j = i;
      while (j + 1 < list.length && list[j + 1].year === list[j].year + 1 && list[j + 1].tag === list[i].tag) j += 1;
      const span = i === j ? `${list[i].year}` : j - i === 1 ? `${list[i].year},${list[j].year}` : `${list[i].year}-${list[j].year}`;
      out.push(span + list[i].tag);
      i = j + 1;
    }
    return out.join(" ");
  };

  const lines = [];
  lines.push("# 地方大会の収録状況");
  lines.push("");
  lines.push("★**このファイルは `scripts/build-regional-results.mjs` が生成する。直接編集しない。**");
  lines.push("生成物を取り直すたびに書き直される（`--pref` で1県だけ走らせたときも全県ぶん出る）。");
  lines.push("");
  lines.push("★**年は暦年。** 高校野球の「年度」とは秋がずれる");
  lines.push("（秋季大会は年度でいえば翌春の選考資料だが、暦の上では同じ年の9〜11月）。");
  lines.push("★**年の出し方は `yearOfTournament` と同じ** ——");
  lines.push("試合に日付があればその年、無ければ大会名の `第N回…選手権`（+1918）・`令和N年`・`(YYYY)` から出す。");
  lines.push("");

  const covered = rows.reduce((s, r) => s + r.games, 0);
  const tournaments = rows.reduce((s, r) => s + r.tournaments, 0);
  lines.push(`**${rows.length} 県 / ${tournaments} 大会 / ${covered.toLocaleString("en-US")} 試合**`);
  lines.push("");
  lines.push("| 県 | 試合 | 大会 | 年数 | 収録している年 | 抜けている年 |");
  lines.push("|---|---:|---:|---:|---|---|");
  for (const district of ALL_DISTRICTS) {
    const r = byDistrict.get(district);
    if (!r) {
      lines.push(`| ${district} | — | — | — | **収録していない** | |`);
      continue;
    }
    const ys = [...r.years.keys()].sort((a, b) => a - b);
    const missing = [];
    for (let y = ys[0]; y <= ys.at(-1); y += 1) if (!r.years.has(y)) missing.push(y);
    lines.push(
      `| ${district} | ${r.games} | ${r.tournaments} | ${r.years.size} | ${formatYears(r.years)} | ` +
        `${missing.length ? missing.join(",") : "-"} |`,
    );
  }
  lines.push("");
  lines.push("★**括弧の中は「その年に入っている季節」**（春夏秋がそろっている年は省く）。");
  lines.push("★**「抜けている年」は、収録した年の範囲の中で1試合も無い年。**");
  lines.push("遡ったあとはここを必ず見ること —— **その年の取得が一度こけただけで、");
  lines.push("警告も出ないまま丸ごと欠ける**（引き継ぎは「前の生成物にある大会」しか戻さないため）。");

  const missingDistricts = ALL_DISTRICTS.filter((d) => !byDistrict.has(d));
  if (missingDistricts.length) {
    lines.push("");
    lines.push(`## 収録していない ${missingDistricts.length} 県`);
    lines.push("");
    lines.push(`${missingDistricts.join("・")}。`);
    lines.push("");
    lines.push("★**連盟が転載・複製を制限している県。** 理由と調査の中身は");
    lines.push("README の「都道府県高野連サイトの規約調査」にある。**足す前に必ず読むこと。**");
  }

  const undated = rows.filter((r) => r.undated);
  if (undated.length) {
    lines.push("");
    lines.push("## 年が出せない大会");
    lines.push("");
    for (const r of undated) lines.push(`- ${r.district}: ${r.undated} 大会`);
    lines.push("");
    lines.push("★**日付を1つも持たず、大会名からも年が導けない大会。**");
    lines.push("県のページでは「年の分からない大会」として別枠に出る。");
  }

  writeFileSync(OUT_COVERAGE, lines.join("\n") + "\n", "utf8");
  console.log(`  書き出した: ${path.relative(ROOT, OUT_COVERAGE)}（${rows.length} 県）`);
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
      /**
       * 重複を落としつつ足す。**同じ試合が別ページに出ることがある。**
       *
       * ★★**日付を持たない出典では、鍵に大会名を入れること**（2026-08-24）。
       *
       *   富山は紙に日付が1つも無いので、鍵が `null＋校名＋校名` になり、
       *   **別の年の同じ顔合わせが1つの試合として潰れた**
       *   （2025年の2回戦が16→15になった）。
       *   ★`upcoming` で同じ罠を踏んで「鍵に大会名を必ず入れる」と決めてあったのに、
       *   **こちらには入っていなかった。**
       *
       *   ★**日付がある出典は今までどおりの鍵にする。** 大会名を足すと、
       *   **出典が同じ試合を違う大会名で2回載せていたときに重複が残る**
       *   （既存39県の生成物を変えないため、条件を分けてある）。
       *
       *   ★**日付の無い引き分け再試合は落ちる**（同じ大会・同じ回戦・同じ顔合わせ）。
       *   いまそういう出典は無い。出てきたらここを見直すこと。
       */
      /*
        ★★★**副の出典は「主の出典が持っていない 年×季節」だけを足す**（2026-09-03。`hsbFillAdapter`）。

        ★**主が1試合でも持っている年は入れない。** 混ざって同じ大会が2つの名前で並ぶより、
        **取りこぼすほうを選んでいる。**
        ★**主のものかどうかは `source` の名前で見分ける** ——
        副が足した試合には必ず `source` が付いている（愛知の CATVase と同じ形）。
        ★**主が先に走って生成物を書いている**ので、ここで読めば今回のぶんも入っている。
      */
      const coveredByPrimary = adapter.fillGapsOnly
        ? new Set(
            (previousDistrict(adapter.slug)?.games ?? [])
              .filter((g) => g.source?.name !== adapter.gameSource?.name)
              .map((g) => `${g.season}\t${g.date?.slice(0, 4) ?? yearOfTournament(g.tournament, [g]) ?? "?"}`),
          )
        : null;
      const add = (list) => {
        let added = 0;
        for (const g of list) {
          if (coveredByPrimary) {
            const y = g.date?.slice(0, 4) ?? yearOfTournament(g.tournament, [g]);
            if (coveredByPrimary.has(`${g.season}\t${y ?? "?"}`)) continue;
            // ★**足したぶんの出所を必ず書く**（県の出典は主のままなので、これが無いと嘘になる）
            g.source = { ...adapter.gameSource };
          }
          const key = g.date
            ? `${g.date}\t${g.teams[0].display}\t${g.teams[1].display}`
            : `${g.tournament}\t${g.round}\t${g.teams[0].display}\t${g.teams[1].display}`;
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
      /*
        ★★★**大会名から導ける年と、試合の日付の年が食い違ったら、その季節は捨てる**
        （2026-08-24。**新潟で実際にデータを壊してから入れた歯止め**）。

        新潟のアダプタは Excel の中身から試合を読むが、**大会名は別の場所から取る。**
        `--year 2024` で走らせると **2024年の試合に「令和8年度」の大会名が付き**、
        引き継ぎ（大会名で見分ける）が「同じ大会」と判断して
        **正しい2026年のデータを2024年のデータで上書きした。**

        ★**警告では足りない。** 上書きは静かに起き、
        **画面には「令和8年度春季」として2年前の試合が並ぶ。**
        ★**気づけたのは日付を目で見たからで、検算はどれも通っていた。**

        ★**「令和N年」「第N回…選手権」から年が出せる大会だけを見る。**
        年が導けない大会名（「秋季◯◯大会」など）は素通しする —— 出せない年を
        当てにいくと、**正しい出典まで巻き込んで捨てる。**
      */
      const mismatched = new Map();
      for (const g of seasonGames) {
        if (!g.date || !g.tournament) continue;
        const t = normalize(g.tournament);
        const senshuken = t.match(/第(\d+)回.*選手権/);
        const reiwa = t.match(/令和(\d+)年/);
        /*
          ★**大会名に西暦がそのまま入る出典がある**（2026-08-24 追加。島根）。
          `2023年春季島根県大会` `2019年代秋季島根県大会` `2024年度春季島根県大会`。
          ★**これを見ていなかったので、島根で5件の年混入を素通ししていた**
          （決め打ちURLが404のときに別の年の紙を読んでいた）。
          ★**「年代」は暦年+1**（秋）なので、下の「1年の幅を許す」でちょうど吸収される。
        */
        const seireki = t.match(/(\d{4})年/);
        /*
          ★★★**西暦を回数より先に見ること**（2026-09-01。順番が `yearOfTournament` と逆だった）。
          `2017年 第70回愛知県高等学校野球選手権大会` のように**両方入っている名前**があり、
          回数を先に見ると **70 + 1918 = 1988年** という別の年になる。
          ★**いまは日付を持たない大会ばかりで表に出ていないだけ**で、
          日付が付いた瞬間にその季節が丸ごと落ちる。**`yearOfTournament` と同じ順にそろえる。**
        */
        /*
          ★★★**「第N回…選手権」は全国の選手権とは限らない**（2026-09-01。大分）。
          大分の県大会は `第149回大分県高等学校野球選手権大会` で、
          **149 + 1918 = 2067年**という無い年になる。
          ★**その結果、大分の春季は毎回この検査に落ちて「前の内容を残す」で凍っていた**
          （画面は正しく見えるので気づきにくい）。
          ★**ありえない年になったら、その規則は当たっていない。** 使わない。
        */
        const byRound = senshuken ? Number(senshuken[1]) + 1918 : null;
        const named = seireki
          ? Number(seireki[1])
          : reiwa
            ? 2018 + Number(reiwa[1])
            : byRound !== null && byRound >= 1915 && byRound <= new Date().getFullYear() + 1
              ? byRound
              : null;
        if (named == null) continue;
        const actual = Number(g.date.slice(0, 4));
        // 年度をまたぐ大会がある（秋季は前年の秋＝同じ暦年）ので1年の幅を許す
        if (Math.abs(named - actual) > 1) {
          mismatched.set(g.tournament, `${g.tournament}（名前は${named}年・試合は${actual}年）`);
        }
      }
      if (mismatched.size) {
        console.log(
          `  ⚠️ ${season}: 大会名の年と試合の年が食い違う。**この季節は1試合も出さない**\n` +
            [...mismatched.values()].map((m) => `      ${m}`).join("\n"),
        );
        seasonGames.length = 0;
      }

      /*
        ★★**1つの大会の試合が2つ以上の暦年にまたがっていたら知らせる**（2026-08-24）。

        ★**上の検算をすり抜ける誤りがある。** 大会名から年が導けない
        （「令和N年」も「第N回…選手権」も無い）大会では年を突き合わせられない。
        **山梨で実際に見つかった** ——
          第78回春季関東地区高校野球山梨県大会 … 2026年31試合 ＋ **2023年3試合**
          第78回秋季関東地区高校野球山梨県大会 … 2025年34試合 ＋ **2024年3試合**
        どちらも**この作業より前からあった誤り**（生成物に元から入っていた）。

        ★**春（3〜5月）・夏（7〜8月）・秋（9〜10月）はどれも暦年をまたがない**ので、
        1大会が2年に分かれていたら出典の拾い過ぎを疑う。
        ★**落とさずに知らせるだけにしてある。** どちらの年が正しいかは
        紙を見ないと決められず、**機械が選ぶと逆を捨てる恐れがある。**
      */
      const byTournament = new Map();
      for (const g of seasonGames) {
        if (!g.date) continue;
        const key = g.tournament ?? "";
        if (!byTournament.has(key)) byTournament.set(key, new Map());
        const years = byTournament.get(key);
        years.set(g.date.slice(0, 4), (years.get(g.date.slice(0, 4)) ?? 0) + 1);
      }
      for (const [name, years] of byTournament) {
        if (years.size < 2) continue;
        const detail = [...years].sort((a, b) => b[1] - a[1]).map(([y, n]) => `${y}年${n}件`);
        console.log(
          `  ⚠️ ${season}: 1つの大会に複数の年が混ざっている（${name || "大会名なし"}: ${detail.join(" / ")}）。` +
            `出典の拾い過ぎの疑い。**落としていないので、紙を見て確かめること**`,
        );
      }

      const before = (previousDistrict(adapter.slug)?.games ?? []).filter(
        (g) => g.season === season,
      );
      if (seasonGames.length === 0) {
        if (before.length) {
          /*
            ★★**「特定の大会だけを足す」副のアダプタは、0件が普通の季節がある**
            （2026-09-04。`okayamaTrials` は地区予選だけを足すので**夏は必ず0件**）。
            ★**そこに ⚠️ を出すと、毎回の実行で必ず1本鳴るので本物の異常が埋もれる。**
            ★★**季節を減らして黙らせてはいけない** —— **書き出しは季節ごと**なので、
            **見に行かなかった季節は生成物から丸ごと消える**（実際に夏446試合が消えた）。
            **3季とも見に行って、0件のときに前の内容を残すのが正しい。**
          */
          if (adapter.addsOnly) {
            console.log(`  ℹ️ ${season}: ${adapter.addsOnly}（今回は0件）。前の内容を残す`);
          } else {
            console.log(
              `  ⚠️ ${season}: 前は ${before.length} 試合あったのに1試合も取れなかった。` +
                `前の内容を残す（出典側の変更なら、直すまで古いままになる）`,
            );
          }
          seasonGames.push(...before);
        }
      } else if (before.length) {
        /*
          ★★**今回取れなかった「過去の大会」は前の生成物から引き継ぐ**（2026-08-24）。

          ★**これが無いと過去年を貯められない。**
          出典はふつう**今年の紙しか置いていない**ので、毎回の実行で
          「今年ぶんを取って季節を丸ごと上書き」すると、
          **`--year 2024` で取った過去年が次の実行で消える。**
          逆に `--year` を付けた実行では**今年が消える。**

          ★**引き継ぐ単位は「大会」。** 今回取れた大会は新しいほうで置き換わるので、
          **出典が誤りを直したときはちゃんと反映される。**
          触らないのは「今回どこにも出てこなかった大会」だけ。

          ★**大会名で見分ける。** 年で見分けないのは、
          **日付を1つも持たない出典がある**ため（富山・三重・兵庫ほか9県）。

          ★**古い大会名が残り続けることがある**（山口は大会が改称された）。
          画面に出るのは「いちばん新しい大会」なので実害は出ないが、
          **「秋が去年のままではないか」は毎季たしかめること**（READMEの宿題）。
        */
        /*
          ★★★**鍵は「大会名＋年」にすること**（2026-08-27。**2県を壊してから入れた**）。

          大会名だけだと、次の2つで**前の年が静かに上書きされる**:

            ★**`tournament: null` の県がある**（実測：神奈川262試合・奈良92試合）。
              名前が無いので**どの年も同じ鍵**になる。奈良を `--year 2020〜2023` で
              走らせたら、**2014年の92試合が2023年の102試合に置き換わった。**
            ★**出典が1年ずれた名前を返す県がある**（島根）。`--year 2020` で取った試合が
              `2021年秋季島根県大会` という名前で入り、**本物の2021年秋37試合を消した。**

          ★**年は「試合の日付」から出す。大会名からではない** ——
          **名前が信用できないことがそもそもの原因**なので、名前から年を出しても意味が無い。
          ★**日付を1つも持たない出典では今までどおり大会名だけ**になる
          （富山・三重・兵庫ほか9県。鍵の後ろが空文字になるだけで、挙動は変わらない）。
        */
        /*
          ★★★**「日付が無かった試合」は、同じ名前の大会を取り直したら捨てる**
          （2026-08-30。愛知で**同じ試合が2つ**になってから入れた）。

          読み手を直して**それまで日付の無かった試合に日付が付く**と、
          鍵の年のところが空文字から西暦に変わる。すると
          **前の生成物の側が「別の大会」に見えて引き継がれ、
          準決勝2試合と決勝が二重に並んだ**（実際に並んだ）。
          ★**検算はどれも通る**（重複は勝敗の不変条件を壊さない）。
          **気づけたのは試合数を数えたから。**

          ★**日付を1つも持たない県の挙動は変わらない**（鍵の年は元から空文字で、
          名前が一致すればどちらの条件でも捨てられる）。
        */
        const carryKey = (g) => `${g.tournament ?? ""}\t${g.date ? g.date.slice(0, 4) : ""}`;
        const fresh = new Set(seasonGames.map(carryKey));
        const freshNames = new Set(seasonGames.map((g) => g.tournament).filter(Boolean));
        const carried = before.filter(
          (g) => !fresh.has(carryKey(g)) && !(g.tournament && !g.date && freshNames.has(g.tournament)),
        );
        if (carried.length) {
          const names = [...new Set(carried.map((g) => g.tournament))];
          console.log(
            `  ${season}: 過去の大会を引き継いだ（${carried.length} 試合／` +
              `${names.length} 大会: ${names.slice(0, 2).join("・")}${names.length > 2 ? "ほか" : ""}）`,
          );
          seasonGames.push(...carried);
        }
      }

      /*
        ★★**2026-08-23 に窓を外した**（運営者の「2025年の大会結果も入れて」から）。

        ~~開催中の大会だけに絞る（いちばん新しい試合から120日）~~
        → **出典が持っているぶんは全部残す。**

        ★**外した理由は、見積もりが過大だったこと。**
        README には「一覧を最後まで辿ると過去4年ぶん・47県で16MBになる」と
        書いてあったが、**これは長野の履歴の深さから外挿した数字**だった。
        ★**実測（2026-08-23・全県）では、取れる総数は 5,638試合**で、
        窓を付けた状態の 4,785試合に対して **+853試合（+18%）にすぎない。**
        **履歴を持っている出典がそもそも少ない**（22県は今年の紙しか置いていない）。

        ★**画面の側は変わらない。** 県のページは
        **いちばん新しい大会だけ**を出す（`latestSeasonGames`）。
        ★**そこを一緒に直してあること** —— 窓が無いと**1つの季節に複数の年**が
        入るので、季節だけで絞ると5年ぶんの春季大会が1大会として並ぶ。

        ★**差分が毎日出る心配は無い。** 窓は元から「今日」ではなく
        「その季節のいちばん新しい試合」を基点にしていた。**外すほうがより安定する**
        （もう試合が落ちることが無い）。
      */
      /*
        ★★★**同じ大会が2つの名前で並ぶことがある**（2026-09-02 その3。**佐賀7件・熊本1件**）。
        **出典が日ごとのページで大会名を書き分けている**ためで、実際に入っていたのは:

          「第107回全国高等学校野球選手権佐賀大会」22試合 ／「第107回全国高等学校野球佐賀大会」13試合
          「第105回全国高等学校野球選手権記念佐賀大会」7試合 ／「…選手権佐賀大会」26試合
          「第72回NHK杯佐賀県…」1試合 ／「第72回ＮＨＫ杯佐賀県…」6試合          ← **全角**
          「第143回 九州地区高等学校野球熊本大会」9試合 ／「第143回 九州地区高等学校野球 熊本大会」46試合 ← **空白**

        ★★**寄せないと、画面では1つの大会が2つに割れる**（トーナメント表も組めない）。
        ★**寄せるのは「空白・全角ラテン・選手権・記念を外すと同じになる名前」だけ。**
        **試合数の多いほうへ寄せる**（少ないほうが書き落とし）。
        ★**寄せたことは必ずログに出す** —— 出典の書き方が変わったときに気づけるように。
      */
      const canonKey = (n) =>
        (n ?? "")
          .replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
          .replace(/[\s\u3000]/g, "")
          .replace(/選手権|記念/g, "");
      const nameBuckets = new Map();
      for (const g of seasonGames) {
        if (!g.tournament) continue;
        const k = canonKey(g.tournament);
        if (!nameBuckets.has(k)) nameBuckets.set(k, new Map());
        const m = nameBuckets.get(k);
        m.set(g.tournament, (m.get(g.tournament) ?? 0) + 1);
      }
      /*
        ★★★**寄せる前に「会期の中に収まるか」を必ず見ること**（2026-09-02 その3）。

        **出典が1日ぶんのページで大会名を書き間違えていることがある** ——
        佐賀の **2026-06-05（NHK杯の決勝）** のページが
        「第108回全国高等学校野球佐賀大会」と名乗っており、
        **名前だけで寄せると、6月の試合が7月の選手権の「決勝」として並ぶ**（実際に並んだ）。
        ★**少ないほうの試合が、多いほうの会期（いちばん早い日〜いちばん遅い日）に
        収まっているときだけ寄せる。** 日付を持たない試合が混じるときは寄せない。
      */
      const spanOf = (name) => {
        const ds = seasonGames.filter((g) => g.tournament === name).map((g) => g.date);
        return ds.every(Boolean) ? [ds.slice().sort()[0], ds.slice().sort().at(-1)] : null;
      };
      const canonName = new Map();
      for (const m of nameBuckets.values()) {
        if (m.size < 2) continue;
        const best = [...m].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0];
        const span = spanOf(best);
        for (const name of m.keys()) {
          if (name === best) continue;
          const mine = spanOf(name);
          if (!span || !mine) continue;
          /*
            ★**少ないほうは「早い回戦の日」であることが多い**（出典が大会の序盤だけ別の名前で
            書いていた）ので、**会期に収まっていることまでは求めない。**
            ★★**求めるのは「離れていないこと」** —— 県大会は1か月ほどで終わるので、
            **どちらかの会期からもう一方までが1週間より離れていたら別の大会**とみなす。
          */
          const gapDays = Math.max(
            0,
            (Date.parse(mine[0]) - Date.parse(span[1])) / 86400000,
            (Date.parse(span[0]) - Date.parse(mine[1])) / 86400000,
          );
          if (gapDays > 7) {
            console.log(
              `  ⚠️ ${season}: 「${name}」は「${best}」と同じ名前に見えるが、${Math.round(gapDays)}日離れている` +
                `（${mine[0]}〜${mine[1]} / 会期 ${span[0]}〜${span[1]}）。**別の大会とみて寄せない**`,
            );
            continue;
          }
          canonName.set(name, best);
        }
      }
      if (canonName.size) {
        console.log(
          `  ℹ️ ${season}: 同じ大会が2つの名前で入っていたので寄せた（` +
            [...canonName].map(([from, to]) => `「${from}」→「${to}」`).join("、") +
            "）",
        );
        for (const g of seasonGames) {
          const to = canonName.get(g.tournament);
          if (to) g.tournament = to;
        }
      }

      /*
        ★★★**同じ試合が2つ入っていることがある**（2026-09-03 その2。実測で5件）。

        ★**重複を落とす鍵（上の `add`）は「日付＋1校目＋2校目」**なので、
        **出典が同じ試合を左右逆に載せていると落ちない**
        （静岡 2025-09-14 `袋井 6-静清 4` と `静清 4-袋井 6`）。
        ★**引き継いだぶんは `add` を通らない**ので、そこでも落ちない
        （長野の中信予選会に同じ試合が3組）。

        ★**ここで「日付＋校名2つ（並べ替え）＋得点2つ（並べ替え）」で落とす。**
        ★★**得点まで鍵に入れるのは、同じ日に同じ顔合わせが2試合ある紙があるため**
        （山梨 2023-04-19 は `富士学苑 10-甲府東 2` と `甲府東 12-富士学苑 13` の2試合が
        別の球場で行われている）。**得点が違えば別の試合として残す。**
      */
      const dupKey = (g) =>
        [
          g.date ?? "",
          ...g.teams.map((t) => t.display).sort(),
          ...g.teams.map((t) => t.score).sort((x, y) => x - y),
        ].join("\t");
      const uniq = new Map();
      for (const g of seasonGames) if (!uniq.has(dupKey(g))) uniq.set(dupKey(g), g);
      if (uniq.size !== seasonGames.length) {
        console.log(`  ℹ️ ${season}: 同じ試合が2つ入っていたので ${seasonGames.length - uniq.size} 件落とした`);
        seasonGames.length = 0;
        seasonGames.push(...uniq.values());
      }

      const kept = seasonGames;

      const dates = kept.map((g) => g.date).filter(Boolean).sort();
      const years = [...new Set(dates.map((d) => d.slice(0, 4)))];
      console.log(
        `  ${season}: ${kept.length} 試合` +
          (dates.length ? `（${dates[0]} 〜 ${dates.at(-1)}）` : "") +
          (years.length > 1 ? ` ／ ${years.length} 年ぶん` : ""),
      );
      all.push(...kept);
    }

    /*
      ★★★**同じ大会が2つの季節に分かれていることがある**（2026-09-03 その2。長野で3試合）。

      **出典の季節ごとのページが、別の季節の紙を1枚だけ拾っていた** ——
      `第153回 北信越地区高等学校野球長野県大会 中信予選会`（2025-08-31）が
      **秋季に16試合・春季に3試合**入っており、**その3試合は秋季と丸ごと重なっていた。**

      ★**大会は1つの季節に属する**ので、**試合数の多いほうの季節に寄せる。**
      ★**寄せたあとに、季節をまたいだ重複を落とす**（季節ごとの重複落としでは残る）。
      ★**日付を持たない試合は大会名と回戦まで鍵に入れる** ——
      **別の年の同じ顔合わせ・同じ得点**が落ちてしまう（富山・三重のように日付が無い出典がある）。
    */
    const seasonsOfTournament = new Map();
    for (const g of all) {
      if (!g.tournament) continue;
      if (!seasonsOfTournament.has(g.tournament)) seasonsOfTournament.set(g.tournament, new Map());
      const m = seasonsOfTournament.get(g.tournament);
      m.set(g.season, (m.get(g.season) ?? 0) + 1);
    }
    for (const [name, m] of seasonsOfTournament) {
      if (m.size < 2) continue;
      const best = [...m].sort((a, b) => b[1] - a[1])[0][0];
      console.log(
        `  ⚠️ 「${name}」が ${[...m].map(([s, n]) => `${s}${n}件`).join("・")} に分かれている。` +
          `**${best} に寄せる**（出典の季節ごとのページが別の季節の紙を拾っている）`,
      );
      for (const g of all) if (g.tournament === name) g.season = best;
    }
    {
      const key = (g) =>
        g.date
          ? [g.date, ...g.teams.map((t) => t.display).sort(), ...g.teams.map((t) => t.score).sort((x, y) => x - y)].join("\t")
          : [g.tournament, g.round, ...g.teams.map((t) => t.display).sort(), ...g.teams.map((t) => t.score).sort((x, y) => x - y)].join("\t");
      const uniq = new Map();
      for (const g of all) if (!uniq.has(key(g))) uniq.set(key(g), g);
      if (uniq.size !== all.length) {
        console.log(`  ℹ️ 季節をまたいで同じ試合が ${all.length - uniq.size} 件あったので落とした`);
        all.length = 0;
        all.push(...uniq.values());
      }
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
      /*
        ★★**収録する大会だけ残す**（2026-08-23。`isTargetTournament` の説明を読むこと）。
        **新人大会・1年生大会などは、秋に開かれても「秋季大会」ではない。**
      */
      .filter((g) => isTargetTournament(g.tournament))
      .map((g) => {
        const allowNationwide = !isPrefectureOnly(g.tournament);
        return { ...g, teams: g.teams.map((t) => decorate(t, allowNationwide)) };
      });
    const dropped = all.length - games.length;
    if (dropped) {
      const names = [...new Set(all.filter((g) => !isTargetTournament(g.tournament)).map((g) => g.tournament))];
      console.log(`  （収録対象外の大会を ${dropped} 試合外した: ${names.join("・")}）`);
    }
    /*
      ★★**2026-08-21 に方針を変えた。生成物には私立どうしの試合も残す**（運営者の判断）。

      ~~公立が絡む試合だけ残す。このサイトの切り口はそこにある~~
      → **「取るときは私立の戦績も引用し、着目するところを公立にする」**に変えた。

      ★**なぜ必要だったか。** 落とすと**トーナメント表が作れない。**
      枝が欠けるだけでなく、**その次の公立の試合に誰が上がってきたのかも辿れない**
      （落ちていたのは全4,033試合に対して私立どうしが0件＝全部落ちていた）。
      ベストNを数えるのに `allGames` を別に持っていたのも同じ理由で、
      **「表示は公立だけ／数えるのは全部」を2本のデータでやっていた。**

      ★★**画面の見え方は変えていない。** 絞り込みは表示側（`latestSeasonGames`）に移した。
      **県のページに私立どうしの試合を出すという意味ではない。**
      ★**戻すときは、表示側の絞り込みも一緒に見ること**（片方だけ戻すと画面が変わる）。
    */

    /*
      ★★**組み合わせ（まだ行われていない試合）**（2026-08-22。運営者の指示）。

      ★**結果とは別の入れ物にする。** 試合（`games`）は
      **スコアと勝敗を必ず持つ**形で、画面・トーナメント表・検算のすべてが
      それを前提にしている。**未実施の試合をそこへ混ぜると全部に波及する。**
      ★**足すだけなら、既存の4,785試合にも表示にも1バイトも影響しない。**

      ★**すでに結果が出ている組はここから落とす。**
      同じ紙が「組合せ」から「結果」へ育つので、放っておくと
      **終わった試合が「これから」として残る。**
      ★**日付ではなく「同じ2校の試合が `games` にあるか」で見る**
      （雨天順延で日付が動くため）。

      ★★**鍵に大会名を必ず入れること。** 校名だけで見ると
      **別の大会の同じ顔合わせ**に当たる（大分の秋の組合せ4試合のうち1試合が、
      春・夏に同じ2校が当たっていたために「もう終わった」と judged された）。
    */
    const upcomingRaw = adapter.collectUpcoming
      ? await adapter.collectUpcoming({ fetchHtml: get }).catch((e) => {
          console.log(`  ⚠️ 組み合わせ: ${e.message}`);
          return [];
        })
      : [];
    const pairKey = (g) =>
      [g.tournament, ...[...g.teams.map((t) => t.display)].sort()].join("\t");
    const playedKey = new Set(games.map(pairKey));
    const upcoming = upcomingRaw
      // ★組み合わせにも同じ範囲をかける（新人大会の組合せを入れない）
      .filter((g) => isTargetTournament(g.tournament))
      .map((g) => ({
        ...g,
        teams: g.teams.map((t) => {
          const { score: _s, won: _w, ...rest } = decorate(t, !isPrefectureOnly(g.tournament));
          return rest;
        }),
      }))
      .filter((g) => !playedKey.has(pairKey(g)));
    if (upcomingRaw.length) {
      console.log(
        `  → 組み合わせ ${upcoming.length} 試合（読んだ ${upcomingRaw.length} 件のうち、` +
          `結果が出ている ${upcomingRaw.length - upcoming.length} 件は落とした）`,
      );
    }

    const publicTeams = new Set(
      games.flatMap((g) => g.teams.filter((t) => t.slug).map((t) => t.slug)),
    );
    const withPublic = games.filter((g) => g.teams.some((t) => t.slug)).length;
    console.log(
      `  → ${games.length} 試合（うち公立が絡む ${withPublic} 件）/ 公立 ${publicTeams.size} 校`,
    );
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
        ★**組み合わせ（未実施）。無い県は空**（型のうえでも省略できる）。
        **`games` とは別物**なので混ぜないこと。
      */
      ...(upcoming.length ? { upcoming } : {}),
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
    /*
      ★★**1つの県にアダプタが2つあることがある**（2026-09-03。`hsbFillAdapter`）。
      **あとから走ったほうの `district` には、引き継ぎで主のぶんも入っている**
      （書き出したファイルと同じ中身）ので、**同じ slug は後勝ちで置き換える。**
      ★**足すと、抜粋も勝ち上がりもその県だけ二重に数える。**
    */
    const already = districts.findIndex((d) => d.slug === district.slug);
    if (already >= 0) districts[already] = district;
    else districts.push(district);
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

  /*
    ★★**抜粋はいちばん新しい季節だけにする**（2026-08-21。運営者の判断）。

    それまでは季節を混ぜて「公立が勝った試合を優先・新しい順」で選んでいたが、
    **夏は39県ぶん、秋は始まったばかりの数県ぶん**しか無いので、
    秋季大会が始まっても**トップには夏の選手権が並び続けた**（実測 80件中72件が夏）。

    ★**下の `spotlightSeason`（いちばん新しい試合の季節）と同じ基準で切る。**
    右カラムの「まだ負けていない公立校」と左の試合一覧が**同じ大会を指す**ようになる。
    ★**季節が変わる端境期は件数が減る**が、**古い大会が新しい顔で並ぶよりよい。**
    ★**前年の秋は入らない**（上の `pickupFrom` の窓で落ちている）。
  */
  const pickupSeason =
    districts
      .flatMap((d) => d.games)
      .filter((g) => g.date)
      .sort((a, b) => a.date.localeCompare(b.date))
      .at(-1)?.season ?? null;

  const pickups = [];
  for (const d of districts) {
    const sorted = [...d.games]
      .filter((g) => g.teams.some((t) => t.slug && !t.combined))
      .filter((g) => !pickupSeason || g.season === pickupSeason)
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
  /*
    ★**抜粋（左の試合一覧）と同じ季節を使う**（2026-08-21）。
    別々に出すと、**左が秋・右が夏**のように食い違いうる。
  */
  const spotlightSeason = pickupSeason;

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

  /*
    ★★★**0対0の試合は、同じ大会に同じ顔合わせがもう1試合あるはず**（2026-08-30 その2）。

    高校野球の引き分けは**再試合**になるので、**本物の引き分けなら必ず対になる試合がある**
    （山口の `西市 0-0 下関商`→翌日 2-3、宮崎の `小林秀峰 0-0 都城農業`→翌日 11-5）。
    ★**対が無い 0対0 は、たいてい出典の読み違いか、中断した試合の空欄を 0 と読んだもの。**
    実際にこれで**沖縄の `宮古工 0-0 美里工`**（美里工が2回戦に進んでいるのに引き分け）と
    **富山の `南砺福野 0-0 不二越工業`**（紙に片方の得点しか刷られていない）が見つかった。

    ★**落とさずに警告に留める。** 大会によっては引き分けのまま抽選で決めることもあり、
    **「対が無い＝必ず誤り」ではない。** 紙を見て判断するのは人の仕事。
    ★**`Number("") === 0` を踏んだ県は、まずここに出る**（島根87件・栃木10件・佐賀7件）。
  */
  for (const d of districts) {
    for (const g of d.allGames) {
      if (g.teams?.[0]?.score !== 0 || g.teams?.[1]?.score !== 0) continue;
      const names = g.teams.map((t) => t.display);
      const again = d.allGames.some(
        (o) =>
          o !== g &&
          o.tournament === g.tournament &&
          names.every((n) => o.teams.some((t) => t.display === n)),
      );
      if (again) continue;
      console.log(
        `  ⚠️ ${d.slug} / ${g.tournament ?? ""}: ${names.join(" 0-0 ")}` +
          `（${g.date ?? "日付なし"}）は引き分けなのに再試合が無い。出典を見ること`,
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
  /*
    ★**同じ slug のアダプタが2つあるので、ここで畳むこと**（2026-09-03）。
    畳まないと `loaders.ts` に同じ鍵が2回出て、**TypeScript が通らない**（TS1117）。
  */
  const known = [
    ...new Map(
      ADAPTERS.filter((a) => existsSync(path.join(OUT_DIR, `${a.slug}.json`))).map((a) => [a.slug, a]),
    ).values(),
  ];
  const indexFile =
    `// このファイルは scripts/build-regional-results.mjs が生成する。直接編集しない。\n` +
    `// 県のページが自分の県だけ読み込むための表。**静的 import にしないこと**\n` +
    `// （全県が1つのページに入る）。\n` +
    `//\n` +
    `// ★★県ごとのデータは **JSON**（\`<県>.json\`）。**こちらも生成物で、直接編集しない。**\n` +
    `//    TypeScript のリテラルにすると、試合が数千件で TS2590\n` +
    `//    （"union type that is too complex to represent"）になり型検査が通らない。\n` +
    `//    甲子園・神宮と同じ扱いで、**型はここで1回だけ与える。**\n\n` +
    `import type { RegionalDistrict } from "@/lib/regional-results";\n\n` +
    `export const REGIONAL_LOADERS: Record<string, () => Promise<RegionalDistrict>> = {\n` +
    known
      .map(
        (a) =>
          `  ${a.slug}: () => import("./${a.slug}.json").then((m) => m.default as RegionalDistrict),\n`,
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
  /*
    ---- 収録状況の一覧 ----
    ★★**生成物を読み直して作る**ので、`--pref` で1県だけ走らせたときも全県ぶん出る。
    ★**`--pref` で抜ける前に呼ぶこと** —— あとに置くと、
    **1県だけ走らせたときに一覧が更新されない**（実際にそうなっていた）。
  */
  writeCoverage();

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

  /*
    ------------------------------------------------------------------
    ★★ タイル地図に出す「今季の進捗」（2026-08-22 に追加）
    ------------------------------------------------------------------

    47地区ぶんの1行だけを書き出す。**県ごとのファイルは読まない。**

    ★**季節は全国で1つ**（`pickupSeason`）。県ごとに別の季節を出すと、
    **地図の中で夏と秋が混ざって「どの大会の一覧なのか」が言えなくなる。**

    ★★**その季節の試合が「無い」には2種類ある。区別して書き出すこと。**

      （この生成物に**行が無い**）… その地区の出典をまだ読んでいない（39県の外の地区）
      `pending`                  … 出典はあるが、その季節の試合がまだ取れていない

    **画面で同じ見た目にすると「まだ始まっていない」と「取れていない」が
    混ざる。** 秋は始まったばかりで `pending` が大半になるので、ここは効く。

    ★**47地区の一覧はここに持たない。** 地区マスタ（`src/lib/constants.ts` の
    `PREFECTURES`）はTypeScriptにあり、このスクリプト（.mjs）からは読めない。
    **画面側が49地区を並べ、この表に無い地区を「未対応」として描く。**
    ★**マスタを2か所に持たないこと**（ずれたら地図が欠ける）。

    ★**前年の同じ季節を「今季」として数えない。** 抜粋と同じ窓（`pickupFrom`）で切る。
    切らないと、秋のページが前年ぶんしか無い県が**去年の決勝を「終了」として出す。**
  */
  /** 回戦の深さ。深いほど大きい。`ROUND_ORDER` はこの上で定義済み */
  const depthOf = (round) => {
    const i = ROUND_ORDER.indexOf(round ?? "");
    return i < 0 ? -1 : i;
  };
  /** 地図が示す年。いちばん新しい試合の年 */
  const boardYear = newestOverall ? Number(newestOverall.slice(0, 4)) : null;

  const progress = districts.map((d) => {
    const pending = { slug: d.slug, district: d.district, state: "pending" };
    /*
      ★**全試合から数える**（私立どうしも含む）。進捗は大会の進み具合なので、
      公立が絡むかどうかは関係がない。**画面に出す試合の数は別に持つ。**
    */
    /*
      ★**組み合わせだけ出ている県は「開幕予定」として出す**（2026-08-22）。
      **試合はまだ0件でも「これから始まる」ことは分かっている**ので、
      「まだ試合がありません」と同じ見た目にしない。
    */
    const seasonGames = d.games.filter((g) => g.season === pickupSeason);
    if (!seasonGames.length) {
      const soon = (d.upcoming ?? []).filter((g) => g.season === pickupSeason);
      if (!soon.length) return pending;
      return {
        slug: d.slug,
        district: d.district,
        state: "scheduled",
        season: pickupSeason,
        tournament: soon[0].tournament ?? null,
        /** 開幕日（組み合わせのいちばん早い試合） */
        opensOn: soon.map((g) => g.date).filter(Boolean).sort()[0] ?? null,
        games: soon.length,
      };
    }

    /*
      ★★**大会ごとに分けてから、1つだけを見る。**
      **1つの季節に複数の大会が並ぶ県がある**（徳島の秋は**5つ**あり、
      ブロック大会4つと新人中央大会が同じ季節に入っている）。
      まとめて数えると、**ブロック予選の決勝で県全体が「終了」になる**
      （実際に徳島がそうなった）。

      ★★**選ぶのは「最後の試合がいちばん新しい大会」。試合数の多い大会ではない。**
      徳島のブロック大会は7試合で 8/13 に終わっており、
      いま動いている新人中央大会は**4試合で 8/21**。
      試合数で選ぶと**終わったブロック大会を「県の今季」として出す。**
      ★**これはサイトの他の場所と同じ決め方**（`results-slot.ts` の
      「最後の試合が新しいほうを出す」、`spotlightSeason` の「いちばん新しい試合の季節」）。
      ★**日付がどこにも無い県だけ、試合数のいちばん多い大会に落とす。**
    */
    const byTournament = new Map();
    for (const g of seasonGames) {
      const k = g.tournament ?? "";
      if (!byTournament.has(k)) byTournament.set(k, []);
      byTournament.get(k).push(g);
    }
    const newestOf = (gs) => gs.map((g) => g.date).filter(Boolean).sort().at(-1) ?? "";
    const [tournament, games] = [...byTournament.entries()].sort(
      (a, b) => newestOf(b[1]).localeCompare(newestOf(a[1])) || b[1].length - a[1].length,
    )[0];

    // ★**今季のものでなければ出さない**（前年の大会を「今季」として並べない）
    const year = yearOfTournament(tournament, games);
    if (year === null || (boardYear !== null && year !== boardYear)) return pending;

    const finalGame = games.find((g) => g.round === "決勝");
    const deepest = games.reduce((a, b) => (depthOf(b.round) > depthOf(a.round) ? b : a));
    const champ = finalGame?.teams.find((t) => t.won) ?? null;
    return {
      slug: d.slug,
      district: d.district,
      state: finalGame ? "done" : "playing",
      season: pickupSeason,
      tournament: tournament || null,
      games: games.length,
      publicGames: games.filter((g) => g.teams.some((t) => t.slug)).length,
      /** いちばん深い回戦。「4回戦」「準決勝」「決勝」 */
      round: deepest.round ?? null,
      latestDate: games.map((g) => g.date).filter(Boolean).sort().at(-1) ?? null,
      /** 優勝校。**決勝が読めたときだけ。**私立なら slug は null */
      champion: champ ? { display: champ.display, slug: champ.slug ?? null } : null,
    };
  });

  /*
    ★**進捗の生成物を組み立てる。**

    `generatedAt` は**中身が変わったときだけ**新しくする。詳しくは下の
    `keepStampIfUnchanged` を読むこと。
  */
  const renderProgress = (board) =>
    `// このファイルは scripts/build-regional-results.mjs が生成する。直接編集しない。\n` +
    `// タイル地図に出す「今季の進捗」。**47地区ぶんの1行だけ**（県ごとの試合は別ファイル）。\n\n` +
    `import type { RegionalProgressBoard } from "@/lib/regional-results";\n\n` +
    `export const REGIONAL_PROGRESS: RegionalProgressBoard = ${JSON.stringify(
      board,
      null,
      2,
    )};\n`;

  const board = {
    season: pickupSeason,
    latestDate,
    /*
      ★**データが最後に変わった時刻**（2026-08-28 追加。`app/regional/page.tsx` が出す）。
      ★★**`latestDate`（最後の試合の日）とは別物。**
      大会の谷間や雨天中止で何日も試合が無いと、`latestDate` だけでは
      **サイトが止まっているように見える。**
      ★**秒より下は落とす**（差分を読むときに邪魔になるだけ）。
    */
    generatedAt: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    districts: progress,
  };
  const progressFile = keepStampIfUnchanged(renderProgress, board);
  writeFileSync(OUT_PROGRESS, progressFile, "utf8");
  const counted = progress.filter((p) => p.state === "playing" || p.state === "done").length;

  console.log(
    `  書き出した: ${path.relative(ROOT, OUT_PROGRESS)}` +
      `（${counted} 地区に今季の試合あり／終了 ${progress.filter((p) => p.state === "done").length}）`,
  );

}

/**
 * 生成物の時刻印を、**中身が変わったときだけ**新しくする。
 *
 * ------------------------------------------------------------------
 * ★★**時刻を素直に書くと、CIが中身の無いコミットを積み続ける。**
 *
 * 地方大会の更新は1日2回走る。時刻をそのまま書くと**試合が1つも
 * 増えなかった日でもファイルが変わる**ので、毎日2つの空コミットが積まれる。
 * これはこのリポジトリが繰り返し避けてきたこと
 * （「抜粋のシャッフルは表示時にやる」「1試合も取れなかった県は書き換えない」）。
 *
 * ★**そこで「時刻以外が前と同じなら、前の時刻を据え置く」。**
 * 画面に出る「最終更新」は**データが最後に変わった日時**という意味になり、
 * 空コミットは1つも積まれない。
 *
 * @param render 生成物の全文を作る関数
 * @param board  `generatedAt` を持つ生成物の中身
 */
function keepStampIfUnchanged(render, board) {
  const next = render(board);
  if (!existsSync(OUT_PROGRESS)) return next;
  const prev = readFileSync(OUT_PROGRESS, "utf8");
  const stamp = prev.match(/"generatedAt": "([^"]+)"/)?.[1];
  if (!stamp) return next;
  // ★**前の時刻を差し込んで全文が一致するか**で「中身が同じ」を判定する
  return render({ ...board, generatedAt: stamp }) === prev ? prev : next;
}

await main();
