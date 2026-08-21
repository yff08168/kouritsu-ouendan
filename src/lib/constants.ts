/**
 * サイト全体で共有する定数。
 * DBに入れるほどではない / 変わらない値だけをここに置く。
 */

export const SITE = {
  name: "公立応援団",
  fullName: "公立高校野球応援サイト「公立応援団」",
  catchphrase: "公立高校野球が、もっと面白くなる。",
  description:
    "全国の公立高校野球を応援する人のためのサイト。ニュース、学校情報、戦績、歴史、そして公立旋風まで。公立高校野球の“今”を、ここに。",
  /*
   * 既定値を本番ドメインにしてある。Vercel側で環境変数の設定を忘れても
   * canonical と sitemap が localhost になってしまう事故を防ぐため。
   * ローカル開発では .env.local の NEXT_PUBLIC_SITE_URL が上書きする。
   */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://kouritsu-ouendan.com",
  locale: "ja_JP",
  xHandle: "@kouritsu_ouendan",
  xUrl: "https://x.com/kouritsu_ouendan",
} as const;

/**
 * 運営者情報。
 *
 * ★ 公開前に必ず設定すること ★
 * 未設定のままだと /about と /contact に「未設定」と表示される。
 * 実在しない名前や住所を仮に入れることはしない（虚偽の運営者情報になるため）。
 *
 * 将来 Google AdSense を申請する場合、運営者情報・問い合わせ先・
 * プライバシーポリシーの3点は審査の前提になる。
 */
export const OPERATOR: {
  /** 例: 「公立応援団 編集部」、個人名、屋号など */
  name: string | null;
  /** 問い合わせ用のメールアドレス。公開したくない場合は null のままでよい */
  contactEmail: string | null;
  /** サイト開設年 */
  establishedYear: number;
} = {
  name: "公立応援団 編集部",
  // TODO(公開前): 問い合わせ用のGmailを取得したら入れる。
  // 応援メッセージを預かっている以上、削除依頼・通報の受け皿が要る。
  // Xだけだと、Xアカウントを持たない人が削除を求められない。
  contactEmail: null,
  establishedYear: 2026,
};

/**
 * 「公立旋風」の呼び名。
 *
 * このサイト独自の看板コンテンツだが、高校野球に詳しくない人には
 * 何のページか伝わりにくい。名前だけを置かず、必ず説明を添えて出す。
 *
 * 呼び名を変えたくなったらここだけ直せば全ページに反映される。
 * URL（/phenomenon）は変えないこと。一度公開したURLを変えると
 * 検索結果と外部リンクが切れるため。
 */
export const PHENOMENON = {
  /** ナビや見出しに出す短い名前 */
  label: "公立旋風",
  /** 見出しの下や一覧カードに添える一行説明 */
  tagline: "公立高校が起こした快進撃の記録",
  /** ページ冒頭で使う、もう少し詳しい説明 */
  description:
    "強豪私学がひしめく地方大会や甲子園で、公立高校が勝ち上がっていくこと。このサイトでは、その一つひとつを記録として残していきます。",
} as const;

/**
 * ヘッダー / フッターの主要ナビゲーション。
 *
 * **「公立高校」と「都道府県」は1つにまとめた（2026-08-13）。**
 * どちらも日本地図から学校へ辿るページで、利用者から見ると
 * 同じものが2つ並んでいた。`/prefectures` はURLを壊さないために
 * 残してあるが、ナビからは外し `/schools` の中から辿れるようにしている。
 */
/**
 * グローバルナビ。**ヘッダー（PC・モバイルのメニュー）とフッターが同じ一覧を見る。**
 *
 * ★**「ニュース」は 2026-08-21 に運営者の判断で外した**（`/news` 自体は残っている）。
 * 記事が0件のうちは入口を出さない。**戻すときはここに1行足すだけ。**
 */
export const NAV = [
  { href: "/schools", label: "公立高校を探す" },
  { href: "/rankings", label: "記録" },
  { href: "/phenomenon", label: PHENOMENON.label },
  { href: "/features", label: "特集" },
] as const;

/**
 * 記録・ランキングのページ一覧。
 *
 * ハブページのカード・グローバルナビ・sitemap がこの1か所を見る。
 * **URLは公開後に変えない。** slug はローマ字（日本語URLは共有時に読めなくなる）。
 */
export const RANKINGS = [
  {
    slug: "koshien",
    title: "甲子園出場回数ランキング",
    short: "出場回数",
    description:
      "春・夏・通算のそれぞれで、甲子園に多く出場している公立高校の順位。通算勝利数と勝率でも並べ替えられます。",
  },
  {
    slug: "best",
    title: "春夏の最高成績",
    short: "最高成績",
    description:
      "優勝・準優勝・ベスト4……と、到達した段階ごとに学校を並べた一覧。公立で全国制覇した学校がひと目で分かります。",
  },
  {
    slug: "21seiki-waku",
    title: "21世紀枠の出場校",
    short: "21世紀枠",
    description:
      "2001年に始まった21世紀枠で選抜大会に出場した学校を、選ばれた年の順に並べた年表。",
  },
  {
    slug: "prefectures",
    title: "都道府県別の甲子園記録",
    short: "都道府県別",
    description:
      "公立勢がどの地域で甲子園に出ているか。出場回数・勝利数を日本地図の形に色分けして表示します。",
  },
  {
    slug: "history",
    title: "公立の甲子園、100年の移り変わり",
    short: "100年の推移",
    description:
      "甲子園の出場校に公立が占める割合は、100年でどう変わったのか。大会ごとの推移を折れ線で示します。",
  },
] as const;

export type RankingPage = (typeof RANKINGS)[number];

export const RANKING_BY_SLUG = new Map(RANKINGS.map((r) => [r.slug, r]));

/** 設置区分。国立・高専も応援対象に含める（私立のみ収録対象外） */
export const ESTABLISHMENTS = {
  prefectural: "県立",
  municipal: "市立",
  town_village: "町村立",
  combined: "組合立",
  national: "国立",
  private: "私立",
} as const;

export type Establishment = keyof typeof ESTABLISHMENTS;

/**
 * 設置区分の表示ラベル。
 * 都道府県立は「県立」で一律にせず、北海道は道立、東京は都立、
 * 大阪・京都は府立と表記する（実際の校名表記に合わせるため）。
 *
 * 地区名は「北北海道」「西東京」のように分割されているので、
 * 完全一致ではなく末尾で見る。
 */
export function establishmentLabel(
  establishment: Establishment,
  prefectureName: string,
): string {
  if (establishment !== "prefectural") return ESTABLISHMENTS[establishment];
  if (prefectureName.endsWith("北海道")) return "道立";
  if (prefectureName.endsWith("東京")) return "都立";
  if (prefectureName === "大阪" || prefectureName === "京都") return "府立";
  return "県立";
}

/** サイトの収録対象（私立は対戦相手データとしてのみ保持する） */
export const TARGET_ESTABLISHMENTS: Establishment[] = [
  "prefectural",
  "municipal",
  "town_village",
  "combined",
  "national",
];

/** 学校種別。国立を含めたことで高専・中等教育学校が入るため区別する */
export const SCHOOL_KINDS = {
  high_school: "高等学校",
  kosen: "高等専門学校",
  secondary: "中等教育学校",
} as const;

export type SchoolKind = keyof typeof SCHOOL_KINDS;

/** ニュースのカテゴリ */
export const NEWS_CATEGORIES = {
  result: "大会・結果",
  news: "ニュース",
  topic: "トピックス",
  column: "コラム",
  preview: "展望",
} as const;

export type NewsCategory = keyof typeof NEWS_CATEGORIES;

/**
 * 公立旋風の規模。
 *
 * **`prefectural` は「県大会」ではなく「地方大会」と出す**（2026-08-20 に変更）。
 * 東東京・西東京の大会は「県大会」ではないうえ、サイトの他の場所
 * （結果速報・県のページ）はどれも都道府県の予選を「地方大会」と呼んでいる。
 * `regional` の「地区大会」は関東大会・東海大会のような複数県の大会のこと。
 */
export const PHENOMENON_LEVELS = {
  koshien: "甲子園",
  prefectural: "地方大会",
  regional: "地区大会",
} as const;

/** 特集のカテゴリ */
export const FEATURE_CATEGORIES = {
  guide: "観戦ガイド",
  history: "歴史",
  school_intro: "チーム紹介",
  stadium: "球場情報",
  goods: "観戦グッズ",
} as const;

export const SEASONS = {
  spring: "春",
  summer: "夏",
  autumn: "秋",
} as const;

/** 地方区分。都道府県一覧のグルーピングに使う */
export const REGIONS = [
  "北海道",
  "東北",
  "関東",
  "中部",
  "近畿",
  "中国",
  "四国",
  "九州・沖縄",
] as const;

export type Region = (typeof REGIONS)[number];

export type PrefectureMaster = {
  /**
   * 地区ID。DBの主キーと一致させる。
   *
   * 分割していない45件はJIS都道府県コードと同じ値。
   * 北海道（01）と東京（13）は甲子園の大会区分にあわせて2つに分けたため、
   * JISコードに対応する値がなく、48〜51を割り当てている。
   */
  id: number;
  name: string;
  slug: string;
  region: Region;
  /**
   * タイル地図での配置（列, 行）。1始まり。
   *
   * 実際の県境SVGを使わずマス目に並べているのは、
   * (1) 小さい県（香川・大阪など）もタップしやすい大きさを保てる
   * (2) 地図データの配布ライセンスと帰属表示の問題が発生しない
   * (3) ただのリンクの集まりなのでキーボード操作と読み上げがそのまま効く
   * ため。正確な地図ではなく、位置関係が伝わればよいという割り切り。
   *
   * 並びは**甲子園の出場校一覧でおなじみの配置**に合わせてある
   * （北海道・東北を右上にまとめ、残り40地区を10列×4行に敷き詰める）。
   * 高校野球を見る人がいちばん見慣れた形で、日本の形を模した配置より
   * マスの隙間が少なく、1マスあたりを大きく取れる。
   */
  mapCol: number;
  mapRow: number;
  /** 横に何マス分使うか。北海道の2地区だけ2マス（既定は1） */
  mapSpan?: number;
};

/** タイル地図の列数・行数。CSSグリッドの定義に使う */
export const MAP_COLUMNS = 10;
export const MAP_ROWS = 10;

/**
 * 地区マスタ（49件）。おおむねJISコード順。
 *
 * 都道府県そのものではなく、**甲子園の大会区分**で並べている。
 * 北海道は北北海道・南北海道、東京は東東京・西東京に分かれ、
 * それぞれ別の代表校が甲子園に出るため、高校野球では2つの地区として扱う。
 * 学校の住所としての「北海道」「東京都」は schools.city 側に残る。
 *
 * slug をローマ字にしているのは、日本語URLがエンコードされて
 * 共有時に読めなくなるのを避けるため（設計判断⑨）。
 *
 * ------------------------------------------------------------------
 * タイル地図の座標について
 *
 *   1〜2行目 … 北海道の2地区（右上・横2マス）
 *   3〜5行目 … 東北6県（右端2列）。左に空くマスは凡例と説明を置く場所
 *   6〜9行目 … 残り40地区を10列×4行に。各行は西から東へ
 *   10行目   … 沖縄
 *
 *   配列の並び自体はJISコード順のまま。狭い画面では地方別の一覧に
 *   切り替わり、そのときはこの並びがそのまま読み上げ順になるため。
 */
export const PREFECTURES: PrefectureMaster[] = [
  { id: 48, name: "北北海道", slug: "kita-hokkaido", region: "北海道", mapCol: 9, mapRow: 1, mapSpan: 2 },
  { id: 49, name: "南北海道", slug: "minami-hokkaido", region: "北海道", mapCol: 9, mapRow: 2, mapSpan: 2 },
  { id: 2, name: "青森", slug: "aomori", region: "東北", mapCol: 9, mapRow: 3 },
  { id: 3, name: "岩手", slug: "iwate", region: "東北", mapCol: 10, mapRow: 3 },
  { id: 4, name: "宮城", slug: "miyagi", region: "東北", mapCol: 10, mapRow: 4 },
  { id: 5, name: "秋田", slug: "akita", region: "東北", mapCol: 9, mapRow: 4 },
  { id: 6, name: "山形", slug: "yamagata", region: "東北", mapCol: 9, mapRow: 5 },
  { id: 7, name: "福島", slug: "fukushima", region: "東北", mapCol: 10, mapRow: 5 },
  { id: 8, name: "茨城", slug: "ibaraki", region: "関東", mapCol: 10, mapRow: 7 },
  { id: 9, name: "栃木", slug: "tochigi", region: "関東", mapCol: 10, mapRow: 6 },
  { id: 10, name: "群馬", slug: "gunma", region: "関東", mapCol: 9, mapRow: 6 },
  { id: 11, name: "埼玉", slug: "saitama", region: "関東", mapCol: 9, mapRow: 7 },
  { id: 12, name: "千葉", slug: "chiba", region: "関東", mapCol: 10, mapRow: 9 },
  // 東東京と西東京は必ず横に並べる。縦に積むと東西の関係が読み取れない。
  { id: 50, name: "東東京", slug: "higashi-tokyo", region: "関東", mapCol: 10, mapRow: 8 },
  { id: 51, name: "西東京", slug: "nishi-tokyo", region: "関東", mapCol: 9, mapRow: 8 },
  { id: 14, name: "神奈川", slug: "kanagawa", region: "関東", mapCol: 9, mapRow: 9 },
  { id: 15, name: "新潟", slug: "niigata", region: "中部", mapCol: 8, mapRow: 6 },
  { id: 16, name: "富山", slug: "toyama", region: "中部", mapCol: 7, mapRow: 6 },
  { id: 17, name: "石川", slug: "ishikawa", region: "中部", mapCol: 6, mapRow: 6 },
  { id: 18, name: "福井", slug: "fukui", region: "中部", mapCol: 7, mapRow: 7 },
  { id: 19, name: "山梨", slug: "yamanashi", region: "中部", mapCol: 8, mapRow: 8 },
  { id: 20, name: "長野", slug: "nagano", region: "中部", mapCol: 8, mapRow: 7 },
  { id: 21, name: "岐阜", slug: "gifu", region: "中部", mapCol: 7, mapRow: 8 },
  { id: 22, name: "静岡", slug: "shizuoka", region: "中部", mapCol: 8, mapRow: 9 },
  { id: 23, name: "愛知", slug: "aichi", region: "中部", mapCol: 7, mapRow: 9 },
  { id: 24, name: "三重", slug: "mie", region: "近畿", mapCol: 6, mapRow: 9 },
  { id: 25, name: "滋賀", slug: "shiga", region: "近畿", mapCol: 6, mapRow: 8 },
  { id: 26, name: "京都", slug: "kyoto", region: "近畿", mapCol: 6, mapRow: 7 },
  { id: 27, name: "大阪", slug: "osaka", region: "近畿", mapCol: 5, mapRow: 7 },
  { id: 28, name: "兵庫", slug: "hyogo", region: "近畿", mapCol: 5, mapRow: 6 },
  { id: 29, name: "奈良", slug: "nara", region: "近畿", mapCol: 5, mapRow: 8 },
  { id: 30, name: "和歌山", slug: "wakayama", region: "近畿", mapCol: 5, mapRow: 9 },
  { id: 31, name: "鳥取", slug: "tottori", region: "中国", mapCol: 4, mapRow: 6 },
  { id: 32, name: "島根", slug: "shimane", region: "中国", mapCol: 3, mapRow: 6 },
  { id: 33, name: "岡山", slug: "okayama", region: "中国", mapCol: 4, mapRow: 7 },
  { id: 34, name: "広島", slug: "hiroshima", region: "中国", mapCol: 3, mapRow: 7 },
  { id: 35, name: "山口", slug: "yamaguchi", region: "中国", mapCol: 2, mapRow: 6 },
  { id: 36, name: "徳島", slug: "tokushima", region: "四国", mapCol: 4, mapRow: 9 },
  { id: 37, name: "香川", slug: "kagawa", region: "四国", mapCol: 4, mapRow: 8 },
  { id: 38, name: "愛媛", slug: "ehime", region: "四国", mapCol: 3, mapRow: 8 },
  { id: 39, name: "高知", slug: "kochi", region: "四国", mapCol: 3, mapRow: 9 },
  { id: 40, name: "福岡", slug: "fukuoka", region: "九州・沖縄", mapCol: 2, mapRow: 7 },
  { id: 41, name: "佐賀", slug: "saga", region: "九州・沖縄", mapCol: 1, mapRow: 6 },
  { id: 42, name: "長崎", slug: "nagasaki", region: "九州・沖縄", mapCol: 1, mapRow: 7 },
  { id: 43, name: "熊本", slug: "kumamoto", region: "九州・沖縄", mapCol: 1, mapRow: 8 },
  { id: 44, name: "大分", slug: "oita", region: "九州・沖縄", mapCol: 2, mapRow: 8 },
  { id: 45, name: "宮崎", slug: "miyazaki", region: "九州・沖縄", mapCol: 2, mapRow: 9 },
  { id: 46, name: "鹿児島", slug: "kagoshima", region: "九州・沖縄", mapCol: 1, mapRow: 9 },
  { id: 47, name: "沖縄", slug: "okinawa", region: "九州・沖縄", mapCol: 1, mapRow: 10 },
];

export const PREFECTURE_BY_SLUG = new Map(PREFECTURES.map((p) => [p.slug, p]));
export const PREFECTURE_BY_ID = new Map(PREFECTURES.map((p) => [p.id, p]));
