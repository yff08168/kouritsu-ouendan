import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeKoshienName, prefectureKey } from "@/lib/koshien-games";
import { normalizeJinguName } from "@/lib/jingu-games";
import { shortSchoolName } from "@/lib/school-name";
import { escapeLikePattern, throwIfError, toImageRef, toPrefectureRef } from "@/lib/queries/shared";
import { PREFECTURE_BY_SLUG } from "@/lib/constants";
import type { Establishment, SchoolKind } from "@/lib/constants";
import type {
  ChampionshipRow,
  SchoolCountRow,
  SchoolDetailRow,
  SchoolRecordRow,
  SchoolRow,
} from "@/types/database";
import type {
  Championship,
  SchoolDetail,
  SchoolRecord,
  SchoolSummary,
} from "@/types/app";

const SCHOOL_SUMMARY_SELECT = `
  id, slug, name, official_name, city, establishment, school_kind,
  catchcopy, koshien_spring_count, koshien_summer_count, last_koshien_year,
  cheer_count,
  image_url, image_credit, image_source_url,
  prefecture:prefectures ( name, slug )
`;

/** 都道府県が引けなかった行を落とすためのフォールバック */
const UNKNOWN_PREFECTURE = { name: "－", slug: "" };

function toSchoolSummary(row: SchoolRow): SchoolSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    officialName: row.official_name,
    prefecture: toPrefectureRef(row.prefecture) ?? UNKNOWN_PREFECTURE,
    city: row.city,
    establishment: row.establishment,
    schoolKind: row.school_kind,
    catchcopy: row.catchcopy,
    image: toImageRef(row, `${row.name}の外観`),
    koshienSpringCount: row.koshien_spring_count,
    koshienSummerCount: row.koshien_summer_count,
    lastKoshienYear: row.last_koshien_year,
    cheerCount: row.cheer_count ?? 0,
  };
}

/**
 * slug を指定して学校をまとめて取る。**渡した順に返す。**
 *
 * DBの `in` は順序を保証しないので、並べ直してから返す。
 * トップの「今夏の甲子園に出場している公立校」のように、
 * 呼び出し側が並び（勝ち残り→敗退など）を決めたい場面で使う。
 */
export async function getSchoolsBySlugs(
  slugs: string[],
): Promise<SchoolSummary[]> {
  if (slugs.length === 0) return [];
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("schools")
    .select(SCHOOL_SUMMARY_SELECT)
    .in("slug", slugs);

  throwIfError(error, "学校のまとめ取得");

  const bySlug = new Map(
    ((data ?? []) as unknown as SchoolRow[]).map((row) => [
      row.slug,
      toSchoolSummary(row),
    ]),
  );
  return slugs.map((slug) => bySlug.get(slug)).filter((s) => s !== undefined);
}

/**
 * トップページの「注目の公立高校」枠。
 * いまは甲子園出場回数が多い順。将来は編集部が選んだ順に変える余地がある。
 */
export async function getFeaturedSchools(limit = 3): Promise<SchoolSummary[]> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("schools")
    .select(SCHOOL_SUMMARY_SELECT)
    .order("last_koshien_year", { ascending: false, nullsFirst: false })
    .order("koshien_summer_count", { ascending: false })
    .limit(limit);

  throwIfError(error, "注目校の取得");

  return ((data ?? []) as unknown as SchoolRow[]).map(toSchoolSummary);
}

/** 詳細ページ用。一覧の列に、詳細でだけ使う列を足す。 */
const SCHOOL_DETAIL_SELECT = `
  ${SCHOOL_SUMMARY_SELECT},
  description, website_url, founded_year, name_aliases
`;

/** slug から学校1件を取得する。見つからなければ null（呼び出し側で404にする）。 */
export async function getSchoolBySlug(
  slug: string,
): Promise<SchoolDetail | null> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("schools")
    .select(SCHOOL_DETAIL_SELECT)
    .eq("slug", slug)
    .maybeSingle();

  throwIfError(error, "学校情報の取得");
  if (!data) return null;

  const row = data as unknown as SchoolDetailRow;
  return {
    ...toSchoolSummary(row),
    description: row.description,
    websiteUrl: row.website_url,
    foundedYear: row.founded_year,
    nameAliases: row.name_aliases ?? [],
  };
}

/**
 * 甲子園出場歴。新しい年が上。同じ年なら夏 → 春の順。
 *
 * season は列挙型 `('spring', 'summer', 'autumn')` で、Postgres は
 * 列挙型を**定義順**で比較する。降順にすると autumn → summer → spring に
 * なるので、これで夏が春より上に来る。
 */
export async function getSchoolChampionships(
  schoolId: string,
): Promise<Championship[]> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("school_championships")
    .select("id, year, season, result, wins, losses, note")
    .eq("school_id", schoolId)
    .order("year", { ascending: false })
    .order("season", { ascending: false });

  throwIfError(error, "甲子園出場歴の取得");

  return ((data ?? []) as unknown as ChampionshipRow[]).map((row) => ({
    id: row.id,
    year: row.year,
    season: row.season,
    result: row.result,
    wins: row.wins,
    losses: row.losses,
    note: row.note,
  }));
}

/** 最近の戦績。新しい年が上。 */
export async function getSchoolRecords(
  schoolId: string,
  limit = 12,
): Promise<SchoolRecord[]> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("school_records")
    .select("id, year, tournament_name, result, note")
    .eq("school_id", schoolId)
    .order("year", { ascending: false })
    .limit(limit);

  throwIfError(error, "戦績の取得");

  return ((data ?? []) as unknown as SchoolRecordRow[]).map((row) => ({
    id: row.id,
    year: row.year,
    tournamentName: row.tournament_name,
    result: row.result,
    note: row.note,
  }));
}

/** 同じ都道府県の他の学校。回遊導線に使う（要件23）。 */
/*
  ★★**同じ県の学校は「県ごとに1回」取る**（2026-09-04）。

  ★**学校ページ3,500枚が1枚ずつ問い合わせていた** ——
  返ってくるのは**その県の校名順の先頭数校**で、**同じ県ならほとんど同じ**。
  ★**「自分を除く先頭4校」は、先頭5校を取ってから自分を外せば同じ結果になる**
  （自分が先頭5校に入っていれば4校、入っていなければ先頭4校）。
  ★**5分で作り直す**（`fetchSchoolNameRows` と同じ考え方。永久に持たない）。
*/
const RELATED_TTL_MS = 5 * 60 * 1000;
const relatedCache = new Map<string, { at: number; rows: Promise<SchoolRow[]> }>();

function relatedRows(prefectureId: number, take: number): Promise<SchoolRow[]> {
  const key = `${prefectureId}\t${take}`;
  const now = Date.now();
  const hit = relatedCache.get(key);
  if (hit && now - hit.at <= RELATED_TTL_MS) return hit.rows;
  const rows = (async () => {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("schools")
      .select(SCHOOL_SUMMARY_SELECT)
      .eq("prefecture_id", prefectureId)
      .order("name", { ascending: true })
      .limit(take);
    throwIfError(error, "同じ都道府県の学校の取得");
    return (data ?? []) as unknown as SchoolRow[];
  })().catch((e) => {
    // ★**失敗を持ち越さない。** 次の呼び出しでもう一度取りに行く
    relatedCache.delete(key);
    throw e;
  });
  relatedCache.set(key, { at: now, rows });
  return rows;
}

export async function getRelatedSchools(
  prefectureSlug: string,
  excludeSchoolId: string,
  limit = 4,
): Promise<SchoolSummary[]> {
  const prefecture = PREFECTURE_BY_SLUG.get(prefectureSlug);
  if (!prefecture) return [];

  // ★**自分が入っているかもしれないので1校多く取る**
  const rows = await relatedRows(prefecture.id, limit + 1);
  return rows
    .filter((row) => row.id !== excludeSchoolId)
    .slice(0, limit)
    .map(toSchoolSummary);
}

/**
 * あるニュースに関連づけられた学校。
 * 記事から学校ページへの回遊導線に使う（要件34）。
 */
export async function getSchoolsByNews(
  newsId: string,
  limit = 6,
): Promise<SchoolSummary[]> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("schools")
    .select(`${SCHOOL_SUMMARY_SELECT}, news_schools!inner ( news_id )`)
    .eq("news_schools.news_id", newsId)
    .limit(limit);

  throwIfError(error, "関連する学校の取得");

  return ((data ?? []) as unknown as SchoolRow[]).map(toSchoolSummary);
}

/** ある公立旋風に登場する学校 */
export async function getSchoolsByPhenomenon(
  phenomenonId: string,
  limit = 6,
): Promise<SchoolSummary[]> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("schools")
    .select(`${SCHOOL_SUMMARY_SELECT}, phenomenon_schools!inner ( phenomenon_id )`)
    .eq("phenomenon_schools.phenomenon_id", phenomenonId)
    .limit(limit);

  throwIfError(error, "登場する学校の取得");

  return ((data ?? []) as unknown as SchoolRow[]).map(toSchoolSummary);
}

/** generateStaticParams 用。公開済みの学校slugを全部返す。 */
/** PostgREST が1回に返す上限 */
const SLUG_PAGE_SIZE = 1000;

/**
 * 全学校の slug。sitemap と generateStaticParams が使う。
 *
 * **必ずページングすること。** PostgREST は1回に1,000行しか返さないので、
 * 素の `select("slug")` だと3,505校のうち1,000校しか返らない。
 * それに気づかないまま公開すると、**sitemap から2,500校が丸ごと抜ける。**
 * （2026-08-12 に実際にこの状態だった）
 *
 * `slug` は unique なので、これで並べればページの境目で重複・欠落が起きない。
 */
export async function getAllSchoolSlugs(): Promise<string[]> {
  return fetchSchoolSlugs({ koshienOnly: false });
}

/**
 * sitemap に載せる学校の slug。
 *
 * **甲子園出場歴のある学校だけ。** 出場歴の無い約2,827校のページは
 * `noindex` にしているので（`app/schools/[slug]/page.tsx` の isIndexable）、
 * sitemap に載せると「載せているのに入れるなと言う」矛盾した指示になる。
 * 中身が入れば自動的に両方に現れる。
 */
export async function getIndexableSchoolSlugs(): Promise<string[]> {
  return fetchSchoolSlugs({ koshienOnly: true });
}

async function fetchSchoolSlugs({
  koshienOnly,
}: {
  koshienOnly: boolean;
}): Promise<string[]> {
  const supabase = createSupabaseServerClient();
  const slugs: string[] = [];

  for (let from = 0; ; from += SLUG_PAGE_SIZE) {
    let query = supabase
      .from("schools")
      .select("slug")
      .order("slug", { ascending: true })
      .range(from, from + SLUG_PAGE_SIZE - 1);

    if (koshienOnly) {
      query = query.or(
        "koshien_spring_count.gt.0,koshien_summer_count.gt.0",
      );
    }

    const { data, error } = await query;

    throwIfError(error, "学校slugの取得");

    const page = (data ?? []) as { slug: string }[];
    slugs.push(...page.map((row) => row.slug));
    if (page.length < SLUG_PAGE_SIZE) break;
  }

  return slugs;
}

/**
 * 並び替え。
 *
 * **DBの列で並べられるものだけ。** PostgREST は式を order に渡せないので、
 * 「春＋夏の合計」は生成列が要る（`koshien_total`／マイグレーション 0007）。
 */
export const SCHOOL_SORTS = {
  pref: { label: "都道府県順", note: "北から順に、同じ県内は校名順" },
  count: { label: "甲子園出場回数順", note: "春夏の合計が多い順", needs0007: true },
  recent: { label: "最近甲子園に出た順", note: "最後に出場した年が新しい順" },
  cheer: { label: "応援の多い順", note: "応援ボタンが押された数の多い順" },
} as const;

export type SchoolSort = keyof typeof SCHOOL_SORTS;

export const SCHOOL_KOSHIEN_FILTERS = {
  yes: "甲子園に出たことがある",
  no: "甲子園はまだ",
} as const;

export type SchoolKoshienFilter = keyof typeof SCHOOL_KOSHIEN_FILTERS;

export type SchoolSearchParams = {
  /** 学校名・正式名称・別名・市区町村を横断する部分一致 */
  q?: string;
  /** 都道府県slug（例: shimane） */
  prefectureSlug?: string;
  /** 設置区分。私立は収録対象外なので渡されない想定 */
  establishment?: Establishment;
  /** 学校種別（高校・高専・中等教育学校） */
  kind?: SchoolKind;
  /** 甲子園の出場歴の有無 */
  koshien?: SchoolKoshienFilter;
  sort?: SchoolSort;
  /** 1始まり */
  page?: number;
  perPage?: number;
};

export type SchoolSearchResult = {
  schools: SchoolSummary[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  /**
   * 指定された並び替えが使えず、既定（都道府県順）で返したか。
   * マイグレーション 0007 が未適用のときに立つ。画面で断ること。
   */
  sortUnavailable: boolean;
};

/**
 * 学校の一覧・検索。
 *
 * 検索対象は schools.search_text（名称・正式名称・別名・市区町村を結合した列）。
 * トリガで維持され、pg_trgm の GIN インデックスが張ってある。
 * 日本語は形態素解析なしだと標準の全文検索が効かないため、部分一致を使っている。
 */
export async function searchSchools({
  q = "",
  prefectureSlug,
  establishment,
  kind,
  koshien,
  sort = "pref",
  page = 1,
  perPage = 24,
}: SchoolSearchParams): Promise<SchoolSearchResult> {
  const supabase = createSupabaseServerClient();
  const currentPage = Math.max(1, Math.floor(page));
  const from = (currentPage - 1) * perPage;

  /*
    **問い合わせは毎回ゼロから組み立てる。**
    PostgREST のビルダーは `.order()` などが自身を書き換えて返す作りなので、
    一度実行したものを使い回すと条件が二重に付く。下の再試行のために
    関数にしてある。
  */
  const run = (sortKey: SchoolSort) => {
    let query = supabase
      .from("schools")
      .select(SCHOOL_SUMMARY_SELECT, { count: "exact" });

    if (q) query = query.ilike("search_text", `%${escapeLikePattern(q)}%`);

    if (prefectureSlug) {
      const prefecture = PREFECTURE_BY_SLUG.get(prefectureSlug);
      // 存在しないslugが来たら0件にする（不正なIDでの全件取得を防ぐ）
      query = query.eq("prefecture_id", prefecture?.id ?? -1);
    }

    if (establishment) query = query.eq("establishment", establishment);
    if (kind) query = query.eq("school_kind", kind);

    if (koshien === "yes") {
      query = query.or("koshien_spring_count.gt.0,koshien_summer_count.gt.0");
    } else if (koshien === "no") {
      query = query.eq("koshien_spring_count", 0).eq("koshien_summer_count", 0);
    }

    if (sortKey === "count") {
      query = query.order("koshien_total", { ascending: false });
    } else if (sortKey === "recent") {
      // 未出場（null）は後ろへ。「最近出た順」の先頭に空欄が並ぶのを防ぐ
      query = query.order("last_koshien_year", {
        ascending: false,
        nullsFirst: false,
      });
    } else if (sortKey === "cheer") {
      query = query.order("cheer_count", { ascending: false });
    } else {
      query = query.order("prefecture_id", { ascending: true });
    }

    /*
      **最後は必ず一意に決まる列で締める。**
      同点が多い列（出場回数・最終出場年・応援数）だけで並べると、
      ページの境目で同じ学校が2回出たり抜けたりする。
    */
    return query
      .order("name", { ascending: true })
      .order("slug", { ascending: true })
      .range(from, from + perPage - 1);
  };

  let { data, error, count } = await run(sort);

  /*
    `koshien_total` はマイグレーション 0007 で足す生成列。
    **未適用でも /schools を落とさない。** このプロジェクトはSQLを人が
    ブラウザで流す運用なので、適用漏れでページごと落ちるのを避ける。
    既定の並びで出し直し、並び替えが効いていないことを画面で断る。
  */
  let sortUnavailable = false;
  if (error && sort === "count") {
    sortUnavailable = true;
    ({ data, error, count } = await run("pref"));
  }

  throwIfError(error, "学校の検索");

  const total = count ?? 0;
  return {
    schools: ((data ?? []) as unknown as SchoolRow[]).map(toSchoolSummary),
    total,
    page: currentPage,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    sortUnavailable,
  };
}

/**
 * 都道府県ごとの収録校数。
 * 全学校を取得して数えると全国データ投入後に重くなるため、
 * DB側のビュー（0003）で集計している。
 */
export async function getSchoolCountByPrefecture(): Promise<
  Record<string, number>
> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("school_counts_by_prefecture")
    .select("prefecture_slug, school_count");

  throwIfError(error, "都道府県別の学校数の取得");

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as unknown as SchoolCountRow[]) {
    counts[row.prefecture_slug] = Number(row.school_count);
  }
  return counts;
}

/**
 * 校名 → 学校マスタの学校、の索引。**全国大会のページで使う。**
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
 *   ★**そろえてあるので、「学校ページには出るのに大会ページでは公立扱いされない」
 *   という食い違いが起きない。**
 *
 *   ★★**同じ鍵に2校が当たったら、その鍵は捨てる。**
 *   （県立と市立で同名の学校がある。**どちらか分からないものを当てない。**
 *   地方大会の照合で「同じ地区で2件以上に当たったら結び付けない」と
 *   しているのと同じ考え方）。
 *
 * ------------------------------------------------------------------
 * ★ ビルド1回につき1度しか取りに行かない
 *
 *   `cache()` で包んであるので、190枚の大会ページを作るあいだ
 *   **同じレンダリングの中では1回しか問い合わせない**（3,505校＝4リクエスト）。
 */
export type SchoolNameRef = { slug: string; name: string; pref: string };

type SchoolNameRow = {
  slug: string;
  name: string;
  official_name: string | null;
  prefecture: { name: string } | { name: string }[] | null;
};

/*
  ★★★**校名索引は「モジュールに1回」持つ**（2026-09-04）。

  ★**`cache()`（React）はリクエスト1つのあいだしか効かない。**
  ビルドは**ページ1枚ごとが1リクエスト**なので、**5,000枚ぶん取り直していた** ——
  1枚につき **schools 3,500行を4リクエスト**（PostgREST は1回1,000行）。
  ★★**そのせいでビルドが落ちるようになった** ——
  `Failed to build /schools/… after 3 attempts`（1枚60秒の上限）。
  **落ちる枚数は回ごとに変わり**（0枚・7枚・149枚・238枚）、**遅いのは Supabase の待ち**だった。

  ★**5分で作り直す**（県のページの `revalidate = 300` に合わせる）。
  **ビルド中は5分以内に終わる範囲で使い回し、動いているサーバーでは5分で新しくなる。**
  ★**永久に持たないこと** —— 学校マスタを入れ替えたのに古い索引を返し続ける。
*/
const SCHOOL_NAME_ROWS_TTL_MS = 5 * 60 * 1000;
let schoolNameRows: { at: number; rows: Promise<SchoolNameRow[]> } | null = null;

const loadSchoolNameRows = async (): Promise<SchoolNameRow[]> => {
  const supabase = createSupabaseServerClient();
  const rows: SchoolNameRow[] = [];

  // ★**必ずページングする。** PostgREST は1回に1,000行しか返さない
  for (let from = 0; ; from += SLUG_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("schools")
      // ★都道府県も取る（同名の別校に当てないため。2026-08-26）
      .select("slug, name, official_name, prefecture:prefectures ( name )")
      .order("slug", { ascending: true })
      .range(from, from + SLUG_PAGE_SIZE - 1);

    throwIfError(error, "校名索引の取得");

    const page = (data ?? []) as SchoolNameRow[];
    rows.push(...page);
    if (page.length < SLUG_PAGE_SIZE) break;
  }

  return rows;
};

const fetchSchoolNameRows = (): Promise<SchoolNameRow[]> => {
  const now = Date.now();
  if (!schoolNameRows || now - schoolNameRows.at > SCHOOL_NAME_ROWS_TTL_MS) {
    // ★**取り直しに失敗したら次の呼び出しでもう一度取りに行く**（失敗を持ち越さない）
    const rows = loadSchoolNameRows().catch((e) => {
      schoolNameRows = null;
      throw e;
    });
    schoolNameRows = { at: now, rows };
  }
  return schoolNameRows.rows;
};

export type SchoolNameIndex = {
  /**
   * 校名から学校を引く。**県が分かるなら渡すこと。**
   *
   * ★★**同じ校名の学校が別の県にある**（福山市立福山＝広島／鹿児島県立福山）。
   * 県を渡さないと「どちらか分からない」として**引けない** ——
   * 2026年夏の広島代表「福山」がこれで、**公立が9校あるのに8校**と出ていた。
   * ★**同じ県に同名が2校あるときだけ、本当に引けない**（当て推量をしない）。
   */
  find(display: string, pref?: string): SchoolNameRef | null;
};

export const getSchoolNameIndex = cache(
  async (variant: "koshien" | "jingu"): Promise<SchoolNameIndex> => {
    const normalize = variant === "koshien" ? normalizeKoshienName : normalizeJinguName;
    const rows = await fetchSchoolNameRows();

    /** 校名だけで一意に引けるもの。**2校に当たる鍵は null を入れて「引けない」印にする** */
    const byName = new Map<string, SchoolNameRef | null>();
    /** 校名＋県。**同じ県に同名が2校あるときだけ null** */
    const byNameAndPref = new Map<string, SchoolNameRef | null>();

    for (const row of rows) {
      const prefName = Array.isArray(row.prefecture)
        ? row.prefecture[0]?.name
        : row.prefecture?.name;
      const ref: SchoolNameRef = { slug: row.slug, name: row.name, pref: prefName ?? "" };
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
        const withPref = `${key}	${prefectureKey(ref.pref)}`;
        const inPref = byNameAndPref.get(withPref);
        if (inPref === undefined) byNameAndPref.set(withPref, ref);
        else if (inPref && inPref.slug !== row.slug) byNameAndPref.set(withPref, null);
      }
    }

    return {
      find(display: string, pref?: string) {
        const key = normalize(display);
        if (!key) return null;
        if (pref) {
          const hit = byNameAndPref.get(`${key}	${prefectureKey(pref)}`);
          // ★県まで分かっているなら、その県での答えがすべて（無ければ結び付けない）
          if (hit !== undefined) return hit;
          return null;
        }
        return byName.get(key) ?? null;
      },
    };
  },
);

/**
 * その都道府県の甲子園の集計。**県のページのリード文に使う。**
 *
 * ------------------------------------------------------------------
 * ★★**`getKoshienDataset` を使わない理由**（2026-08-29）
 *
 *   あちらは出場歴3,000件を4リクエストで取る（`/rankings` 用）。
 *   ★**県のページは `revalidate = 300`**（投票と応援メッセージが動くため）で、
 *   49枚が5分ごとに作り直されうる。**そこに3,000行の集計を足すと
 *   1時間に588回のデータセット取得**になる。
 *
 *   ★**ここは学校マスタの非正規化列を、その県のぶんだけ読む**
 *   （出場歴のある学校だけなので、多い県でも数十行）。
 *
 * ★**RLS が公開済みの行しか返さない。** `status` の条件を書かないこと。
 */
export type PrefectureKoshienSummary = {
  /** 甲子園に出たことがある公立校の数 */
  schools: number;
  /** 春夏あわせた延べ出場回数 */
  appearances: number;
  /** いちばん最近に出た学校。同じ年に複数いれば校名順で1校 */
  latest: { name: string; slug: string; year: number } | null;
};

type KoshienCountRow = {
  slug: string;
  name: string;
  koshien_spring_count: number;
  koshien_summer_count: number;
  last_koshien_year: number | null;
};

export async function getPrefectureKoshienSummary(
  prefectureSlug: string,
): Promise<PrefectureKoshienSummary> {
  const empty: PrefectureKoshienSummary = {
    schools: 0,
    appearances: 0,
    latest: null,
  };

  const prefecture = PREFECTURE_BY_SLUG.get(prefectureSlug);
  if (!prefecture) return empty;

  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("schools")
    .select("slug, name, koshien_spring_count, koshien_summer_count, last_koshien_year")
    .eq("prefecture_id", prefecture.id)
    // ★出場歴のある学校だけ。**「0回」の学校を数に入れない**
    .or("koshien_spring_count.gt.0,koshien_summer_count.gt.0")
    // ★並びを一意に決める（このリポジトリで3度踏んだページングの罠と同じ理由）
    .order("name", { ascending: true });

  throwIfError(error, "都道府県の甲子園集計の取得");

  const rows = (data ?? []) as unknown as KoshienCountRow[];
  if (rows.length === 0) return empty;

  let appearances = 0;
  let latest: PrefectureKoshienSummary["latest"] = null;
  for (const row of rows) {
    appearances += row.koshien_spring_count + row.koshien_summer_count;
    if (row.last_koshien_year === null) continue;
    // ★同じ年に複数いたら先に来たほう（＝校名順）を採る。**当て推量で選ばない**
    if (!latest || row.last_koshien_year > latest.year) {
      latest = { name: row.name, slug: row.slug, year: row.last_koshien_year };
    }
  }

  return { schools: rows.length, appearances, latest };
}
