/**
 * 21世紀枠で選抜大会に出場した学校の一覧。
 *
 * ★ このファイルは scripts/build-21st-century.mjs が生成する。直接編集しない。★
 * 出典: ja.wikipedia.org「選抜高等学校野球大会」の「21世紀枠出場校一覧」（CC BY-SA 4.0）。
 *
 * 取り込んでいるのは**事実データだけ**（年・地区区分・校名）。
 * 記事に書かれている選考理由の文章は取り込んでいない（CC BY-SA の継承条件は
 * 事実の抽出では発動しないが、文章を持ってくると発動するため）。
 * 成績は DB の school_championships 側にある。表記を揃えるためそちらを使う。
 *
 * 毎年1月の選考後に `node scripts/build-21st-century.mjs --refresh` で更新する。
 */

export type TwentyFirstCenturyBerth = {
  year: number;
  /** 選出時の地区区分。「東日本」「西日本」「地域限定なし」など年によって変わる */
  region: string | null;
  /** 記事内での表記（「宜野座」など） */
  displayName: string;
  /** Wikipedia の記事名。学校マスタとの照合キー */
  article: string;
  /** 表に書かれている都道府県名 */
  prefectureText: string | null;
  /** 学校マスタと照合できた場合の slug。私立などマスタに無い学校は null */
  schoolSlug: string | null;
};

/** 出典表示。ページに必ず出す。 */
export const TWENTY_FIRST_CENTURY_SOURCE = {
  title: "選抜高等学校野球大会",
  url: "https://ja.wikipedia.org/wiki/%E9%81%B8%E6%8A%9C%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E5%A4%A7%E4%BC%9A#21%E4%B8%96%E7%B4%80%E6%9E%A0%E5%87%BA%E5%A0%B4%E6%A0%A1%E4%B8%80%E8%A6%A7",
  license: "CC BY-SA 4.0",
  generatedOn: "2026-08-12",
} as const;

/**
 * 大会が中止になった年。選出はされたが甲子園では1試合も行われていない
 * （代わりに「2020年甲子園高校野球交流試合」が行われた）。
 * DB の出場歴にもこの年の記録は入れていないので、画面では成績を出さずに注記する。
 */
export const CANCELLED_YEARS: readonly number[] = [2020];

export const TWENTY_FIRST_CENTURY_BERTHS: readonly TwentyFirstCenturyBerth[] = [
  { year: 2001, region: "東日本", displayName: "安積", article: "福島県立安積高等学校", prefectureText: "福島", schoolSlug: "asaka" },
  { year: 2001, region: "西日本", displayName: "宜野座", article: "沖縄県立宜野座高等学校", prefectureText: "沖縄", schoolSlug: "ginoza" },
  { year: 2002, region: "西日本", displayName: "松江北", article: "島根県立松江北高等学校", prefectureText: "島根", schoolSlug: "matsuekita" },
  { year: 2002, region: "東日本", displayName: "鵡川", article: "北海道鵡川高等学校", prefectureText: "北海道", schoolSlug: "mukawa" },
  { year: 2003, region: "西日本", displayName: "隠岐", article: "島根県立隠岐高等学校", prefectureText: "島根", schoolSlug: "shimane-oki" },
  { year: 2003, region: "東日本", displayName: "柏崎", article: "新潟県立柏崎高等学校", prefectureText: "新潟", schoolSlug: "kashiwazaki" },
  { year: 2004, region: "東日本", displayName: "一関一", article: "岩手県立一関第一高等学校・附属中学校", prefectureText: "岩手", schoolSlug: "ichinosekidaiichi" },
  { year: 2004, region: "西日本", displayName: "八幡浜", article: "愛媛県立八幡浜高等学校", prefectureText: "愛媛", schoolSlug: "yawatahama" },
  { year: 2005, region: "東日本", displayName: "一迫商", article: "宮城県一迫商業高等学校", prefectureText: "宮城", schoolSlug: "ichihasamashogyo" },
  { year: 2005, region: "西日本", displayName: "高松", article: "香川県立高松高等学校", prefectureText: "香川", schoolSlug: "takamatsu" },
  { year: 2006, region: "西日本", displayName: "金沢桜丘", article: "石川県立金沢桜丘高等学校", prefectureText: "石川", schoolSlug: "kanazawasakuragaoka" },
  { year: 2006, region: "東日本", displayName: "真岡工", article: "栃木県立真岡工業高等学校", prefectureText: "栃木", schoolSlug: "mokakogyo" },
  { year: 2007, region: "西日本", displayName: "都城泉ヶ丘", article: "宮崎県立都城泉ヶ丘高等学校・附属中学校", prefectureText: "宮崎", schoolSlug: "miyakonojoizumigaoka" },
  { year: 2007, region: "東日本", displayName: "都留", article: "山梨県立都留高等学校", prefectureText: "山梨", schoolSlug: "tsuru" },
  { year: 2008, region: "東日本", displayName: "安房", article: "千葉県立安房高等学校", prefectureText: "千葉", schoolSlug: "awa" },
  { year: 2008, region: "西日本", displayName: "華陵", article: "山口県立華陵高等学校", prefectureText: "山口", schoolSlug: "karyo" },
  { year: 2008, region: "中日本", displayName: "成章", article: "愛知県立成章高等学校", prefectureText: "愛知", schoolSlug: "aichi-seisho" },
  { year: 2009, region: "地域限定なし", displayName: "大分上野丘", article: "大分県立大分上野丘高等学校", prefectureText: "大分", schoolSlug: "oitauenogaoka" },
  { year: 2009, region: "西日本", displayName: "彦根東", article: "滋賀県立彦根東高等学校", prefectureText: "滋賀", schoolSlug: "hikonehigashi" },
  { year: 2009, region: "東日本", displayName: "利府", article: "宮城県利府高等学校", prefectureText: "宮城", schoolSlug: "rifu" },
  { year: 2010, region: "地域限定なし", displayName: "向陽", article: "和歌山県立向陽中学校・高等学校", prefectureText: "和歌山", schoolSlug: "wakayama-koyo" },
  { year: 2010, region: "東日本", displayName: "山形中央", article: "山形県立山形中央高等学校", prefectureText: "山形", schoolSlug: "yamagatachuo" },
  { year: 2010, region: "西日本", displayName: "川島", article: "徳島県立川島中学校・高等学校", prefectureText: "徳島", schoolSlug: "kawashima" },
  { year: 2011, region: "東日本", displayName: "佐渡", article: "新潟県立佐渡高等学校", prefectureText: "新潟", schoolSlug: "sado" },
  { year: 2011, region: "西日本", displayName: "城南", article: "徳島県立城南高等学校", prefectureText: "徳島", schoolSlug: "jonan" },
  { year: 2011, region: "地域限定なし", displayName: "大館鳳鳴", article: "秋田県立大館鳳鳴高等学校", prefectureText: "秋田", schoolSlug: "odatehomei" },
  { year: 2012, region: "西日本", displayName: "洲本", article: "兵庫県立洲本高等学校", prefectureText: "兵庫", schoolSlug: "sumoto" },
  { year: 2012, region: "地域限定なし", displayName: "女満別", article: "北海道大空高等学校", prefectureText: "北海道", schoolSlug: "ozora" },
  { year: 2012, region: "東日本", displayName: "石巻工", article: "宮城県石巻工業高等学校", prefectureText: "宮城", schoolSlug: "ishinomakikogyo" },
  { year: 2013, region: "東日本", displayName: "いわき海星", article: "福島県立小名浜海星高等学校", prefectureText: "福島", schoolSlug: "onahamakaisei" },
  { year: 2013, region: "地域限定なし", displayName: "益田翔陽", article: "島根県立益田翔陽高等学校", prefectureText: "島根", schoolSlug: "masudashoyo" },
  { year: 2013, region: "地域限定なし", displayName: "遠軽", article: "北海道遠軽高等学校", prefectureText: "北海道", schoolSlug: "engaru" },
  { year: 2013, region: "西日本", displayName: "土佐", article: "土佐中学校・高等学校", prefectureText: "高知", schoolSlug: null },
  { year: 2014, region: "西日本", displayName: "海南", article: "和歌山県立海南高等学校", prefectureText: "和歌山", schoolSlug: "kainan" },
  { year: 2014, region: "東日本", displayName: "小山台", article: "東京都立小山台高等学校", prefectureText: "東京", schoolSlug: "koyamadai" },
  { year: 2014, region: "地域限定なし", displayName: "大島", article: "鹿児島県立大島高等学校", prefectureText: "鹿児島", schoolSlug: "kagoshima-oshima" },
  { year: 2015, region: "地域限定なし", displayName: "桐蔭", article: "和歌山県立桐蔭中学校・高等学校", prefectureText: "和歌山", schoolSlug: "toin" },
  { year: 2015, region: "西日本", displayName: "松山東", article: "愛媛県立松山東高等学校", prefectureText: "愛媛", schoolSlug: "matsuyamahigashi" },
  { year: 2015, region: "東日本", displayName: "豊橋工", article: "愛知県立豊橋工科高等学校", prefectureText: "愛知", schoolSlug: "toyohashikoka" },
  { year: 2016, region: "東日本", displayName: "釜石", article: "岩手県立釜石高等学校", prefectureText: "岩手", schoolSlug: "kamaishi" },
  { year: 2016, region: "西日本", displayName: "小豆島", article: "香川県立小豆島中央高等学校", prefectureText: "香川", schoolSlug: "shodoshimachuo" },
  { year: 2016, region: "地域限定なし", displayName: "長田", article: "兵庫県立長田高等学校", prefectureText: "兵庫", schoolSlug: "nagata" },
  { year: 2017, region: "地域限定なし", displayName: "多治見", article: "岐阜県立多治見高等学校", prefectureText: "岐阜", schoolSlug: "tajimi" },
  { year: 2017, region: "西日本", displayName: "中村", article: "高知県立中村中学校・高等学校", prefectureText: "高知", schoolSlug: "kochi-nakamura" },
  { year: 2017, region: "東日本", displayName: "不来方", article: "岩手県立不来方高等学校", prefectureText: "岩手", schoolSlug: "nanshomirai" },
  { year: 2018, region: "西日本", displayName: "伊万里", article: "佐賀県立伊万里高等学校", prefectureText: "佐賀", schoolSlug: "imari" },
  { year: 2018, region: "地域限定なし", displayName: "膳所", article: "滋賀県立膳所高等学校", prefectureText: "滋賀", schoolSlug: "zeze" },
  { year: 2018, region: "東日本", displayName: "由利工", article: "秋田県立由利工業高等学校", prefectureText: "秋田", schoolSlug: "yurikogyo" },
  { year: 2019, region: "地域限定なし", displayName: "熊本西", article: "熊本県立熊本西高等学校", prefectureText: "熊本", schoolSlug: "kumamotonishi" },
  { year: 2019, region: "東日本", displayName: "石岡一", article: "茨城県立石岡第一高等学校", prefectureText: "茨城", schoolSlug: "ishiokadaiichi" },
  { year: 2019, region: "西日本", displayName: "富岡西", article: "徳島県立富岡西高等学校", prefectureText: "徳島", schoolSlug: "tomiokanishi" },
  { year: 2020, region: "東日本", displayName: "帯広農", article: "北海道帯広農業高等学校", prefectureText: "北海道", schoolSlug: "obihironogyo" },
  { year: 2020, region: "地域限定なし", displayName: "磐城", article: "福島県立磐城高等学校", prefectureText: "福島", schoolSlug: "iwaki" },
  { year: 2020, region: "西日本", displayName: "平田", article: "島根県立平田高等学校", prefectureText: "島根", schoolSlug: "hirata" },
  { year: 2021, region: "地域限定なし", displayName: "具志川商", article: "沖縄県立具志川商業高等学校", prefectureText: "沖縄", schoolSlug: "gushikawashogyo" },
  { year: 2021, region: "地域限定なし", displayName: "三島南", article: "静岡県立三島南高等学校", prefectureText: "静岡", schoolSlug: "mishimaminami" },
  { year: 2021, region: "西日本", displayName: "東播磨", article: "兵庫県立東播磨高等学校", prefectureText: "兵庫", schoolSlug: "higashiharima" },
  { year: 2021, region: "東日本", displayName: "八戸西", article: "青森県立八戸西高等学校", prefectureText: "青森", schoolSlug: "hachinohenishi" },
  { year: 2022, region: "西日本", displayName: "大分舞鶴", article: "大分県立大分舞鶴高等学校", prefectureText: "大分", schoolSlug: "oitamaizuru" },
  { year: 2022, region: "地域限定なし", displayName: "只見", article: "福島県立只見高等学校", prefectureText: "福島", schoolSlug: "tadami" },
  { year: 2022, region: "東日本", displayName: "丹生", article: "福井県立丹生高等学校", prefectureText: "福井", schoolSlug: "nyu" },
  { year: 2023, region: "西日本", displayName: "城東", article: "徳島県立城東高等学校", prefectureText: "徳島", schoolSlug: "tokushima-joto" },
  { year: 2023, region: "地域限定なし", displayName: "石橋", article: "栃木県立石橋高等学校", prefectureText: "栃木", schoolSlug: "ishibashi" },
  { year: 2023, region: "東日本", displayName: "氷見", article: "富山県立氷見高等学校", prefectureText: "富山", schoolSlug: "himi" },
  { year: 2024, region: "近畿", displayName: "田辺", article: "和歌山県立田辺中学校・高等学校", prefectureText: "和歌山", schoolSlug: "wakayama-tanabe" },
  { year: 2024, region: "北海道", displayName: "別海", article: "北海道別海高等学校", prefectureText: "北海道", schoolSlug: "betsukai" },
  { year: 2025, region: "九州", displayName: "壱岐", article: "長崎県立壱岐高等学校", prefectureText: "長崎", schoolSlug: "iki" },
  { year: 2025, region: "関東", displayName: "横浜清陵", article: "神奈川県立横浜清陵高等学校", prefectureText: "神奈川", schoolSlug: "yokohamaseiryo" },
  { year: 2026, region: "四国", displayName: "高知農", article: "高知県立高知農業高等学校", prefectureText: "高知", schoolSlug: "kochinogyo" },
  { year: 2026, region: "九州", displayName: "長崎西", article: "長崎県立長崎西高等学校", prefectureText: "長崎", schoolSlug: "nagasakinishi" },
];
