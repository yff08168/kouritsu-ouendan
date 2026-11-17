/**
 * 校名 → 学校マスタの学校、の索引を組み立てる（**全国大会のページで使う**）。
 *
 * 学校マスタの読み込み（Supabase）は `src/lib/queries/schools.ts` の `getSchoolNameIndex`。
 * ここは**行を受け取って索引を作るだけの関数**なので、DB に触らずに確かめられる
 * （`scripts/check-public-index.mjs`）。
 *
 * ------------------------------------------------------------------
 * ★★ なぜ要るか（2026-08-26）
 *
 *   甲子園・明治神宮の生成物は**校名の文字列しか持っていない**
 *   （地方大会の生成物と違い、slug が入っていない）。
 *   大会のページで「どれが公立か」を示すには、**校名から引き直す**しかない。
 *
 * ------------------------------------------------------------------
 * ★★ 学校ページと同じ規則でしか結び付けない
 *
 *   照合は **`normalizeKoshienName` / `normalizeJinguName` による完全一致**で、
 *   これは学校ページ（`koshienGamesOf` / `jinguGamesOf`）が使っているものと同じ。
 *
 *   ★★**同じ鍵に2校が当たったら、その鍵は捨てる。**
 *   （県立と市立で同名の学校がある。**どちらか分からないものを当てない。**
 *   地方大会の照合で「同じ地区で2件以上に当たったら結び付けない」としているのと同じ考え方）。
 *
 * ------------------------------------------------------------------
 * ★★★ マスタの校名で引けない公立校を、2つの表で補う（2026-11-04）
 *
 *   マスタは**現存校だけ**で、校名は**今の名前**。次の公立校が引けず、大会ページで
 *   「公立」と数えられていなかった。**1,328校名のうち767が引けず、うち250が公立**だった。
 *
 *     ・閉校・統合・改称した学校  観音寺中央（1995春優勝）・鳴門工・愛知一中・和歌山中…
 *     ・県立と市立の同名校で鍵が捨てられた学校  広島商・広島工・前橋・岐阜商
 *     ・記事の略し方がマスタと合わない学校  県岐阜商・市船橋・市和歌山商・取手二・印旛…
 *
 *   1. **別名表**（`src/lib/data/koshien-school-aliases.json`。生成物）
 *      Wikipedia の表のリンク先を、DB の出場歴と同じ規則でマスタに突き合わせたもの。
 *      **学校ページに結ぶ**（承継先の学校へ）。DB の出場歴と必ず一致する。
 *      作り方は `scripts/build-koshien-school-aliases.mjs`。
 *   2. **手書きの公立校**（`src/lib/content/koshien-unlinked-schools.ts`）
 *      閉校して DB に承継先が無い学校など。**公立として数えるが、学校ページへは結ばない**
 *      （`slug` が null）。理由はそのファイルの冒頭。
 *
 *   ★**どちらも「空いている鍵」にしか入れない。** マスタの校名が1校に決まっている鍵は動かさない
 *   （今まで正しく引けていたものを変えない）。2校に当たって捨てられていた鍵（広島商など）は埋める。
 *   ★**公開されていない学校（マスタの行が読めない slug）には結ばない。**
 *   ★**公立かどうかを校名から推測しない。** 根拠は「マスタに行がある」（文科省の一覧で私立以外）か、
 *   人が Wikipedia の学校の記事で確かめたことだけ。
 */

import { normalizeKoshienName, prefectureKey } from "@/lib/koshien-games";
import { normalizeJinguName } from "@/lib/jingu-games";
import { shortSchoolName } from "@/lib/school-name";
import aliasData from "@/lib/data/koshien-school-aliases.json";
import {
  UNLINKED_PUBLIC_SCHOOLS,
  type UnlinkedPublicSchool,
} from "@/lib/content/koshien-unlinked-schools";

export type SchoolNameRef = {
  /**
   * 学校ページの slug。
   * ★★**学校ページが無い公立校（閉校して DB に承継先が無い学校など）は null。**
   * 公立としては数えるが、**`/schools/${slug}` のリンクを作ってはいけない。**
   */
  slug: string | null;
  /** 学校マスタの校名。学校ページが無い公立校は正式名称（Wikipedia の記事名） */
  name: string;
  /** 都道府県（甲子園の大会区分） */
  pref: string;
  /**
   * 大会記事の呼び名が、学校マスタの校名と違う別名で引けたとき true
   * （旧校名・略称・「県◯◯」「市◯◯」・閉校校）。
   * ★**地の文では大会記事の呼び名（`display`）で呼ぶ**。`name` は今の校名で、
   * 「愛知一中が優勝」を「旭丘高校が優勝」と書くと時代が合わない。
   */
  alias?: true;
  /** 学校ページが無い公立校の一言（「2022年閉校（青洲高校に統合）」）。画面に出す */
  status?: string;
};

/** 校名 → 学校マスタ。県が分かるなら渡すこと（`SchoolNameIndex.find`） */
export type SchoolResolver = (display: string, pref?: string) => SchoolNameRef | null;

export type SchoolNameIndex = {
  /**
   * 校名から学校を引く。**県が分かるなら渡すこと。**
   *
   * ★★**同じ校名の学校が別の県にある**（福山市立福山＝広島／鹿児島県立福山）。
   * 県を渡さないと「どちらか分からない」として**引けない** ——
   * 2026年夏の広島代表「福山」がこれで、**公立が9校あるのに8校**と出ていた。
   * ★**同じ県に同名が2校あるときだけ、本当に引けない**（当て推量をしない）。
   *
   * ★★**`slug` が null のものを返すことがある**（学校ページが無い公立校）。
   * 「引けた＝公立」は今までどおり成り立つが、**リンクは `slug` があるときだけ作ること。**
   */
  find: SchoolResolver;
};

/** 学校マスタの1行（`schools` から必要な列だけ） */
export type SchoolNameRow = {
  slug: string;
  name: string;
  official_name: string | null;
  prefecture: { name: string } | { name: string }[] | null;
};

/** 別名表の1件（生成物の形） */
export type SchoolAlias = {
  /** 大会記事の校名 */
  display: string;
  /** 学校マスタの県（甲子園の大会区分） */
  pref: string;
  /** 試合に県が書かれていない（古い大会）。県なしの照合にも使う */
  prefless: boolean;
  slug: string;
  /** 根拠にした Wikipedia の記事名（読み手向け。画面には出さない） */
  articles: string[];
};

export const KOSHIEN_SCHOOL_ALIASES: readonly SchoolAlias[] = (
  aliasData as unknown as { aliases: SchoolAlias[] }
).aliases;

export type SchoolNameIndexExtras = {
  /** 別名表。省くと生成物（本番と同じ）。`[]` を渡すと補う前の索引になる（件数の比較用） */
  aliases?: readonly SchoolAlias[];
  /** 手書きの公立校。省くと本番と同じ。`[]` を渡すと補う前の索引になる */
  unlinked?: readonly UnlinkedPublicSchool[];
};

export function buildSchoolNameIndex(
  rows: readonly SchoolNameRow[],
  variant: "koshien" | "jingu",
  extras: SchoolNameIndexExtras = {},
): SchoolNameIndex {
  const normalize = variant === "koshien" ? normalizeKoshienName : normalizeJinguName;
  const aliases = extras.aliases ?? KOSHIEN_SCHOOL_ALIASES;
  const unlinked = extras.unlinked ?? UNLINKED_PUBLIC_SCHOOLS;
  /** 校名だけで一意に引けるもの。**2校に当たる鍵は null を入れて「引けない」印にする** */
  const byName = new Map<string, SchoolNameRef | null>();
  /** 校名＋県。**同じ県に同名が2校あるときだけ null** */
  const byNameAndPref = new Map<string, SchoolNameRef | null>();
  const bySlug = new Map<string, SchoolNameRef>();

  for (const row of rows) {
    const prefName = Array.isArray(row.prefecture)
      ? row.prefecture[0]?.name
      : row.prefecture?.name;
    const ref: SchoolNameRef = { slug: row.slug, name: row.name, pref: prefName ?? "" };
    bySlug.set(row.slug, ref);
    /*
      ★**当てにいく表記は3つ**（学校ページと同じ）。
      マスタの校名・正式名・一覧用の短い校名。
      大会記事は略称なので、**どれかに完全一致したときだけ**結び付ける。
    */
    const keys = [row.name, row.official_name ?? "", shortSchoolName(row.name, row.slug)]
      .map(normalize)
      .filter(Boolean);

    for (const key of new Set(keys)) {
      const found = byName.get(key);
      if (found === undefined) byName.set(key, ref);
      else if (found && found.slug !== row.slug) byName.set(key, null);

      if (!ref.pref) continue;
      const withPref = `${key}\t${prefectureKey(ref.pref)}`;
      const inPref = byNameAndPref.get(withPref);
      if (inPref === undefined) byNameAndPref.set(withPref, ref);
      else if (inPref && inPref.slug !== row.slug) byNameAndPref.set(withPref, null);
    }
  }

  // ------------------------------------------------------------------
  // マスタの校名で引けないぶんを補う
  // ------------------------------------------------------------------
  /** 補いで入れた鍵 -> 入れた学校。**同じ鍵に別々の学校を入れようとしたら捨てる**（どちらか分からない） */
  const filled = new Map<string, string>();

  const fill = (
    map: Map<string, SchoolNameRef | null>,
    kind: "name" | "pref",
    key: string,
    ref: SchoolNameRef,
    id: string,
  ) => {
    const mark = `${kind}\t${key}`;
    const prev = filled.get(mark);
    if (prev !== undefined) {
      // 補い同士がぶつかった（生成物は鍵ごとに1校なので、ふつうは起きない）
      if (prev !== id) map.set(key, null);
      return;
    }
    // ★**マスタが1校に決めている鍵は動かさない。** 空いている鍵と、2校に当たって捨てられた鍵だけ埋める
    if (map.get(key)) return;
    filled.set(mark, id);
    map.set(key, ref);
  };

  const register = (display: string, pref: string, prefless: boolean, ref: SchoolNameRef, id: string) => {
    const key = normalize(display);
    if (!key) return;
    fill(byNameAndPref, "pref", `${key}\t${prefectureKey(pref)}`, ref, id);
    if (prefless) fill(byName, "name", key, ref, id);
  };

  for (const a of aliases) {
    const school = bySlug.get(a.slug);
    // ★公開されていない学校（マスタの行が読めない）には結ばない
    if (!school) continue;
    register(a.display, a.pref, a.prefless, { ...school, alias: true }, a.slug);
  }

  for (const u of unlinked) {
    const ref: SchoolNameRef = {
      slug: null,
      name: u.official,
      pref: u.pref,
      alias: true,
      ...(u.status ? { status: u.status } : {}),
    };
    register(u.display, u.pref, Boolean(u.prefless), ref, `unlinked:${u.official}`);
  }

  return {
    find(display: string, pref?: string) {
      const key = normalize(display);
      if (!key) return null;
      if (pref) {
        const hit = byNameAndPref.get(`${key}\t${prefectureKey(pref)}`);
        // ★県まで分かっているなら、その県での答えがすべて（無ければ結び付けない）
        if (hit !== undefined) return hit;
        return null;
      }
      return byName.get(key) ?? null;
    },
  };
}
