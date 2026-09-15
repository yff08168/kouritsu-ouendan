// このファイルは scripts/build-regional-results.mjs が生成する。直接編集しない。
// トップの速報カード用の抜粋。**全国ぶんはここに入れない**（県ごとのファイルにある）。

import type { RegionalPickups } from "@/lib/regional-results";

export const REGIONAL_PICKUPS: RegionalPickups = {
  "latestDate": "2026-09-15",
  "spotlightSeason": "autumn",
  "spotlight": [
    {
      "slug": "asameishin",
      "display": "厚狭明進",
      "name": "厚狭明進高校",
      "district": "山口",
      "districtSlug": "yamaguchi",
      "wins": 1,
      "standing": "1回戦突破"
    },
    {
      "slug": "nishinomiyakurakuen",
      "display": "西宮苦楽園",
      "name": "西宮苦楽園高校",
      "district": "兵庫",
      "districtSlug": "hyogo",
      "wins": 1,
      "standing": "1回戦突破"
    }
  ],
  "games": [
    {
      "districtSlug": "kanagawa",
      "district": "神奈川",
      "sourceName": "神奈川高校野球ステーション",
      "sourceUrl": "https://www.kanagawa-baseball.com/",
      "date": "2026-09-15",
      "season": "autumn",
      "tournament": "令和8年度神奈川県高校野球秋季県大会",
      "round": "3回戦",
      "teams": [
        {
          "display": "横浜",
          "score": 18,
          "won": true,
          "name": "横浜",
          "slug": null
        },
        {
          "display": "横浜栄",
          "score": 4,
          "won": false,
          "name": "横浜栄高校",
          "slug": "yokohamasakae"
        }
      ]
    },
    {
      "districtSlug": "kumamoto",
      "district": "熊本",
      "sourceName": "熊本県高等学校野球連盟",
      "sourceUrl": "http://www.kumamoto-kouyaren.com/",
      "date": "2026-09-15",
      "season": "autumn",
      "tournament": "第159回九州地区高等学校野球熊本大会",
      "round": "1回戦",
      "teams": [
        {
          "display": "学園大付属",
          "score": 9,
          "won": true,
          "name": "学園大付属",
          "slug": null
        },
        {
          "display": "天草",
          "score": 0,
          "won": false,
          "name": "天草高校",
          "slug": "amakusa"
        }
      ]
    },
    {
      "districtSlug": "kumamoto",
      "district": "熊本",
      "sourceName": "熊本県高等学校野球連盟",
      "sourceUrl": "http://www.kumamoto-kouyaren.com/",
      "date": "2026-09-15",
      "season": "autumn",
      "tournament": "第159回九州地区高等学校野球熊本大会",
      "round": "1回戦",
      "teams": [
        {
          "display": "真和",
          "score": 0,
          "won": false,
          "name": "真和",
          "slug": null
        },
        {
          "display": "宇土",
          "score": 7,
          "won": true,
          "name": "宇土高校",
          "slug": "uto"
        }
      ]
    },
    {
      "districtSlug": "kumamoto",
      "district": "熊本",
      "sourceName": "熊本県高等学校野球連盟",
      "sourceUrl": "http://www.kumamoto-kouyaren.com/",
      "date": "2026-09-15",
      "season": "autumn",
      "tournament": "第159回九州地区高等学校野球熊本大会",
      "round": "1回戦",
      "teams": [
        {
          "display": "八代清流",
          "score": 1,
          "won": false,
          "name": "八代清流高校",
          "slug": "yatsushiroseiryu"
        },
        {
          "display": "千原台",
          "score": 10,
          "won": true,
          "name": "千原台高校",
          "slug": "chiharadai"
        }
      ]
    }
  ]
};
