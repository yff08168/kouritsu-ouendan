// このファイルは scripts/build-regional-results.mjs が生成する。直接編集しない。
// トップの速報カード用の抜粋。**全国ぶんはここに入れない**（県ごとのファイルにある）。

import type { RegionalPickups } from "@/lib/regional-results";

export const REGIONAL_PICKUPS: RegionalPickups = {
  "latestDate": "2026-08-20",
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
      "slug": "otadaiichi",
      "display": "太田一",
      "name": "太田第一高校",
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
    },
    {
      "slug": "shimodatekogyo",
      "display": "下館工",
      "name": "下館工業高校",
      "district": "茨城",
      "districtSlug": "ibaraki",
      "wins": 1,
      "standing": "2回戦突破"
    },
    {
      "slug": "shimotsumadaiichi",
      "display": "下妻一",
      "name": "下妻第一高校",
      "district": "茨城",
      "districtSlug": "ibaraki",
      "wins": 1,
      "standing": "2回戦突破"
    },
    {
      "slug": "sawa",
      "display": "佐和",
      "name": "佐和高校",
      "district": "茨城",
      "districtSlug": "ibaraki",
      "wins": 1,
      "standing": "2回戦突破"
    },
    {
      "slug": "toridedaiichi",
      "display": "取手一",
      "name": "取手第一高校",
      "district": "茨城",
      "districtSlug": "ibaraki",
      "wins": 1,
      "standing": "2回戦突破"
    }
  ],
  "games": [
    {
      "districtSlug": "tokushima",
      "district": "徳島",
      "sourceName": "徳島県高等学校野球連盟",
      "sourceUrl": "https://www.tk2.nmt.ne.jp/~tokushimakoyaren/",
      "date": "2026-08-20",
      "season": "autumn",
      "tournament": "令和8年度徳島県高等学校新人中央大会",
      "round": "1回戦",
      "teams": [
        {
          "display": "鳴門",
          "score": 3,
          "won": false,
          "name": "鳴門高校",
          "slug": "tokushima-naruto"
        },
        {
          "display": "阿南光",
          "score": 4,
          "won": true,
          "name": "阿南光高校",
          "slug": "ananko"
        }
      ]
    },
    {
      "districtSlug": "ibaraki",
      "district": "茨城",
      "sourceName": "茨城県高等学校野球連盟",
      "sourceUrl": "http://www.ibaraki-hbf.com/",
      "date": "2026-08-20",
      "season": "autumn",
      "tournament": "第79回秋季関東地区高等学校野球茨城県大会 一次予選",
      "round": "代表決定戦",
      "teams": [
        {
          "display": "勝田工",
          "score": 1,
          "won": false,
          "name": "勝田工業高校",
          "slug": "katsutakogyo"
        },
        {
          "display": "太田一",
          "score": 7,
          "won": true,
          "name": "太田第一高校",
          "slug": "otadaiichi"
        }
      ]
    },
    {
      "districtSlug": "ibaraki",
      "district": "茨城",
      "sourceName": "茨城県高等学校野球連盟",
      "sourceUrl": "http://www.ibaraki-hbf.com/",
      "date": "2026-08-20",
      "season": "autumn",
      "tournament": "第79回秋季関東地区高等学校野球茨城県大会 一次予選",
      "round": "2回戦",
      "teams": [
        {
          "display": "古河二",
          "score": 0,
          "won": false,
          "name": "古河第二高校",
          "slug": "kogadaini"
        },
        {
          "display": "下館工",
          "score": 15,
          "won": true,
          "name": "下館工業高校",
          "slug": "shimodatekogyo"
        }
      ]
    },
    {
      "districtSlug": "ibaraki",
      "district": "茨城",
      "sourceName": "茨城県高等学校野球連盟",
      "sourceUrl": "http://www.ibaraki-hbf.com/",
      "date": "2026-08-20",
      "season": "autumn",
      "tournament": "第79回秋季関東地区高等学校野球茨城県大会 一次予選",
      "round": "2回戦",
      "teams": [
        {
          "display": "県西連合",
          "score": 0,
          "won": false,
          "name": "県西連合",
          "slug": null,
          "combined": true
        },
        {
          "display": "守谷",
          "score": 10,
          "won": true,
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
      "date": "2026-08-20",
      "season": "autumn",
      "tournament": "第79回秋季関東地区高等学校野球茨城県大会 一次予選",
      "round": "2回戦",
      "teams": [
        {
          "display": "水海道二",
          "score": 2,
          "won": false,
          "name": "水海道第二高校",
          "slug": "mitsukaidodaini"
        },
        {
          "display": "下妻一",
          "score": 11,
          "won": true,
          "name": "下妻第一高校",
          "slug": "shimotsumadaiichi"
        }
      ]
    },
    {
      "districtSlug": "tokushima",
      "district": "徳島",
      "sourceName": "徳島県高等学校野球連盟",
      "sourceUrl": "https://www.tk2.nmt.ne.jp/~tokushimakoyaren/",
      "date": "2026-08-13",
      "season": "autumn",
      "tournament": "令和8年度徳島県高校野球新人南部ブロック大会",
      "round": "決勝",
      "teams": [
        {
          "display": "阿南光",
          "score": 1,
          "won": false,
          "name": "阿南光高校",
          "slug": "ananko"
        },
        {
          "display": "海部",
          "score": 8,
          "won": true,
          "name": "海部高校",
          "slug": "kaifu"
        }
      ]
    },
    {
      "districtSlug": "tokushima",
      "district": "徳島",
      "sourceName": "徳島県高等学校野球連盟",
      "sourceUrl": "https://www.tk2.nmt.ne.jp/~tokushimakoyaren/",
      "date": "2026-08-13",
      "season": "autumn",
      "tournament": "令和8年度徳島県高校野球新人南部ブロック大会",
      "round": "3位決定戦",
      "teams": [
        {
          "display": "那賀",
          "score": 1,
          "won": false,
          "name": "那賀高校",
          "slug": "tokushima-naga"
        },
        {
          "display": "小松島",
          "score": 11,
          "won": true,
          "name": "小松島高校",
          "slug": "komatsushima"
        }
      ]
    },
    {
      "districtSlug": "tokushima",
      "district": "徳島",
      "sourceName": "徳島県高等学校野球連盟",
      "sourceUrl": "https://www.tk2.nmt.ne.jp/~tokushimakoyaren/",
      "date": "2026-08-11",
      "season": "autumn",
      "tournament": "令和8年度徳島県高校野球新人ブロック大会（Aブロック）",
      "round": "決勝",
      "teams": [
        {
          "display": "鳴門",
          "score": 14,
          "won": true,
          "name": "鳴門高校",
          "slug": "tokushima-naruto"
        },
        {
          "display": "城東",
          "score": 4,
          "won": false,
          "name": "城東高校",
          "slug": "tokushima-joto"
        }
      ]
    },
    {
      "districtSlug": "hiroshima",
      "district": "広島",
      "sourceName": "広島県高等学校野球連盟",
      "sourceUrl": "https://hiroshima.hhbf1950.or.jp/",
      "date": "2026-07-28",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権広島大会",
      "round": "決勝",
      "teams": [
        {
          "display": "広島商",
          "score": 3,
          "won": false,
          "name": "広島商業高校",
          "slug": "hiroshimashogyo"
        },
        {
          "display": "福山",
          "score": 4,
          "won": true,
          "name": "福山高校",
          "slug": "fukuyama"
        }
      ]
    },
    {
      "districtSlug": "saga",
      "district": "佐賀",
      "sourceName": "佐賀県高等学校野球連盟",
      "sourceUrl": "http://kouyaren-saga.jp/",
      "date": "2026-07-27",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権佐賀大会",
      "round": "決勝",
      "teams": [
        {
          "display": "北陵",
          "score": 1,
          "won": false,
          "name": "北陵",
          "slug": null
        },
        {
          "display": "佐賀商業",
          "score": 4,
          "won": true,
          "name": "佐賀商業高校",
          "slug": "sagashogyo"
        }
      ]
    },
    {
      "districtSlug": "hiroshima",
      "district": "広島",
      "sourceName": "広島県高等学校野球連盟",
      "sourceUrl": "https://hiroshima.hhbf1950.or.jp/",
      "date": "2026-07-26",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権広島大会",
      "round": "準決勝",
      "teams": [
        {
          "display": "広島商",
          "score": 9,
          "won": true,
          "name": "広島商業高校",
          "slug": "hiroshimashogyo"
        },
        {
          "display": "広陵",
          "score": 4,
          "won": false,
          "name": "広陵",
          "slug": null
        }
      ]
    },
    {
      "districtSlug": "hiroshima",
      "district": "広島",
      "sourceName": "広島県高等学校野球連盟",
      "sourceUrl": "https://hiroshima.hhbf1950.or.jp/",
      "date": "2026-07-26",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権広島大会",
      "round": "準決勝",
      "teams": [
        {
          "display": "福山",
          "score": 4,
          "won": true,
          "name": "福山高校",
          "slug": "fukuyama"
        },
        {
          "display": "呉",
          "score": 3,
          "won": false,
          "name": "呉高校",
          "slug": "kure"
        }
      ]
    },
    {
      "districtSlug": "saga",
      "district": "佐賀",
      "sourceName": "佐賀県高等学校野球連盟",
      "sourceUrl": "http://kouyaren-saga.jp/",
      "date": "2026-07-25",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権佐賀大会",
      "round": "準決勝",
      "teams": [
        {
          "display": "早稲田佐賀",
          "score": 3,
          "won": false,
          "name": "早稲田佐賀",
          "slug": null
        },
        {
          "display": "佐賀商業",
          "score": 5,
          "won": true,
          "name": "佐賀商業高校",
          "slug": "sagashogyo"
        }
      ]
    },
    {
      "districtSlug": "kyoto",
      "district": "京都",
      "sourceName": "京都府高等学校野球連盟",
      "sourceUrl": "https://kyoto-hsbf.sakura.ne.jp/khsbf/",
      "date": "2026-07-25",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権京都大会",
      "round": "準決勝",
      "teams": [
        {
          "display": "鳥羽",
          "score": 4,
          "won": true,
          "name": "鳥羽高校",
          "slug": "kyoto-toba"
        },
        {
          "display": "京都両洋",
          "score": 1,
          "won": false,
          "name": "京都両洋",
          "slug": null
        }
      ]
    },
    {
      "districtSlug": "okayama",
      "district": "岡山",
      "sourceName": "岡山県高等学校野球連盟",
      "sourceUrl": "https://www.okayama-hbf.com/",
      "date": "2026-07-25",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権岡山大会",
      "round": "準決勝",
      "teams": [
        {
          "display": "倉敷商",
          "score": 9,
          "won": true,
          "name": "倉敷商業高校",
          "slug": "kurashikishogyo"
        },
        {
          "display": "関西",
          "score": 5,
          "won": false,
          "name": "関西",
          "slug": null
        }
      ]
    },
    {
      "districtSlug": "gunma",
      "district": "群馬",
      "sourceName": "群馬県高等学校野球連盟",
      "sourceUrl": "http://www.gunma-hbf.com/",
      "date": "2026-07-24",
      "season": "summer",
      "tournament": "108回全国高校野球選手権群馬大会",
      "round": "準決勝",
      "teams": [
        {
          "display": "前橋商",
          "score": 4,
          "won": true,
          "name": "前橋商業高校",
          "slug": "maebashishogyo"
        },
        {
          "display": "桐生第一",
          "score": 1,
          "won": false,
          "name": "桐生第一",
          "slug": null
        }
      ]
    },
    {
      "districtSlug": "yamaguchi",
      "district": "山口",
      "sourceName": "山口県高等学校野球連盟",
      "sourceUrl": "https://yamaguchi-hbf.com/",
      "date": "2026-07-24",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権山口大会",
      "round": "準々決勝",
      "teams": [
        {
          "display": "防府商工",
          "score": 1,
          "won": false,
          "name": "防府商工高校",
          "slug": "hofushoko"
        },
        {
          "display": "小野田工業",
          "score": 8,
          "won": true,
          "name": "小野田工業高校",
          "slug": "onodakogyo"
        }
      ]
    },
    {
      "districtSlug": "shimane",
      "district": "島根",
      "sourceName": "島根県高校野球データベース",
      "sourceUrl": "https://kokoyakyu-database.jp/",
      "date": "2026-07-24",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権島根県大会",
      "round": "準決勝",
      "teams": [
        {
          "display": "開星",
          "score": 6,
          "won": false,
          "name": "開星",
          "slug": null
        },
        {
          "display": "島根中央",
          "score": 7,
          "won": true,
          "name": "島根中央高校",
          "slug": "shimanechuo"
        }
      ]
    },
    {
      "districtSlug": "gifu",
      "district": "岐阜",
      "sourceName": "岐阜県高等学校野球連盟",
      "sourceUrl": "https://ghbf.asfsite.jp/",
      "date": "2026-07-23",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権岐阜大会",
      "round": null,
      "teams": [
        {
          "display": "関商工",
          "score": 9,
          "won": true,
          "name": "関商工高校",
          "slug": "sekishoko"
        },
        {
          "display": "多治見工業",
          "score": 2,
          "won": false,
          "name": "多治見工業高校",
          "slug": "tajimikogyo"
        }
      ]
    },
    {
      "districtSlug": "yamaguchi",
      "district": "山口",
      "sourceName": "山口県高等学校野球連盟",
      "sourceUrl": "https://yamaguchi-hbf.com/",
      "date": "2026-07-23",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権山口大会",
      "round": "準々決勝",
      "teams": [
        {
          "display": "南陽工業",
          "score": 5,
          "won": true,
          "name": "南陽工業高校",
          "slug": "nanyokogyo"
        },
        {
          "display": "宇部鴻城",
          "score": 0,
          "won": false,
          "name": "宇部鴻城",
          "slug": null
        }
      ]
    },
    {
      "districtSlug": "okayama",
      "district": "岡山",
      "sourceName": "岡山県高等学校野球連盟",
      "sourceUrl": "https://www.okayama-hbf.com/",
      "date": "2026-07-23",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権岡山大会",
      "round": "準々決勝",
      "teams": [
        {
          "display": "倉敷商",
          "score": 11,
          "won": true,
          "name": "倉敷商業高校",
          "slug": "kurashikishogyo"
        },
        {
          "display": "岡山東商",
          "score": 1,
          "won": false,
          "name": "岡山東商業高校",
          "slug": "okayamahigashishogyo"
        }
      ]
    },
    {
      "districtSlug": "kagawa",
      "district": "香川",
      "sourceName": "香川県高等学校野球連盟",
      "sourceUrl": "https://www.kagawa-hbf.com/top",
      "date": "2026-07-23",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権香川大会",
      "round": "準決勝",
      "teams": [
        {
          "display": "丸亀",
          "score": 2,
          "won": false,
          "name": "丸亀高校",
          "slug": "marugame"
        },
        {
          "display": "高松商",
          "score": 3,
          "won": true,
          "name": "高松商業高校",
          "slug": "takamatsushogyo"
        }
      ]
    },
    {
      "districtSlug": "nagasaki",
      "district": "長崎",
      "sourceName": "長崎県高等学校野球連盟",
      "sourceUrl": "https://nagasaki-kouyaren.com/",
      "date": "2026-07-23",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権長崎大会",
      "round": "準決勝",
      "teams": [
        {
          "display": "長崎西",
          "score": 2,
          "won": false,
          "name": "長崎西高校",
          "slug": "nagasakinishi"
        },
        {
          "display": "大崎",
          "score": 5,
          "won": true,
          "name": "大崎高校",
          "slug": "nagasaki-osaki"
        }
      ]
    },
    {
      "districtSlug": "nara",
      "district": "奈良",
      "sourceName": "奈良県高等学校野球連盟",
      "sourceUrl": "http://www1.kcn.ne.jp/~nhsbbf/",
      "date": "2026-07-22",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権奈良大会",
      "round": "準々決勝",
      "teams": [
        {
          "display": "生駒",
          "score": 4,
          "won": false,
          "name": "生駒高校",
          "slug": "ikoma"
        },
        {
          "display": "畝傍",
          "score": 5,
          "won": true,
          "name": "畝傍高校",
          "slug": "unebi"
        }
      ]
    },
    {
      "districtSlug": "ehime",
      "district": "愛媛",
      "sourceName": "愛媛県高等学校野球連盟",
      "sourceUrl": "http://www.ehimehbb.jp/",
      "date": "2026-07-22",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権愛媛大会",
      "round": "準々決勝",
      "teams": [
        {
          "display": "小松",
          "score": 3,
          "won": true,
          "name": "小松高校",
          "slug": "ehime-komatsu"
        },
        {
          "display": "済美",
          "score": 0,
          "won": false,
          "name": "済美",
          "slug": null
        }
      ]
    },
    {
      "districtSlug": "kyoto",
      "district": "京都",
      "sourceName": "京都府高等学校野球連盟",
      "sourceUrl": "https://kyoto-hsbf.sakura.ne.jp/khsbf/",
      "date": "2026-07-22",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権京都大会",
      "round": "準々決勝",
      "teams": [
        {
          "display": "龍谷大平安",
          "score": 7,
          "won": false,
          "name": "龍谷大平安",
          "slug": null
        },
        {
          "display": "鳥羽",
          "score": 10,
          "won": true,
          "name": "鳥羽高校",
          "slug": "kyoto-toba"
        }
      ]
    },
    {
      "districtSlug": "hiroshima",
      "district": "広島",
      "sourceName": "広島県高等学校野球連盟",
      "sourceUrl": "https://hiroshima.hhbf1950.or.jp/",
      "date": "2026-07-22",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権広島大会",
      "round": "準々決勝",
      "teams": [
        {
          "display": "呉港",
          "score": 3,
          "won": false,
          "name": "呉港",
          "slug": null
        },
        {
          "display": "広島商",
          "score": 5,
          "won": true,
          "name": "広島商業高校",
          "slug": "hiroshimashogyo"
        }
      ]
    },
    {
      "districtSlug": "ishikawa",
      "district": "石川",
      "sourceName": "石川県高等学校野球連盟",
      "sourceUrl": "https://ishikawa-hbf.jp/",
      "date": "2026-07-22",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権石川大会",
      "round": "準々決勝",
      "teams": [
        {
          "display": "金沢市立工業",
          "score": 2,
          "won": true,
          "name": "金沢市立工業高校",
          "slug": "kanazawashiritsukogyo"
        },
        {
          "display": "金沢学院大附",
          "score": 1,
          "won": false,
          "name": "金沢学院大附",
          "slug": null
        }
      ]
    },
    {
      "districtSlug": "gifu",
      "district": "岐阜",
      "sourceName": "岐阜県高等学校野球連盟",
      "sourceUrl": "https://ghbf.asfsite.jp/",
      "date": "2026-07-22",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権岐阜大会",
      "round": null,
      "teams": [
        {
          "display": "中津商業",
          "score": 1,
          "won": false,
          "name": "中津商業高校",
          "slug": "nakatsushogyo"
        },
        {
          "display": "県岐阜商",
          "score": 2,
          "won": true,
          "name": "岐阜商業高校",
          "slug": "gifushogyo"
        }
      ]
    },
    {
      "districtSlug": "shimane",
      "district": "島根",
      "sourceName": "島根県高校野球データベース",
      "sourceUrl": "https://kokoyakyu-database.jp/",
      "date": "2026-07-22",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権島根県大会",
      "round": "準々決勝",
      "teams": [
        {
          "display": "島根中央",
          "score": 8,
          "won": true,
          "name": "島根中央高校",
          "slug": "shimanechuo"
        },
        {
          "display": "松江北",
          "score": 1,
          "won": false,
          "name": "松江北高校",
          "slug": "matsuekita"
        }
      ]
    },
    {
      "districtSlug": "gunma",
      "district": "群馬",
      "sourceName": "群馬県高等学校野球連盟",
      "sourceUrl": "http://www.gunma-hbf.com/",
      "date": "2026-07-21",
      "season": "summer",
      "tournament": "108回全国高校野球選手権群馬大会",
      "round": "準々決勝",
      "teams": [
        {
          "display": "利根商",
          "score": 1,
          "won": false,
          "name": "利根商業高校",
          "slug": "toneshogyo"
        },
        {
          "display": "前橋商",
          "score": 10,
          "won": true,
          "name": "前橋商業高校",
          "slug": "maebashishogyo"
        }
      ]
    },
    {
      "districtSlug": "saga",
      "district": "佐賀",
      "sourceName": "佐賀県高等学校野球連盟",
      "sourceUrl": "http://kouyaren-saga.jp/",
      "date": "2026-07-21",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権佐賀大会",
      "round": "準々決勝",
      "teams": [
        {
          "display": "唐津商業",
          "score": 3,
          "won": false,
          "name": "唐津商業高校",
          "slug": "karatsushogyo"
        },
        {
          "display": "有田工業",
          "score": 4,
          "won": true,
          "name": "有田工業高校",
          "slug": "aritakogyo"
        }
      ]
    },
    {
      "districtSlug": "saga",
      "district": "佐賀",
      "sourceName": "佐賀県高等学校野球連盟",
      "sourceUrl": "http://kouyaren-saga.jp/",
      "date": "2026-07-21",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権佐賀大会",
      "round": "準々決勝",
      "teams": [
        {
          "display": "佐賀商業",
          "score": 3,
          "won": true,
          "name": "佐賀商業高校",
          "slug": "sagashogyo"
        },
        {
          "display": "嬉野高校",
          "score": 2,
          "won": false,
          "name": "嬉野高校",
          "slug": "ureshino"
        }
      ]
    },
    {
      "districtSlug": "nara",
      "district": "奈良",
      "sourceName": "奈良県高等学校野球連盟",
      "sourceUrl": "http://www1.kcn.ne.jp/~nhsbbf/",
      "date": "2026-07-21",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権奈良大会",
      "round": null,
      "teams": [
        {
          "display": "法隆寺国際",
          "score": 3,
          "won": false,
          "name": "法隆寺国際高校",
          "slug": "horyujikokusai"
        },
        {
          "display": "御所実業",
          "score": 4,
          "won": true,
          "name": "御所実業高校",
          "slug": "gosejitsugyo"
        }
      ]
    },
    {
      "districtSlug": "ehime",
      "district": "愛媛",
      "sourceName": "愛媛県高等学校野球連盟",
      "sourceUrl": "http://www.ehimehbb.jp/",
      "date": "2026-07-21",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権愛媛大会",
      "round": "準々決勝",
      "teams": [
        {
          "display": "松山商",
          "score": 8,
          "won": false,
          "name": "松山商業高校",
          "slug": "matsuyamashogyo"
        },
        {
          "display": "松山北",
          "score": 11,
          "won": true,
          "name": "松山北高校",
          "slug": "matsuyamakita"
        }
      ]
    },
    {
      "districtSlug": "shizuoka",
      "district": "静岡",
      "sourceName": "静岡県高等学校野球連盟",
      "sourceUrl": "https://shizuoka-hbf.com/",
      "date": "2026-07-21",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権静岡大会",
      "round": "4回戦",
      "teams": [
        {
          "display": "静岡学園",
          "score": 2,
          "won": false,
          "name": "静岡学園",
          "slug": null
        },
        {
          "display": "静岡",
          "score": 3,
          "won": true,
          "name": "静岡高校",
          "slug": "shizuoka"
        }
      ]
    },
    {
      "districtSlug": "shizuoka",
      "district": "静岡",
      "sourceName": "静岡県高等学校野球連盟",
      "sourceUrl": "https://shizuoka-hbf.com/",
      "date": "2026-07-21",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権静岡大会",
      "round": "4回戦",
      "teams": [
        {
          "display": "東海大静岡翔洋",
          "score": 1,
          "won": false,
          "name": "東海大静岡翔洋",
          "slug": null
        },
        {
          "display": "富士市立",
          "score": 3,
          "won": true,
          "name": "富士市立高校",
          "slug": "fujishiritsu"
        }
      ]
    },
    {
      "districtSlug": "yamaguchi",
      "district": "山口",
      "sourceName": "山口県高等学校野球連盟",
      "sourceUrl": "https://yamaguchi-hbf.com/",
      "date": "2026-07-21",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権山口大会",
      "round": "3回戦",
      "teams": [
        {
          "display": "柳井",
          "score": 5,
          "won": false,
          "name": "柳井高校",
          "slug": "yanai"
        },
        {
          "display": "岩国",
          "score": 10,
          "won": true,
          "name": "岩国高校",
          "slug": "iwakuni"
        }
      ]
    },
    {
      "districtSlug": "yamaguchi",
      "district": "山口",
      "sourceName": "山口県高等学校野球連盟",
      "sourceUrl": "https://yamaguchi-hbf.com/",
      "date": "2026-07-21",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権山口大会",
      "round": "3回戦",
      "teams": [
        {
          "display": "南陽工業",
          "score": 5,
          "won": true,
          "name": "南陽工業高校",
          "slug": "nanyokogyo"
        },
        {
          "display": "華陵",
          "score": 0,
          "won": false,
          "name": "華陵高校",
          "slug": "karyo"
        }
      ]
    },
    {
      "districtSlug": "fukui",
      "district": "福井",
      "sourceName": "福井県高等学校野球連盟",
      "sourceUrl": "https://291fki.sakura.ne.jp/wp2024/",
      "date": "2026-07-21",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権福井大会",
      "round": "準々決勝",
      "teams": [
        {
          "display": "金津",
          "score": 5,
          "won": false,
          "name": "金津高校",
          "slug": "kanazu"
        },
        {
          "display": "福井商業",
          "score": 6,
          "won": true,
          "name": "福井商業高校",
          "slug": "fukuishogyo"
        }
      ]
    },
    {
      "districtSlug": "saitama",
      "district": "埼玉",
      "sourceName": "埼玉高校野球情報局",
      "sourceUrl": "https://saitama-baseball.com/",
      "date": "2026-07-20",
      "season": "summer",
      "tournament": "2026年（第108回）全国高校野球選手権埼玉大会",
      "round": "5回戦",
      "teams": [
        {
          "display": "浦和麗明",
          "score": 1,
          "won": false,
          "name": "浦和麗明",
          "slug": null
        },
        {
          "display": "大宮東",
          "score": 2,
          "won": true,
          "name": "大宮東高校",
          "slug": "omiyahigashi"
        }
      ]
    },
    {
      "districtSlug": "saitama",
      "district": "埼玉",
      "sourceName": "埼玉高校野球情報局",
      "sourceUrl": "https://saitama-baseball.com/",
      "date": "2026-07-20",
      "season": "summer",
      "tournament": "2026年（第108回）全国高校野球選手権埼玉大会",
      "round": "5回戦",
      "teams": [
        {
          "display": "正智深谷",
          "score": 1,
          "won": false,
          "name": "正智深谷",
          "slug": null
        },
        {
          "display": "川口市立",
          "score": 3,
          "won": true,
          "name": "川口市立高校",
          "slug": "kawaguchishiritsu"
        }
      ]
    },
    {
      "districtSlug": "gunma",
      "district": "群馬",
      "sourceName": "群馬県高等学校野球連盟",
      "sourceUrl": "http://www.gunma-hbf.com/",
      "date": "2026-07-20",
      "season": "summer",
      "tournament": "108回全国高校野球選手権群馬大会",
      "round": "3回戦",
      "teams": [
        {
          "display": "伊勢崎商",
          "score": 1,
          "won": false,
          "name": "伊勢崎商業高校",
          "slug": "isesakishogyo"
        },
        {
          "display": "桐生",
          "score": 9,
          "won": true,
          "name": "桐生高校",
          "slug": "kiryu"
        }
      ]
    },
    {
      "districtSlug": "nara",
      "district": "奈良",
      "sourceName": "奈良県高等学校野球連盟",
      "sourceUrl": "http://www1.kcn.ne.jp/~nhsbbf/",
      "date": "2026-07-20",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権奈良大会",
      "round": null,
      "teams": [
        {
          "display": "生駒",
          "score": 5,
          "won": true,
          "name": "生駒高校",
          "slug": "ikoma"
        },
        {
          "display": "奈良高専",
          "score": 3,
          "won": false,
          "name": "奈良工業高専",
          "slug": "narakogyo"
        }
      ]
    },
    {
      "districtSlug": "nara",
      "district": "奈良",
      "sourceName": "奈良県高等学校野球連盟",
      "sourceUrl": "http://www1.kcn.ne.jp/~nhsbbf/",
      "date": "2026-07-20",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権奈良大会",
      "round": null,
      "teams": [
        {
          "display": "郡山",
          "score": 11,
          "won": true,
          "name": "郡山高校",
          "slug": "nara-koriyama"
        },
        {
          "display": "高田",
          "score": 8,
          "won": false,
          "name": "高田高校",
          "slug": "nara-takata"
        }
      ]
    },
    {
      "districtSlug": "gifu",
      "district": "岐阜",
      "sourceName": "岐阜県高等学校野球連盟",
      "sourceUrl": "https://ghbf.asfsite.jp/",
      "date": "2026-07-20",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権岐阜大会",
      "round": null,
      "teams": [
        {
          "display": "岐阜高専",
          "score": 2,
          "won": false,
          "name": "岐阜工業高専",
          "slug": "gifukogyo-kosen"
        },
        {
          "display": "益田清風",
          "score": 12,
          "won": true,
          "name": "益田清風高校",
          "slug": "mashitaseifu"
        }
      ]
    },
    {
      "districtSlug": "gifu",
      "district": "岐阜",
      "sourceName": "岐阜県高等学校野球連盟",
      "sourceUrl": "https://ghbf.asfsite.jp/",
      "date": "2026-07-20",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権岐阜大会",
      "round": null,
      "teams": [
        {
          "display": "岐阜第一",
          "score": 5,
          "won": false,
          "name": "岐阜第一",
          "slug": null
        },
        {
          "display": "県岐阜商",
          "score": 9,
          "won": true,
          "name": "岐阜商業高校",
          "slug": "gifushogyo"
        }
      ]
    },
    {
      "districtSlug": "fukui",
      "district": "福井",
      "sourceName": "福井県高等学校野球連盟",
      "sourceUrl": "https://291fki.sakura.ne.jp/wp2024/",
      "date": "2026-07-20",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権福井大会",
      "round": "準々決勝",
      "teams": [
        {
          "display": "敦賀",
          "score": 5,
          "won": true,
          "name": "敦賀高校",
          "slug": "tsuruga"
        },
        {
          "display": "大野",
          "score": 4,
          "won": false,
          "name": "大野高校",
          "slug": "fukui-ono"
        }
      ]
    },
    {
      "districtSlug": "okayama",
      "district": "岡山",
      "sourceName": "岡山県高等学校野球連盟",
      "sourceUrl": "https://www.okayama-hbf.com/",
      "date": "2026-07-20",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権岡山大会",
      "round": "3回戦",
      "teams": [
        {
          "display": "創志",
          "score": 5,
          "won": false,
          "name": "創志",
          "slug": null
        },
        {
          "display": "倉敷工",
          "score": 6,
          "won": true,
          "name": "倉敷工業高校",
          "slug": "kurashikikogyo"
        }
      ]
    },
    {
      "districtSlug": "okayama",
      "district": "岡山",
      "sourceName": "岡山県高等学校野球連盟",
      "sourceUrl": "https://www.okayama-hbf.com/",
      "date": "2026-07-20",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権岡山大会",
      "round": "3回戦",
      "teams": [
        {
          "display": "金光",
          "score": 1,
          "won": false,
          "name": "金光",
          "slug": null
        },
        {
          "display": "岡山東商",
          "score": 8,
          "won": true,
          "name": "岡山東商業高校",
          "slug": "okayamahigashishogyo"
        }
      ]
    },
    {
      "districtSlug": "kagawa",
      "district": "香川",
      "sourceName": "香川県高等学校野球連盟",
      "sourceUrl": "https://www.kagawa-hbf.com/top",
      "date": "2026-07-20",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権香川大会",
      "round": "準々決勝",
      "teams": [
        {
          "display": "高松商",
          "score": 10,
          "won": true,
          "name": "高松商業高校",
          "slug": "takamatsushogyo"
        },
        {
          "display": "寒川",
          "score": 2,
          "won": false,
          "name": "寒川",
          "slug": null
        }
      ]
    },
    {
      "districtSlug": "kagawa",
      "district": "香川",
      "sourceName": "香川県高等学校野球連盟",
      "sourceUrl": "https://www.kagawa-hbf.com/top",
      "date": "2026-07-20",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権香川大会",
      "round": "準々決勝",
      "teams": [
        {
          "display": "蓬莱",
          "score": 5,
          "won": false,
          "name": "蓬莱",
          "slug": null
        },
        {
          "display": "丸亀",
          "score": 6,
          "won": true,
          "name": "丸亀高校",
          "slug": "marugame"
        }
      ]
    },
    {
      "districtSlug": "nagasaki",
      "district": "長崎",
      "sourceName": "長崎県高等学校野球連盟",
      "sourceUrl": "https://nagasaki-kouyaren.com/",
      "date": "2026-07-20",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権長崎大会",
      "round": "準々決勝",
      "teams": [
        {
          "display": "創成館",
          "score": 1,
          "won": false,
          "name": "創成館",
          "slug": null
        },
        {
          "display": "大崎",
          "score": 4,
          "won": true,
          "name": "大崎高校",
          "slug": "nagasaki-osaki"
        }
      ]
    },
    {
      "districtSlug": "nagasaki",
      "district": "長崎",
      "sourceName": "長崎県高等学校野球連盟",
      "sourceUrl": "https://nagasaki-kouyaren.com/",
      "date": "2026-07-20",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権長崎大会",
      "round": "準々決勝",
      "teams": [
        {
          "display": "波佐見",
          "score": 11,
          "won": true,
          "name": "波佐見高校",
          "slug": "hasami"
        },
        {
          "display": "九州文化",
          "score": 6,
          "won": false,
          "name": "九州文化",
          "slug": null
        }
      ]
    },
    {
      "districtSlug": "nagasaki",
      "district": "長崎",
      "sourceName": "長崎県高等学校野球連盟",
      "sourceUrl": "https://nagasaki-kouyaren.com/",
      "date": "2026-07-20",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権長崎大会",
      "round": "準々決勝",
      "teams": [
        {
          "display": "長崎西",
          "score": 10,
          "won": true,
          "name": "長崎西高校",
          "slug": "nagasakinishi"
        },
        {
          "display": "大村工",
          "score": 1,
          "won": false,
          "name": "大村工業高校",
          "slug": "omurakogyo"
        }
      ]
    },
    {
      "districtSlug": "iwate",
      "district": "岩手",
      "sourceName": "白球ペンギン.com",
      "sourceUrl": "https://89penguin.com/",
      "date": "2026-07-20",
      "season": "summer",
      "tournament": "選手権岩手大会",
      "round": "準々決勝",
      "teams": [
        {
          "display": "一関一",
          "score": 2,
          "won": true,
          "name": "一関第一高校",
          "slug": "ichinosekidaiichi"
        },
        {
          "display": "盛岡誠桜",
          "score": 0,
          "won": false,
          "name": "盛岡誠桜",
          "slug": null
        }
      ]
    },
    {
      "districtSlug": "kumamoto",
      "district": "熊本",
      "sourceName": "熊本県高等学校野球連盟",
      "sourceUrl": "http://www.kumamoto-kouyaren.com/",
      "date": "2026-07-19",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権熊本大会",
      "round": "準々決勝",
      "teams": [
        {
          "display": "熊本工業",
          "score": 6,
          "won": true,
          "name": "熊本工業高校",
          "slug": "kumamotokogyo"
        },
        {
          "display": "ルーテル学院",
          "score": 5,
          "won": false,
          "name": "ルーテル学院",
          "slug": null
        }
      ]
    },
    {
      "districtSlug": "gunma",
      "district": "群馬",
      "sourceName": "群馬県高等学校野球連盟",
      "sourceUrl": "http://www.gunma-hbf.com/",
      "date": "2026-07-19",
      "season": "summer",
      "tournament": "108回全国高校野球選手権群馬大会",
      "round": "3回戦",
      "teams": [
        {
          "display": "渋川青翠",
          "score": 2,
          "won": false,
          "name": "渋川青翠高校",
          "slug": "shibukawaseisui"
        },
        {
          "display": "前橋商",
          "score": 6,
          "won": true,
          "name": "前橋商業高校",
          "slug": "maebashishogyo"
        }
      ]
    },
    {
      "districtSlug": "ehime",
      "district": "愛媛",
      "sourceName": "愛媛県高等学校野球連盟",
      "sourceUrl": "http://www.ehimehbb.jp/",
      "date": "2026-07-19",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権愛媛大会",
      "round": "3回戦",
      "teams": [
        {
          "display": "西条",
          "score": 13,
          "won": true,
          "name": "西条高校",
          "slug": "saijo"
        },
        {
          "display": "聖カタリナ学園",
          "score": 4,
          "won": false,
          "name": "聖カタリナ学園",
          "slug": null
        }
      ]
    },
    {
      "districtSlug": "ehime",
      "district": "愛媛",
      "sourceName": "愛媛県高等学校野球連盟",
      "sourceUrl": "http://www.ehimehbb.jp/",
      "date": "2026-07-19",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権愛媛大会",
      "round": "3回戦",
      "teams": [
        {
          "display": "小松",
          "score": 9,
          "won": true,
          "name": "小松高校",
          "slug": "ehime-komatsu"
        },
        {
          "display": "宇和島東",
          "score": 2,
          "won": false,
          "name": "宇和島東高校",
          "slug": "uwajimahigashi"
        }
      ]
    },
    {
      "districtSlug": "aichi",
      "district": "愛知",
      "sourceName": "CATVase.jp（愛知県ケーブルテレビ協議会）",
      "sourceUrl": "https://catvase.jp/",
      "date": "2026-07-19",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権愛知大会",
      "round": "4回戦",
      "teams": [
        {
          "display": "碧南",
          "score": 1,
          "won": false,
          "name": "碧南高校",
          "slug": "hekinan"
        },
        {
          "display": "名古屋南",
          "score": 4,
          "won": true,
          "name": "名古屋南高校",
          "slug": "nagoyaminami"
        }
      ]
    },
    {
      "districtSlug": "aichi",
      "district": "愛知",
      "sourceName": "CATVase.jp（愛知県ケーブルテレビ協議会）",
      "sourceUrl": "https://catvase.jp/",
      "date": "2026-07-19",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権愛知大会",
      "round": "4回戦",
      "teams": [
        {
          "display": "誉",
          "score": 3,
          "won": false,
          "name": "誉",
          "slug": null
        },
        {
          "display": "千種",
          "score": 4,
          "won": true,
          "name": "千種高校",
          "slug": "chikusa"
        }
      ]
    },
    {
      "districtSlug": "aichi",
      "district": "愛知",
      "sourceName": "CATVase.jp（愛知県ケーブルテレビ協議会）",
      "sourceUrl": "https://catvase.jp/",
      "date": "2026-07-19",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権愛知大会",
      "round": "4回戦",
      "teams": [
        {
          "display": "渥美農業",
          "score": 2,
          "won": false,
          "name": "渥美農業高校",
          "slug": "atsuminogyo"
        },
        {
          "display": "刈谷工科",
          "score": 5,
          "won": true,
          "name": "刈谷工科高校",
          "slug": "kariyakoka"
        }
      ]
    },
    {
      "districtSlug": "aichi",
      "district": "愛知",
      "sourceName": "CATVase.jp（愛知県ケーブルテレビ協議会）",
      "sourceUrl": "https://catvase.jp/",
      "date": "2026-07-19",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権愛知大会",
      "round": "4回戦",
      "teams": [
        {
          "display": "名古屋大谷",
          "score": 1,
          "won": false,
          "name": "名古屋大谷",
          "slug": null
        },
        {
          "display": "西尾東",
          "score": 2,
          "won": true,
          "name": "西尾東高校",
          "slug": "nishiohigashi"
        }
      ]
    },
    {
      "districtSlug": "kyoto",
      "district": "京都",
      "sourceName": "京都府高等学校野球連盟",
      "sourceUrl": "https://kyoto-hsbf.sakura.ne.jp/khsbf/",
      "date": "2026-07-19",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権京都大会",
      "round": "4回戦",
      "teams": [
        {
          "display": "城南菱創",
          "score": 2,
          "won": false,
          "name": "城南菱創高校",
          "slug": "jonanryoso"
        },
        {
          "display": "鳥羽",
          "score": 7,
          "won": true,
          "name": "鳥羽高校",
          "slug": "kyoto-toba"
        }
      ]
    },
    {
      "districtSlug": "ishikawa",
      "district": "石川",
      "sourceName": "石川県高等学校野球連盟",
      "sourceUrl": "https://ishikawa-hbf.jp/",
      "date": "2026-07-19",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権石川大会",
      "round": "3回戦",
      "teams": [
        {
          "display": "金沢市立工業",
          "score": 4,
          "won": true,
          "name": "金沢市立工業高校",
          "slug": "kanazawashiritsukogyo"
        },
        {
          "display": "小松",
          "score": 0,
          "won": false,
          "name": "小松高校",
          "slug": "komatsu"
        }
      ]
    },
    {
      "districtSlug": "ishikawa",
      "district": "石川",
      "sourceName": "石川県高等学校野球連盟",
      "sourceUrl": "https://ishikawa-hbf.jp/",
      "date": "2026-07-19",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権石川大会",
      "round": "3回戦",
      "teams": [
        {
          "display": "金沢二水",
          "score": 1,
          "won": false,
          "name": "金沢二水高校",
          "slug": "kanazawanisui"
        },
        {
          "display": "門前",
          "score": 7,
          "won": true,
          "name": "門前高校",
          "slug": "monzen"
        }
      ]
    },
    {
      "districtSlug": "yamagata",
      "district": "山形",
      "sourceName": "山形県高等学校野球連盟",
      "sourceUrl": "https://www.yamagata-hbf.org/",
      "date": "2026-07-19",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権山形大会",
      "round": "準々決勝",
      "teams": [
        {
          "display": "山形南",
          "score": 4,
          "won": true,
          "name": "山形南高校",
          "slug": "yamagataminami"
        },
        {
          "display": "山形学院",
          "score": 3,
          "won": false,
          "name": "山形学院",
          "slug": null
        }
      ]
    },
    {
      "districtSlug": "shizuoka",
      "district": "静岡",
      "sourceName": "静岡県高等学校野球連盟",
      "sourceUrl": "https://shizuoka-hbf.com/",
      "date": "2026-07-19",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権静岡大会",
      "round": "3回戦",
      "teams": [
        {
          "display": "島田商",
          "score": 2,
          "won": false,
          "name": "島田商業高校",
          "slug": "shimadashogyo"
        },
        {
          "display": "静岡",
          "score": 9,
          "won": true,
          "name": "静岡高校",
          "slug": "shizuoka"
        }
      ]
    },
    {
      "districtSlug": "shizuoka",
      "district": "静岡",
      "sourceName": "静岡県高等学校野球連盟",
      "sourceUrl": "https://shizuoka-hbf.com/",
      "date": "2026-07-19",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権静岡大会",
      "round": "3回戦",
      "teams": [
        {
          "display": "御殿場南",
          "score": 0,
          "won": false,
          "name": "御殿場南高校",
          "slug": "gotenbaminami"
        },
        {
          "display": "富士市立",
          "score": 10,
          "won": true,
          "name": "富士市立高校",
          "slug": "fujishiritsu"
        }
      ]
    },
    {
      "districtSlug": "fukui",
      "district": "福井",
      "sourceName": "福井県高等学校野球連盟",
      "sourceUrl": "https://291fki.sakura.ne.jp/wp2024/",
      "date": "2026-07-19",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権福井大会",
      "round": "2回戦",
      "teams": [
        {
          "display": "足羽",
          "score": 3,
          "won": false,
          "name": "足羽高校",
          "slug": "asuwa"
        },
        {
          "display": "敦賀",
          "score": 11,
          "won": true,
          "name": "敦賀高校",
          "slug": "tsuruga"
        }
      ]
    },
    {
      "districtSlug": "fukui",
      "district": "福井",
      "sourceName": "福井県高等学校野球連盟",
      "sourceUrl": "https://291fki.sakura.ne.jp/wp2024/",
      "date": "2026-07-19",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権福井大会",
      "round": "2回戦",
      "teams": [
        {
          "display": "金津",
          "score": 2,
          "won": true,
          "name": "金津高校",
          "slug": "kanazu"
        },
        {
          "display": "羽水",
          "score": 1,
          "won": false,
          "name": "羽水高校",
          "slug": "usui"
        }
      ]
    },
    {
      "districtSlug": "kagawa",
      "district": "香川",
      "sourceName": "香川県高等学校野球連盟",
      "sourceUrl": "https://www.kagawa-hbf.com/top",
      "date": "2026-07-19",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権香川大会",
      "round": "3回戦",
      "teams": [
        {
          "display": "三本松",
          "score": 8,
          "won": true,
          "name": "三本松高校",
          "slug": "sanbonmatsu"
        },
        {
          "display": "小豆島中央",
          "score": 4,
          "won": false,
          "name": "小豆島中央高校",
          "slug": "shodoshimachuo"
        }
      ]
    },
    {
      "districtSlug": "kochi",
      "district": "高知",
      "sourceName": "高知県高等学校野球連盟",
      "sourceUrl": "https://www.kochi-hbf.com/top",
      "date": "2026-07-19",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権高知大会",
      "round": "2回戦",
      "teams": [
        {
          "display": "高知国際",
          "score": 2,
          "won": false,
          "name": "高知国際高校",
          "slug": "kochikokusai"
        },
        {
          "display": "高知東",
          "score": 9,
          "won": true,
          "name": "高知東高校",
          "slug": "kochihigashi"
        }
      ]
    },
    {
      "districtSlug": "kochi",
      "district": "高知",
      "sourceName": "高知県高等学校野球連盟",
      "sourceUrl": "https://www.kochi-hbf.com/top",
      "date": "2026-07-19",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権高知大会",
      "round": "2回戦",
      "teams": [
        {
          "display": "土佐塾",
          "score": 1,
          "won": false,
          "name": "土佐塾",
          "slug": null
        },
        {
          "display": "梼原",
          "score": 3,
          "won": true,
          "name": "檮原高校",
          "slug": "yusuhara"
        }
      ]
    },
    {
      "districtSlug": "shimane",
      "district": "島根",
      "sourceName": "島根県高校野球データベース",
      "sourceUrl": "https://kokoyakyu-database.jp/",
      "date": "2026-07-19",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権島根県大会",
      "round": "3回戦",
      "teams": [
        {
          "display": "松江南",
          "score": 8,
          "won": true,
          "name": "松江南高校",
          "slug": "matsueminami"
        },
        {
          "display": "松江農林",
          "score": 5,
          "won": false,
          "name": "松江農林高校",
          "slug": "matsuenorin"
        }
      ]
    },
    {
      "districtSlug": "shimane",
      "district": "島根",
      "sourceName": "島根県高校野球データベース",
      "sourceUrl": "https://kokoyakyu-database.jp/",
      "date": "2026-07-19",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権島根県大会",
      "round": "3回戦",
      "teams": [
        {
          "display": "安来",
          "score": 2,
          "won": false,
          "name": "安来高校",
          "slug": "yasugi"
        },
        {
          "display": "松江商業",
          "score": 9,
          "won": true,
          "name": "松江商業高校",
          "slug": "matsueshogyo"
        }
      ]
    },
    {
      "districtSlug": "kanagawa",
      "district": "神奈川",
      "sourceName": "神奈川高校野球ステーション",
      "sourceUrl": "https://www.kanagawa-baseball.com/",
      "date": "2026-07-18",
      "season": "summer",
      "tournament": "第108回全国高等学校野球選手権神奈川大会",
      "round": "5回戦",
      "teams": [
        {
          "display": "市ケ尾",
          "score": 3,
          "won": true,
          "name": "市ケ尾高校",
          "slug": "ichigao"
        },
        {
          "display": "川和",
          "score": 1,
          "won": false,
          "name": "川和高校",
          "slug": "kawawa"
        }
      ]
    },
    {
      "districtSlug": "saitama",
      "district": "埼玉",
      "sourceName": "埼玉高校野球情報局",
      "sourceUrl": "https://saitama-baseball.com/",
      "date": "2026-07-18",
      "season": "summer",
      "tournament": "2026年（第108回）全国高校野球選手権埼玉大会",
      "round": "4回戦",
      "teams": [
        {
          "display": "飯能",
          "score": 1,
          "won": false,
          "name": "飯能高校",
          "slug": "hanno"
        },
        {
          "display": "川口市立",
          "score": 4,
          "won": true,
          "name": "川口市立高校",
          "slug": "kawaguchishiritsu"
        }
      ]
    },
    {
      "districtSlug": "saitama",
      "district": "埼玉",
      "sourceName": "埼玉高校野球情報局",
      "sourceUrl": "https://saitama-baseball.com/",
      "date": "2026-07-18",
      "season": "summer",
      "tournament": "2026年（第108回）全国高校野球選手権埼玉大会",
      "round": "4回戦",
      "teams": [
        {
          "display": "熊谷商",
          "score": 1,
          "won": true,
          "name": "熊谷商業高校",
          "slug": "kumagayashogyo"
        },
        {
          "display": "武南",
          "score": 0,
          "won": false,
          "name": "武南",
          "slug": null
        }
      ]
    }
  ]
};
