/**
 * 文部科学省「学校コード一覧」から学校データのINSERT文を作る。
 *
 *   node scripts/build-school-seed.mjs 関東
 *
 * 方針：**事実はすべて公的データから取り、こちらで書かない。**
 * 学校名・所在地・設置区分は文科省のCSVをそのまま使う。
 * 生成AIに学校名を書かせると必ず存在しない学校が混ざるため、
 * このスクリプトはCSVにある行だけを出力する。
 *
 * 唯一の例外が「読み」。CSVにふりがなが無く、URLのローマ字slugが作れない。
 * 読みは data/school-kana.json に持ち、ここでは参照するだけにしている。
 * 読みが無い学校は出力せず、data/missing-kana.json に書き出して知らせる。
 *
 * 出典: https://www.mext.go.jp/b_menu/toukei/mext_01087.html
 *       （政府標準利用規約。出典表示のうえ二次利用可）
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(root, "data");

/**
 * 文科省CSV。高校は東日本・西日本の2本立て。
 * 高専は高校のファイルに入っておらず、大学・短大と同じファイルにある。
 */
const SOURCES = {
  east: "https://www.mext.go.jp/content/20260529-mxt_chousa01-000011635_2.csv",
  west: "https://www.mext.go.jp/content/20260529-mxt_chousa01-000011635_4.csv",
  kosen: "https://www.mext.go.jp/content/20260529-mxt_chousa01-000011635_6.csv",
};

/** どの地方でも読むファイル。高専は全国が1本にまとまっている */
const COMMON_SOURCES = ["kosen"];

/** 地方 -> CSV上の都道府県番号ラベル -> 地区slug */
const PREFECTURE_SLUG = {
  "01(北海道)": null, // 住所から北北海道・南北海道を判定する（下記）
  "02(青森)": "aomori",
  "03(岩手)": "iwate",
  "04(宮城)": "miyagi",
  "05(秋田)": "akita",
  "06(山形)": "yamagata",
  "07(福島)": "fukushima",
  "08(茨城)": "ibaraki",
  "09(栃木)": "tochigi",
  "10(群馬)": "gunma",
  "11(埼玉)": "saitama",
  "12(千葉)": "chiba",
  "13(東京)": null, // 住所から東東京・西東京を判定する（下記）
  "14(神奈川)": "kanagawa",
  "15(新潟)": "niigata",
  "16(富山)": "toyama",
  "17(石川)": "ishikawa",
  "18(福井)": "fukui",
  "19(山梨)": "yamanashi",
  "20(長野)": "nagano",
  "21(岐阜)": "gifu",
  "22(静岡)": "shizuoka",
  "23(愛知)": "aichi",
  "24(三重)": "mie",
  "25(滋賀)": "shiga",
  "26(京都)": "kyoto",
  "27(大阪)": "osaka",
  "28(兵庫)": "hyogo",
  "29(奈良)": "nara",
  "30(和歌山)": "wakayama",
  "31(鳥取)": "tottori",
  "32(島根)": "shimane",
  "33(岡山)": "okayama",
  "34(広島)": "hiroshima",
  "35(山口)": "yamaguchi",
  "36(徳島)": "tokushima",
  "37(香川)": "kagawa",
  "38(愛媛)": "ehime",
  "39(高知)": "kochi",
  "40(福岡)": "fukuoka",
  "41(佐賀)": "saga",
  "42(長崎)": "nagasaki",
  "43(熊本)": "kumamoto",
  "44(大分)": "oita",
  "45(宮崎)": "miyazaki",
  "46(鹿児島)": "kagoshima",
  "47(沖縄)": "okinawa",
};

/**
 * 東京の学校を東東京・西東京へ振り分ける。
 *
 * 西東京大会に出るのは「多摩地域＋世田谷区・練馬区・杉並区」の学校。
 * 残りの20区と島嶼部が東東京大会。
 * 2013年に世田谷区が西へ、中野区が東へ再編されて今の形になった。
 *
 * 出典: 全国高等学校野球選手権西東京大会（Wikipedia）
 *       https://ja.wikipedia.org/wiki/全国高等学校野球選手権西東京大会
 *
 * 区割りが変わったらここを直す。年度で変わりうるので、
 * 実際の組み合わせ表と食い違ったら連盟の発表を優先すること。
 */
const NISHI_TOKYO_WARDS = ["世田谷区", "練馬区", "杉並区"];

function resolveTokyoDistrict(city) {
  if (!city) return null;
  if (NISHI_TOKYO_WARDS.includes(city)) return "nishi-tokyo";
  // 23区（上の3区以外）と島嶼部は東東京
  if (city.endsWith("区")) return "higashi-tokyo";
  if (/^(大島町|利島村|新島村|神津島村|三宅村|御蔵島村|八丈町|青ヶ島村|小笠原村)$/.test(city)) {
    return "higashi-tokyo";
  }
  // 残りは多摩地域の市町村
  return "nishi-tokyo";
}

/*
 * 文科省のCSVは東日本（01北海道〜24三重）と西日本（25滋賀〜47沖縄）の2本。
 * 近畿は三重が東、残りが西とファイルをまたぐので sources は配列で持つ。
 */
const REGIONS = {
  北海道: { sources: ["east"], prefectures: ["01(北海道)"] },
  東北: {
    sources: ["east"],
    prefectures: ["02(青森)", "03(岩手)", "04(宮城)", "05(秋田)", "06(山形)", "07(福島)"],
  },
  関東: {
    sources: ["east"],
    prefectures: ["08(茨城)", "09(栃木)", "10(群馬)", "11(埼玉)", "12(千葉)", "13(東京)", "14(神奈川)"],
  },
  // 北陸（富山・石川・福井）はサイトの地方区分では中部に入る（constants.ts の REGIONS）
  中部: {
    sources: ["east"],
    prefectures: [
      "15(新潟)", "16(富山)", "17(石川)", "18(福井)",
      "19(山梨)", "20(長野)", "21(岐阜)", "22(静岡)", "23(愛知)",
    ],
  },
  近畿: {
    sources: ["east", "west"],
    prefectures: [
      "24(三重)", "25(滋賀)", "26(京都)", "27(大阪)",
      "28(兵庫)", "29(奈良)", "30(和歌山)",
    ],
  },
  中国: {
    sources: ["west"],
    prefectures: ["31(鳥取)", "32(島根)", "33(岡山)", "34(広島)", "35(山口)"],
  },
  四国: {
    sources: ["west"],
    prefectures: ["36(徳島)", "37(香川)", "38(愛媛)", "39(高知)"],
  },
  "九州・沖縄": {
    sources: ["west"],
    prefectures: [
      "40(福岡)", "41(佐賀)", "42(長崎)", "43(熊本)",
      "44(大分)", "45(宮崎)", "46(鹿児島)", "47(沖縄)",
    ],
  },
};

/**
 * 北海道の学校を北北海道・南北海道へ振り分ける。
 *
 * 南北海道大会に出るのは 石狩・空知・後志・胆振・日高・渡島・檜山 の学校、
 * 北北海道大会は 上川・留萌・宗谷・オホーツク・十勝・釧路・根室。
 * つまり振興局で決まるので、住所の市町村から一意に定まる。
 *
 * 対応表は data/hokkaido-shinkokyoku.json にある。
 * 表に無い市町村は振り分けずに未指定として報告する（黙って寄せない）。
 */
const SOUTH_SUBPREFECTURES = ["石狩", "空知", "後志", "胆振", "日高", "渡島", "檜山"];

function makeHokkaidoResolver(table) {
  const byCity = new Map();
  for (const [subprefecture, cities] of Object.entries(table)) {
    if (subprefecture.startsWith("_")) continue;
    const district = SOUTH_SUBPREFECTURES.includes(subprefecture)
      ? "minami-hokkaido"
      : "kita-hokkaido";
    for (const city of cities) byCity.set(city, district);
  }
  return (city) => (city ? (byCity.get(city) ?? null) : null);
}

// ------------------------------------------------------------
// CSV
// ------------------------------------------------------------

/** 引用符つきフィールドに対応した素朴なCSVパーサ */
function parseCsv(src) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function loadSource(which) {
  const file = path.join(DATA_DIR, `mext-${which}.csv`);
  if (!existsSync(file)) {
    console.log(`ダウンロード中: ${SOURCES[which]}`);
    const res = await fetch(SOURCES[which]);
    if (!res.ok) throw new Error(`取得に失敗しました: ${res.status}`);
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
  }
  // 文科省のCSVはShift_JIS
  return parseCsv(new TextDecoder("shift_jis").decode(await readFile(file)));
}

// ------------------------------------------------------------
// 正規化
// ------------------------------------------------------------

/**
 * 正式名称から設置区分を読む。
 *
 * 設置区分の列は 国/公/私 の3つしかなく、「県立」と「市立」を区別できない。
 * 一方で正式名称は必ず設置者を含んでいる（「千葉県立…」「横浜市立…」）ので、
 * そこから読む。名称に頼れない北海道（「北海道〇〇高等学校」）は
 * 対象地方に入れるときに個別対応すること。
 */
function readEstablishment(officialName, settiCode, prefectureFullName) {
  if (settiCode.startsWith("1")) return "national";
  if (/組合立/.test(officialName)) return "combined";

  /*
   * 設置者の書き方は都道府県ごとに違う。3通りある。
   *   1. 「千葉県立千葉高等学校」   設置者名＋立
   *   2. 「市立函館高等学校」       設置者名を書かずに「市立」だけ
   *   3. 「宮城県仙台第一高等学校」 「立」を付けない（北海道・宮城）
   * 市町村立を先に見る。「宮城県」で始まる市立校を県立と取り違えないため。
   */
  // 東京の特別区立（千代田区立九段中等教育学校など）も市立と同じ扱いにする
  if (/^(?:.+?)?[市区]立/.test(officialName)) return "municipal";
  if (/^(?:.+?)?[町村]立/.test(officialName)) return "town_village";
  if (/^.+?[都道府県]立/.test(officialName)) return "prefectural";
  if (officialName.startsWith(prefectureFullName)) return "prefectural";
  return null;
}

/**
 * 「東京都八王子市館町1097番地」-> 「八王子市」。
 *
 * 市区町村をまとめて `.+?[市区町村]` で取ると、名前の途中に市や村を含む
 * 自治体で切る位置を間違える（余市町→「余市」、東村山市→「東村」、
 * 武蔵村山市→「武蔵村」、田村市→「田村」）。
 * 郡があれば町村、無ければ市、次に区、最後に町村、の順に見る。
 */
function readCity(address) {
  const rest = address.replace(/^(北海道|東京都|(?:大阪|京都)府|.+?県)/, "");

  /*
   * 郡部は必ず町か村。町を先に探すのは、玉村町のように村を名前の途中に
   * 含む自治体があるため（[町村]でまとめて探すと「玉村」で切れてしまう）。
   * 字数を5文字までに区切って、町を含む番地まで拾わないようにしている。
   *
   * 名前の途中に郡が入る市は、郡部と区別がつかないので名指しで避ける
   * （蒲郡市三谷町が「蒲郡」＋「市三谷町」に見えてしまう）。
   * 郡が先頭にある郡山市・郡上市は、郡の前に文字が無いので誤爆しない。
   */
  if (!SHI_WITH_GUN.some((name) => rest.startsWith(name))) {
    const gun =
      rest.match(/^.+?郡(.{1,5}?町)/) ??
      rest.match(/^.+?郡(.{1,5}?村)/) ??
      rest.match(/^.+?郡(.+?[町村])/);
    if (gun) {
      // 大町町のように町を名前の途中に含む町は、最初の町で切ると1文字足りない
      const after = rest[rest.indexOf(gun[1]) + gun[1].length];
      return after === "町" ? `${gun[1]}町` : gun[1];
    }
  }

  /*
   * 市が名前の途中にも入る市は、最初の市で切ると1文字足りない
   * （野々市市 -> 野々市）。全国でこの3つだけなので名指しで拾う。
   * 「次の文字も市なら伸ばす」にすると、あわら市市姫のような住所で
   * 「あわら市市」になってしまう。
   */
  const tricky = ["野々市市", "四日市市", "廿日市市"].find((n) => rest.startsWith(n));
  if (tricky) return tricky;

  // 政令市は「横浜市港南区」の順なので、市で切れば区は自然に落ちる
  const shi = rest.match(/^.+?市/);
  if (shi) return shi[0];

  const ku = rest.match(/^.+?区/);
  if (ku) return ku[0];

  // 島は住所に島名が入ることがある（「八丈島八丈町大賀郷」）。町村名の手前だけ落とす
  const island = rest.replace(/^(?:八丈島|三宅島|伊豆大島)(?=.+?[町村])/, "");
  const machi = island.match(/^.+?[町村]/);
  return machi ? machi[0] : null;
}

/**
 * 正式名称を「芯」と「表示名」に分ける。
 *
 *   千葉県立千葉高等学校             -> 芯 千葉             / 千葉高校
 *   岩手県立杜陵高等学校奥州校       -> 芯 杜陵奥州校       / 杜陵高校奥州校
 *   宮城県築館高等学校一迫商業キャンパス
 *                                    -> 芯 築館一迫商業キャンパス
 *                                       / 築館高校一迫商業キャンパス
 *
 * 分校とキャンパスは「高等学校」の後ろに名前が続く。単純に末尾を削ると
 * 「杜陵奥州校高校」のような名前になってしまうので、前後に分けて組み直す。
 * 芯は読みの辞書とslugの単位。
 */
function splitName(officialName, prefectureFullName) {
  /*
   * 設置者を落とす。**どれか1つだけ**を適用する。
   * 続けて掛けると「新潟県立新潟県央工業高等学校」が
   * 「新潟県立」と「新潟県」の両方を削られて「央工業」になってしまう。
   */
  const stripSetter = (part) => {
    const trimmed = part.trim();
    for (const pattern of [
      /^.+?組合立(.*)$/,
      /^(?:.+?)?[市区町村]立(.*)$/,
      /^.+?[都道府県]立(.*)$/,
    ]) {
      const hit = trimmed.match(pattern);
      if (hit) return hit[1].trim();
    }
    // 「立」を付けない県（北海道・宮城・長野）は設置者名そのものが前に付く
    if (trimmed.startsWith(prefectureFullName) && trimmed.length > prefectureFullName.length) {
      return trimmed.slice(prefectureFullName.length).trim();
    }
    return trimmed;
  };

  for (const [marker, shortMarker] of [
    // 「高等専門学校」を先に見る。「高等学校」で切ると「専門学校」が残る
    ["高等専門学校", "高専"],
    ["高等学校", "高校"],
    ["中等教育学校", "中等教育学校"],
  ]) {
    const match = officialName.match(new RegExp(`^(.*?)${marker}(.*)$`));
    if (!match) continue;

    /*
     * 設置者を落とすと名前が無くなる学校（「小松市立高等学校」）と、
     * 分野名だけになる学校（「石川県立工業高等学校」）は設置者を残す。
     * 「工業高校」では何県の学校か分からないし、他県の同種の学校と
     * 見分けもつかないため。
     */
    const stripped = stripSetter(match[1]);
    const needsSetter =
      stripped === "" ||
      CATEGORY_ONLY_NAMES.has(stripped) ||
      // 「大学附属」で始まる名前は、どこの大学か分からなくなる
      // （兵庫県立大学附属、山口県立大学附属周防大島）
      stripped.startsWith("大学附属");
    const base = needsSetter ? match[1].trim() : stripped;

    return { stem: `${base}${match[2]}`, name: `${base}${shortMarker}${match[2]}` };
  }

  const stem = stripSetter(officialName);
  return { stem, name: stem };
}

/**
 * 住所に「郡」が混ざる市。郡部の住所と見分けがつかないので名指しで持つ。
 *   蒲郡市・小郡市・大和郡山市 … 市の名前そのものに郡が入る
 *   鹿児島市                   … 市内の地名が郡山町
 * `--cities` で市区町村の一覧を出して、おかしいものが無いか確かめること。
 */
const SHI_WITH_GUN = ["蒲郡市", "小郡市", "大和郡山市", "鹿児島市"];

/** これだけになったら設置者を残す。学校名ではなく分野名だから */
const CATEGORY_ONLY_NAMES = new Set([
  "工業", "商業", "農業", "水産", "工科", "商工", "農林", "実業", "産業",
  "第一工業", "第二工業", "第三工業",
  // 熊本県立第一・第二。番号だけではどこの学校か分からない
  "第一", "第二", "第三",
  // 兵庫県立大学附属・奈良県立大学附属。どこの大学か分からなくなる
  "大学附属",
]);

/** 読みをローマ字に直す。slugに使うので長音は伸ばさず母音を落とす（例: とうきょう -> tokyo） */
function toRomaji(kana) {
  const table = [
    ["きゃ", "kya"], ["きゅ", "kyu"], ["きょ", "kyo"],
    ["しゃ", "sha"], ["しゅ", "shu"], ["しょ", "sho"],
    ["ちゃ", "cha"], ["ちゅ", "chu"], ["ちょ", "cho"],
    ["にゃ", "nya"], ["にゅ", "nyu"], ["にょ", "nyo"],
    ["ひゃ", "hya"], ["ひゅ", "hyu"], ["ひょ", "hyo"],
    ["みゃ", "mya"], ["みゅ", "myu"], ["みょ", "myo"],
    ["りゃ", "rya"], ["りゅ", "ryu"], ["りょ", "ryo"],
    ["ぎゃ", "gya"], ["ぎゅ", "gyu"], ["ぎょ", "gyo"],
    ["じゃ", "ja"], ["じゅ", "ju"], ["じょ", "jo"],
    ["びゃ", "bya"], ["びゅ", "byu"], ["びょ", "byo"],
    ["ぴゃ", "pya"], ["ぴゅ", "pyu"], ["ぴょ", "pyo"],
    // 外来語の表記（「ＩＴ未来」=あいてぃーみらい など）
    ["てぃ", "ti"], ["でぃ", "di"], ["でゅ", "du"], ["とぅ", "tu"],
    ["ふぁ", "fa"], ["ふぃ", "fi"], ["ふぇ", "fe"], ["ふぉ", "fo"],
    ["うぃ", "wi"], ["うぇ", "we"], ["うぉ", "wo"],
    ["しぇ", "she"], ["じぇ", "je"], ["ちぇ", "che"], ["つぁ", "tsa"],
    ["ヴ", "v"], ["ぁ", "a"], ["ぃ", "i"], ["ぅ", "u"], ["ぇ", "e"], ["ぉ", "o"],
    ["あ", "a"], ["い", "i"], ["う", "u"], ["え", "e"], ["お", "o"],
    ["か", "ka"], ["き", "ki"], ["く", "ku"], ["け", "ke"], ["こ", "ko"],
    ["さ", "sa"], ["し", "shi"], ["す", "su"], ["せ", "se"], ["そ", "so"],
    ["た", "ta"], ["ち", "chi"], ["つ", "tsu"], ["て", "te"], ["と", "to"],
    ["な", "na"], ["に", "ni"], ["ぬ", "nu"], ["ね", "ne"], ["の", "no"],
    ["は", "ha"], ["ひ", "hi"], ["ふ", "fu"], ["へ", "he"], ["ほ", "ho"],
    ["ま", "ma"], ["み", "mi"], ["む", "mu"], ["め", "me"], ["も", "mo"],
    ["や", "ya"], ["ゆ", "yu"], ["よ", "yo"],
    ["ら", "ra"], ["り", "ri"], ["る", "ru"], ["れ", "re"], ["ろ", "ro"],
    ["わ", "wa"], ["を", "o"], ["ん", "n"],
    ["が", "ga"], ["ぎ", "gi"], ["ぐ", "gu"], ["げ", "ge"], ["ご", "go"],
    ["ざ", "za"], ["じ", "ji"], ["ず", "zu"], ["ぜ", "ze"], ["ぞ", "zo"],
    ["だ", "da"], ["ぢ", "ji"], ["づ", "zu"], ["で", "de"], ["ど", "do"],
    ["ば", "ba"], ["び", "bi"], ["ぶ", "bu"], ["べ", "be"], ["ぼ", "bo"],
    ["ぱ", "pa"], ["ぴ", "pi"], ["ぷ", "pu"], ["ぺ", "pe"], ["ぽ", "po"],
    ["ー", ""],
  ];

  let out = "";
  for (let i = 0; i < kana.length; i++) {
    // 促音は次の子音を重ねる
    if (kana[i] === "っ") {
      const next = table.find(([k]) => kana.startsWith(k, i + 1));
      if (next) out += next[1][0];
      continue;
    }
    const hit = table.find(([k]) => kana.startsWith(k, i));
    if (!hit) throw new Error(`読めない文字があります: ${kana[i]}（${kana}）`);
    out += hit[1];
    i += hit[0].length - 1;
  }

  /*
   * 長音を落とす（とうきょう -> toukyou -> tokyo）。
   *
   * ただし「ひろお（広尾）」のように、長音ではなく母音が2つ並ぶ名前もある。
   * 機械的には見分けられないので、そういう学校は
   * data/school-kana.json にローマ字を直接書いて上書きする。
   */
  return out.replace(/ou/g, "o").replace(/uu/g, "u").replace(/oo/g, "o");
}

/**
 * 高野連の加盟校名簿と照合して、硬式野球部があるかを判定する。
 *
 * 名簿は「千葉」「市立千葉」「東金商」のような短縮形で書かれている。
 * こちらの持っている芯（「千葉」「東金商業」）とは形が違うので、
 * 総当たりではなく次の順で見る。
 *
 *   1. 芯そのもの、または「市立」を足したもの が名簿にあるか
 *   2. 名簿の名前が芯の先頭と一致するか（東金商 -> 東金商業）
 *      ただし前方一致するものが1つに絞れるときだけ。
 *      「千葉」で「千葉東」「千葉北」まで拾ってしまうのを避ける。
 *
 * 判定できなかった学校と、名簿にあってこちらに無い名前は
 * どちらも報告する。**推測で加盟扱いにはしない。**
 */
function makeClubChecker(entry) {
  const names = new Set(entry.schools);
  const used = new Set();

  return {
    isMember(school) {
      // 中等教育学校は名簿でもその名前で載る
      const withKind =
        school.schoolKind === "secondary" ? `${school.stem}中等教育学校` : school.stem;

      /*
       * 高専は名簿では「木更津高専」のように書かれる。
       * こちらの芯は正式名称にあわせた「木更津工業」なので、
       * 工業・商船を落として高専を付けた形でも照合する。
       */
      if (school.schoolKind === "kosen") {
        const forms = [
          `${school.stem}高専`,
          `${school.stem.replace(/(工業|商船)$/, "")}高専`,
          `${school.stem}高等専門学校`,
        ];
        for (const form of forms) {
          if (names.has(form)) {
            used.add(form);
            return true;
          }
        }
      }

      /*
       * 市立校を先に見る。県立千葉と千葉市立千葉のように芯が同じ学校があり、
       * 芯だけで先に照合すると市立のほうが「千葉」を取ってしまう。
       */
      const candidates =
        school.establishment === "municipal"
          ? [`市立${withKind}`, `市立${school.stem}`, withKind, school.stem]
          : [withKind, school.stem];

      for (const candidate of candidates) {
        if (names.has(candidate)) {
          used.add(candidate);
          return true;
        }
      }

      /*
       * 名簿側が省略形のとき（東金商 / 東金商業）。
       *
       * 単なる前方一致にすると「千葉」が「千葉大宮」まで拾ってしまうので、
       * **残りがちょうど1文字で、それが省略の補完に使う字のときだけ**通す。
       *   商 -> 商業 / 工 -> 工業 / 農 -> 農業 / 総 -> 総合 / 附 -> 附属
       */
      const completion = ["業", "合", "属"];
      const abbreviated = entry.schools.find(
        (n) =>
          n.length >= 2 &&
          school.stem.length === n.length + 1 &&
          school.stem.startsWith(n) &&
          completion.includes(school.stem.slice(-1)),
      );
      if (abbreviated) {
        used.add(abbreviated);
        return true;
      }
      return false;
    },
    unmatchedNames: () => entry.schools.filter((n) => !used.has(n)),
  };
}

const sqlString = (value) =>
  value === null || value === undefined ? "null" : `'${String(value).replace(/'/g, "''")}'`;

// ------------------------------------------------------------
// 本体
// ------------------------------------------------------------

/*
 * 引数で指定がなければ定義してある地方すべてを作る。
 *
 * **必ず全地方を一度に処理する。** slugの重複は地方をまたいで起きるため
 * （本庄と本荘、足立と安達、大野と小野はどれもローマ字にすると同じになる）、
 * 地方ごとに別々に走らせると重複に気づけず、
 * INSERT時に後の学校が前の学校を上書きしてしまう。
 *
 * REGIONS の順番が先に来た学校が短いslugを取る。
 * **既存のslugを変えないため、地方を足すときは必ず末尾に足すこと。**
 */
const requested = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const regionNames = requested.length ? requested : Object.keys(REGIONS);
for (const name of regionNames) {
  if (!REGIONS[name]) throw new Error(`知らない地方です: ${name}`);
}

/*
 * 辞書を読む。
 *
 * JSON.parse は同じキーが2回出てくると黙って後ろで上書きする。
 * 手で育てる辞書なので、うっかり同じ学校を2回書いたときに気づけるよう
 * ここで見張る（実際に「広尾」を二重に書いて片方が消えたことがある）。
 */
async function loadDictionary(file) {
  const raw = await readFile(file, "utf-8");
  const seen = new Set();
  for (const [, key] of raw.matchAll(/^\s*"((?:[^"\\]|\\.)*)"\s*:/gm)) {
    if (seen.has(key)) throw new Error(`${path.basename(file)} にキーが重複しています: ${key}`);
    seen.add(key);
  }
  return JSON.parse(raw);
}

const kanaPath = path.join(DATA_DIR, "school-kana.json");
const kana = existsSync(kanaPath) ? await loadDictionary(kanaPath) : {};
const districtPath = path.join(DATA_DIR, "district-override.json");
const districtOverride = existsSync(districtPath)
  ? JSON.parse(await readFile(districtPath, "utf-8"))
  : {};
// 「桐生市立商業高等学校」が「商業高校」になってしまうような場合の手当て。学校コードで指定する
const namePath = path.join(DATA_DIR, "name-override.json");
const nameOverride = existsSync(namePath)
  ? JSON.parse(await readFile(namePath, "utf-8"))
  : {};
// 校名に設置者が入っていない学校（「ふたば未来学園高等学校」など）の手当て
const establishmentPath = path.join(DATA_DIR, "establishment-override.json");
const establishmentOverride = existsSync(establishmentPath)
  ? JSON.parse(await readFile(establishmentPath, "utf-8"))
  : {};
// 硬式野球部の有無（高野連の加盟校名簿）。調べた都道府県だけ入っている
const clubsPath = path.join(DATA_DIR, "baseball-clubs.json");
const baseballClubs = existsSync(clubsPath) ? await loadDictionary(clubsPath) : {};
const resolveHokkaidoDistrict = makeHokkaidoResolver(
  JSON.parse(await readFile(path.join(DATA_DIR, "hokkaido-shinkokyoku.json"), "utf-8")),
);

const ready = [];
const missingKana = [];
const missingDistrict = [];
const problems = [];
const targetCount = new Map();

const sources = new Map();
for (const which of new Set(regionNames.flatMap((n) => [...REGIONS[n].sources, ...COMMON_SOURCES]))) {
  sources.set(which, (await loadSource(which)).slice(2));
}

/** 収録対象の学校種。D1 高校 / D2 中等教育学校 / G1 高等専門学校 */
const TARGET_KINDS = ["D1", "D2", "G1"];

const targets = [];
for (const name of regionNames) {
  const region = REGIONS[name];
  const rows = [...region.sources, ...COMMON_SOURCES]
    .flatMap((s) => sources.get(s))
    .filter((r) => {
      if (r.length < 8 || !r[0]) return false;
      if (!region.prefectures.includes(r[2])) return false;
      if (!TARGET_KINDS.some((k) => r[1].startsWith(k))) return false;
      if (r[3].startsWith("3")) return false; // 私立は対象外
      if (r[9]) return false; // 廃止済み
      return true;
    });
  targetCount.set(name, rows.length);
  for (const row of rows) targets.push({ regionName: name, row });
}

for (const { regionName, row } of targets) {
  const [code, kind, prefLabel, setti, , officialName, address] = row;

  // 「13(東京)」-> 「東京都」。設置者名の判定に使う
  const bare = prefLabel.replace(/^\d+\(|\)$/g, "");
  const prefectureFullName = /^(北海道|東京|大阪|京都)$/.test(bare)
    ? bare.replace(/^東京$/, "東京都").replace(/^(大阪|京都)$/, "$1府")
    : `${bare}県`;

  const establishment =
    establishmentOverride[code] ??
    readEstablishment(officialName, setti, prefectureFullName);
  if (!establishment) {
    problems.push({ code, officialName, reason: "設置区分を読めない" });
    continue;
  }

  const split = splitName(officialName, prefectureFullName);
  const stem = split.stem;
  const city = readCity(address);
  const name = nameOverride[code] ?? split.name;
  const prefectureSlug =
    districtOverride[code] ??
    PREFECTURE_SLUG[prefLabel] ??
    (prefLabel === "13(東京)" ? resolveTokyoDistrict(city) : null) ??
    (prefLabel === "01(北海道)" ? resolveHokkaidoDistrict(city) : null);
  if (!prefectureSlug) {
    missingDistrict.push({ code, officialName, city });
    continue;
  }

  // 読みは学校コード優先、なければ芯の部分で引く。
  // 「〇〇工業」「〇〇第一」のような組み合わせは地方をまたいで同じ読みなので、
  // 芯を単位にすると辞書がそのぶん小さくなる。
  const reading = kana[code] ?? kana[stem];
  if (!reading) {
    missingKana.push({ code, officialName, stem, name, city, prefectureSlug });
    continue;
  }

  ready.push({
    regionName,
    code,
    // 辞書にローマ字が直接書いてあればそれを使う（長音の判定が効かない名前用）
    slug: /^[a-z-]+$/.test(reading) ? reading : toRomaji(reading),
    stem,
    name,
    officialName,
    prefectureSlug,
    city,
    establishment,
    schoolKind: kind.startsWith("G1")
      ? "kosen"
      : kind.startsWith("D2")
        ? "secondary"
        : "high_school",
  });
}

/*
 * slugの重複を潰す。
 * 県立千葉高校と千葉市立千葉高校のように、同じ芯の学校が実在する。
 * 後から来たほうに地区slugを足して分ける。それでも並ぶ場合は問題として報告する。
 */
const bySlug = new Map();
for (const school of ready) {
  /*
   * 分け方の候補を順に試す。
   *
   * 高専は高校と芯が重なることが多い（函館工業高校と函館工業高専）。
   * 地区名を足すより -kosen を足すほうが何の学校か分かるので先に試す。
   * 中等教育学校も同じ理由で -chuto。
   */
  const kindSuffix =
    school.schoolKind === "kosen" ? "kosen" : school.schoolKind === "secondary" ? "chuto" : null;
  const candidates = [
    school.slug,
    ...(kindSuffix ? [`${school.slug}-${kindSuffix}`] : []),
    `${school.prefectureSlug}-${school.slug}`,
    ...(kindSuffix ? [`${school.prefectureSlug}-${school.slug}-${kindSuffix}`] : []),
    // それでも並ぶときのための番号付き。ここまで来ることはまず無い
    ...[2, 3, 4].map((n) => `${school.prefectureSlug}-${school.slug}-${n}`),
  ];

  const free = candidates.find((c) => !bySlug.has(c));
  if (free) bySlug.set(free, { ...school, slug: free });
  else {
    problems.push({
      code: school.code,
      officialName: school.officialName,
      reason: `slugが重複したまま解決できない: ${school.slug}`,
    });
  }
}

/*
 * 硬式野球部の有無で公開・非公開を分ける。
 *
 * 名簿を用意していない都道府県はそのまま公開する。全部を下書きにすると
 * サイトから学校が消えてしまうので、調べた県から順に絞っていく形にする。
 * 部が無い学校は消さずに下書きにする。RLSで公開側からは見えなくなるが、
 * 名簿が変わったときに戻せる。
 */
const checkers = new Map();
for (const [prefectureSlug, entry] of Object.entries(baseballClubs)) {
  if (prefectureSlug.startsWith("_")) continue;
  checkers.set(prefectureSlug, makeClubChecker(entry));
}

/*
 * 名簿がまだ無い都道府県でも、校名に「女子」が入る学校は下書きにする。
 *
 * 高野連の硬式野球は男子のみで、女子校は加盟できない（女子硬式野球は別の連盟）。
 * 校名から機械的に分かる、数少ない確実な除外条件。
 * 共学化して名前だけ残っている学校があれば、名簿を入れたときに拾い直せる。
 */
const CO_ED_DESPITE_NAME = [
  // 大学は女子大だが、附属の中等教育学校は共学
  "奈良女子大学附属中等教育学校",
];
const isGirlsSchool = (school) =>
  school.name.includes("女子") && !CO_ED_DESPITE_NAME.includes(school.name);

const screening = new Map();
const girlsOnly = [];
for (const school of bySlug.values()) {
  const checker = checkers.get(school.prefectureSlug);
  if (!checker) {
    if (isGirlsSchool(school)) {
      school.status = "draft";
      girlsOnly.push(school.name);
    } else {
      school.status = "published";
    }
    continue;
  }
  const member = checker.isMember(school);
  school.status = member ? "published" : "draft";

  if (!screening.has(school.prefectureSlug)) {
    screening.set(school.prefectureSlug, { member: 0, nonMember: [] });
  }
  const tally = screening.get(school.prefectureSlug);
  if (member) tally.member++;
  else tally.nonMember.push(school.name);
}

await mkdir(DATA_DIR, { recursive: true });
await writeFile(
  path.join(DATA_DIR, "missing-kana.json"),
  JSON.stringify(missingKana, null, 2) + "\n",
  "utf-8",
);

console.log(`対象: ${targets.length}校（${regionNames.join(" / ")}）`);
console.log(`  出力できる:     ${bySlug.size}`);
console.log(`  読みが未登録:   ${missingKana.length}  -> data/missing-kana.json`);
console.log(`  地区が未指定:   ${missingDistrict.length}`);
console.log(`  その他の問題:   ${problems.length}`);
for (const p of problems.slice(0, 20)) console.log(`    - ${p.officialName}: ${p.reason}`);
for (const m of missingDistrict.slice(0, 20)) console.log(`    - ${m.officialName}: 「${m.city}」がどの地区か分からない`);

const renamed = [...bySlug.values()].filter((s) => s.slug.includes("-"));
console.log(`\nslugが重複して地区名を足したもの: ${renamed.length}`);

if (checkers.size === 0) {
  console.log("\n硬式野球部の絞り込み: 名簿が未登録のため全校を公開扱い");
} else {
  console.log("\n硬式野球部の絞り込み（data/baseball-clubs.json）");
  const screenedTotal = [...screening.values()].reduce((n, t) => n + t.member, 0);
  const droppedTotal = [...screening.values()].reduce((n, t) => n + t.nonMember.length, 0);
  console.log(`  調査済み: ${screening.size}地区 / 公開 ${screenedTotal}校 / 下書き ${droppedTotal}校`);
  console.log(`  未調査:   ${49 - screening.size}地区（女子校だけ下書き、あとは公開）`);
  console.log(`  女子校として下書きにした: ${girlsOnly.length}校`);
  if (girlsOnly.length) console.log(`    ${girlsOnly.join(" ")}`);

  for (const [prefectureSlug, tally] of screening) {
    console.log(`\n  [${prefectureSlug}] 部あり ${tally.member} / 部なし ${tally.nonMember.length}`);
    if (tally.nonMember.length) console.log(`    下書きにした: ${tally.nonMember.join(" ")}`);
    const leftover = checkers.get(prefectureSlug).unmatchedNames();
    if (leftover.length) {
      // 名簿にあってこちらのデータで見つからなかった名前。
      // 私立・高専の取りこぼしか、表記の違い。目視で確かめる。
      console.log(`    名簿にあって照合できず: ${leftover.join(" ")}`);
    }
  }
}

for (const name of regionNames) {
  const schools = [...bySlug.values()].filter((s) => s.regionName === name);
  if (schools.length === 0) continue;

  const values = schools
    .map(
      (s) =>
        `  (${sqlString(s.slug)}, ${sqlString(s.name)}, ${sqlString(s.officialName)}, ` +
        `(select id from public.prefectures where slug = ${sqlString(s.prefectureSlug)}), ` +
        `${sqlString(s.city)}, ${sqlString(s.establishment)}::public.establishment, ` +
        `${sqlString(s.schoolKind)}::public.school_kind, ${sqlString(s.status)}::public.content_status)`,
    )
    .join(",\n");

  const sql = `-- ============================================================
-- ${name}の公立高校（${schools.length}校）
--
-- 出典: 文部科学省「学校コード一覧」（令和8年5月1日時点）
--       https://www.mext.go.jp/b_menu/toukei/mext_01087.html
--
-- このファイルは scripts/build-school-seed.mjs が生成する。直接編集しない。
-- 学校名・所在地・設置区分は上記の公的データそのまま。
-- 読み（URLのローマ字slugのもと）だけ data/school-kana.json で補っている。
--
-- 甲子園出場歴・創立年・紹介文は含まない。別途入れる。
-- ============================================================

insert into public.schools
  (slug, name, official_name, prefecture_id, city, establishment, school_kind, status)
values
${values}
on conflict (slug) do update set
  name          = excluded.name,
  official_name = excluded.official_name,
  prefecture_id = excluded.prefecture_id,
  city          = excluded.city,
  establishment = excluded.establishment,
  school_kind   = excluded.school_kind,
  -- 硬式野球部の有無で公開・非公開が変わるので、流し直しで反映されるようにする
  status        = excluded.status;
`;

  const outPath = path.join(root, "supabase", `schools_${name}.sql`);
  await writeFile(outPath, sql, "utf-8");
  console.log(`  ${path.relative(root, outPath)}  ${schools.length}校`);

  // 市区町村の切り出しは間違えても気づきにくいので、一覧を出して目視できるようにする
  if (process.argv.includes("--cities")) {
    const cities = [...new Set(schools.map((s) => s.city))].sort();
    console.log(`    市区町村（${cities.length}）: ${cities.join(" ")}`);
  }
}
