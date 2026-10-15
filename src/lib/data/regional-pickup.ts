// このファイルは scripts/build-regional-results.mjs が生成する。直接編集しない。
// トップの速報カード用の抜粋。**全国ぶんはここに入れない**（県ごとのファイルにある）。

import type { RegionalPickups } from "@/lib/regional-results";

export const REGIONAL_PICKUPS: RegionalPickups = {
  "latestDate": "2026-10-15",
  "spotlightSeason": "autumn",
  "spotlight": [],
  "games": [
    {
      "districtSlug": "saga",
      "district": "佐賀",
      "sourceName": "佐賀県高等学校野球連盟",
      "sourceUrl": "http://kouyaren-saga.jp/",
      "date": "2026-10-12",
      "season": "autumn",
      "tournament": "第159回九州地区高等学校野球佐賀大会",
      "round": null,
      "teams": [
        {
          "display": "佐賀北",
          "score": 4,
          "won": false,
          "innings": [
            0,
            0,
            3,
            0,
            0,
            0,
            0,
            0,
            1
          ],
          "name": "佐賀北高校",
          "slug": "sagakita"
        },
        {
          "display": "早稲田佐賀",
          "score": 13,
          "won": true,
          "innings": [
            0,
            3,
            0,
            2,
            0,
            5,
            2,
            1
          ],
          "name": "早稲田佐賀",
          "slug": null
        }
      ]
    },
    {
      "districtSlug": "kagawa",
      "district": "香川",
      "sourceName": "香川県高等学校野球連盟",
      "sourceUrl": "https://www.kagawa-hbf.com/top",
      "date": "2026-10-12",
      "season": "autumn",
      "tournament": "令和8年度(第79回)秋季四国地区高等学校野球 香川県大会",
      "round": "準決勝",
      "teams": [
        {
          "display": "蓬莱",
          "score": 9,
          "won": true,
          "name": "蓬莱",
          "slug": null
        },
        {
          "display": "丸亀",
          "score": 1,
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
      "date": "2026-10-12",
      "season": "autumn",
      "tournament": "2026年 秋季東京都高等学校野球大会",
      "round": "2回戦",
      "teams": [
        {
          "display": "安田学園",
          "score": 5,
          "won": true,
          "name": "安田学園",
          "slug": null
        },
        {
          "display": "足立新田",
          "score": 1,
          "won": false,
          "name": "足立新田高校",
          "slug": "adachishinden"
        }
      ]
    },
    {
      "districtSlug": "tokyo",
      "district": "東京",
      "sourceName": "HSB flash",
      "sourceUrl": "https://tokyo.hsbflash.jp/",
      "date": "2026-10-12",
      "season": "autumn",
      "tournament": "2026年 秋季東京都高等学校野球大会",
      "round": "2回戦",
      "teams": [
        {
          "display": "城東",
          "score": 3,
          "won": true,
          "name": "城東高校",
          "slug": "joto"
        },
        {
          "display": "昭和一学園",
          "score": 2,
          "won": false,
          "name": "昭和一学園",
          "slug": null
        }
      ]
    },
    {
      "districtSlug": "tokyo",
      "district": "東京",
      "sourceName": "HSB flash",
      "sourceUrl": "https://tokyo.hsbflash.jp/",
      "date": "2026-10-12",
      "season": "autumn",
      "tournament": "2026年 秋季東京都高等学校野球大会",
      "round": "2回戦",
      "teams": [
        {
          "display": "八王子実践",
          "score": 11,
          "won": true,
          "name": "八王子実践",
          "slug": null
        },
        {
          "display": "豊多摩",
          "score": 1,
          "won": false,
          "name": "豊多摩高校",
          "slug": "toyotama"
        }
      ]
    }
  ]
};
