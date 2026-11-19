/**
 * 明治神宮野球大会（高校の部）の歴代の優勝校・準優勝校・決勝のスコア・出場校数。
 *
 * ★ このファイルは scripts/build-jingu-champions.mjs が生成する。直接編集しない。★
 * 出典: ja.wikipedia「明治神宮野球大会」の「歴代結果（高校の部）」（CC BY-SA 4.0）。
 *
 * 取り込んでいるのは**事実データだけ**（回・年・校数・優勝校・地区・県・決勝のスコア・準優勝校・地区・県）。
 * 備考の文章は取り込んでいない。中止の年は回と年だけ（`JINGU_CHAMPIONS_CANCELLED`）。
 * ★高校の部は第4回（1973年）から。
 * ★生成時に、記事の中の整合（回の欠け・年の重複・各行の欠け）と、
 *   `jingu-games.json` の決勝との一致（24 大会。優勝校・準優勝校・スコア・出場校数）を確かめてある。
 * ★地区は**出典の表記のまま**（古い年は「中部」）。東京・北海道は地区も県も同じ語。
 *   都道府県で数えるときは `prefectureKey`（koshien-games.ts）で寄せること（出典は「北海道」「東京」と書く）。
 * ★校名は記事の略称（高松商・九州国際大付）。**画面で学校マスタに引くときは甲子園と同じ規則（`getSchoolNameIndex("koshien")`）。**
 */

export type JinguChampionTeam = {
  /** 記事の表記（「高松商」「九州国際大付」） */
  name: string;
  /** 「北信越」「東京」「中部」。出典の表記のまま */
  region: string;
  /** 「福井」「東京」「北海道」 */
  prefecture: string;
};

export type JinguChampion = {
  /** 第N回 */
  no: number;
  year: number;
  /** 出場校数 */
  schoolCount: number;
  champion: JinguChampionTeam;
  /** 「3-2」（優勝校の得点が先） */
  score: string;
  /** サヨナラ */
  walkOff: boolean;
  runnerUp: JinguChampionTeam;
};

/** 開催が中止された年（高校の部の回数は数えている） */
export const JINGU_CHAMPIONS_CANCELLED: readonly { no: number; year: number }[] = [
  { no: 19, year: 1988 },
  { no: 51, year: 2020 },
];

export const JINGU_CHAMPIONS_SOURCE = {"name":"ja.wikipedia「明治神宮野球大会」","url":"https://ja.wikipedia.org/wiki/%E6%98%8E%E6%B2%BB%E7%A5%9E%E5%AE%AE%E9%87%8E%E7%90%83%E5%A4%A7%E4%BC%9A"} as const;

export const JINGU_CHAMPIONS: readonly JinguChampion[] = [
  { no: 4, year: 1973, schoolCount: 10, champion: { name: "若狭", region: "北信越", prefecture: "福井" }, score: "3-2", walkOff: true, runnerUp: { name: "平安", region: "近畿", prefecture: "京都" } },
  { no: 5, year: 1974, schoolCount: 10, champion: { name: "福井商", region: "北信越", prefecture: "福井" }, score: "2-1", walkOff: false, runnerUp: { name: "日大山形", region: "東北", prefecture: "山形" } },
  { no: 6, year: 1975, schoolCount: 10, champion: { name: "徳島商", region: "四国", prefecture: "徳島" }, score: "5-0", walkOff: false, runnerUp: { name: "自動車工", region: "中部", prefecture: "静岡" } },
  { no: 7, year: 1976, schoolCount: 10, champion: { name: "早稲田実", region: "東京", prefecture: "東京" }, score: "13-5", walkOff: false, runnerUp: { name: "大田", region: "中国", prefecture: "島根" } },
  { no: 8, year: 1977, schoolCount: 10, champion: { name: "東北", region: "東北", prefecture: "宮城" }, score: "3-1", walkOff: false, runnerUp: { name: "高知商", region: "四国", prefecture: "高知" } },
  { no: 9, year: 1978, schoolCount: 10, champion: { name: "柳川商", region: "九州", prefecture: "福岡" }, score: "12-2", walkOff: false, runnerUp: { name: "市神港", region: "近畿", prefecture: "兵庫" } },
  { no: 10, year: 1979, schoolCount: 10, champion: { name: "東海大三", region: "北信越", prefecture: "長野" }, score: "3-2", walkOff: false, runnerUp: { name: "鳴門", region: "四国", prefecture: "徳島" } },
  { no: 11, year: 1980, schoolCount: 10, champion: { name: "星稜", region: "北信越", prefecture: "石川" }, score: "4-1", walkOff: false, runnerUp: { name: "早稲田実", region: "東京", prefecture: "東京" } },
  { no: 12, year: 1981, schoolCount: 10, champion: { name: "明徳", region: "四国", prefecture: "高知" }, score: "3-1", walkOff: false, runnerUp: { name: "大府", region: "中部", prefecture: "愛知" } },
  { no: 13, year: 1982, schoolCount: 8, champion: { name: "東北", region: "東北", prefecture: "宮城" }, score: "4-0", walkOff: false, runnerUp: { name: "尽誠学園", region: "四国", prefecture: "香川" } },
  { no: 14, year: 1983, schoolCount: 8, champion: { name: "岩倉", region: "東京", prefecture: "東京" }, score: "5-0", walkOff: false, runnerUp: { name: "京都商", region: "近畿", prefecture: "京都" } },
  { no: 15, year: 1984, schoolCount: 8, champion: { name: "国学院久我山", region: "東京", prefecture: "東京" }, score: "10-1", walkOff: false, runnerUp: { name: "松商学園", region: "北信越", prefecture: "長野" } },
  { no: 16, year: 1985, schoolCount: 8, champion: { name: "松商学園", region: "北信越", prefecture: "長野" }, score: "12-4", walkOff: false, runnerUp: { name: "帝京", region: "東京", prefecture: "東京" } },
  { no: 17, year: 1986, schoolCount: 8, champion: { name: "帝京", region: "東京", prefecture: "東京" }, score: "10-8", walkOff: false, runnerUp: { name: "愛知", region: "東海", prefecture: "愛知" } },
  { no: 18, year: 1987, schoolCount: 8, champion: { name: "堀越", region: "東京", prefecture: "東京" }, score: "3-2", walkOff: true, runnerUp: { name: "明石", region: "近畿", prefecture: "兵庫" } },
  { no: 20, year: 1989, schoolCount: 8, champion: { name: "東北", region: "東北", prefecture: "宮城" }, score: "2-0", walkOff: false, runnerUp: { name: "帝京", region: "東京", prefecture: "東京" } },
  { no: 21, year: 1990, schoolCount: 8, champion: { name: "国士舘", region: "東京", prefecture: "東京" }, score: "11-3", walkOff: false, runnerUp: { name: "木本", region: "東海", prefecture: "三重" } },
  { no: 22, year: 1991, schoolCount: 8, champion: { name: "星稜", region: "北信越", prefecture: "石川" }, score: "13-8", walkOff: false, runnerUp: { name: "帝京", region: "東京", prefecture: "東京" } },
  { no: 23, year: 1992, schoolCount: 8, champion: { name: "世田谷学園", region: "東京", prefecture: "東京" }, score: "12-8", walkOff: false, runnerUp: { name: "東海大相模", region: "関東", prefecture: "神奈川" } },
  { no: 24, year: 1993, schoolCount: 8, champion: { name: "東北", region: "東北", prefecture: "宮城" }, score: "5-2", walkOff: false, runnerUp: { name: "拓大一", region: "東京", prefecture: "東京" } },
  { no: 25, year: 1994, schoolCount: 8, champion: { name: "創価", region: "東京", prefecture: "東京" }, score: "6-3", walkOff: false, runnerUp: { name: "星稜", region: "北信越", prefecture: "石川" } },
  { no: 26, year: 1995, schoolCount: 8, champion: { name: "帝京", region: "東京", prefecture: "東京" }, score: "7-3", walkOff: false, runnerUp: { name: "福井商", region: "北信越", prefecture: "福井" } },
  { no: 27, year: 1996, schoolCount: 8, champion: { name: "上宮", region: "近畿", prefecture: "大阪" }, score: "8-7", walkOff: false, runnerUp: { name: "春日部共栄", region: "関東", prefecture: "埼玉" } },
  { no: 28, year: 1997, schoolCount: 8, champion: { name: "横浜", region: "関東", prefecture: "神奈川" }, score: "5-3", walkOff: false, runnerUp: { name: "沖縄水産", region: "九州", prefecture: "沖縄" } },
  { no: 29, year: 1998, schoolCount: 8, champion: { name: "日南学園", region: "九州", prefecture: "宮崎" }, score: "10-9", walkOff: true, runnerUp: { name: "日大三", region: "東京", prefecture: "東京" } },
  { no: 30, year: 1999, schoolCount: 10, champion: { name: "四日市工", region: "東海", prefecture: "三重" }, score: "14-13", walkOff: true, runnerUp: { name: "敦賀気比", region: "北信越", prefecture: "福井" } },
  { no: 31, year: 2000, schoolCount: 10, champion: { name: "東福岡", region: "九州", prefecture: "福岡" }, score: "8-0", walkOff: false, runnerUp: { name: "尽誠学園", region: "四国", prefecture: "香川" } },
  { no: 32, year: 2001, schoolCount: 10, champion: { name: "報徳学園", region: "近畿", prefecture: "兵庫" }, score: "10-1", walkOff: false, runnerUp: { name: "関西", region: "中国", prefecture: "岡山" } },
  { no: 33, year: 2002, schoolCount: 10, champion: { name: "中京", region: "東海", prefecture: "岐阜" }, score: "8-6", walkOff: false, runnerUp: { name: "延岡学園", region: "九州", prefecture: "宮崎" } },
  { no: 34, year: 2003, schoolCount: 10, champion: { name: "愛工大名電", region: "東海", prefecture: "愛知" }, score: "6-4", walkOff: false, runnerUp: { name: "大阪桐蔭", region: "近畿", prefecture: "大阪" } },
  { no: 35, year: 2004, schoolCount: 10, champion: { name: "柳ヶ浦", region: "九州", prefecture: "大分" }, score: "8-2", walkOff: false, runnerUp: { name: "愛工大名電", region: "東海", prefecture: "愛知" } },
  { no: 36, year: 2005, schoolCount: 10, champion: { name: "駒大苫小牧", region: "北海道", prefecture: "北海道" }, score: "5-0", walkOff: false, runnerUp: { name: "関西", region: "中国", prefecture: "岡山" } },
  { no: 37, year: 2006, schoolCount: 10, champion: { name: "高知", region: "四国", prefecture: "高知" }, score: "10-5", walkOff: false, runnerUp: { name: "報徳学園", region: "近畿", prefecture: "兵庫" } },
  { no: 38, year: 2007, schoolCount: 10, champion: { name: "常葉菊川", region: "東海", prefecture: "静岡" }, score: "5-4", walkOff: false, runnerUp: { name: "横浜", region: "関東", prefecture: "神奈川" } },
  { no: 39, year: 2008, schoolCount: 10, champion: { name: "慶応", region: "関東", prefecture: "神奈川" }, score: "8-6", walkOff: false, runnerUp: { name: "天理", region: "近畿", prefecture: "奈良" } },
  { no: 40, year: 2009, schoolCount: 10, champion: { name: "大垣日大", region: "東海", prefecture: "岐阜" }, score: "10-9", walkOff: false, runnerUp: { name: "東海大相模", region: "関東", prefecture: "神奈川" } },
  { no: 41, year: 2010, schoolCount: 10, champion: { name: "日大三", region: "東京", prefecture: "東京" }, score: "4-1", walkOff: false, runnerUp: { name: "鹿児島実", region: "九州", prefecture: "鹿児島" } },
  { no: 42, year: 2011, schoolCount: 10, champion: { name: "光星学院", region: "東北", prefecture: "青森" }, score: "6-5", walkOff: false, runnerUp: { name: "愛工大名電", region: "東海", prefecture: "愛知" } },
  { no: 43, year: 2012, schoolCount: 10, champion: { name: "仙台育英", region: "東北", prefecture: "宮城" }, score: "12-4", walkOff: false, runnerUp: { name: "関西", region: "中国", prefecture: "岡山" } },
  { no: 44, year: 2013, schoolCount: 10, champion: { name: "沖縄尚学", region: "九州", prefecture: "沖縄" }, score: "9-8", walkOff: false, runnerUp: { name: "日本文理", region: "北信越", prefecture: "新潟" } },
  { no: 45, year: 2014, schoolCount: 10, champion: { name: "仙台育英", region: "東北", prefecture: "宮城" }, score: "4-1", walkOff: false, runnerUp: { name: "浦和学院", region: "関東", prefecture: "埼玉" } },
  { no: 46, year: 2015, schoolCount: 10, champion: { name: "高松商", region: "四国", prefecture: "香川" }, score: "8-3", walkOff: false, runnerUp: { name: "敦賀気比", region: "北信越", prefecture: "福井" } },
  { no: 47, year: 2016, schoolCount: 10, champion: { name: "履正社", region: "近畿", prefecture: "大阪" }, score: "11-6", walkOff: false, runnerUp: { name: "早稲田実", region: "東京", prefecture: "東京" } },
  { no: 48, year: 2017, schoolCount: 10, champion: { name: "明徳義塾", region: "四国", prefecture: "高知" }, score: "4-0", walkOff: false, runnerUp: { name: "創成館", region: "九州", prefecture: "長崎" } },
  { no: 49, year: 2018, schoolCount: 10, champion: { name: "札幌大谷", region: "北海道", prefecture: "北海道" }, score: "2-1", walkOff: false, runnerUp: { name: "星稜", region: "北信越", prefecture: "石川" } },
  { no: 50, year: 2019, schoolCount: 10, champion: { name: "中京大中京", region: "東海", prefecture: "愛知" }, score: "4-3", walkOff: false, runnerUp: { name: "健大高崎", region: "関東", prefecture: "群馬" } },
  { no: 52, year: 2021, schoolCount: 10, champion: { name: "大阪桐蔭", region: "近畿", prefecture: "大阪" }, score: "11-7", walkOff: false, runnerUp: { name: "広陵", region: "中国", prefecture: "広島" } },
  { no: 53, year: 2022, schoolCount: 10, champion: { name: "大阪桐蔭", region: "近畿", prefecture: "大阪" }, score: "6-5", walkOff: false, runnerUp: { name: "広陵", region: "中国", prefecture: "広島" } },
  { no: 54, year: 2023, schoolCount: 10, champion: { name: "星稜", region: "北信越", prefecture: "石川" }, score: "3-1", walkOff: false, runnerUp: { name: "作新学院", region: "関東", prefecture: "栃木" } },
  { no: 55, year: 2024, schoolCount: 10, champion: { name: "横浜", region: "関東", prefecture: "神奈川" }, score: "4-3", walkOff: false, runnerUp: { name: "広島商", region: "中国", prefecture: "広島" } },
  { no: 56, year: 2025, schoolCount: 10, champion: { name: "九州国際大付", region: "九州", prefecture: "福岡" }, score: "11-1", walkOff: false, runnerUp: { name: "神戸国際大付", region: "近畿", prefecture: "兵庫" } },
];
