/**
 * 公立旋風の「勝ち上がり」データ。
 *
 * **ここは生成物ではない。手で書く編集コンテンツ。**
 * `src/lib/data/` （スクリプトが吐く生成物・直接編集しない）とは別物なので
 * 置き場所を分けている。
 *
 * なぜDBに入れないのか:
 *   試合単位のテーブルを足すとマイグレーションを人がSQL Editorで流す作業が増え、
 *   流し忘れると詳細ページが落ちる。記事は数十件の規模で、更新も編集作業の一部
 *   なのでコードと一緒にデプロイされるほうが事故が少ない。
 *
 * ★★ スコアは必ず一次資料で裏を取ってから書くこと。記憶で書かない。★★
 *   ここのデータは data/wikipedia-cache/ の wikitext を直接読んで作っている。
 *   要約モデル（WebFetch）を通すと対戦相手も勝敗も入れ替わる。実際に、
 *   最初の版では次の2件の誤りが混入した:
 *     - 金足農×近江を「延長タイブレーク」と書いた（実際は9回裏のサヨナラ）
 *     - 佐賀北×宇治山田商の引き分けを「1-1」と書いた（実際は「4-4」）
 *   **資料に無いものは書かない。** 引き分け試合のスコアは大会記事の
 *   ブラケットには載っておらず、試合単体の記事にしか無い。
 */

export type GameOutcome = "win" | "loss" | "draw";

/**
 * イニングごとの得点（スコアボード）。
 *
 * 得点は文字列で持つ。後攻が9回を戦わなかった `X` や、サヨナラの `2x` を
 * そのまま表現するため。数値にすると情報が落ちる。
 */
export type Linescore = {
  /** 先攻チーム名 */
  roadTeam: string;
  /** 後攻チーム名 */
  homeTeam: string;
  /** 先攻のイニングごとの得点 */
  roadInnings: string[];
  /** 後攻のイニングごとの得点 */
  homeInnings: string[];
  /**
   * 先攻・後攻の 得点・安打・失策。
   * **安打と失策は資料に無ければ省く。** 0を入れないこと（0安打は別の意味になる）。
   * 両チームぶん揃っているときだけ H・E の列を出す。
   */
  roadTotals: { r: number; h?: number; e?: number };
  homeTotals: { r: number; h?: number; e?: number };
  /** この記録の主役校がどちら側か。スコアボードで強調するのに使う */
  subject: "road" | "home";
  /** 投手（投球回つき）。資料にあるぶんだけ */
  roadPitchers?: string;
  homePitchers?: string;
  /** 本塁打。打った側だけ入れる */
  roadHomeRuns?: string;
  homeHomeRuns?: string;
  /** 試合時間 */
  duration?: string;
};

export type RunGame = {
  /** 「1回戦」「準々決勝」など */
  round: string;
  /** 「8月11日」。資料に無ければ省く（推測しない） */
  date?: string;
  /** 対戦相手の校名。表記は大会記事にあわせた略称 */
  opponent: string;
  /** その校の代表地区 */
  opponentPrefecture?: string;
  /** 主役校の得点 */
  scoreFor: number;
  /** 相手の得点 */
  scoreAgainst: number;
  outcome: GameOutcome;
  /** サヨナラ勝ちか */
  walkOff?: boolean;
  /** 「延長13回」など、試合形式の補足 */
  note?: string;
  /**
   * 試合の展開。**出典をもとに自分の言葉で書く。**
   * 新聞記事やWikipediaの文章を写さないこと（事実の抽出なら
   * CC BY-SAの継承は発動しないが、文章を持ってくると発動する）。
   */
  comment?: string;
  /** スコアボード。資料がある試合だけ */
  linescore?: Linescore;
};

/**
 * 動画の出所の区分。
 *
 * `official` … 大会主催者・放送局・学校・高野連など権利者の公式チャンネル。
 * `unverified` … それ以外。**既定では画面に出さない**（isEmbeddableVideo）。
 *                 消すと調べ直しになるので記録としては残す。
 */
export type VideoSource = "official" | "unverified";

export type RunVideo = {
  url: string;
  title: string;
  /** 誰が上げたものかを必ず記録する */
  channel: string;
  source: VideoSource;
  /** 出所を確認した日。動画は消えるので確認日を残す */
  checkedOn: string;
};

/** 画面に埋め込んでよい動画か。判断を1か所に閉じ込める。 */
export function isEmbeddableVideo(video: RunVideo): boolean {
  return video.source === "official";
}

export type TournamentRun = {
  /** phenomena テーブルの slug と対応させる */
  phenomenonSlug: string;
  schoolSlug: string;
  schoolName: string;
  year: number;
  season: "spring" | "summer";
  tournamentName: string;
  /** 到達した段階 */
  result: string;
  games: RunGame[];
  /**
   * 出典。**URLは任意。** 運営者自身の記録や書籍にはURLが無い。
   * `note` は「1回戦・3回戦・準々決勝・準決勝」のように、
   * その出典がどの試合ぶんかを示すのに使う。
   */
  sources: { label: string; url?: string; note?: string }[];
  videos?: RunVideo[];
};

const wiki = (title: string) =>
  `https://ja.wikipedia.org/wiki/${encodeURIComponent(title)}`;

export const TOURNAMENT_RUNS: TournamentRun[] = [
  // ==========================================================
  // 佐賀北 2007（優勝）
  //
  // スコアボードは全7試合そろっている。出所が3つに分かれている。
  //   引き分け・再試合          … 試合単体の記事（Wikipedia）
  //   決勝                      … 大会記事（Wikipedia）
  //   1回戦・3回戦・準々決勝・準決勝 … 運営者のスコアブック
  //
  // 安打（H）と失策（E）はWikipedia由来の3試合にしか無い。
  // 揃っていない試合では列ごと出さない（0を入れない）。
  //
  // 勝ち数は6勝0敗1分。引き分け再試合を挟むので、
  // 引き分けを勝敗のどちらにも数えないこと（DB側も2026-08-12に修正済み）。
  // ==========================================================
  {
    phenomenonSlug: "sagakita-2007-summer",
    schoolSlug: "sagakita",
    schoolName: "佐賀北高校",
    year: 2007,
    season: "summer",
    tournamentName: "第89回全国高等学校野球選手権大会",
    result: "優勝",
    games: [
      {
        round: "1回戦",
        date: "8月8日",
        opponent: "福井商",
        opponentPrefecture: "福井",
        scoreFor: 2,
        scoreAgainst: 0,
        outcome: "win",
        comment:
          "3回と8回に1点ずつを挙げ、馬場から久保への継投で福井商を完封した。副島に本塁打が出ている。",
        linescore: {
          roadTeam: "佐賀北",
          homeTeam: "福井商",
          roadInnings: ["0","0","1","0","0","0","0","1","0"],
          homeInnings: ["0","0","0","0","0","0","0","0","0"],
          roadTotals: { r: 2 },
          homeTotals: { r: 0 },
          subject: "road",
          roadPitchers: "馬場→久保",
          homePitchers: "山田→宇野",
          roadHomeRuns: "副島",
        },
      },
      {
        round: "2回戦",
        date: "8月14日",
        opponent: "宇治山田商",
        opponentPrefecture: "三重",
        scoreFor: 4,
        scoreAgainst: 4,
        outcome: "draw",
        note: "延長15回引き分け",
        comment:
          "1回に2点を先行したが、5回に満塁から一挙4点を返されて逆転される。6回と7回に1点ずつ返して追いつき、そのまま延長へ。13回には1死満塁の勝ち越し機を作ったが得点できず、15回を戦って4対4の引き分け。この大会で唯一の再試合となった。",
        linescore: {
          roadTeam: "佐賀北",
          homeTeam: "宇治山田商",
          roadInnings: ["2","0","0","0","0","1","1","0","0","0","0","0","0","0","0"],
          homeInnings: ["0","0","0","0","4","0","0","0","0","0","0","0","0","0","0"],
          roadTotals: { r: 4, h: 10, e: 2 },
          homeTotals: { r: 4, h: 9, e: 4 },
          subject: "road",
          roadPitchers: "馬場（5回）、久保（10回）",
          homePitchers: "平生（6回）、中井（9回）",
        },
      },
      {
        round: "2回戦 再試合",
        date: "8月16日",
        opponent: "宇治山田商",
        opponentPrefecture: "三重",
        scoreFor: 9,
        scoreAgainst: 1,
        outcome: "win",
        comment:
          "前日までの接戦から一転。4回に1点を先制すると、6回に3点、7回に4点を集めて突き放した。12安打9得点で、2日越しの対戦に決着をつけた。",
        linescore: {
          roadTeam: "佐賀北",
          homeTeam: "宇治山田商",
          roadInnings: ["0","0","0","1","0","3","4","1","0"],
          homeInnings: ["0","0","1","0","0","0","0","0","0"],
          roadTotals: { r: 9, h: 12, e: 1 },
          homeTotals: { r: 1, h: 7, e: 2 },
          subject: "road",
          roadPitchers: "馬場（5回）、久保（4回）",
          homePitchers: "中井（6回）、平生（1回1/3）、中井（1回2/3）",
        },
      },
      {
        round: "3回戦",
        date: "8月17日",
        opponent: "前橋商",
        opponentPrefecture: "群馬",
        scoreFor: 5,
        scoreAgainst: 2,
        outcome: "win",
        comment:
          "2回に2点本塁打で先制されたが、その裏すぐに2点を返して追いつく。3回・4回と着実に加点し、7回にも1点。再試合の翌日という連戦だったが、馬場から久保への継投で2点に抑えた。",
        linescore: {
          roadTeam: "前橋商",
          homeTeam: "佐賀北",
          roadInnings: ["0","2","0","0","0","0","0","0","0"],
          homeInnings: ["0","2","1","1","0","0","1","0","X"],
          roadTotals: { r: 2 },
          homeTotals: { r: 5 },
          subject: "home",
          roadPitchers: "佐々木→樺沢",
          homePitchers: "馬場→久保",
          roadHomeRuns: "佐々木",
          homeHomeRuns: "馬場",
        },
      },
      {
        round: "準々決勝",
        date: "8月19日",
        opponent: "帝京",
        opponentPrefecture: "東東京",
        scoreFor: 4,
        scoreAgainst: 3,
        outcome: "win",
        walkOff: true,
        note: "延長13回",
        comment:
          "1回から3回まで毎回1点を挙げて3対0としたが、4回に追いつかれる。以降は両校とも得点なく延長へ入り、13回、2死からの連打で一・二塁として井手の中前適時打でサヨナラ勝ち。救援した久保が延長10回と12回の2度のスクイズを阻んでいる。",
        linescore: {
          roadTeam: "帝京",
          homeTeam: "佐賀北",
          roadInnings: ["0","1","0","2","0","0","0","0","0","0","0","0","0"],
          homeInnings: ["1","1","1","0","0","0","0","0","0","0","0","0","1x"],
          roadTotals: { r: 3 },
          homeTotals: { r: 4 },
          subject: "home",
          roadPitchers: "高島→垣ケ原",
          homePitchers: "馬場→久保",
          homeHomeRuns: "副島",
        },
      },
      {
        round: "準決勝",
        date: "8月21日",
        opponent: "長崎日大",
        opponentPrefecture: "長崎",
        scoreFor: 3,
        scoreAgainst: 0,
        outcome: "win",
        comment:
          "2回にスクイズで先制し、4回と7回にも1点ずつ。長崎日大に5安打を許し無死の走者を5度背負いながら、守り切って無失点で決勝進出を決めた。この大会2度目の完封勝ち。",
        linescore: {
          roadTeam: "長崎日大",
          homeTeam: "佐賀北",
          roadInnings: ["0","0","0","0","0","0","0","0","0"],
          homeInnings: ["0","1","0","1","0","0","1","0","X"],
          roadTotals: { r: 0 },
          homeTotals: { r: 3 },
          subject: "home",
          roadPitchers: "浦口→小山",
          homePitchers: "馬場→久保",
        },
      },
      {
        round: "決勝",
        date: "8月22日",
        opponent: "広陵",
        opponentPrefecture: "広島",
        scoreFor: 5,
        scoreAgainst: 4,
        outcome: "win",
        comment:
          "7回まで0対4。安打数も5対13と押されていたが、8回裏に一挙5点を返して逆転した。副島浩史の満塁本塁打が出たのがこの回で、佐賀北はこの試合の得点をすべて8回に集めている。",
        linescore: {
          roadTeam: "広陵",
          homeTeam: "佐賀北",
          roadInnings: ["0","2","0","0","0","0","2","0","0"],
          homeInnings: ["0","0","0","0","0","0","0","5","X"],
          roadTotals: { r: 4, h: 13, e: 0 },
          homeTotals: { r: 5, h: 5, e: 0 },
          subject: "home",
          roadPitchers: "野村（8回）",
          homePitchers: "馬場（7回1/3）、久保（1回2/3）",
          homeHomeRuns: "副島",
          duration: "2時間15分",
        },
      },
    ],
    sources: [
      {
        label: "当サイト運営者が記録したスコアブック（2007年夏）",
        note: "1回戦・3回戦・準々決勝・準決勝のスコアボード",
      },
      {
        label: "宇治山田商業対佐賀北延長15回引き分け再試合 - Wikipedia",
        url: wiki("宇治山田商業対佐賀北延長15回引き分け再試合"),
        note: "2回戦および再試合のスコアボード",
      },
      {
        label: "第89回全国高等学校野球選手権大会 - Wikipedia",
        url: wiki("第89回全国高等学校野球選手権大会"),
        note: "決勝のスコアボード、大会全体の勝ち上がり",
      },
    ],
  },

  // ==========================================================
  // 金足農 2018（準優勝）
  //
  // 「金農旋風」の独立記事に全6試合ぶんのLinescoreと試合経過がある。
  // 4校のうち唯一、全試合のスコアボードが揃っている。
  // ==========================================================
  {
    phenomenonSlug: "kanaashinogyo-2018-summer",
    schoolSlug: "kanaashinogyo",
    schoolName: "金足農業高校",
    year: 2018,
    season: "summer",
    tournamentName: "第100回全国高等学校野球選手権記念大会",
    result: "準優勝",
    games: [
      {
        round: "1回戦",
        date: "8月8日",
        opponent: "鹿児島実",
        opponentPrefecture: "鹿児島",
        scoreFor: 5,
        scoreAgainst: 1,
        outcome: "win",
        comment:
          "3回にスクイズと適時打で3点を先制し、8回にも2点を加えた。吉田輝星が9回を1失点、14奪三振で投げ切っている。",
        linescore: {
          roadTeam: "鹿児島実",
          homeTeam: "金足農",
          roadInnings: ["0","0","0","0","0","0","0","1","0"],
          homeInnings: ["0","0","3","0","0","0","0","2","X"],
          roadTotals: { r: 1, h: 9, e: 1 },
          homeTotals: { r: 5, h: 12, e: 1 },
          subject: "home",
          roadPitchers: "吉村（3回1/3）、立本（1回1/3）、吉村（3回1/3）",
          homePitchers: "吉田（9回）",
          duration: "2時間9分",
        },
      },
      {
        round: "2回戦",
        date: "8月14日",
        opponent: "大垣日大",
        opponentPrefecture: "岐阜",
        scoreFor: 6,
        scoreAgainst: 3,
        outcome: "win",
        comment:
          "序盤に点を取り合ったあと膠着し、3対3のまま終盤へ。8回に大友の勝ち越し本塁打で抜け出し、9回にも2点を加えた。吉田は13奪三振。",
        linescore: {
          roadTeam: "金足農",
          homeTeam: "大垣日大",
          roadInnings: ["1","2","0","0","0","0","0","1","2"],
          homeInnings: ["1","0","2","0","0","0","0","0","0"],
          roadTotals: { r: 6, h: 9, e: 1 },
          homeTotals: { r: 3, h: 6, e: 0 },
          subject: "road",
          roadPitchers: "吉田（9回）",
          homePitchers: "内藤（2回）、杉本（7回）",
          roadHomeRuns: "大友",
          duration: "1時間59分",
        },
      },
      {
        round: "3回戦",
        date: "8月17日",
        opponent: "横浜",
        opponentPrefecture: "南神奈川",
        scoreFor: 5,
        scoreAgainst: 4,
        outcome: "win",
        comment:
          "1回に2点を先行されたが、3回に吉田の2ランで追いつく。その後も勝ち越されて2点を追う展開となり、8回裏に高橋の3ランで逆転した。高橋にとっては高校に入って初めての本塁打だった。23年ぶりのベスト8進出。",
        linescore: {
          roadTeam: "横浜",
          homeTeam: "金足農",
          roadInnings: ["2","0","0","0","0","1","1","0","0"],
          homeInnings: ["0","0","2","0","0","0","0","3","X"],
          roadTotals: { r: 4, h: 12, e: 0 },
          homeTotals: { r: 5, h: 8, e: 1 },
          subject: "home",
          roadPitchers: "板川（8回）",
          homePitchers: "吉田（9回）",
          homeHomeRuns: "吉田、高橋",
          duration: "1時間53分",
        },
      },
      {
        round: "準々決勝",
        date: "8月18日",
        opponent: "近江",
        opponentPrefecture: "滋賀",
        scoreFor: 3,
        scoreAgainst: 2,
        outcome: "win",
        walkOff: true,
        comment:
          "1点を追う9回裏、無死満塁から9番斎藤が2ランスクイズを決めてサヨナラ勝ち。大会史上初の逆転満塁サヨナラ2ランスクイズだった。1984年以来34年ぶりのベスト4。",
        linescore: {
          roadTeam: "近江",
          homeTeam: "金足農",
          roadInnings: ["0","0","0","1","0","1","0","0","0"],
          homeInnings: ["0","0","0","0","1","0","0","0","2x"],
          roadTotals: { r: 2, h: 7, e: 2 },
          homeTotals: { r: 3, h: 8, e: 2 },
          subject: "home",
          roadPitchers: "佐合（4回）、林（4回1/3）",
          homePitchers: "吉田（9回）",
          duration: "1時間47分",
        },
      },
      {
        round: "準決勝",
        date: "8月20日",
        opponent: "日大三",
        opponentPrefecture: "西東京",
        scoreFor: 2,
        scoreAgainst: 1,
        outcome: "win",
        comment:
          "1回に先制し5回にも加点。相手に4回以降は単打しか許さず、8回の1点にとどめて逃げ切った。秋田県勢としては第1回大会以来103年ぶりの決勝進出。",
        linescore: {
          roadTeam: "金足農",
          homeTeam: "日大三",
          roadInnings: ["1","0","0","0","1","0","0","0","0"],
          homeInnings: ["0","0","0","0","0","0","0","1","0"],
          roadTotals: { r: 2, h: 10, e: 2 },
          homeTotals: { r: 1, h: 9, e: 0 },
          subject: "road",
          roadPitchers: "吉田（9回）",
          homePitchers: "広沢（3回2/3）、河村（3回2/3）、井上（1回2/3）",
          duration: "2時間13分",
        },
      },
      {
        round: "決勝",
        date: "8月21日",
        opponent: "大阪桐蔭",
        opponentPrefecture: "北大阪",
        scoreFor: 2,
        scoreAgainst: 13,
        outcome: "loss",
        comment:
          "初回に3点を失い、吉田はこの回だけで35球を要した。4回に3ラン、5回にも長短打を集められて6点を奪われ、吉田は5回で降板。2対13で大会を終えた。ここまでの5試合を一人で投げ抜いてきた末の決勝だった。",
        linescore: {
          roadTeam: "金足農",
          homeTeam: "大阪桐蔭",
          roadInnings: ["0","0","1","0","0","0","1","0","0"],
          homeInnings: ["3","0","0","3","6","0","1","0","X"],
          roadTotals: { r: 2, h: 5, e: 1 },
          homeTotals: { r: 13, h: 15, e: 0 },
          subject: "road",
          roadPitchers: "吉田（5回）、打川（3回）",
          homePitchers: "柿木（9回）",
          homeHomeRuns: "宮﨑、根尾",
          duration: "2時間12分",
        },
      },
    ],
    sources: [
      {
        label: "金農旋風 - Wikipedia",
        url: wiki("金農旋風"),
        note: "全6試合のスコアボード、試合経過",
      },
      {
        label: "第100回全国高等学校野球選手権記念大会 - Wikipedia",
        url: wiki("第100回全国高等学校野球選手権記念大会"),
        note: "大会全体の勝ち上がり",
      },
    ],
  },

  // ==========================================================
  // 大社 2024（ベスト8）
  //
  // Wikipedia には独立記事（「大社旋風」）が無く、大会記事のブラケットには
  // 最終スコアしか載っていない。イニングごとの得点は運営者が当時つけた
  // スコアブックによる（2026-08-12 に本人が照合済み）。
  //
  // **4試合とも最終スコアが大会記事と一致することを確認済み**
  // （3-1 / 5-4 / 3-2 / 2-8、通算3勝1敗）。
  // ==========================================================
  {
    phenomenonSlug: "taisha-2024-summer",
    schoolSlug: "taisha",
    schoolName: "大社高校",
    year: 2024,
    season: "summer",
    tournamentName: "第106回全国高等学校野球選手権大会",
    result: "ベスト8",
    games: [
      {
        round: "1回戦",
        date: "8月11日",
        opponent: "報徳学園",
        opponentPrefecture: "兵庫",
        scoreFor: 3,
        scoreAgainst: 1,
        outcome: "win",
        comment:
          "32年ぶりの甲子園。1回に2点を先制し、7回にも1点を加えた。馬庭が9回を投げ切り、報徳学園の得点は9回の1点だけに抑えている。",
        linescore: {
          roadTeam: "大社",
          homeTeam: "報徳学園",
          roadInnings: ["2","0","0","0","0","0","1","0","0"],
          homeInnings: ["0","0","0","0","0","0","0","0","1"],
          roadTotals: { r: 3 },
          homeTotals: { r: 1 },
          subject: "road",
          roadPitchers: "馬庭",
          homePitchers: "今朝丸→間木→伊藤",
        },
      },
      {
        round: "2回戦",
        date: "8月15日",
        opponent: "創成館",
        opponentPrefecture: "長崎",
        scoreFor: 5,
        scoreAgainst: 4,
        outcome: "win",
        note: "延長10回タイブレーク",
        comment:
          "3回に先制されたが5回に追いつく。6回に2点を勝ち越されると、8回に2点を返して再び同点とした。延長10回のタイブレークで2点を挙げ、その裏の1点を振り切っている。馬庭が10回を投げ切った。",
        linescore: {
          roadTeam: "大社",
          homeTeam: "創成館",
          roadInnings: ["0","0","0","0","1","0","0","2","0","2"],
          homeInnings: ["0","0","1","0","0","2","0","0","0","1"],
          roadTotals: { r: 5 },
          homeTotals: { r: 4 },
          subject: "road",
          roadPitchers: "馬庭",
          homePitchers: "奥田→村田",
        },
      },
      {
        round: "3回戦",
        date: "8月17日",
        opponent: "早稲田実",
        opponentPrefecture: "西東京",
        scoreFor: 3,
        scoreAgainst: 2,
        outcome: "win",
        walkOff: true,
        note: "延長11回タイブレーク",
        comment:
          "1回に先制したものの6回と7回に逆転される。9回にスクイズで追いつくと、延長11回無死満塁から馬庭が中前へ運んでサヨナラ勝ち。2試合続けてのタイブレークを制してベスト8に進んだ。夏のベスト8は1931年以来。",
        linescore: {
          roadTeam: "早稲田実",
          homeTeam: "大社",
          roadInnings: ["0","0","0","0","0","1","1","0","0","0","0"],
          homeInnings: ["1","0","0","0","0","0","0","0","1","0","1x"],
          roadTotals: { r: 2 },
          homeTotals: { r: 3 },
          subject: "home",
          roadPitchers: "中村→川上",
          homePitchers: "馬庭",
        },
      },
      {
        round: "準々決勝",
        date: "8月19日",
        opponent: "神村学園",
        opponentPrefecture: "鹿児島",
        scoreFor: 2,
        scoreAgainst: 8,
        outcome: "loss",
        comment:
          "1回に先制し4回にも加点して食い下がったが、5回に勝ち越されると7回に4点を失って突き放された。3人の投手をつぎ込んだが及ばず、ベスト8で大会を終えた。",
        linescore: {
          roadTeam: "神村学園",
          homeTeam: "大社",
          roadInnings: ["0","1","0","1","1","0","4","1","0"],
          homeInnings: ["1","0","0","1","0","0","0","0","0"],
          roadTotals: { r: 8 },
          homeTotals: { r: 2 },
          subject: "home",
          roadPitchers: "今村→早瀬",
          homePitchers: "岸→山本→馬庭",
          duration: "2時間40分",
        },
      },
    ],
    sources: [
      {
        label: "当サイト運営者が記録したスコアブック（2024年夏）",
        note: "全4試合のスコアボード",
      },
      {
        label: "第106回全国高等学校野球選手権大会 - Wikipedia",
        url: wiki("第106回全国高等学校野球選手権大会"),
        note: "大会全体の勝ち上がり",
      },
    ],
  },

  // ==========================================================
  // 県岐阜商 2025（ベスト4）
  //
  // イニングごとの得点は運営者が当時つけたスコアブックによる
  // （2026-08-12 に本人が照合済み）。**全5試合そろっている。**
  // 最終スコアが大会記事と一致することを確認済み（通算4勝1敗）。
  // ==========================================================
  {
    phenomenonSlug: "gifushogyo-2025-summer",
    schoolSlug: "gifushogyo",
    schoolName: "岐阜商業高校",
    year: 2025,
    season: "summer",
    tournamentName: "第107回全国高等学校野球選手権大会",
    result: "ベスト4",
    games: [
      {
        round: "1回戦",
        date: "8月11日",
        opponent: "日大山形",
        opponentPrefecture: "山形",
        scoreFor: 6,
        scoreAgainst: 3,
        outcome: "win",
        comment:
          "初回に1点を先行されたが、5回に2点を挙げて逆転し、7回にも4点を加えて突き放した。柴田が9回を投げ切っている。",
        linescore: {
          roadTeam: "日大山形",
          homeTeam: "県岐阜商",
          roadInnings: ["1","0","0","0","0","0","0","0","2"],
          homeInnings: ["0","0","0","0","2","0","4","0","X"],
          roadTotals: { r: 3 },
          homeTotals: { r: 6 },
          subject: "home",
          roadPitchers: "小林→本田→児玉",
          homePitchers: "柴田",
        },
      },
      {
        round: "2回戦",
        date: "8月15日",
        opponent: "東海大熊本星翔",
        opponentPrefecture: "熊本",
        scoreFor: 4,
        scoreAgainst: 3,
        outcome: "win",
        comment:
          "3回に先制され、5回に3点を返して逆転。7回に追いつかれた直後の8回に勝ち越し、1点差で振り切った。柴田が2試合続けての完投。",
        linescore: {
          roadTeam: "県岐阜商",
          homeTeam: "東海大熊本星翔",
          roadInnings: ["0","0","0","0","3","0","0","1","0"],
          homeInnings: ["0","0","1","0","1","0","1","0","0"],
          roadTotals: { r: 4 },
          homeTotals: { r: 3 },
          subject: "road",
          roadPitchers: "柴田",
          homePitchers: "水野→三池→緒方",
        },
      },
      {
        round: "3回戦",
        date: "8月17日",
        opponent: "明豊",
        opponentPrefecture: "大分",
        scoreFor: 3,
        scoreAgainst: 1,
        outcome: "win",
        comment:
          "1回に3点を先制し、それがこの試合の全得点となった。3人の継投で明豊を2回の1点だけに抑えている。",
        linescore: {
          roadTeam: "明豊",
          homeTeam: "県岐阜商",
          roadInnings: ["0","1","0","0","0","0","0","0","0"],
          homeInnings: ["3","0","0","0","0","0","0","0","X"],
          roadTotals: { r: 1 },
          homeTotals: { r: 3 },
          subject: "home",
          roadPitchers: "寺本",
          homePitchers: "豊吉→渡辺大→柴田",
        },
      },
      {
        round: "準々決勝",
        date: "8月19日",
        opponent: "横浜",
        opponentPrefecture: "南神奈川",
        scoreFor: 8,
        scoreAgainst: 7,
        outcome: "win",
        walkOff: true,
        note: "延長11回タイブレーク",
        comment:
          "4対4で並んだまま延長へ。10回のタイブレークで3点を勝ち越されたが、その裏に小舘の3点適時二塁打で追いついた。11回、2死一・三塁から坂口が左前へ運んでサヨナラ。16年ぶりのベスト4に進んだ。",
        linescore: {
          roadTeam: "横浜",
          homeTeam: "県岐阜商",
          roadInnings: ["0","0","0","0","0","3","0","1","0","3","0"],
          homeInnings: ["1","0","0","1","2","0","0","0","0","3","1x"],
          roadTotals: { r: 7 },
          homeTotals: { r: 8 },
          subject: "home",
          roadPitchers: "織田→山脇→奥村頼",
          homePitchers: "渡辺大→柴田→和田",
          duration: "2時間42分",
        },
      },
      {
        round: "準決勝",
        date: "8月21日",
        opponent: "日大三",
        opponentPrefecture: "西東京",
        scoreFor: 2,
        scoreAgainst: 4,
        outcome: "loss",
        note: "延長10回タイブレーク",
        comment:
          "初回に先制されたが2回に追いつき、5回に勝ち越す。8回に同点とされ、2試合続けての延長タイブレークとなった10回に2点を奪われた。柴田は164球を投げ切ったが、打線は6回以降に安打が出なかった。",
        linescore: {
          roadTeam: "日大三",
          homeTeam: "県岐阜商",
          roadInnings: ["1","0","0","0","0","0","0","1","0","2"],
          homeInnings: ["0","1","0","0","1","0","0","0","0","0"],
          roadTotals: { r: 4 },
          homeTotals: { r: 2 },
          subject: "home",
          roadPitchers: "根本→近藤",
          homePitchers: "柴田",
        },
      },
    ],
    sources: [
      {
        label: "当サイト運営者が記録したスコアブック（2025年夏）",
        note: "全5試合のスコアボード",
      },
      {
        label: "第107回全国高等学校野球選手権大会 - Wikipedia",
        url: wiki("第107回全国高等学校野球選手権大会"),
        note: "大会全体の勝ち上がり",
      },
    ],
  },
];

/** phenomena の slug から勝ち上がりを引く。無ければ undefined。 */
export function getTournamentRun(
  phenomenonSlug: string,
): TournamentRun | undefined {
  return TOURNAMENT_RUNS.find((run) => run.phenomenonSlug === phenomenonSlug);
}

/** 勝敗の集計。**敗戦数は画面に出さない方針なので勝ち数と引き分けだけ返す。** */
export function summarizeRun(run: TournamentRun) {
  const wins = run.games.filter((g) => g.outcome === "win").length;
  const draws = run.games.filter((g) => g.outcome === "draw").length;
  return { wins, draws, games: run.games.length };
}
