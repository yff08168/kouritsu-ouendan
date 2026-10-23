// このファイルは scripts/build-regional-results.mjs が生成する。直接編集しない。
// トップの速報カード用の抜粋。**全国ぶんはここに入れない**（県ごとのファイルにある）。

import type { RegionalPickups } from "@/lib/regional-results";

export const REGIONAL_PICKUPS: RegionalPickups = {
  "latestDate": "2026-10-20",
  "spotlightSeason": "autumn",
  "spotlight": [],
  "games": [
    {
      "districtSlug": "tokyo",
      "district": "東京",
      "sourceName": "HSB flash",
      "sourceUrl": "https://tokyo.hsbflash.jp/",
      "date": "2026-10-18",
      "season": "autumn",
      "tournament": "2026年 2026年秋季東京都高等学校野球大会",
      "round": "3回戦",
      "teams": [
        {
          "display": "東海大菅生",
          "score": 18,
          "won": true,
          "name": "東海大菅生",
          "slug": null
        },
        {
          "display": "城東",
          "score": 0,
          "won": false,
          "name": "城東高校",
          "slug": "joto"
        }
      ]
    }
  ]
};
