// このファイルは scripts/build-live-results.mjs が生成する。直接編集しない。
// 出典: 第108回全国高等学校野球選手権大会（Wikipedia, CC BY-SA）
//   https://ja.wikipedia.org/wiki/%E7%AC%AC108%E5%9B%9E%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E5%A4%A7%E4%BC%9A

import type { LiveResults } from "@/lib/live-results";

export const LIVE_RESULTS: LiveResults = {
  "tournamentTitle": "第108回全国高等学校野球選手権大会",
  "season": "summer",
  "year": 2026,
  "sourceUrl": "https://ja.wikipedia.org/wiki/%E7%AC%AC108%E5%9B%9E%E5%85%A8%E5%9B%BD%E9%AB%98%E7%AD%89%E5%AD%A6%E6%A0%A1%E9%87%8E%E7%90%83%E9%81%B8%E6%89%8B%E6%A8%A9%E5%A4%A7%E4%BC%9A",
  "games": [
    {
      "round": "2回戦",
      "date": "8月10日",
      "order": "3",
      "walkOff": false,
      "teams": [
        {
          "display": "高岡商",
          "score": 1,
          "won": false,
          "slug": "takaokashogyo",
          "name": "高岡商業高校",
          "prefecture": "富山"
        },
        {
          "display": "高川学園",
          "score": 7,
          "won": true,
          "slug": null,
          "name": "高川学園",
          "prefecture": null
        }
      ]
    },
    {
      "round": "2回戦",
      "date": "8月11日",
      "order": "1",
      "walkOff": false,
      "teams": [
        {
          "display": "横手",
          "score": 0,
          "won": false,
          "slug": "yokote",
          "name": "横手高校",
          "prefecture": "秋田"
        },
        {
          "display": "敦賀気比",
          "score": 10,
          "won": true,
          "slug": null,
          "name": "敦賀気比",
          "prefecture": null
        }
      ]
    },
    {
      "round": "2回戦",
      "date": "8月11日",
      "order": "2",
      "walkOff": false,
      "teams": [
        {
          "display": "智弁和歌山",
          "score": 2,
          "won": true,
          "slug": null,
          "name": "智弁和歌山",
          "prefecture": null
        },
        {
          "display": "社",
          "score": 1,
          "won": false,
          "slug": "hyogo-yashiro",
          "name": "社高校",
          "prefecture": "兵庫"
        }
      ]
    },
    {
      "round": "2回戦",
      "date": "8月12日",
      "order": "1",
      "walkOff": false,
      "teams": [
        {
          "display": "拓大紅陵",
          "score": 1,
          "won": true,
          "slug": null,
          "name": "拓大紅陵",
          "prefecture": null
        },
        {
          "display": "佐賀商",
          "score": 0,
          "won": false,
          "slug": "sagashogyo",
          "name": "佐賀商業高校",
          "prefecture": "佐賀"
        }
      ]
    },
    {
      "round": "1回戦",
      "date": "8月6日",
      "order": "1",
      "walkOff": false,
      "teams": [
        {
          "display": "東筑",
          "score": 1,
          "won": false,
          "slug": "tochiku",
          "name": "東筑高校",
          "prefecture": "福岡"
        },
        {
          "display": "神村学園",
          "score": 5,
          "won": true,
          "slug": null,
          "name": "神村学園",
          "prefecture": null
        }
      ]
    },
    {
      "round": "1回戦",
      "date": "8月7日",
      "order": "2",
      "walkOff": false,
      "teams": [
        {
          "display": "八幡商",
          "score": 1,
          "won": false,
          "slug": "hachimanshogyo",
          "name": "八幡商業高校",
          "prefecture": "滋賀"
        },
        {
          "display": "健大高崎",
          "score": 7,
          "won": true,
          "slug": null,
          "name": "健大高崎",
          "prefecture": null
        }
      ]
    },
    {
      "round": "1回戦",
      "date": "8月8日",
      "order": "3",
      "walkOff": false,
      "teams": [
        {
          "display": "日本文理",
          "score": 4,
          "won": false,
          "slug": null,
          "name": "日本文理",
          "prefecture": null
        },
        {
          "display": "大分商",
          "score": 6,
          "won": true,
          "slug": "oitashogyo",
          "name": "大分商業高校",
          "prefecture": "大分"
        }
      ]
    },
    {
      "round": "1回戦",
      "date": "8月9日",
      "order": "3",
      "walkOff": true,
      "teams": [
        {
          "display": "鳴門渦潮",
          "score": 2,
          "won": true,
          "slug": "narutozushio",
          "name": "鳴門渦潮高校",
          "prefecture": "徳島"
        },
        {
          "display": "八王子実践",
          "score": 1,
          "won": false,
          "slug": null,
          "name": "八王子実践",
          "prefecture": null
        }
      ]
    }
  ],
  "alive": [
    {
      "slug": "oitashogyo",
      "name": "大分商業高校",
      "prefecture": "大分",
      "wins": 1
    },
    {
      "slug": "narutozushio",
      "name": "鳴門渦潮高校",
      "prefecture": "徳島",
      "wins": 1
    }
  ]
};
