/**
 * コラム（`/column` と `/column/<slug>`）。**運営者が書く、観戦記と所感。手で書く編集コンテンツ。**
 *
 * ------------------------------------------------------------------
 * ★★ なぜ作ったか（2026-11-21）
 *
 *   運営者が明治神宮大会の1日目（2試合）を球場で観戦した。**主観（所感）を書ける場所が
 *   サイトに無かった** —— `/guide` は一次資料に基づく客観的な解説、`/phenomenon` は記録の記事、
 *   `/features`（特集）は Supabase に入れる方式で人が SQL を流す運用。
 *   **コラムは「運営者が観て、思ったこと」を書く場所**で、書き手は運営者（一人称でよい）。
 *
 * ★★ 置き場所をここにした理由（`guides.ts` と同じ）
 *   **DB が止まってもサイトの本体は描ける**方針（特集は Supabase 依存）。SQL も要らない。
 *   原稿はこのファイルに Markdown で置き、既存の `NewsBody`（生 HTML を通さない）で描く。
 *
 * ------------------------------------------------------------------
 * ★★★ 書き方の決めごと（運営者と決めた 2026-11-21）
 *
 *   - 名前は「コラム」。書き手は「運営者」。切り口は **公立応援団の目線**
 *     （出場校がすべて私学の大会でも、公立の目線で観る）。
 *   - ★**選手は「良いプレー」を肯定的に書くときだけ名前を出してよい**（運営者の判断。
 *     「選手個人のページ・個人成績は作らない」方針は変わらない）。
 *     **エラー・失点・敗因を個人名で書かない。** 打率・防御率などの**個人成績の表は作らない。**
 *     学年・出身・家族など**個人が特定される情報は書かない。**
 *     迷ったら名前を出さず「先発の左腕」「4番打者」のように書く。
 *   - ★**監督・チームの判断（継投など）も、批判の形で書かない。** 「難しい場面だった」と書く。
 *   - **数字（スコア・対戦・日付）は `games` に1度だけ書き、`scripts/verify-column.mjs` で
 *     大会の公式データと突き合わせる。** 本文の中に点数を書き写さない（書くなら検算の対象にする）。
 *   - **写真は運営者が撮ったものだけ。** `public/column/<slug>/` に置いて自サイトから配信する
 *     （外部 URL を参照しない）。撮影者を必ず書く。報道写真・第三者の写真や動画は使わない。
 *   - **敗戦数を書かない**（ほかのページと同じ）。出典から引くのは事実だけで、文章は転載しない。
 *   - slug はローマ字（AGENTS.md）。**公開後に変えない。**
 *
 * ★ **`published: false` は本番に出ない**（一覧・sitemap・フッターにも載らない）。
 *   `next dev` では下書きも見られる（本番ビルドでは出ない）。**公開するときは `true` にして
 *   `publishedOn` を入れる。** 公開済みが1本も無いあいだは `/column` 自体が 404 で、入口も出ない。
 */

export type ColumnGame = {
  /** 試合の日（YYYY-MM-DD） */
  date: string;
  /** 開始時刻（「8:30」）。分からなければ省く */
  time?: string;
  round: string;
  /** 左がカードの1校目。**点数は大会の記録と同じ向きで書く** */
  teams: [{ name: string; score: number }, { name: string; score: number }];
  /** 検算の相手。`scripts/verify-column.mjs` が読む */
  source: { kind: "jingu"; year: number };
  /** その試合が載っている大会ページ */
  href: string;
};

export type ColumnPhoto = {
  /** `/column/<slug>/xxx.jpg`（`public/column/<slug>/` に置く） */
  src: string;
  alt: string;
  width: number;
  height: number;
  /** 「撮影：運営者」。**必須**（帰属表示を省かない） */
  credit: string;
  caption?: string;
};

export type Column = {
  slug: string;
  /** h1 */
  title: string;
  /** `<title>`。サイト名を除いて30文字ほどまで */
  searchTitle: string;
  description: string;
  /** 「明治神宮大会」のような括り。一覧とバッジに出す */
  topic: string;
  author: string;
  published: boolean;
  /** 公開日（YYYY-MM-DD）。公開するまでは null */
  publishedOn: string | null;
  updatedOn?: string;
  /** 観戦した日（YYYY-MM-DD）。「◯月◯日に観戦しました」を出す */
  watchedOn?: string;
  lead: string[];
  /** 観戦した試合。**本文には点数を書き写さず、ここに書く** */
  games: ColumnGame[];
  /** Markdown。`NewsBody` で描く（見出しは `##` から） */
  body: string;
  photos: ColumnPhoto[];
  /** 関連するページ（記事の下に出す） */
  related: { href: string; label: string }[];
  /** このコラムが扱うページ。そのページに「観戦コラム」のカードを出す（`ColumnLinkCard`） */
  about: string[];
};

export const COLUMNS: Column[] = [
  {
    slug: "jingu-2026-day1",
    title: "明治神宮大会1日目を観戦して ― 仙台育英×鹿児島城西、創志学園×北海",
    searchTitle: "神宮大会1日目を観戦して｜2026年の観戦記",
    description:
      "2026年の明治神宮大会（高校の部）1日目、仙台育英対鹿児島城西と創志学園対北海を球場で観た運営者の観戦記と所感です。",
    topic: "明治神宮大会",
    author: "運営者",
    published: false,
    publishedOn: null,
    watchedOn: "2026-11-19",
    lead: [
      "2026年11月19日、明治神宮大会（高校の部）の1日目、第1試合と第2試合を明治神宮野球場で観戦しました。",
      "出場10校はどれも私学ですが、公立応援団の目線で、観たことと思ったことを書きます。",
    ],
    games: [
      {
        date: "2026-11-19",
        time: "8:30",
        round: "1回戦",
        teams: [
          { name: "仙台育英", score: 7 },
          { name: "鹿児島城西", score: 6 },
        ],
        source: { kind: "jingu", year: 2026 },
        href: "/jingu/2026",
      },
      {
        date: "2026-11-19",
        time: "11:00",
        round: "1回戦",
        teams: [
          { name: "創志学園", score: 5 },
          { name: "北海", score: 7 },
        ],
        source: { kind: "jingu", year: 2026 },
        href: "/jingu/2026",
      },
    ],
    /*
      ★★**運営者のメモ（2026-11-21 に受け取った分。ここに足していく）**
        - 球場: 平日の朝からかなりの人が入っていた。朝から並びもあった。
        - 第1試合（仙台育英 7-6 鹿児島城西）: 鹿児島城西は先発投手の変え時が難しかった。仙台育英の地力が上回った。
        - 第2試合（創志学園 5-7 北海）: 北海のエースは途中で打球を手に受けた。それでも投げ続けた（→ ここに触れる。2026-11-21 受領）。
          ★「手に受けた」を超えて、けがの程度・交代の有無・その後の経過を書かない（観ていない・記録にも無い）。
          ★公式記録では北海の投手はこの1人だけ（完投）。これは記録の事実として添えてよい。名前は出さず「北海のエース」と書く
            （良いプレーなので名前を出してもよいが、運営者の判断を待つ）。
        - 2試合を通して・公立の目線で: （待ち）
      ★**メモの言葉を超えて書き足さない**（観ていないことを書かない）。足りない部分は運営者に聞く。
    */
    body: `## 球場の雰囲気

平日の朝から、かなりの観客が入っていました。朝から並びもできていました。

## 第1試合　仙台育英 7－6 鹿児島城西

鹿児島城西は、先発投手を代えるタイミングが難しい試合でした。最後は仙台育英の地力が上回りました。

（試合の内容・概要：運営者の原稿待ち）

## 第2試合　創志学園 5－7 北海

北海のエースは、試合の途中で打球を手に受けました。それでも投げ続けました。公式記録では、北海の投手はこのエース1人だけです。

（試合の内容・概要：運営者の原稿待ち）

## 2試合を通して

（運営者の原稿待ち）
`,
    photos: [],
    related: [
      { href: "/jingu/2026", label: "2026年 明治神宮大会（高校の部）の組み合わせ・日程・結果" },
      { href: "/jingu/champions", label: "明治神宮大会（高校の部）の歴代優勝校" },
      { href: "/jingu", label: "明治神宮大会の一覧" },
    ],
    about: ["/jingu/2026"],
  },
];

/**
 * 画面に出してよいコラム。
 *
 * ★**本番（`NODE_ENV=production`）では公開済みだけ。** `next dev` では下書きも出す
 * （運営者が原稿を確かめるため）。**ビルドの `generateStaticParams`・sitemap も本番では公開済みだけ**になる。
 */
const visible = (c: Column) => c.published || process.env.NODE_ENV !== "production";

/** 公開日の新しい順（下書きは公開日が無いので先頭） */
export function listColumns(): Column[] {
  return COLUMNS.filter(visible).sort((a, b) =>
    (b.publishedOn ?? "9999").localeCompare(a.publishedOn ?? "9999"),
  );
}

export function findColumn(slug: string): Column | undefined {
  return listColumns().find((c) => c.slug === slug);
}

/** 公開済みのコラムが1本でもあるか（入口を出すかの判断。下書きは数えない） */
export function hasPublishedColumns(): boolean {
  return COLUMNS.some((c) => c.published);
}

/** そのページ（例: `/jingu/2026`）を扱った公開済みのコラム */
export function columnsAbout(href: string): Column[] {
  return COLUMNS.filter((c) => c.published && c.about.includes(href));
}
