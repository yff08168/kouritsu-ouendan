/**
 * fetch-koshien-wikipedia.mjs が貯めた大会別記事を解析して
 * data/koshien-appearances.json を作る。
 *
 *   node scripts/build-koshien-seed.mjs
 *
 * 出力は「大会 → 出場校 → 成績」の素の形。学校マスタとの照合とSQL生成は
 * 次の段階（match-koshien.mjs）で行う。ここでは Wikipedia の中身を
 * そのまま構造化することだけに専念する。
 *
 * ------------------------------------------------------------------
 * 記事の形は一つではない。206大会を通して見たところ次の書式が混在している。
 *
 * 【出場校の書き方】3種類
 *   (A) 表・地区が先（近年の夏）
 *       |[[全国高等学校野球選手権千葉大会|千葉]]||[[千葉県立銚子商業高等学校|銚子商]]||2年連続8回目
 *   (B) 表・学校が先（古い春）※ 列の順序が (A) と逆
 *       |[[広陵高等学校 (広島県)|広陵中]]||[[広島県|広島]]||2年連続2回目
 *   (C) 箇条書き（第36回夏あたり）
 *       * [[北海高等学校|北海]]（[[北海道]]、2年連続18回目）
 *
 *   列の位置に頼ると (A) と (B) で取り違えるので、**位置ではなくリンク先が
 *   学校の記事かどうかで判定する。** 都道府県（[[広島県|広島]]）や
 *   地方大会（[[全国高等学校野球選手権千葉大会|千葉]]）は末尾で除ける。
 *
 * 【試合結果の書き方】2種類
 *   (a) 箇条書き（近年）
 *       * 銚子商 6 - 0 平安
 *       * 東海大相模 3x - 2 土浦日大（延長16回）        ← x はサヨナラ
 *       * [[記事名|鹿児島実 5 - 4 東海大相模（延長15回）]]  ← 丸ごとリンクのことがある
 *   (b) トーナメント表テンプレート（古い大会と一部の近年）
 *       {{Round16 no third
 *       |RD1=1回戦
 *       ||'''広陵中'''|'''11'''|静岡中|1
 *       |（延長12回）|'''松本商'''|'''5x'''|高松商|2      ← 2列目は日付や注記
 *       |RD2=準々決勝
 *       }}
 *       区切ったときの3〜6番目が「校名・得点・校名・得点」で、これは
 *       Round16 でも Round8 seed でも同じ。RD*= から回戦名が取れる。
 *
 *   どちらの書式でも決勝は {{Linescore}} で別に書かれていることがある。
 *
 * ------------------------------------------------------------------
 * 照合キーについて
 *
 * 代表校はウィキリンクになっていて、リンク先が学校記事の正式名称になっている。
 * 「銚子商」ではなく「千葉県立銚子商業高等学校」で照合できるので、
 * 表示名で突き合わせるより桁違いに安全。しかも統廃合・改称した学校は
 * リンク先が現存校の記事になっている（秋田市立→秋田県立秋田中央高等学校、
 * 一関商工→一関学院高等学校）。「現存校に引き継ぐ」という方針と一致する。
 *
 * 試合結果のほうは短縮名なので、同じ記事の代表校表で作った
 * 「短縮名 → 記事名」の対応で引く。記事の中で閉じるので取り違えが起きない。
 *
 * ------------------------------------------------------------------
 * result（到達段階）の決め方
 *
 * 「準々決勝」「準決勝」「決勝」は独立した小見出しになっているので確実に取れる。
 * 一方それ以前は、近年の記事では「=== 1回戦 - 3回戦 ===」とまとめられていて、
 * 見出しから何回戦かを決められない。シードや不戦勝もあるため勝ち数からも
 * 逆算できない。**分からないことを分かったように書かない**ため、
 * 4強より下は「初戦敗退」「N勝」という、数えた事実だけで言える形にする。
 * 詳しい内訳は wins / losses に入るので情報は落ちない。
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE_DIR = path.join(ROOT, "data", "wikipedia-cache");
const OUT = path.join(ROOT, "data", "koshien-appearances.json");

/**
 * <ref>…</ref> と <ref …/> を消す。校名の直後に付いていて解析を壊す。
 *
 * **必ず節まるごとに掛けること。行ごとに掛けてはいけない。**
 * <ref> は改行をまたぐことがあり、行単位だと閉じタグが見つからず消せない。
 * 第85回夏（2003年）の 1回戦にこの形がある:
 *
 *   |8月9日（1）：<ref>8月8日（第2試合）：…ノーゲームが宣告された。
 *   {{Linescore
 *   …
 *   }}</ref>|駒大苫小牧|2|'''倉敷工'''|'''5'''
 *
 * 行単位で消すと最後の行が「}}」で始まるため、トーナメント表の途中で
 * 表が終わったと誤判定し、**そのブロックの残りの試合をすべて取りこぼす。**
 * 節まるごとに消せば前後がつながって1行の正しい表の行になる。
 */
function stripRefs(s) {
  return s.replace(/<ref[^>]*\/>/g, "").replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "");
}

/**
 * 注釈テンプレート（{{Efn|…}} {{Refnest|…}}）を入れ子ごと消す。
 *
 * これらは中に「|」を含む。トーナメント表の行は「|」で区切って読むので、
 * 消さないまま分割すると列がずれ、**その試合が丸ごと落ちる。**
 *
 *   |8月19日（4）|作新学院|7|'''高松商'''{{Efn|name="reiwa"}}|'''10'''
 *
 * 得点であるはずの位置に「name="reiwa"」が来て数値にならない。
 * 2021年夏の高岡商・2022年春の丹生/只見・2022年夏の県岐阜商・
 * 1989年春の宇都宮工・2008年夏の日田林工がこれで落ちていた。
 *
 * 中に <ref> を含むことがあるので **stripRefs のあとに掛ける。**
 * {{Linescore}} や {{Round8 seed}} は消してはいけないので、名前で絞る。
 */
const NOTE_TEMPLATES = /^(efn|refnest|sfn|r|注|注釈|要出典)$/i;

function stripNoteTemplates(s) {
  let out = "";
  let i = 0;
  while (i < s.length) {
    if (s[i] === "{" && s[i + 1] === "{") {
      const name = /^\{\{\s*([^|}\s]*)/.exec(s.slice(i))?.[1] ?? "";
      if (NOTE_TEMPLATES.test(name)) {
        // 対応する }} まで飛ばす（入れ子を数える）
        let depth = 0;
        let j = i;
        while (j < s.length) {
          if (s[j] === "{" && s[j + 1] === "{") {
            depth++;
            j += 2;
          } else if (s[j] === "}" && s[j + 1] === "}") {
            depth--;
            j += 2;
            if (depth === 0) break;
          } else {
            j++;
          }
        }
        i = j;
        continue;
      }
    }
    out += s[i];
    i++;
  }
  return out;
}

/**
 * スコアの区切りに使われるダッシュ類。**記事によって文字が違う。**
 * 第44回選抜（1972年春）は全角ハイフン U+FF0D「－」だけを使っており、
 * ASCIIハイフンしか見ていなかったため **この大会の試合を1件も読めず、
 * 出場27校のうち26校が成績不明になっていた。**
 * 一覧: - ‐ ‑ ‒ – — ― − －
 */
const DASH = "[-\\u2010\\u2011\\u2012\\u2013\\u2014\\u2015\\u2212\\uFF0D]";
const SCORE_CELL_RE = new RegExp(`^(\\d+)x?\\s*${DASH}\\s*(\\d+)x?$`);
/**
 * 箇条書きの試合行。「（校名）（得点）－（得点）（校名）」。
 *
 * 気を付ける点が3つある。
 *  1. 先頭に「8月18日」のような日付が付く大会がある（第1回夏など）。読み飛ばす。
 *  2. 得点の前に空白が無いことがある。第54回夏の「海星（長崎）2 - 0 海星（三重）」。
 *     校名が「）」で終わるときは空白なしでも区切れることにする。
 *  3. **末尾の（…）を機械的に注記とみなしてはいけない。**「（延長12回）」は注記だが
 *     「（長崎）」は校名の一部。ここでは落とさずに校名として残し、
 *     引けなかったときだけ注記とみなして落とす（summarize の lookupKey）。
 */
const BULLET_GAME_RE = new RegExp(
  `^(?:\\d+月\\d+日\\s+)?(.+?)(?:\\s+|(?<=）))(\\d+)x?\\s*${DASH}\\s*(\\d+)x?\\s+(.+?)\\s*$`,
);

/** [[記事|表示]] → 表示、[[記事]] → 記事。'''強調''' も落とす。 */
function stripLinks(s) {
  return stripRefs(s)
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/'''/g, "")
    .replace(/''/g, "");
}

/**
 * リンク先が学校の記事か。
 * 「全国高等学校野球選手権千葉大会」も「高等学校」を含むので、
 * 含むかではなく**末尾が何か**で見る（大会・連盟・都道府県を落とす）。
 */
function looksLikeSchool(article) {
  const a = article.replace(/\s*[（(][^）)]*[）)]\s*$/, "").trim(); // 曖昧さ回避を外す
  if (/(大会|連盟|野球部|一覧)$/.test(a)) return false;
  // 「東海大学付属相模高等学校・中等部」「沼津市立沼津高等学校・中等部」のように
  // 中等部で終わる記事名がある。高等部・初等部も同様。
  return /(高等学校|高等専門学校|高等部|中等部|初等部|中等教育学校|中学校|学校)$/.test(a);
}

/** 見出し名にマッチする節を、次の同レベル以上の見出しまで切り出す */
function section(text, namePattern) {
  const re = new RegExp("^(=+)\\s*(" + namePattern + ")\\s*=+\\s*$", "m");
  const m = text.match(re);
  if (!m) return null;
  const level = m[1].length;
  const start = m.index + m[0].length;
  const rest = text.slice(start);
  const next = rest.search(new RegExp("^={1," + level + "}[^=]", "m"));
  return next < 0 ? rest : rest.slice(0, next);
}

/** Infobox から開催年を取る */
function parseYear(wikitext) {
  const m = wikitext.match(/^\s*\|\s*year\s*=\s*(\d{4})/m);
  return m ? Number(m[1]) : null;
}

/**
 * 出場校（代表校）を読む。
 * 表の列の位置に頼らず、行の中のウィキリンクのうち学校記事を指すものを拾う。
 * (A)(B)(C) いずれの書式でも同じ扱いになる。
 */
function parseTeams(wikitext) {
  // 夏は「代表校」、春は「選出校」または「出場校」。大会によって揺れる。
  const sec = section(wikitext, "代表校|出場校|選出校|出場校・地区");
  if (!sec) return { teams: [], warning: "代表校/出場校/選出校の節が無い" };

  const teams = [];
  const seen = new Set();

  for (const rawLine of sec.split("\n")) {
    const trimmed = rawLine.trim();
    const line = stripRefs(trimmed);
    // 表の行か箇条書きの行だけを見る（地の文から拾わない）
    if (!line.startsWith("|") && !line.startsWith("*")) continue;
    if (line.startsWith("|-") || line.startsWith("|}") || line.startsWith("|+")) continue;

    const links = [...line.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)];
    const schoolLinks = links.filter((m) => looksLikeSchool(m[1]));
    if (schoolLinks.length !== 1) continue; // 0件＝学校行でない / 2件以上＝曖昧なので拾わない

    const article = schoolLinks[0][1].trim();
    const short = (schoolLinks[0][2] ?? schoolLinks[0][1]).trim();
    if (seen.has(article)) continue; // 同じ学校が2度書かれている行は1回だけ
    seen.add(article);

    // 同じ行にある「2年連続8回目」「初出場」を拾う
    const plain = stripLinks(line);
    const am = plain.match(/(?:\d+年(?:連続|ぶり))?\s*(?:\d+回目|初出場)/);

    /**
     * その学校を他校と区別するための呼び分け（都道府県名など）の候補。
     * **短縮名が他校とぶつかったときにだけ使う。**
     *
     * 第36回選抜（1964年）は和歌山と徳島の両方から「海南高校」が出ていて、
     * 記事は試合結果で「和歌山海南」「徳島海南」と書き分けている。
     * 第54回夏（1972年）は三重と長崎の「海星」が対戦していて「海星（長崎）」。
     *
     * 出どころが1つだと足りない。同じ行の地区リンクは
     * 「三岐」「西九州」のような**地方大会名**のことがあり、記事本文が使う
     * 「三重」「長崎」と一致しない。記事名のほうから
     * 「海星中学校・高等学校 (三重県)」「和歌山県立海南高等学校」も見る。
     */
    const prefs = new Set();
    const paren = article.match(/[（(]\s*([^）)]+?)[都道府県]\s*[）)]\s*$/);
    if (paren) prefs.add(paren[1].trim());
    const setter = article.match(/^(.+?)[都道府県]立/);
    if (setter) prefs.add(setter[1].trim());
    const other = links.find((m) => !looksLikeSchool(m[1]));
    if (other) prefs.add((other[2] ?? other[1]).replace(/[都道府県]$/, "").trim());

    /**
     * 棄権・出場辞退。**試合をしていないので勝敗では表せない。**
     * 第8回夏（1922年）の新潟商は「選手の罹患による棄権。出場回数は
     * カウントされている」と注記されており、1試合も行っていない。
     * 注記は <ref> や {{Efn}} の中なので、剥がす前の行で見る。
     *
     * **行に「辞退」があるだけで辞退と決めてはいけない。** 繰り上げ出場した
     * 学校の注記は「**他校の**出場辞退により繰り上げ出場」と書かれていて、
     * 辞退したのはその学校ではない。2022年春の近江（京都国際の辞退による
     * 繰り上げ・準優勝）などがこれで誤判定になる。
     * そこで「注記の中で辞退に触れており、かつ**他校を挙げていない**」ものに絞る。
     * さらに summarize 側で「1試合もしていない」ことも条件にする。
     */
    const noteTexts = [
      ...trimmed.matchAll(/<ref[^>]*>([\s\S]*?)<\/ref>/g),
      ...trimmed.matchAll(/\{\{\s*[Ee]fn[^|}]*\|([\s\S]*?)\}\}/g),
    ].map((m) => m[1]);
    const withdrew = noteTexts.some(
      (n) => /(棄権|出場辞退|参加を辞退|出場を辞退)/.test(n) && !n.includes("[["),
    );

    teams.push({
      article,
      short,
      prefs: [...prefs].filter(Boolean),
      withdrew,
      appearanceText: am ? am[0].trim() : null,
    });
  }
  return { teams, warning: teams.length === 0 ? "出場校を1件も読めなかった" : null };
}

/**
 * 試合結果を読む。返すのは { winner, loser, round } の配列。
 * round は独立した小見出しがあるときだけ入る（決勝・準決勝・準々決勝）。
 */
function parseGames(wikitext) {
  const raw = section(wikitext, "試合結果|組み合わせ・試合結果|組合せ・試合結果");
  if (!raw) return { games: [], warning: "試合結果の節が無い" };

  // **行に分ける前に、節まるごとから注記を消す。**
  // <ref> も {{Efn}} も改行や「|」を含んでいて、残したまま行単位で読むと
  // 表の列がずれる・表の途中で表が終わったと誤判定する。理由は各関数の説明にある。
  const sec = stripNoteTemplates(stripRefs(raw));

  const games = [];
  /** 出場辞退・不戦敗になった学校（短縮名）。試合はしていない。 */
  const walkoverLosers = new Set();
  const seen = new Set();
  let round = null;        // 小見出し（=== 準決勝 ===）から
  let bracketRound = null; // トーナメント表テンプレートの RD*= から
  let inBracket = false;

  const add = (a, na, b, nb, r) => {
    if (!a || !b) return;
    if (!Number.isFinite(na) || !Number.isFinite(nb)) return;
    if (na === nb) return; // 引き分け再試合。両者に勝敗を付けない
    const g = na > nb ? { winner: a, loser: b, round: r } : { winner: b, loser: a, round: r };
    const key = `${g.winner}|${g.loser}|${r ?? ""}`;
    if (seen.has(key)) return; // 同じ試合が2つの書式で書かれている場合の重複を防ぐ
    seen.add(key);
    games.push(g);
  };

  const normalizeRound = (name) =>
    /^(決勝|準決勝|準々決勝)$/.test(name) ? name : null;

  for (const rawLine of sec.split("\n")) {
    const line = rawLine.trim();

    const head = line.match(/^=+\s*([^=]+?)\s*=+$/);
    if (head) {
      round = normalizeRound(head[1].trim());
      continue;
    }

    // --- (b) トーナメント表テンプレート ---
    if (/^\{\{\s*Round\d/i.test(line)) {
      inBracket = true;
      bracketRound = null;
      continue;
    }
    if (inBracket && line.startsWith("}}")) {
      inBracket = false;
      bracketRound = null;
      continue;
    }
    if (inBracket) {
      const rd = line.match(/^\|\s*RD\d+\s*=\s*(.*)$/);
      if (rd) {
        bracketRound = normalizeRound(stripLinks(rd[1]).trim());
        continue;
      }
      // |注記|校名|得点|校名|得点  → 区切った3〜6番目
      if (line.startsWith("|")) {
        // **分割の前にリンクを外す。** [[記事|表示]] の中の「|」で列がずれる。
        //   |8月16日（1）：[[宇治山田商業対佐賀北延長15回引き分け再試合|再試合]]|宇治山田商|1|…
        // これを外さないと 2007年夏の宇治山田商の試合が読めない。
        const f = stripLinks(line).split("|").map((x) => x.trim());
        if (f.length >= 6) {
          // 不戦勝・不戦敗。得点欄が空で、片方に「不戦勝」と書かれている。
          //   ||広島商||'''大阪桐蔭'''（不戦勝）|      （2022年春・広島商のコロナ辞退）
          // **試合はしていないので勝敗には数えない。** 辞退した側だけ覚えておく。
          if (f[3] === "" && f[5] === "" && /不戦勝/.test(f[2] + f[4])) {
            const loser = /不戦勝/.test(f[2]) ? f[4] : f[2];
            if (loser) walkoverLosers.add(loser.replace(/[（(].*$/, "").trim());
            continue;
          }
          add(f[2], Number(f[3].replace(/x$/, "")), f[4], Number(f[5].replace(/x$/, "")), bracketRound);
        }
        continue;
      }
      continue;
    }

    // --- (c) 表（勝利・スコア・敗戦の列を持つ） ---
    // |rowspan="3"|8月8日||第1試合||有田工||5 - 4||大垣日大||1時間55分||…
    // 列の数も位置も記事によって違うので、**スコアのセルを探して前後を取る。**
    if (line.startsWith("|") && !line.startsWith("|-") && !line.startsWith("|}")) {
      const cells = line.split("||").map((c) => {
        let x = stripLinks(c).replace(/^\|+/, "");
        // 属性付きセル（rowspan="3"|8月8日、style="…"|本文）は最後の | の後ろが中身
        const bar = x.lastIndexOf("|");
        if (bar >= 0) x = x.slice(bar + 1);
        return x.trim();
      });
      const j = cells.findIndex((c) => SCORE_CELL_RE.test(c));
      if (j > 0 && j + 1 < cells.length) {
        const sc = cells[j].match(SCORE_CELL_RE);
        add(cells[j - 1], Number(sc[1]), cells[j + 1], Number(sc[2]), round);
      }
      continue;
    }

    // --- (a) 箇条書き ---
    if (!line.startsWith("*")) continue;
    // 行全体がリンクになっていることがあるので先に剥がす
    const plain = stripLinks(line.replace(/^\*\s*/, ""));
    // （日付） 校名 得点 - 得点 校名（延長n回）
    const m = plain.match(BULLET_GAME_RE);
    if (!m) continue;
    add(m[1], Number(m[2]), m[4], Number(m[3]), round);
  }

  /**
   * 決勝の Linescore を拾う。
   *
   * **1つ目だけを見てはいけない。** 引き分け再試合の大会では
   * 引き分けたほうが先に書かれている。第51回夏（1969年）の
   * 三沢 対 松山商 は延長18回0-0で引き分け、翌日の再試合で松山商が優勝した。
   * 1つ目（0-0）は引き分けなので add が捨て、決勝が1件も取れないまま
   * **両校とも4勝0敗・成績不明になっていた。**
   * 決勝が取れるまで順に見れば、再試合のほうが拾える。
   */
  for (const ls of sec.matchAll(/\{\{\s*Linescore[\s\S]*?\n\}\}/g)) {
    // トーナメント表から決勝が取れているならそちらを優先する
    if (games.some((g) => g.round === "決勝")) break;
    const get = (k) => {
      const m = ls[0].match(new RegExp("\\|\\s*" + k + "\\s*=\\s*([^|\\n}]+)"));
      return m ? stripLinks(m[1]).trim() : null;
    };
    add(get("Road"), Number(get("RR")), get("Home"), Number(get("HR")), "決勝");
  }

  return {
    games,
    walkoverLosers,
    warning: games.length === 0 ? "試合を1件も読めなかった" : null,
  };
}

/**
 * 決勝から数えた距離（k）を到達段階の名前にする。
 * k=0 の敗者が準優勝、k=1 が4強、k=2 が8強……と2倍ずつ増える。
 *
 * **決勝から逆算するのでシード・不戦勝の影響を受けない。** 49代表の夏なら
 * 2回戦の時点で32校ちょうどなので、k=4 の敗者は正しく「ベスト32」になる。
 * 1回戦敗退（k=5）は 64 に満たないが、そこは勝利数0なので「初戦敗退」が優先される。
 */
const ROUND_LABELS = ["準優勝", "ベスト4", "ベスト8", "ベスト16", "ベスト32", "ベスト64"];

/** 見出しで回戦が分かっている場合の k */
const ROUND_TO_K = { 決勝: 0, 準決勝: 1, 準々決勝: 2 };

/** 学校ごとの成績にまとめる */
function summarize(teams, games, walkoverLosers = new Set()) {
  /**
   * 短縮名 → 学校。ただし **同じ短縮名の学校が同じ大会に2校出ることがある。**
   * 第36回選抜（1964年）は和歌山と徳島の両方から「海南高校」が出場していて、
   * そのまま短縮名で持つと後の1校が前の1校を上書きし、
   * 記事が使う「和歌山海南」「徳島海南」ではどちらも引けなくなる。
   * ぶつかった短縮名は都道府県を足した別名で登録し、素の短縮名は捨てる
   * （どちらを指すか決められないため。**当てずっぽうで結び付けない。**）
   */
  const dup = new Map();
  for (const t of teams) dup.set(t.short, (dup.get(t.short) ?? 0) + 1);

  const byShort = new Map(); // 一意キー → 成績
  const alias = new Map();   // 記事に出てくる呼び名 → 一意キー

  /** 別名を登録する。2校が同じ別名を名乗ったらどちらとも決められないので捨てる。 */
  const ambiguous = new Set();
  const addAlias = (name, key) => {
    if (ambiguous.has(name)) return;
    const prev = alias.get(name);
    if (prev !== undefined && prev !== key) {
      alias.delete(name);
      ambiguous.add(name);
      return;
    }
    alias.set(name, key);
  };

  for (const t of teams) {
    const collides = dup.get(t.short) > 1 && t.prefs.length > 0;
    const key = collides ? `${t.prefs[0]}${t.short}` : t.short;
    byShort.set(key, { ...t, wins: 0, losses: 0, result: null });
    if (collides) {
      // 「徳島海南」「海星（長崎）」のどちらの書き方もある。候補すべてを登録する。
      for (const p of t.prefs) {
        for (const a of [`${p}${t.short}`, `${t.short}（${p}）`, `${t.short}(${p})`]) {
          addAlias(a, key);
        }
      }
    } else {
      addAlias(t.short, key);
    }
  }

  const unmatched = new Set();

  /**
   * 記事に出てくる呼び名から一意キーを引く。
   * 末尾の（…）は「（長崎）」のような校名の一部のことも、「（延長12回）」のような
   * 注記のこともある。**先に校名の一部として引き、駄目なら注記として落とす。**
   * 逆順にすると同名校の区別が付かなくなる。
   */
  const stripTrailingNote = (name) => name.replace(/\s*[（(][^）)]*[）)]\s*$/, "").trim();
  const lookupKey = (name) => {
    if (name == null) return undefined;
    if (alias.has(name)) return alias.get(name);
    const base = stripTrailingNote(name);
    return base !== name ? alias.get(base) : undefined;
  };

  /** 記事に出てくる呼び名から成績を引く。引けない名前は報告に回す。 */
  const resolve = lookupKey;
  const touch = (name) => {
    const key = resolve(name);
    if (key === undefined) {
      unmatched.add(name);
      return undefined;
    }
    return byShort.get(key);
  };

  /**
   * 試合の並びを辿るためのキー。
   * **出場校表に無い学校も同じ土俵で辿れるようにする。** 外地校（大連商・
   * 台北一中など）は出場校表に載っていないが、決勝までの経路の途中にいる。
   * ここで落とすと、その先にいる学校の到達段階が決められなくなる。
   */
  // 引けない名前は注記を落とした形にそろえる。同じ学校の試合が
  // 注記の違いで別々のキーに散らばると、経路を辿れなくなるため。
  const keyOf = (name) => lookupKey(name) ?? stripTrailingNote(name);

  // 各校が出た試合の並び（記事は回戦順に書かれているので配列の順序でよい）
  // キーは一意キー（別名を解決したあと）にそろえる。
  const played = new Map();
  const push = (name, idx) => {
    const key = keyOf(name);
    if (!played.has(key)) played.set(key, []);
    played.get(key).push(idx);
  };

  games.forEach((g, i) => {
    const w = touch(g.winner);
    const l = touch(g.loser);
    if (w) w.wins++;
    if (l) l.losses++;
    push(g.winner, i);
    push(g.loser, i);
  });

  // 優勝校は「決勝の勝者」に限る。
  // **負け試合を取りこぼした学校も losses が 0 になる**ので、
  // 無敗であることを優勝の根拠にすると偽の優勝校を作ってしまう。
  const finalGame = games.find((g) => g.round === "決勝");
  let champion = finalGame ? keyOf(finalGame.winner) : null;
  if (!champion) {
    // 決勝の見出しが無い記事のための予備。無敗が1校だけならそれを優勝とする
    const undefeated = [...byShort.entries()].filter(([, s]) => s.losses === 0 && s.wins > 0);
    if (undefeated.length === 1) champion = undefeated[0][0];
  }

  /**
   * 試合が決勝から何回戦前か。
   *
   * **勝者の残り試合数を数えてはいけない。** 勝者は次に負ければそこで終わるので、
   * それだと決勝以外のほぼ全試合が「決勝の1つ前」になってしまう。
   * 正しくは「勝者が次に出る試合」を辿って決勝まで遡る。次の試合の勝者は
   * 別の学校になるが、ブラケットは決勝に向かって合流するので、辿れば必ず決勝に着く。
   *
   * 辿った先が決勝でなく途切れた場合（＝試合を取りこぼしている）は
   * undefined を返し、到達段階を書かない。
   */
  const kMemo = new Map();
  function kOf(idx, seen = new Set()) {
    if (kMemo.has(idx)) return kMemo.get(idx);
    if (seen.has(idx)) return undefined; // 循環。データが壊れている
    seen.add(idx);

    const g = games[idx];
    const known = ROUND_TO_K[g.round];
    if (known !== undefined) {
      kMemo.set(idx, known);
      return known;
    }

    const winnerGames = played.get(keyOf(g.winner)) ?? [];
    const pos = winnerGames.indexOf(idx);
    const nextIdx = pos >= 0 && pos + 1 < winnerGames.length ? winnerGames[pos + 1] : undefined;

    let k;
    if (nextIdx === undefined) {
      // 勝者がこの後試合をしていない＝決勝。そうでなければ取りこぼし
      k = keyOf(g.winner) === champion ? 0 : undefined;
    } else {
      const next = kOf(nextIdx, seen);
      k = next === undefined ? undefined : next + 1;
    }
    kMemo.set(idx, k);
    return k;
  }

  for (const [key, s] of byShort.entries()) {
    /**
     * 出場したが辞退・棄権した学校。**負けたのではないので「初戦敗退」ではない。**
     * 勝ってから辞退した例（2022年春の広島商＝1回戦に勝ったあとコロナで辞退）が
     * あるので、数えた勝敗はそのまま残す。1試合もしていなければ 0勝0敗。
     */
    // 辞退の根拠が出場校表の注記だけのときは、**1試合もしていない場合に限る。**
    // 注記の書き方が紛らわしく、繰り上げ出場した学校を巻き込みやすいため。
    // 不戦勝の行から分かったものは、勝ってから辞退した例があるので条件を付けない。
    const forfeited =
      walkoverLosers.has(key) ||
      walkoverLosers.has(s.short) ||
      (s.withdrew && s.wins === 0 && s.losses === 0);

    if (forfeited) {
      s.result = "出場辞退";
      s.wins ??= 0;
      s.losses ??= 0;
      continue;
    }

    if (s.wins === 0 && s.losses === 0) {
      // 出場校には載っているが試合が1件も見つからない。開催中か、こちらの
      // 取りこぼし。**「初戦敗退」と書くと事実に反する**ので不明にしておく。
      s.result = null;
      s.wins = null;
      s.losses = null;
      continue;
    }

    if (key === champion) {
      s.result = "優勝";
      continue;
    }

    // 優勝校以外は必ずどこかで負けている。負けが0なのは負け試合の取りこぼしなので、
    // **到達段階を決められない。推測で埋めずに不明のままにする。**
    if (s.losses === 0) {
      s.result = null;
      continue;
    }

    if (s.wins === 0) {
      s.result = "初戦敗退";
      continue;
    }

    /**
     * 敗退が決まった試合＝**最後に負けた試合**で到達段階を測る。
     *
     * 普通の勝ち抜き戦なら負けは1つしかないが、初期の大会には
     * **敗者復活戦**があり、1度負けても勝ち上がれた。第2回夏（1916年）の
     * 鳥取中は1回戦で負けたあと敗者復活戦を勝ち、準決勝で負けている
     * （1勝2敗）。「敗戦はちょうど1」を前提にすると、この種の学校が
     * まるごと成績不明になる。最後の敗戦で測れば正しくベスト4になる。
     */
    const lostIdxs = (played.get(key) ?? []).filter((i) => keyOf(games[i].loser) === key);
    const lastLost = lostIdxs[lostIdxs.length - 1];
    const k = lastLost === undefined ? undefined : kOf(lastLost);
    s.result = k === undefined ? null : (ROUND_LABELS[k] ?? `ベスト${2 ** (k + 1)}`);
  }

  return { schools: [...byShort.values()], unmatched: [...unmatched] };
}

function main() {
  const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) {
    console.error("キャッシュが空。先に fetch-koshien-wikipedia.mjs を実行すること。");
    process.exit(1);
  }

  const tournaments = [];
  const problems = [];
  const empty = []; // 出場校も試合も無い＝中止大会とみられるもの

  // ---- 同じ大会を二重に読まないようにする ----
  // 選抜は1948年（学制改革）で回数が第1回にリセットされ、1955年に通算へ戻された。
  // そのため「第6回選抜高等学校野球大会」が「第25回選抜高等学校野球大会」へ
  // リダイレクトされ、第20〜26回を2度取り込んでしまう。
  // 解決後の記事名で重ね合わせ、**回数が記事名と一致するほうを採る。**
  const records = [];
  for (const f of files) {
    const rec = JSON.parse(readFileSync(path.join(CACHE_DIR, f), "utf8"));
    if (!rec.wikitext) continue; // 記事そのものが無い
    records.push(rec);
  }
  const byTitle = new Map();
  for (const rec of records) {
    const prev = byTitle.get(rec.title);
    if (!prev) {
      byTitle.set(rec.title, rec);
      continue;
    }
    const matches = (r) => r.title.startsWith(`第${r.no}回`);
    if (!matches(prev) && matches(rec)) byTitle.set(rec.title, rec);
  }
  const duplicated = records.length - byTitle.size;
  if (duplicated > 0) {
    console.log(`同一記事に解決した重複を ${duplicated} 件除いた（選抜の回数リセットによるもの）`);
  }

  for (const rec of [...byTitle.values()].sort(
    (a, b) => a.season.localeCompare(b.season) || a.no - b.no,
  )) {

    const year = parseYear(rec.wikitext);
    const { teams, warning: tw } = parseTeams(rec.wikitext);
    const { games, walkoverLosers, warning: gw } = parseGames(rec.wikitext);
    const { schools, unmatched } = summarize(teams, games, walkoverLosers);

    const label = `${rec.season === "summer" ? "夏" : "春"}第${rec.no}回`;

    // 1試合も行われていない大会は中止大会。出場校が発表されていても取り込まない。
    //   1918年（夏第4回）… 米騒動で中止。出場校は決まっていた
    //   1941年（夏第27回）… 戦局悪化で中止
    //   2020年（春第92回）… コロナで中止。選出32校は発表済み
    // **選ばれただけで戦っていない大会を出場歴に入れない。**
    if (teams.length === 0 || games.length === 0) {
      empty.push(
        `${label}（${rec.title}${year ? ` / ${year}年` : ""}）` +
          ` 出場校${teams.length}・試合${games.length}`,
      );
      continue;
    }

    // 勝ち抜き戦なので、最後まで行われた大会なら 試合数 ≧ 出場校数 - 1 になる。
    // 足りないぶんは解析の取りこぼし（外地校の表記ゆれなど）。大会ごと捨てると
    // 実データが失われるので、大会は残したうえで**学校単位で成績不明にする**。
    const shortfall = teams.length - 1 - games.length;
    if (shortfall > 0) {
      problems.push(
        `${label}（${rec.title}）: 試合数が足りない（出場校${teams.length}・試合${games.length}）。` +
          `該当校は成績不明として取り込む`,
      );
    }

    if (tw) problems.push(`${label}（${rec.title}）: ${tw}`);
    if (gw) problems.push(`${label}（${rec.title}）: ${gw}`);
    if (unmatched.length > 0) {
      problems.push(
        `${label}（${rec.title}）: 試合結果に出てくるが出場校表に無い名前 → ${unmatched.join("、")}`,
      );
    }
    if (!year) problems.push(`${label}（${rec.title}）: 開催年が読めない`);

    tournaments.push({
      season: rec.season,
      no: rec.no,
      year,
      title: rec.title,
      schoolCount: schools.length,
      gameCount: games.length,
      schools,
    });
  }

  const out = {
    _comment:
      "甲子園（春の選抜・夏の選手権）の大会別出場校と成績。scripts/build-koshien-seed.mjs が " +
      "data/wikipedia-cache/ から生成する。直接編集しない。",
    _出典:
      "ja.wikipedia.org の大会別記事（CC BY-SA 4.0）。事実データのみを抽出しており、" +
      "記事の文章は含まない。学校名は記事名（正式名称）で持つ。",
    _注意:
      "Wikipediaは二次情報。公開前に高野連の公式記録と抜き取りで突き合わせること。" +
      "result の『N勝』『初戦敗退』は、近年の記事が回戦をまとめて書いていて" +
      "何回戦敗退かを機械的に決められないため、数えた事実だけで表している。",
    generatedOn: new Date().toISOString().slice(0, 10),
    tournaments,
  };

  writeFileSync(OUT, JSON.stringify(out, null, 1), "utf8");

  const totalSchools = tournaments.reduce((a, t) => a + t.schoolCount, 0);
  const totalGames = tournaments.reduce((a, t) => a + t.gameCount, 0);
  console.log(`大会: ${tournaments.length}`);
  console.log(`出場（延べ）: ${totalSchools}`);
  console.log(`試合: ${totalGames}`);
  console.log(`書き出し: ${path.relative(ROOT, OUT)}`);

  if (empty.length > 0) {
    console.log("");
    console.log(
      `--- 取り込まなかった大会 ${empty.length} 件（中止・開催中。試合数が出場校数-1に満たない）---`,
    );
    for (const e of empty) console.log("  " + e);
  }

  if (problems.length > 0) {
    console.log("");
    console.log(`--- 確認が要る点 ${problems.length} 件 ---`);
    for (const p of problems) console.log("  " + p);
  }
}

main();
