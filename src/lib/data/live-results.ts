// このファイルは scripts/build-live-results.mjs が生成する。直接編集しない。
// 出典: 公益財団法人日本高等学校野球連盟（一次情報）
//   https://www.jhbf.or.jp/sensyuken/2026/schedule/

import type { LiveResults } from "@/lib/live-results";

export const LIVE_RESULTS: LiveResults = {
  "tournamentTitle": "第108回全国高等学校野球選手権大会",
  "season": "summer",
  "year": 2026,
  "sourceUrl": "https://www.jhbf.or.jp/sensyuken/2026/schedule/",
  "games": [
    {
      "round": "1回戦",
      "date": "8月6日",
      "order": "1",
      "startTime": "16:02",
      "walkOff": false,
      "teams": [
        {
          "display": "東筑",
          "name": "東筑高校",
          "slug": "tochiku",
          "prefecture": "福岡",
          "score": 1,
          "won": false
        },
        {
          "display": "神村学園",
          "name": "神村学園",
          "slug": null,
          "prefecture": null,
          "score": 5,
          "won": true
        }
      ]
    },
    {
      "round": "1回戦",
      "date": "8月7日",
      "order": "2",
      "startTime": "13:32",
      "walkOff": false,
      "teams": [
        {
          "display": "八幡商",
          "name": "八幡商業高校",
          "slug": "hachimanshogyo",
          "prefecture": "滋賀",
          "score": 1,
          "won": false
        },
        {
          "display": "健大高崎",
          "name": "健大高崎",
          "slug": null,
          "prefecture": null,
          "score": 7,
          "won": true
        }
      ]
    },
    {
      "round": "1回戦",
      "date": "8月8日",
      "order": "3",
      "startTime": "16:10",
      "walkOff": false,
      "teams": [
        {
          "display": "日本文理",
          "name": "日本文理",
          "slug": null,
          "prefecture": null,
          "score": 4,
          "won": false
        },
        {
          "display": "大分商",
          "name": "大分商業高校",
          "slug": "oitashogyo",
          "prefecture": "大分",
          "score": 6,
          "won": true
        }
      ]
    },
    {
      "round": "1回戦",
      "date": "8月9日",
      "order": "3",
      "startTime": "16:20",
      "walkOff": true,
      "teams": [
        {
          "display": "鳴門渦潮",
          "name": "鳴門渦潮高校",
          "slug": "narutozushio",
          "prefecture": "徳島",
          "score": 2,
          "won": true
        },
        {
          "display": "八王子実践",
          "name": "八王子実践",
          "slug": null,
          "prefecture": null,
          "score": 1,
          "won": false
        }
      ]
    },
    {
      "round": "2回戦",
      "date": "8月10日",
      "order": "3",
      "startTime": "16:13",
      "walkOff": false,
      "teams": [
        {
          "display": "高岡商",
          "name": "高岡商業高校",
          "slug": "takaokashogyo",
          "prefecture": "富山",
          "score": 1,
          "won": false
        },
        {
          "display": "高川学園",
          "name": "高川学園",
          "slug": null,
          "prefecture": null,
          "score": 7,
          "won": true
        }
      ]
    },
    {
      "round": "2回戦",
      "date": "8月10日",
      "order": "4",
      "startTime": "18:47",
      "walkOff": false,
      "teams": [
        {
          "display": "天理",
          "name": "天理",
          "slug": null,
          "prefecture": null,
          "score": 7,
          "won": true
        },
        {
          "display": "福山",
          "name": "福山高校",
          "slug": "fukuyama",
          "prefecture": "広島",
          "score": 2,
          "won": false
        }
      ]
    },
    {
      "round": "2回戦",
      "date": "8月11日",
      "order": "1",
      "startTime": "8:02",
      "walkOff": false,
      "teams": [
        {
          "display": "横手",
          "name": "横手高校",
          "slug": "yokote",
          "prefecture": "秋田",
          "score": 0,
          "won": false
        },
        {
          "display": "敦賀気比",
          "name": "敦賀気比",
          "slug": null,
          "prefecture": null,
          "score": 10,
          "won": true
        }
      ]
    },
    {
      "round": "2回戦",
      "date": "8月11日",
      "order": "2",
      "startTime": "13:31",
      "walkOff": false,
      "teams": [
        {
          "display": "智辯和歌山",
          "name": "智辯和歌山",
          "slug": null,
          "prefecture": null,
          "score": 2,
          "won": true
        },
        {
          "display": "社",
          "name": "社高校",
          "slug": "hyogo-yashiro",
          "prefecture": "兵庫",
          "score": 1,
          "won": false
        }
      ]
    },
    {
      "round": "2回戦",
      "date": "8月12日",
      "order": "1",
      "startTime": "8:02",
      "walkOff": false,
      "teams": [
        {
          "display": "拓大紅陵",
          "name": "拓大紅陵",
          "slug": null,
          "prefecture": null,
          "score": 1,
          "won": true
        },
        {
          "display": "佐賀商",
          "name": "佐賀商業高校",
          "slug": "sagashogyo",
          "prefecture": "佐賀",
          "score": 0,
          "won": false
        }
      ]
    }
  ],
  "alive": [
    {
      "slug": "oitashogyo",
      "display": "大分商",
      "name": "大分商業高校",
      "prefecture": "大分",
      "wins": 1,
      "next": {
        "round": "2回戦",
        "date": "8月13日",
        "order": "4",
        "startTime": "18:00",
        "opponent": "英明"
      }
    },
    {
      "slug": "narutozushio",
      "display": "鳴門渦潮",
      "name": "鳴門渦潮高校",
      "prefecture": "徳島",
      "wins": 1,
      "next": null
    }
  ]
};
