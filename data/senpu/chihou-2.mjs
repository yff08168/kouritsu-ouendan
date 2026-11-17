// 公立旋風 第4弾・神奈川と愛知の**準決勝（ベスト4）まで進んだ公立校**。
//
// 運営者の「神奈川、愛知については準決勝まで進んだ高校で再度やって」から。
// Wikipedia の歴代代表校の表は決勝しか持たないので、**準決勝は地方大会の生成物から取る**
// （`scripts/senpu/semifinalists.mjs` が一覧を出す）。生成物は2018年以降だけ。
//
// run.kind "regional"
//   scope "full"（既定） … 大会の全試合が揃っている（complete）ときだけ。全試合を出す
//   scope "late"          … 記録に穴のある大会で、準々決勝以降だけ確かなとき
//   team                  … 生成物の校名（シード表記を外したもの）。シードの付いた校名には slug が付かないので必要
//   displayName           … 画面に出す大会名（生成物の名前には「＜ 大会掲示板 ＞」が付くことがある）
//   label                 … 見出し「◯◯での勝ち上がり」の◯◯
// 夏の大会は、決勝を Wikipedia の表と突き合わせる（食い違えば build が止まる）。
const DEFINITIONS = [
  // ---------------- 神奈川 ----------------
  {
    slug: "yokohamashogyo-2023-summer", school: "yokohamashogyo", year: 2023, season: "summer", level: "prefectural",
    prefecture: "kanagawa", badge: "ベスト4",
    run: {
      kind: "regional", district: "kanagawa", team: "横浜商業", label: "神奈川大会",
      tournament: "第105回全国高等学校野球選手権記念神奈川大会 ＜ 大会掲示板 ＞",
      displayName: "第105回全国高等学校野球選手権記念神奈川大会",
    },
  },
  {
    slug: "atsugikita-2018-autumn", school: "atsugikita", year: 2018, season: "autumn", level: "prefectural",
    prefecture: "kanagawa", badge: "ベスト4",
    run: {
      kind: "regional", district: "kanagawa", team: "厚木北", label: "神奈川県秋季大会",
      tournament: "2018年神奈川県高校野球秋季県大会 組み合わせ 日程 トーナメント表",
      displayName: "2018年神奈川県高校野球秋季県大会",
    },
  },
  {
    slug: "yokohamashogyo-2022-spring", school: "yokohamashogyo", year: 2022, season: "spring", level: "prefectural",
    prefecture: "kanagawa", badge: "ベスト4",
    run: {
      kind: "regional", district: "kanagawa", team: "横浜商業", label: "神奈川県春季大会", scope: "late",
      tournament: "令和4年度神奈川県高校野球春季県大会 ＜ 大会掲示板 ＞",
      displayName: "令和4年度神奈川県高校野球春季県大会",
    },
  },
  {
    slug: "fujisawaseiryu-2022-spring", school: "fujisawaseiryu", year: 2022, season: "spring", level: "prefectural",
    prefecture: "kanagawa", badge: "ベスト4",
    run: {
      kind: "regional", district: "kanagawa", team: "藤沢清流", label: "神奈川県春季大会", scope: "late",
      tournament: "令和4年度神奈川県高校野球春季県大会 ＜ 大会掲示板 ＞",
      displayName: "令和4年度神奈川県高校野球春季県大会",
    },
  },
  // ---------------- 愛知 ----------------
  {
    slug: "nishiohigashi-2018-summer", school: "nishiohigashi", year: 2018, season: "summer", level: "prefectural",
    prefecture: "aichi", badge: "準優勝",
    run: {
      kind: "regional", district: "aichi", block: "東", label: "東愛知大会",
      tournament: "第100回全国高等学校野球選手権記念 東愛知大会",
    },
  },
  {
    slug: "kariya-2018-summer", school: "kariya", year: 2018, season: "summer", level: "prefectural",
    prefecture: "aichi", badge: "ベスト4",
    run: {
      kind: "regional", district: "aichi", block: "東", label: "東愛知大会",
      tournament: "第100回全国高等学校野球選手権記念 東愛知大会",
    },
  },
  {
    slug: "obu-2021-summer", school: "obu", year: 2021, season: "summer", level: "prefectural",
    prefecture: "aichi", badge: "ベスト4",
    run: {
      kind: "regional", district: "aichi", label: "愛知大会",
      tournament: "第103回全国高等学校野球選手権愛知大会",
    },
  },
  {
    slug: "nishiohigashi-2018-autumn", school: "nishiohigashi", year: 2018, season: "autumn", level: "prefectural",
    prefecture: "aichi", badge: "ベスト4",
    run: {
      kind: "regional", district: "aichi", label: "愛知県秋季大会",
      tournament: "2018年 秋季東海地区高等学校野球 愛知県大会",
      displayName: "2018年秋季東海地区高等学校野球 愛知県大会",
    },
  },
  {
    slug: "miyoshi-2026-autumn", school: "miyoshi", year: 2026, season: "autumn", level: "prefectural",
    prefecture: "aichi", badge: "ベスト4",
    run: {
      kind: "regional", district: "aichi", label: "愛知県秋季大会",
      tournament: "2026年 秋季東海地区高等学校野球 愛知県大会",
      displayName: "2026年秋季東海地区高等学校野球 愛知県大会",
    },
  },
];

export default DEFINITIONS;
