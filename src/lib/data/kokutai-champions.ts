/**
 * 国民スポーツ大会（旧・国民体育大会）高校野球競技・硬式の部の歴代優勝校。
 *
 * ★ このファイルは scripts/build-kokutai-champions.mjs が生成する。直接編集しない。★
 * 出典: ja.wikipedia.org「国民スポーツ大会高等学校野球競技」の「歴代優勝校一覧」（CC BY-SA 4.0）。
 *
 * 取り込んでいるのは**事実データだけ**（回・年・優勝校・県・決勝のスコア・準優勝校）。
 * 注記は脚注の名前から自分の言葉で付けている（記事の文章は取り込まない）。
 * 軟式の部は取っていない。学校マスタとの照合は画面側（`getSchoolNameIndex("koshien")`）。
 *
 * 毎年10月の大会後に `node scripts/build-kokutai-champions.mjs --refresh` で更新する。
 */

export type KokutaiTeam = {
  /** 記事内での表記（「浪華商」など） */
  name: string;
  /** 表に書かれている都道府県名 */
  prefecture: string | null;
};

export type KokutaiChampion = {
  /** 第N回。特別国体は「特」 */
  edition: string;
  year: number;
  /** 優勝校。雨天打ち切りや決勝の引き分けで複数のことがある。優勝校なしは空 */
  champions: KokutaiTeam[];
  /** 決勝のスコア（優勝校が1校のときだけ） */
  score: string | null;
  /** 準優勝校（優勝校が1校のときだけ） */
  runnerUp: KokutaiTeam | null;
  /** 「雨天のため打ち切り。大会規定により4校優勝」など */
  note: string | null;
};

/** 出典表示。ページに必ず出す。 */
export const KOKUTAI_SOURCE = {
  title: "国民スポーツ大会高等学校野球競技",
  url: "https://ja.wikipedia.org/wiki/%E5%9B%BD%E6%B0%91%E3%82%B9%E3%83%9D%E3%83%BC%E3%83%84%E5%A4%A7%E4%BC%9A%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E7%AB%B6%E6%8A%80#%E6%AD%B4%E4%BB%A3%E5%84%AA%E5%8B%9D%E6%A0%A1%E4%B8%80%E8%A6%A7",
  license: "CC BY-SA 4.0",
  fetchedAt: "2026-09-21T09:28:51.083Z",
} as const;

export const KOKUTAI_CHAMPIONS: readonly KokutaiChampion[] = [
  { edition: "1", year: 1946, champions: [{ name: "浪華商", prefecture: "大阪" }], score: "8-3", runnerUp: { name: "東京高師附中", prefecture: "東京" }, note: null },
  { edition: "2", year: 1947, champions: [{ name: "岐阜商", prefecture: "岐阜" }], score: "2-1", runnerUp: { name: "小倉中", prefecture: "福岡" }, note: null },
  { edition: "3", year: 1948, champions: [{ name: "西京商", prefecture: "京都" }], score: "2-0", runnerUp: { name: "小倉", prefecture: "福岡" }, note: null },
  { edition: "4", year: 1949, champions: [{ name: "静岡城内", prefecture: "静岡" }], score: "2-1", runnerUp: { name: "明治", prefecture: "東京" }, note: null },
  { edition: "5", year: 1950, champions: [{ name: "瑞陵", prefecture: "愛知" }], score: "2-1", runnerUp: { name: "宇都宮工", prefecture: "栃木" }, note: null },
  { edition: "6", year: 1951, champions: [{ name: "広島観音", prefecture: "広島" }], score: "1-0", runnerUp: { name: "芦屋", prefecture: "兵庫" }, note: null },
  { edition: "7", year: 1952, champions: [{ name: "盛岡商", prefecture: "岩手" }], score: "4-0", runnerUp: { name: "芦屋", prefecture: "兵庫" }, note: null },
  { edition: "8", year: 1953, champions: [{ name: "中京商", prefecture: "愛知" }], score: "2-1", runnerUp: { name: "徳島商", prefecture: "徳島" }, note: null },
  { edition: "9", year: 1954, champions: [{ name: "高知商", prefecture: "高知" }], score: "2-0", runnerUp: { name: "新宮", prefecture: "和歌山" }, note: null },
  { edition: "10", year: 1955, champions: [{ name: "四日市", prefecture: "三重" }], score: "4-3", runnerUp: { name: "若狭", prefecture: "福井" }, note: null },
  { edition: "11", year: 1956, champions: [{ name: "中京商", prefecture: "愛知" }], score: "1-0", runnerUp: { name: "米子東", prefecture: "鳥取" }, note: null },
  { edition: "12", year: 1957, champions: [{ name: "坂出商", prefecture: "香川" }], score: "1-0", runnerUp: { name: "広島商", prefecture: "広島" }, note: null },
  { edition: "13", year: 1958, champions: [{ name: "作新学院", prefecture: "栃木" }, { name: "高松商", prefecture: "香川" }], score: null, runnerUp: null, note: "2校優勝" },
  { edition: "14", year: 1959, champions: [{ name: "日大二", prefecture: "東京" }], score: "4-2", runnerUp: { name: "平安", prefecture: "京都" }, note: null },
  { edition: "15", year: 1960, champions: [{ name: "北海", prefecture: "北海道" }], score: "3-0", runnerUp: { name: "米子東", prefecture: "鳥取" }, note: null },
  { edition: "16", year: 1961, champions: [{ name: "中京商", prefecture: "愛知" }], score: "6-1", runnerUp: { name: "報徳学園", prefecture: "兵庫" }, note: null },
  { edition: "17", year: 1962, champions: [{ name: "西条", prefecture: "愛媛" }], score: "2-0", runnerUp: { name: "久留米商", prefecture: "福岡" }, note: null },
  { edition: "18", year: 1963, champions: [{ name: "下関商", prefecture: "山口" }], score: "5-4", runnerUp: { name: "磐城", prefecture: "福島" }, note: null },
  { edition: "19", year: 1964, champions: [{ name: "博多工", prefecture: "福岡" }], score: "2-0", runnerUp: { name: "尾道商", prefecture: "広島" }, note: null },
  { edition: "20", year: 1965, champions: [{ name: "銚子商", prefecture: "千葉" }], score: "4-1", runnerUp: { name: "岐阜短大付", prefecture: "岐阜" }, note: null },
  { edition: "21", year: 1966, champions: [{ name: "松山商", prefecture: "愛媛" }], score: "1-0", runnerUp: { name: "津久見", prefecture: "大分" }, note: null },
  { edition: "22", year: 1967, champions: [{ name: "大宮", prefecture: "埼玉" }], score: "5-1", runnerUp: { name: "大分商", prefecture: "大分" }, note: null },
  { edition: "23", year: 1968, champions: [{ name: "若狭", prefecture: "福井" }], score: "4-1", runnerUp: { name: "松山商", prefecture: "愛媛" }, note: null },
  { edition: "24", year: 1969, champions: [{ name: "静岡商", prefecture: "静岡" }], score: "1-0", runnerUp: { name: "玉島商", prefecture: "岡山" }, note: null },
  { edition: "25", year: 1970, champions: [{ name: "PL学園", prefecture: "大阪" }], score: "2-1", runnerUp: { name: "大分商", prefecture: "大分" }, note: null },
  { edition: "26", year: 1971, champions: [{ name: "岡山東商", prefecture: "岡山" }], score: "5-3", runnerUp: { name: "報徳学園", prefecture: "兵庫" }, note: null },
  { edition: "27", year: 1972, champions: [{ name: "明星", prefecture: "大阪" }], score: "7-2", runnerUp: { name: "高松一", prefecture: "香川" }, note: null },
  { edition: "28", year: 1973, champions: [{ name: "銚子商", prefecture: "千葉" }], score: "3-2", runnerUp: { name: "作新学院", prefecture: "栃木" }, note: null },
  { edition: "特", year: 1973, champions: [{ name: "岩国", prefecture: "山口" }], score: "5-1", runnerUp: { name: "宮崎実", prefecture: "宮崎" }, note: null },
  { edition: "29", year: 1974, champions: [{ name: "土浦日大", prefecture: "茨城" }], score: "2-1", runnerUp: { name: "銚子商", prefecture: "千葉" }, note: null },
  { edition: "30", year: 1975, champions: [{ name: "習志野", prefecture: "千葉" }], score: "4-3", runnerUp: { name: "新居浜商", prefecture: "愛媛" }, note: null },
  { edition: "31", year: 1976, champions: [{ name: "PL学園", prefecture: "大阪" }], score: "2-1", runnerUp: { name: "海星", prefecture: "長崎" }, note: null },
  { edition: "32", year: 1977, champions: [{ name: "早稲田実", prefecture: "東京" }], score: "5-2", runnerUp: { name: "東洋大姫路", prefecture: "兵庫" }, note: null },
  { edition: "33", year: 1978, champions: [{ name: "報徳学園", prefecture: "兵庫" }], score: "3-2", runnerUp: { name: "中京", prefecture: "愛知" }, note: null },
  { edition: "34", year: 1979, champions: [{ name: "箕島", prefecture: "和歌山" }, { name: "都城", prefecture: "宮崎" }, { name: "浪商", prefecture: "大阪" }, { name: "浜田", prefecture: "島根" }], score: null, runnerUp: null, note: "雨天のため打ち切り。大会規定により4校優勝" },
  { edition: "35", year: 1980, champions: [{ name: "横浜", prefecture: "神奈川" }], score: "4-2", runnerUp: { name: "秋田商", prefecture: "秋田" }, note: null },
  { edition: "36", year: 1981, champions: [{ name: "今治西", prefecture: "愛媛" }], score: "2-1", runnerUp: { name: "早稲田実", prefecture: "東京" }, note: null },
  { edition: "37", year: 1982, champions: [{ name: "広島商", prefecture: "広島" }], score: "3-1", runnerUp: { name: "池田", prefecture: "徳島" }, note: null },
  { edition: "38", year: 1983, champions: [{ name: "中京", prefecture: "愛知" }], score: "4-3", runnerUp: { name: "横浜商", prefecture: "神奈川" }, note: null },
  { edition: "39", year: 1984, champions: [{ name: "取手二", prefecture: "茨城" }], score: "5-4", runnerUp: { name: "PL学園", prefecture: "大阪" }, note: null },
  { edition: "40", year: 1985, champions: [{ name: "高知商", prefecture: "高知" }], score: "5-1", runnerUp: { name: "宇部商", prefecture: "山口" }, note: null },
  { edition: "41", year: 1986, champions: [{ name: "鹿児島商", prefecture: "鹿児島" }], score: "3-1", runnerUp: { name: "東洋大姫路", prefecture: "兵庫" }, note: null },
  { edition: "42", year: 1987, champions: [{ name: "帝京", prefecture: "東京" }], score: "1-0", runnerUp: { name: "沖縄水産", prefecture: "沖縄" }, note: null },
  { edition: "43", year: 1988, champions: [{ name: "沖縄水産", prefecture: "沖縄" }], score: "6-0", runnerUp: { name: "江の川", prefecture: "島根" }, note: null },
  { edition: "44", year: 1989, champions: [{ name: "上宮", prefecture: "大阪" }], score: "5-2", runnerUp: { name: "福岡大大濠", prefecture: "福岡" }, note: null },
  { edition: "45", year: 1990, champions: [{ name: "鹿児島実", prefecture: "鹿児島" }], score: "4-3", runnerUp: { name: "松山商", prefecture: "愛媛" }, note: null },
  { edition: "46", year: 1991, champions: [{ name: "松商学園", prefecture: "長野" }], score: "5-1", runnerUp: { name: "星稜", prefecture: "石川" }, note: null },
  { edition: "47", year: 1992, champions: [{ name: "星稜", prefecture: "石川" }], score: "3-0", runnerUp: { name: "尽誠学園", prefecture: "香川" }, note: null },
  { edition: "48", year: 1993, champions: [{ name: "修徳", prefecture: "東京" }], score: "10-0", runnerUp: { name: "小林西", prefecture: "宮崎" }, note: null },
  { edition: "49", year: 1994, champions: [{ name: "北海", prefecture: "北海道" }], score: "7-2", runnerUp: { name: "愛知", prefecture: "愛知" }, note: null },
  { edition: "50", year: 1995, champions: [{ name: "PL学園", prefecture: "大阪" }], score: "7-6", runnerUp: { name: "柳川", prefecture: "福岡" }, note: null },
  { edition: "51", year: 1996, champions: [{ name: "PL学園", prefecture: "大阪" }], score: "7-2", runnerUp: { name: "福井商", prefecture: "福井" }, note: null },
  { edition: "52", year: 1997, champions: [{ name: "徳島商", prefecture: "徳島" }], score: "5-4", runnerUp: { name: "前橋工", prefecture: "群馬" }, note: null },
  { edition: "53", year: 1998, champions: [{ name: "横浜", prefecture: "神奈川" }], score: "2-1", runnerUp: { name: "京都成章", prefecture: "京都" }, note: null },
  { edition: "54", year: 1999, champions: [{ name: "智弁和歌山", prefecture: "和歌山" }], score: "7-1", runnerUp: { name: "滝川二", prefecture: "兵庫" }, note: null },
  { edition: "55", year: 2000, champions: [{ name: "横浜", prefecture: "神奈川" }], score: "6-4", runnerUp: { name: "長崎日大", prefecture: "長崎" }, note: null },
  { edition: "56", year: 2001, champions: [{ name: "横浜", prefecture: "神奈川" }], score: "6-5", runnerUp: { name: "智弁学園", prefecture: "奈良" }, note: null },
  { edition: "57", year: 2002, champions: [{ name: "川之江", prefecture: "愛媛" }], score: "5-4", runnerUp: { name: "帝京", prefecture: "東京" }, note: null },
  { edition: "58", year: 2003, champions: [{ name: "光星学院", prefecture: "青森" }], score: "9-7", runnerUp: { name: "小松島", prefecture: "徳島" }, note: null },
  { edition: "59", year: 2004, champions: [{ name: "横浜", prefecture: "神奈川" }], score: "10-3", runnerUp: { name: "東北", prefecture: "宮城" }, note: null },
  { edition: "60", year: 2005, champions: [{ name: "駒大苫小牧", prefecture: "北海道" }], score: "9-1", runnerUp: { name: "遊学館", prefecture: "石川" }, note: null },
  { edition: "61", year: 2006, champions: [{ name: "早稲田実", prefecture: "東京" }], score: "1-0", runnerUp: { name: "駒大苫小牧", prefecture: "北海道" }, note: null },
  { edition: "62", year: 2007, champions: [{ name: "今治西", prefecture: "愛媛" }], score: "2-1", runnerUp: { name: "広陵", prefecture: "広島" }, note: null },
  { edition: "63", year: 2008, champions: [], score: null, runnerUp: null, note: "雨天のため打ち切り。優勝校なし" },
  { edition: "64", year: 2009, champions: [{ name: "県岐阜商", prefecture: "岐阜" }], score: "11-4", runnerUp: { name: "都城商", prefecture: "宮崎" }, note: null },
  { edition: "65", year: 2010, champions: [], score: null, runnerUp: null, note: "雨天のため打ち切り。優勝校なし" },
  { edition: "66", year: 2011, champions: [{ name: "日大三", prefecture: "東京" }], score: "4-3", runnerUp: { name: "習志野", prefecture: "千葉" }, note: null },
  { edition: "67", year: 2012, champions: [{ name: "大阪桐蔭", prefecture: "大阪" }, { name: "仙台育英", prefecture: "宮城" }], score: null, runnerUp: null, note: "雨天のため打ち切り。大会規定により2校優勝" },
  { edition: "68", year: 2013, champions: [{ name: "大阪桐蔭", prefecture: "大阪" }, { name: "修徳", prefecture: "東京" }], score: "10-10", runnerUp: null, note: "決勝が引き分けで両校優勝" },
  { edition: "69", year: 2014, champions: [{ name: "明徳義塾", prefecture: "高知" }], score: "3-2", runnerUp: { name: "健大高崎", prefecture: "群馬" }, note: null },
  { edition: "70", year: 2015, champions: [{ name: "東海大相模", prefecture: "神奈川" }], score: "7-5", runnerUp: { name: "中京大中京", prefecture: "愛知" }, note: null },
  { edition: "71", year: 2016, champions: [{ name: "履正社", prefecture: "大阪" }], score: "14-6", runnerUp: { name: "広島新庄", prefecture: "広島" }, note: null },
  { edition: "72", year: 2017, champions: [{ name: "広陵", prefecture: "広島" }], score: "7-4", runnerUp: { name: "大阪桐蔭", prefecture: "大阪" }, note: null },
  { edition: "73", year: 2018, champions: [{ name: "浦和学院", prefecture: "埼玉" }], score: "4-3", runnerUp: { name: "報徳学園", prefecture: "兵庫" }, note: null },
  { edition: "74", year: 2019, champions: [{ name: "関東一", prefecture: "東京" }], score: "10-2", runnerUp: { name: "海星", prefecture: "長崎" }, note: null },
  { edition: "77", year: 2022, champions: [{ name: "大阪桐蔭", prefecture: "大阪" }], score: "5-1", runnerUp: { name: "聖光学院", prefecture: "福島" }, note: null },
  { edition: "特", year: 2023, champions: [{ name: "仙台育英", prefecture: "宮城" }], score: "9-7", runnerUp: { name: "北海", prefecture: "北海道" }, note: null },
  { edition: "78", year: 2024, champions: [{ name: "明徳義塾", prefecture: "高知" }], score: "3-1", runnerUp: { name: "小松大谷", prefecture: "石川" }, note: null },
  { edition: "79", year: 2025, champions: [{ name: "山梨学院", prefecture: "山梨" }], score: "3-1", runnerUp: { name: "高川学園", prefecture: "山口" }, note: null },
];
