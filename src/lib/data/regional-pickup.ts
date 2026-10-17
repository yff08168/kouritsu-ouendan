// このファイルは scripts/build-regional-results.mjs が生成する。直接編集しない。
// トップの速報カード用の抜粋。**全国ぶんはここに入れない**（県ごとのファイルにある）。

import type { RegionalPickups } from "@/lib/regional-results";

export const REGIONAL_PICKUPS: RegionalPickups = {
  "latestDate": "2026-10-17",
  "spotlightSeason": "autumn",
  "spotlight": [],
  "games": [
    {
      "districtSlug": "kagawa",
      "district": "香川",
      "sourceName": "香川県高等学校野球連盟",
      "sourceUrl": "https://www.kagawa-hbf.com/top",
      "date": "2026-10-17",
      "season": "autumn",
      "tournament": "令和8年度(第79回)秋季四国地区高等学校野球 香川県大会",
      "round": "3位決定戦",
      "teams": [
        {
          "display": "尽誠学園",
          "score": 5,
          "won": true,
          "name": "尽誠学園",
          "slug": null
        },
        {
          "display": "丸亀",
          "score": 4,
          "won": false,
          "name": "丸亀高校",
          "slug": "marugame"
        }
      ]
    },
    {
      "districtSlug": "tokyo",
      "district": "東京",
      "sourceName": "HSB flash",
      "sourceUrl": "https://tokyo.hsbflash.jp/",
      "date": "2026-10-17",
      "season": "autumn",
      "tournament": "2026年 2026年秋季東京都高等学校野球大会",
      "round": "3回戦",
      "teams": [
        {
          "display": "聖パウロ学園",
          "score": 8,
          "won": true,
          "name": "聖パウロ学園",
          "slug": null
        },
        {
          "display": "府中工科",
          "score": 1,
          "won": false,
          "name": "府中工科高校",
          "slug": "fuchukoka"
        }
      ]
    }
  ]
};
