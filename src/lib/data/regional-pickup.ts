// このファイルは scripts/build-regional-results.mjs が生成する。直接編集しない。
// トップの速報カード用の抜粋。**全国ぶんはここに入れない**（県ごとのファイルにある）。

import type { RegionalPickups } from "@/lib/regional-results";

export const REGIONAL_PICKUPS: RegionalPickups = {
  "latestDate": "2026-09-09",
  "spotlightSeason": "autumn",
  "spotlight": [
    {
      "slug": "komorogijuku",
      "display": "小諸義塾",
      "name": "小諸義塾高校",
      "district": "長野",
      "districtSlug": "nagano",
      "wins": 1,
      "standing": "準決勝進出"
    }
  ],
  "games": [
    {
      "districtSlug": "kanagawa",
      "district": "神奈川",
      "sourceName": "神奈川高校野球ステーション",
      "sourceUrl": "https://www.kanagawa-baseball.com/",
      "date": "2026-09-09",
      "season": "autumn",
      "tournament": "令和8年度神奈川県高校野球秋季県大会",
      "round": "2回戦",
      "teams": [
        {
          "display": "光明相模原",
          "score": 1,
          "won": true,
          "name": "光明相模原",
          "slug": null
        },
        {
          "display": "厚木北",
          "score": 0,
          "won": false,
          "name": "厚木北高校",
          "slug": "atsugikita"
        }
      ]
    }
  ]
};
