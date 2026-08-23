// このファイルは scripts/build-regional-results.mjs が生成する。直接編集しない。
// トップの速報カード用の抜粋。**全国ぶんはここに入れない**（県ごとのファイルにある）。

import type { RegionalPickups } from "@/lib/regional-results";

export const REGIONAL_PICKUPS: RegionalPickups = {
  "latestDate": "2026-08-23",
  "spotlightSeason": "autumn",
  "spotlight": [
    {
      "slug": "tamashimashogyo",
      "display": "玉島商",
      "name": "玉島商業高校",
      "district": "岡山",
      "districtSlug": "okayama",
      "wins": 6,
      "standing": "決勝進出"
    },
    {
      "slug": "kurashikishogyo",
      "display": "倉敷商",
      "name": "倉敷商業高校",
      "district": "岡山",
      "districtSlug": "okayama",
      "wins": 6,
      "standing": "決勝進出"
    },
    {
      "slug": "shimodatekogyo",
      "display": "下館工",
      "name": "下館工業高校",
      "district": "茨城",
      "districtSlug": "ibaraki",
      "wins": 2,
      "standing": "代表決定戦突破"
    },
    {
      "slug": "shimotsumadaiichi",
      "display": "下妻一",
      "name": "下妻第一高校",
      "district": "茨城",
      "districtSlug": "ibaraki",
      "wins": 2,
      "standing": "代表決定戦突破"
    },
    {
      "slug": "mitoshogyo",
      "display": "水戸商",
      "name": "水戸商業高校",
      "district": "茨城",
      "districtSlug": "ibaraki",
      "wins": 2,
      "standing": "代表決定戦突破"
    },
    {
      "slug": "otadaiichi",
      "display": "太田一",
      "name": "太田第一高校",
      "district": "茨城",
      "districtSlug": "ibaraki",
      "wins": 2,
      "standing": "代表決定戦突破"
    },
    {
      "slug": "hitachidaiichi",
      "display": "日立一",
      "name": "日立第一高校",
      "district": "茨城",
      "districtSlug": "ibaraki",
      "wins": 2,
      "standing": "代表決定戦突破"
    },
    {
      "slug": "tsuchiuradaiichi",
      "display": "土浦一",
      "name": "土浦第一高校",
      "district": "茨城",
      "districtSlug": "ibaraki",
      "wins": 2,
      "standing": "2回戦突破"
    }
  ],
  "games": [
    {
      "districtSlug": "ibaraki",
      "district": "茨城",
      "sourceName": "茨城県高等学校野球連盟",
      "sourceUrl": "http://www.ibaraki-hbf.com/",
      "date": "2026-08-22",
      "season": "autumn",
      "tournament": "第79回秋季関東地区高等学校野球茨城県大会 一次予選",
      "round": "2回戦",
      "teams": [
        {
          "display": "取手松陽",
          "score": 6,
          "won": false,
          "name": "取手松陽高校",
          "slug": "torideshoyo"
        },
        {
          "display": "土浦湖北",
          "score": 7,
          "won": true,
          "name": "土浦湖北高校",
          "slug": "tsuchiurakohoku"
        }
      ]
    },
    {
      "districtSlug": "ibaraki",
      "district": "茨城",
      "sourceName": "茨城県高等学校野球連盟",
      "sourceUrl": "http://www.ibaraki-hbf.com/",
      "date": "2026-08-22",
      "season": "autumn",
      "tournament": "第79回秋季関東地区高等学校野球茨城県大会 一次予選",
      "round": "代表決定戦",
      "teams": [
        {
          "display": "下館工",
          "score": 10,
          "won": true,
          "name": "下館工業高校",
          "slug": "shimodatekogyo"
        },
        {
          "display": "守谷",
          "score": 5,
          "won": false,
          "name": "守谷高校",
          "slug": "moriya"
        }
      ]
    },
    {
      "districtSlug": "ibaraki",
      "district": "茨城",
      "sourceName": "茨城県高等学校野球連盟",
      "sourceUrl": "http://www.ibaraki-hbf.com/",
      "date": "2026-08-22",
      "season": "autumn",
      "tournament": "第79回秋季関東地区高等学校野球茨城県大会 一次予選",
      "round": "代表決定戦",
      "teams": [
        {
          "display": "下妻一",
          "score": 6,
          "won": true,
          "name": "下妻第一高校",
          "slug": "shimotsumadaiichi"
        },
        {
          "display": "岩瀬日大",
          "score": 4,
          "won": false,
          "name": "岩瀬日大",
          "slug": null
        }
      ]
    },
    {
      "districtSlug": "ibaraki",
      "district": "茨城",
      "sourceName": "茨城県高等学校野球連盟",
      "sourceUrl": "http://www.ibaraki-hbf.com/",
      "date": "2026-08-21",
      "season": "autumn",
      "tournament": "第79回秋季関東地区高等学校野球茨城県大会 一次予選",
      "round": "代表決定戦",
      "teams": [
        {
          "display": "水戸商",
          "score": 5,
          "won": true,
          "name": "水戸商業高校",
          "slug": "mitoshogyo"
        },
        {
          "display": "水戸農",
          "score": 2,
          "won": false,
          "name": "水戸農業高校",
          "slug": "mitonogyo"
        }
      ]
    }
  ]
};
