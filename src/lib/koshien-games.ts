/**
 * 甲子園（春の選抜・夏の選手権）の**試合単位の結果**。
 *
 * データ本体は `scripts/build-koshien-games.mjs` が作る**生成物**
 * （`src/lib/data/koshien-games.ts`）。出典は ja.wikipedia の大会記事の wikitext。
 *
 * ------------------------------------------------------------------
 * ★**`school_championships`（DB）とは別物。**
 *
 *   あちらは「どの学校が何年に出て、どこまで勝ち上がったか」の**学校ごとの記録**。
 *   こちらは**試合そのもの**（対戦相手・スコア・日付）。
 *
 * ★**私立も入っている。** 甲子園は全試合が揃って初めて大会の記録になる
 * （地方大会で私立の戦績も引用しているのと同じ考え方）。
 */

export type KoshienGameTeam = {
  /** 大会記事の表記（「県岐阜商」「日大三」） */
  display: string;
  /**
   * ★**代表校の表から取った都道府県**（2026-08-26 追加）。
   * **古い大会は取れない**（「奥羽」「南関東」のような地区名）ので任意。
   * ★**同名の別校に当てないための鍵。** 実際に2003年夏の「金沢」（石川・私立）が
   * 「金沢高校」＝横浜市立金沢（神奈川）に結び付いていた。
   */
  pref?: string;
  score: number;
  won: boolean;
  /** サヨナラ（wikitext の `6x`） */
  walkOff?: boolean;
};

import raw from "@/lib/data/koshien-games.json";
import supplements from "@/lib/data/koshien-supplements.json";

/**
 * ★★**生成物は JSON**（2026-08-24）。
 *
 * TypeScript のリテラル配列にすると、**2,972件で TS2590**
 * （"union type that is too complex to represent"）になり型検査が通らない。
 * ★**JSON にして、型はここで1回だけ与える。**
 * ★**`as unknown as` を挟むのは、JSON の推論結果（`walkOff` が
 * 一部の要素にしか無い等）と型がそのままでは重ならないため。**
 * **中身は生成側が検算済み**で、形は `KoshienGame` に揃っている。
 */
/*
  ★★**自前の出典で埋められなかった大会だけ、別の出典から補っている**（2026-08-26）。

  既定の出典は ja.wikipedia のままで、**記事側の作りが原因で検算に落ちる大会**
  （1938年春・1984年春）だけを `koshien-supplements.json` から足す。
  ★**補ったぶんは1試合ずつ `source` を持っている**ので、画面に出典を出せる
  （地方大会の `RegionalGame.source` と同じ考え方）。
  ★**穴が自前の出典で埋まったら、補いのほうを外すこと。**
*/
export const KOSHIEN_GAMES = [
  ...(raw as unknown as readonly KoshienGame[]),
  ...(supplements as unknown as readonly KoshienGame[]),
];

export type KoshienGame = {
  year: number;
  season: "spring" | "summer";
  /** 第N回 */
  no: number;
  /** 「第107回全国高等学校野球選手権大会」 */
  tournament: string;
  /** 「1回戦」「準々決勝」「決勝」。記事に回戦名が無い段は null */
  round: string | null;
  /** 「2025-08-23」。記事に日付が無ければ null */
  date: string | null;
  /** 「延長10回 TB」など、記事が添えている注記 */
  note: string | null;
  teams: KoshienGameTeam[];
  /**
   * ★**その試合だけ出所が違うときに書く**（既定は ja.wikipedia の大会記事）。
   * 画面に出す（**出典の表示は実際の出所と一致させること**）。
   */
  source?: { name: string; url?: string };
};

/**
 * その学校の甲子園の試合を拾う。
 *
 * ★★**校名は「完全一致」でしか結び付けない。**
 * 大会記事の表記は略称（「県岐阜商」「日大三」）で、**部分一致で拾うと
 * 別の学校に当たる**（「横浜」と「横浜清陵」、「市和歌山」と「和歌山」）。
 * ★**当たらなければ出さない。** 取りこぼすほうが、誤って別の学校の
 * 戦績を出すよりましである。
 *
 * ★★**都道府県が分かるときは一致を要求する**（2026-08-26）。
 * 大会記事の校名は略称で、**別の県の同名校に当たる。**
 * 実際に**2003年夏の「金沢」（石川・私立）が横浜市立金沢（神奈川）の戦績として
 * 出ていた。** ★**記事側に県が無い古い大会は、今までどおり校名だけで見る。**
 *
 * @param names その学校として認めてよい表記（学校マスタの校名・一覧用の短い校名など）
 * @param pref  その学校の都道府県（甲子園の大会区分名でよい）。省略すると県は見ない
 */
export function koshienGamesOf(
  games: readonly KoshienGame[],
  names: readonly string[],
  pref?: string,
): KoshienGame[] {
  const want = new Set(names.map(normalizeKoshienName).filter(Boolean));
  if (!want.size) return [];
  return games.filter((g) =>
    g.teams.some(
      (t) => want.has(normalizeKoshienName(t.display)) && samePrefecture(teamPrefecture(t), pref),
    ),
  );
}

/**
 * 都道府県が食い違っていないか。**どちらかが分からなければ true**（今までどおり）。
 *
 * ★**北北海道・南北海道と北海道、東東京・西東京と東京は同じものとして扱う。**
 * 夏の記事は分割後の名前、春の記事は「北海道」「東京」で書く。
 */
export function samePrefecture(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return true;
  return prefectureKey(a) === prefectureKey(b);
}

/**
 * そのチームの都道府県。**紙に無ければ、同じ校名の他の大会から借りる。**
 *
 * ★★**古い大会は代表校の欄が「地区」**（北陸・奥羽・南関東）で県が取れない。
 * そこを空のままにすると、**同名の別校に当たったままになる** ——
 * 1962年夏の「金沢」（石川）が、学校マスタの「金沢高校」＝横浜市立金沢
 * （神奈川）の戦績として画面に出ていた。
 *
 * ★**借りるのは「県が1つに決まる校名」だけ。** 同じ校名が複数の県で出てくるなら
 * （熊本の城北／徳島県立城北のような組）**借りずに「分からない」とする。**
 * ★**推測ではあるので、照合を厳しくする方向にだけ使う**（緩める方向には使わない）。
 */
export function teamPrefecture(t: KoshienGameTeam): string | undefined {
  return t.pref ?? prefectureByName().get(normalizeKoshienName(t.display));
}

/*
  ★**最初に呼ばれたときに作る（モジュールの読み込み時に作らない）。**
  `normalizeKoshienName` はこのファイルの下のほうにある `const OLD_KANJI` を使うので、
  **読み込み時に走らせると「初期化前に触った」で500になる**（実際になった）。
*/
let cachedPrefectureByName: Map<string, string> | null = null;
const prefectureByName = () => (cachedPrefectureByName ??= buildPrefectureByName());

const buildPrefectureByName = () => {
  const found = new Map<string, Set<string>>();
  for (const g of KOSHIEN_GAMES) {
    for (const t of g.teams) {
      if (!t.pref) continue;
      const key = normalizeKoshienName(t.display);
      const set = found.get(key) ?? new Set<string>();
      set.add(prefectureKey(t.pref));
      found.set(key, set);
    }
  }
  const out = new Map<string, string>();
  for (const [key, set] of found) if (set.size === 1) out.set(key, [...set][0]);
  return out;
};

/** 北北海道・南北海道 → 北海道／東東京・西東京 → 東京 にそろえる */
export function prefectureKey(s: string): string {
  return s.replace(/^(北|南)北海道$/, "北海道").replace(/^(東|西)東京$/, "東京");
}

/**
 * 照合用にそろえる。**画面に出す表記は変えない。**
 *
 * ★**カタカナの「ニ」が漢数字として使われている**記事がある
 * （第97回選抜の「ニ松学舎大付」）。生成側でも直しているが、
 * **学校マスタ側から来る名前にも同じ掃除をかける。**
 */
export function normalizeKoshienName(s: string): string {
  return (
    s
      .normalize("NFKC")
      .replace(/ニ/g, "二")
      .replace(/[ヶケ]/g, "ケ")
      .replace(/\s+/g, "")
      .replace(/高等学校$|高校$|高$/, "")
      /*
        ★**旧字体を新字体に寄せる。** 大会記事と学校マスタで字体が違うことがある
        （地方大会の `normalizeSchoolName` と同じ考え方）。
      */
      .replace(/[應廣濱澤齋邊穗舘國學榮德淸眞靑藝圓惠]/g, (c) => OLD_KANJI[c] ?? c)
      /*
        ★★**大会記事は「商業」を「商」と略す**（`高松商` `松山商` `県岐阜商`）。
        **学校マスタは正式名（高松商業高校）**なので、そのままでは当たらない
        （実際に高松商業・松山商業が**甲子園0試合**になっていた）。
        ★**寄せるのは 商業→商・工業→工・農業→農 の3つだけ**
        （地方大会の照合で使っているのと同じ規則。**これ以上増やさないこと**）。
      */
      .replace(/商業$/, "商")
      .replace(/工業$/, "工")
      .replace(/農業$/, "農")
      .trim()
  );
}

/** 旧字体 → 新字体。**照合のときだけ使う。画面に出す表記は変えない。** */
const OLD_KANJI: Record<string, string> = {
  應: "応", 廣: "広", 濱: "浜", 澤: "沢", 齋: "斎", 邊: "辺", 穗: "穂",
  舘: "館", 國: "国", 學: "学", 榮: "栄", 德: "徳", 淸: "清", 眞: "真",
  靑: "青", 藝: "芸", 圓: "円", 惠: "恵",
};
