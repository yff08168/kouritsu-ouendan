/**
 * 選抜高校野球の「21世紀枠」まわりのデータ（来季の都府県推薦校・選考の日程）。
 *
 * ------------------------------------------------------------------
 * ★★ 出典は日本高野連の「21世紀枠推薦校一覧」（`/senbatsu/<年>/21century/`）
 *
 *   各都府県の連盟が11月上旬までに1校ずつ推薦して発表し、**日本高野連がそれを1枚に
 *   まとめて載せている**（学校名・秋季大会の成績・都府県の発表日）。**更新日時つき**
 *   （例: 2026年11月17日 17:00）で、**発表のたびに行が埋まっていく**。
 *   ★各連盟のページには推薦の理由などの文章があるが、**文章は取らない**
 *   （ニュースと同じ線。校名・成績・日付という事実だけ）。
 *
 * ★★ **生成物にしない。描くときに取りに行く**（`jingu-live.ts` と同じ作り）
 *
 *   北海道の推薦と、12月の「9地区の候補校」、1月の選考結果は**これから順に出る**。
 *   取得 → コミット → 再ビルドを待つと、**発表の当日に載らない。**
 *   ★★**`cache: "force-cache"` を必ず書く**（この版の Next は fetch を既定でキャッシュしない）。
 *   ★★**打ち切りに `signal` を使わない**（キャッシュとメモ化が両方外れる）。`Promise.race` で待つ。
 *   ★★**ページを `force-dynamic` にしない**（見ている人の数だけサーバーが動く。2026-09-10 に止まった）。
 *
 * ★★ **取れなかった日のための控え**（`data/senbatsu-21seiki-recommended.json`。生成物）
 *   `node scripts/snapshot-21seiki.mjs` が**この関数そのもの**（`parseRecommendedHtml`）で
 *   書き出す。**規則を2か所に持たない。** ビルドのときに出典が落ちていても、
 *   控えの内容でページが組める。**控えは更新日時を持っているので、画面にも古さが出る。**
 *
 * ★★ **47行そろっていなければ「取れていない」として捨てる**
 *   連盟が表の形を変えたとき、**半端に読めた表を載せない**（石川の「構造は合うのに相手が違う」と同じ轍）。
 */

import snapshotRaw from "@/lib/data/senbatsu-21seiki-recommended.json";

const BASE = "https://www.jhbf.or.jp";
const UA = "kouritsu-ouendan/1.0 (+https://kouritsu-ouendan.com)";
const TIMEOUT_MS = 8000;
/** 発表のたびに行が埋まる。1時間遅れまでは許す（ページ側の revalidate もこれに合わせる） */
const REVALIDATE = 3600;

/** 選抜の回と開催年。第99回＝2027年（回 = 年 − 1928） */
export const senbatsuEdition = (year: number): number => year - 1928;

/** 日本高野連の推薦校一覧のURL（画面に出典として出す） */
export const recommendedUrl = (year: number): string =>
  `${BASE}/senbatsu/${year}/21century/`;

/**
 * 9地区。**日本高野連が「9地区から推薦された候補校」と呼ぶ区分**で、
 * 「関東・東京」が1つ、山梨は関東に入る（秋季大会の地区の組み方と同じ）。
 * ★**並びは日本高野連のお知らせ（第98回の9地区候補校）の並び**。
 */
export const NINE_AREAS: readonly { name: string; prefectures: readonly string[] }[] = [
  { name: "北海道", prefectures: ["北海道"] },
  { name: "東北", prefectures: ["青森", "岩手", "秋田", "山形", "宮城", "福島"] },
  {
    name: "関東・東京",
    prefectures: ["茨城", "栃木", "群馬", "埼玉", "山梨", "千葉", "東京", "神奈川"],
  },
  { name: "東海", prefectures: ["静岡", "愛知", "岐阜", "三重"] },
  { name: "北信越", prefectures: ["長野", "新潟", "富山", "石川", "福井"] },
  { name: "近畿", prefectures: ["滋賀", "京都", "奈良", "和歌山", "大阪", "兵庫"] },
  { name: "中国", prefectures: ["岡山", "鳥取", "広島", "島根", "山口"] },
  { name: "四国", prefectures: ["香川", "愛媛", "徳島", "高知"] },
  { name: "九州", prefectures: ["福岡", "佐賀", "長崎", "熊本", "大分", "宮崎", "鹿児島", "沖縄"] },
];

export type RecommendedRow = {
  /** 「青森」「東京」。47都道府県の名前（「県」「都」を付けない） */
  prefecture: string;
  /** 出典の表記のまま（「県立弘前実」「日大二」）。まだ発表されていなければ null */
  school: string | null;
  /** 秋季大会の成績。出典の表記を半角にそろえたもの（「ベスト8」「準優勝」「第3位」） */
  record: string | null;
  /** 都府県の発表日の月・日。まだなら null */
  announced: { month: number; day: number } | null;
  /** 出典が「推薦校なし」と書いている（前回の大分）。`school` は null */
  none?: true;
};

export type RecommendedList = {
  year: number;
  /** 日本高野連の更新日時の表示（「2026年11月17日 17:00」）。読めなければ null */
  updatedAt: string | null;
  rows: RecommendedRow[];
  /** 取れた経路。`snapshot` は控え（出典を取れなかったとき） */
  via: "live" | "snapshot";
};

// ---------------------------------------------------------------------
// 読み取り（スクリプトと同じ関数を使う）

const squash = (s: string): string =>
  s.normalize("NFKC").replace(/&nbsp;/g, " ").replace(/[\s　]+/g, " ").trim();

const stripTags = (s: string): string => s.replace(/<[^>]+>/g, "");

const isBlank = (s: string): boolean => s === "" || /^[―－ー\-–—]+$/.test(s);

/**
 * 推薦校一覧のHTMLを読む。**47行そろわなければ null**（半端に読めた表を出さない）。
 */
export function parseRecommendedHtml(
  html: string,
  year: number,
): Omit<RecommendedList, "via"> | null {
  const updatedAt =
    squash(stripTags(html)).match(/(\d{4}年\d{1,2}月\d{1,2}日 \d{1,2}:\d{2})/)?.[1] ?? null;

  const rows: RecommendedRow[] = [];
  for (const tr of html.matchAll(/<tr[\s\S]*?<\/tr>/g)) {
    const cells = [...tr[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
      squash(stripTags(m[1])),
    );
    if (cells.length < 4) continue; // 見出し行（th）は td が無い
    const prefecture = cells[0].replace(/ /g, "");
    const none = cells[1].replace(/ /g, "") === "推薦校なし";
    const school = isBlank(cells[1]) || none ? null : cells[1].replace(/ /g, "");
    const record = isBlank(cells[2]) ? null : cells[2].replace(/ /g, "");
    const date = cells[3].replace(/ /g, "").match(/^(\d{1,2})月(\d{1,2})日$/);
    rows.push({
      prefecture,
      school,
      record,
      announced: date ? { month: Number(date[1]), day: Number(date[2]) } : null,
      ...(none ? { none: true as const } : {}),
    });
  }

  const expected = NINE_AREAS.flatMap((a) => a.prefectures);
  const names = rows.map((r) => r.prefecture);
  const ok =
    rows.length === expected.length &&
    expected.every((p) => names.filter((n) => n === p).length === 1);
  if (!ok) return null;
  return { year, updatedAt, rows };
}

// ---------------------------------------------------------------------
// 取得

async function fetchPage(url: string): Promise<string | null> {
  const load = async (): Promise<string | null> => {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      cache: "force-cache",
      next: { revalidate: REVALIDATE },
    });
    if (!res.ok) return null;
    return await res.text();
  };
  try {
    return await Promise.race([
      load(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ]);
  } catch {
    return null;
  }
}

const SNAPSHOT = snapshotRaw as unknown as Record<string, Omit<RecommendedList, "via">>;

/**
 * その年の選抜（第N回）の都府県推薦校。**出典を取りに行き、取れなければ控え。**
 * どちらも無ければ null（その年のページを作らない）。
 */
export async function getRecommendedList(year: number): Promise<RecommendedList | null> {
  const html = await fetchPage(recommendedUrl(year));
  const live = html ? parseRecommendedHtml(html, year) : null;
  const snap = SNAPSHOT[String(year)];
  if (live) {
    // 出典のほうが古い（控えより更新が前）ことは普通は無いが、あれば新しいほうを採る
    return { ...live, via: "live" };
  }
  return snap ? { ...snap, via: "snapshot" } : null;
}

/** 控えがある年（ページを作る年）。**ここに無い年は 404** */
export const snapshotYears = (): number[] =>
  Object.keys(SNAPSHOT)
    .map(Number)
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b);

/** 控えの更新日（sitemap の lastmod 用）。`2026年11月17日 17:00` → その日の Date。読めなければ undefined */
export function snapshotUpdated(year: number): Date | undefined {
  const m = SNAPSHOT[String(year)]?.updatedAt?.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : undefined;
}

// ---------------------------------------------------------------------
// 表示用

/** 発表日の並べ替え用（月×100＋日）。年またぎは無い（10月〜11月） */
export const announcedKey = (r: RecommendedRow): number | null =>
  r.announced ? r.announced.month * 100 + r.announced.day : null;

/**
 * 出典の校名から、設置者の頭を落とした呼び名を作る（「県立弘前実」→「弘前実」）。
 * ★**設置区分の判定には使わない**（公立かどうかは学校マスタに引けたかで決める）。
 * 「静岡市立」「香川高専高松」のように**名前の一部になっている語は残す**。
 */
export function shortRecommendedName(name: string): string {
  // ★「県」だけは裸で付く（「県仙台第一」「県岡谷南」）。「都」「道」「府」は裸では落とさない
  //   （「都留興譲館」の先頭の「都」は校名の一部）
  const stripped = name.replace(/^(県立|府立|都立|道立|市立|町立|村立|県)(?=.)/, "");
  return stripped === "" ? name : stripped;
}
