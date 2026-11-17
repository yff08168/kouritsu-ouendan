// 公立旋風 第2弾・地方大会（夏）の決勝の記録。激戦区（千葉・福岡・神奈川・埼玉・兵庫・愛知・大阪・東京）の公立校。
//
// 出典は Wikipedia「全国高等学校野球選手権◯◯大会」の歴代代表校の表（決勝の点数・相手・年）。
// 勝ち上がり（1試合ずつ）は持たない（kind: "table"）。**1975年以降だけを数える**（model.mjs の TABLE_SINCE）。
//
// slug は「学校-最後に優勝した年（優勝が無ければ最後の決勝の年）-summer」。
// 題に年・季節を入れない。年は year 列が持つ。
//
// run.koshien … 「甲子園では、1979年にベスト4、…」の成績を甲子園データで検算するための校名と県
// run.extraYears … 本文で触れてよい「決勝の年以外の年」（甲子園・春の選抜・別の大会の年）
const T = (district, school, extra = {}) => ({ kind: "table", district, school, ...extra });

const DEFINITIONS = [
  // ---------------- 千葉 ----------------
  {
    slug: "choshishogyo-2005-summer", school: "choshishogyo", year: 2005, season: "summer", level: "prefectural",
    prefecture: "chiba", badge: "優勝",
    run: T("chiba", "銚子商", { koshien: { display: "銚子商", pref: "千葉" }, extraYears: [1974] }),
  },
  {
    slug: "narashino-2019-summer", school: "narashino", year: 2019, season: "summer", level: "prefectural",
    prefecture: "chiba", badge: "優勝",
    run: T("chiba", "習志野", { koshien: { display: "習志野", pref: "千葉" } }),
  },
  {
    slug: "chiba-funabashi-2025-summer", school: "chiba-funabashi", year: 2025, season: "summer", level: "prefectural",
    prefecture: "chiba", badge: "優勝",
    run: T("chiba", "市船橋", { koshien: { display: "市船橋", pref: "千葉" } }),
  },
  {
    slug: "abiko-1991-summer", school: "abiko", year: 1991, season: "summer", level: "prefectural",
    prefecture: "chiba", badge: "優勝",
    run: T("chiba", "我孫子", { koshien: { display: "我孫子", pref: "千葉" } }),
  },
  {
    slug: "hakuryo-1999-summer", school: "hakuryo", year: 1999, season: "summer", level: "prefectural",
    prefecture: "chiba", badge: "優勝",
    run: T("chiba", "柏陵", { koshien: { display: "柏陵", pref: "千葉" } }),
  },
  // ---------------- 福岡 ----------------
  {
    slug: "tochiku-2026-summer", school: "tochiku", year: 2026, season: "summer", level: "prefectural",
    prefecture: "fukuoka", badge: "優勝",
    run: T("fukuoka", "東筑", { koshien: { display: "東筑", pref: "福岡" } }),
  },
  {
    slug: "kurumeshogyo-1985-summer", school: "kurumeshogyo", year: 1985, season: "summer", level: "prefectural",
    prefecture: "fukuoka", badge: "優勝",
    run: T("fukuoka", "久留米商", { koshien: { display: "久留米商", pref: "福岡" }, extraYears: [1962] }),
  },
  // ---------------- 神奈川 ----------------
  {
    slug: "yokohamashogyo-1990-summer", school: "yokohamashogyo", year: 1990, season: "summer", level: "prefectural",
    prefecture: "kanagawa", badge: "優勝",
    run: T("kanagawa", "横浜商", { koshien: { display: "横浜商", pref: "神奈川" } }),
  },
  {
    slug: "kanagawakogyo-2004-summer", school: "kanagawakogyo", year: 2004, season: "summer", level: "prefectural",
    prefecture: "kanagawa", badge: "準優勝",
    run: T("kanagawa", "神奈川工"),
  },
  // ---------------- 埼玉 ----------------
  {
    slug: "ageo-1984-summer", school: "ageo", year: 1984, season: "summer", level: "prefectural",
    prefecture: "saitama", badge: "優勝",
    run: T("saitama", "上尾", { koshien: { display: "上尾", pref: "埼玉" } }),
  },
  {
    slug: "kumagayashogyo-1981-summer", school: "kumagayashogyo", year: 1981, season: "summer", level: "prefectural",
    prefecture: "saitama", badge: "優勝",
    run: T("saitama", "熊谷商", { koshien: { display: "熊谷商", pref: "埼玉" } }),
  },
  {
    slug: "tokorozawashogyo-1983-summer", school: "tokorozawashogyo", year: 1983, season: "summer", level: "prefectural",
    prefecture: "saitama", badge: "優勝",
    run: T("saitama", "所沢商", { koshien: { display: "所沢商", pref: "埼玉" } }),
  },
  {
    slug: "omiyahigashi-1990-summer", school: "omiyahigashi", year: 1990, season: "summer", level: "prefectural",
    prefecture: "saitama", badge: "優勝",
    run: T("saitama", "大宮東", { koshien: { display: "大宮東", pref: "埼玉" }, extraYears: [1993] }),
  },
  // ---------------- 兵庫 ----------------
  {
    slug: "hyogo-yashiro-2026-summer", school: "hyogo-yashiro", year: 2026, season: "summer", level: "prefectural",
    prefecture: "hyogo", badge: "優勝",
    run: T("hyogo", "社", { koshien: { display: "社", pref: "兵庫" }, extraYears: [2004] }),
  },
  {
    slug: "hyogo-amagasaki-2016-summer", school: "hyogo-amagasaki", year: 2016, season: "summer", level: "prefectural",
    prefecture: "hyogo", badge: "優勝",
    run: T("hyogo", "市尼崎", { koshien: { display: "市尼崎", pref: "兵庫" } }),
  },
  {
    slug: "himejikogyo-2005-summer", school: "himejikogyo", year: 2005, season: "summer", level: "prefectural",
    prefecture: "hyogo", badge: "優勝",
    run: T("hyogo", "姫路工", { koshien: { display: "姫路工", pref: "兵庫" } }),
  },
  {
    slug: "sumoto-1975-summer", school: "sumoto", year: 1975, season: "summer", level: "prefectural",
    prefecture: "hyogo", badge: "優勝",
    run: T("hyogo", "洲本", { koshien: { display: "洲本", pref: "兵庫" } }),
  },
  {
    slug: "nishiwakikogyo-2013-summer", school: "nishiwakikogyo", year: 2013, season: "summer", level: "prefectural",
    prefecture: "hyogo", badge: "優勝",
    run: T("hyogo", "西脇工", { koshien: { display: "西脇工", pref: "兵庫" } }),
  },
  // ---------------- 愛知 ----------------
  {
    slug: "obu-2008-summer", school: "obu", extraSchools: ["aichi-seisho"], year: 2008, season: "summer", level: "prefectural",
    prefecture: "aichi", badge: "優勝",
    run: T("aichi", "大府", { koshien: { display: "大府", pref: "愛知" }, extraYears: [2021] }),
  },
  {
    slug: "toyotanishi-2001-summer", school: "toyotanishi", year: 2001, season: "summer", level: "prefectural",
    prefecture: "aichi", badge: "準優勝",
    run: T("aichi", "豊田西"),
  },
  // ---------------- 大阪 ----------------
  {
    slug: "kasugaoka-1982-summer", school: "kasugaoka", year: 1982, season: "summer", level: "prefectural",
    prefecture: "osaka", badge: "優勝",
    run: T("osaka", "春日丘", { koshien: { display: "春日丘", pref: "大阪" } }),
  },
  {
    slug: "sakuranomiya-1988-summer", school: "sakuranomiya", year: 1988, season: "summer", level: "prefectural",
    prefecture: "osaka", badge: "準優勝",
    run: T("osaka", "桜宮"),
  },
  {
    slug: "shibutani-1990-summer", school: "shibutani", year: 1990, season: "summer", level: "prefectural",
    prefecture: "osaka", badge: "優勝",
    run: T("osaka", "渋谷", { koshien: { display: "渋谷", pref: "大阪" } }),
  },
  {
    slug: "okanmuri-2017-summer", school: "okanmuri", year: 2017, season: "summer", level: "prefectural",
    prefecture: "osaka", badge: "準優勝",
    run: T("osaka", "大冠"),
  },
  // ---------------- 東京 ----------------
  {
    slug: "joto-2001-summer", school: "joto", year: 2001, season: "summer", level: "prefectural",
    prefecture: "higashi-tokyo", badge: "優勝",
    run: T("higashi-tokyo", "城東", { koshien: { display: "城東", pref: "東東京" }, extraYears: [2022] }),
  },
  {
    slug: "yukigaya-2003-summer", school: "yukigaya", year: 2003, season: "summer", level: "prefectural",
    prefecture: "higashi-tokyo", badge: "優勝",
    run: T("higashi-tokyo", "雪谷", { koshien: { display: "雪谷", pref: "東東京" } }),
  },
  {
    slug: "kunitachi-1980-summer", school: "kunitachi", year: 1980, season: "summer", level: "prefectural",
    prefecture: "nishi-tokyo", badge: "優勝",
    run: T("nishi-tokyo", "国立", { koshien: { display: "国立", pref: "西東京" } }),
  },
  {
    slug: "higashiyamato-1985-summer", school: "higashiyamato", year: 1985, season: "summer", level: "prefectural",
    prefecture: "nishi-tokyo", badge: "準優勝",
    run: T("nishi-tokyo", "東大和", { extraYears: [1980] }),
  },
];

export default DEFINITIONS;
