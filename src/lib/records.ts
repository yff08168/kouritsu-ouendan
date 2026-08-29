/**
 * 地方大会のデータから機械的に数え上げる「記録」。
 *
 * ------------------------------------------------------------------
 * ★★**なぜ要るか**（2026-08-29）
 *
 * `/rankings` の5ページは**すべて甲子園の出場歴**から作られている。
 * いっぽう地方大会は44,000試合あるのに、**横断して数えた場所がどこにも無い。**
 * ★**このサイトにしか無いデータはこちら**で、
 * 「公立が優勝した地方大会」は他所では一覧にできない。
 *
 * ------------------------------------------------------------------
 * ★★**入れなかったもの**（次に足す人へ）
 *
 *   ★**大差のついた試合** …… **入れない。**
 *     負けた学校を名指しで並べることになり、
 *     AGENTS.md の「敗戦数を画面に出さない」という配慮と正面から食い違う。
 *     **データがあることと、出してよいことは別。**
 *   ★**延長戦** …… 地方大会の生成物は `note` を持っていない
 *     （持っているのは甲子園・神宮だけ）。**イニング数から推測しない。**
 *
 * ------------------------------------------------------------------
 * ★**組み立ては1回だけ**（`lib/archive.ts` と同じ理由）。
 * 全県を読むので、ページごとに数え直すとビルドが重くなる。
 */

import { PREFECTURES } from "@/lib/constants";
import {
  getRegionalDistrict,
  type RegionalSeason,
} from "@/lib/regional-results";
import { listTournaments, summarizeTournament } from "@/lib/regional-tournaments";
import { vsPath } from "@/lib/head-to-head";

/** 公立が優勝した地方大会1件 */
export type PublicChampion = {
  year: number | null;
  season: RegionalSeason;
  /** 都道府県（甲子園の大会区分名） */
  district: string;
  districtSlug: string;
  /** 画面に出す大会名 */
  tournament: string;
  /** 大会ページへの道 */
  href: string;
  /** 優勝校（出典の表記） */
  school: string;
  schoolSlug: string;
  games: number;
};

/** よく当たるカード1件 */
export type Rivalry = {
  /** 対戦数 */
  meetings: number;
  a: { name: string; slug: string };
  b: { name: string; slug: string };
  /** `/vs/<a>/<b>`。**slugは辞書順の1通りだけ**（`vsPath`） */
  href: string;
  /** それぞれの勝った数。★**負けた数は持たない** */
  aWins: number;
  bWins: number;
  draws: number;
  /** どの都道府県の対戦か */
  district: string;
  districtSlug: string;
};

/** 都道府県ごとのカード */
export type DistrictRivalries = {
  district: string;
  districtSlug: string;
  rivalries: Rivalry[];
};

type Records = {
  champions: PublicChampion[];
  rivalries: Rivalry[];
};

let promise: Promise<Records> | null = null;

async function build(): Promise<Records> {
  const champions: PublicChampion[] = [];

  /*
    ★**カードの鍵は slug の組**（辞書順）。表記ゆれで割れないように。
    ★**私立・県外・連合チームは slug を持たない**ので、自然に外れる。
  */
  const pairs = new Map<
    string,
    Rivalry & { key: string }
  >();

  for (const pref of PREFECTURES) {
    const district = await getRegionalDistrict(pref.slug);
    if (!district) continue;

    // ---- 公立が優勝した大会 ----
    for (const entry of listTournaments(district)) {
      const summary = summarizeTournament(entry);
      /*
        ★★**優勝校は `summarizeTournament` からしか取らない。**
        「決勝がちょうど1試合のときだけ」という規則がそこにあり、
        ★**ブロックごとに決勝がある大会**で1つ選ぶと嘘になる。
      */
      if (!summary.champion || !summary.championSlug) continue;
      champions.push({
        year: entry.year,
        season: entry.season,
        district: district.district,
        districtSlug: district.slug,
        tournament: entry.displayName ?? `${entry.year ?? ""}年の大会`,
        href: `/prefectures/${district.slug}/${entry.slug}`,
        school: summary.champion,
        schoolSlug: summary.championSlug,
        games: summary.games,
      });
    }

    // ---- よく当たるカード ----
    for (const game of district.games) {
      const [x, y] = game.teams;
      if (!x || !y) continue;
      if (!x.slug || !y.slug || x.combined || y.combined) continue;
      // ★**同じ学校どうしになることはないが、鍵が壊れるので落としておく**
      if (x.slug === y.slug) continue;

      const [first, second] = x.slug < y.slug ? [x, y] : [y, x];
      const key = `${first.slug}\t${second.slug}`;
      let entry = pairs.get(key);
      if (!entry) {
        entry = {
          key,
          meetings: 0,
          a: { name: first.name, slug: first.slug! },
          b: { name: second.name, slug: second.slug! },
          href: vsPath(first.slug!, second.slug!),
          aWins: 0,
          bWins: 0,
          draws: 0,
          district: district.district,
          districtSlug: district.slug,
        };
        pairs.set(key, entry);
      }
      entry.meetings += 1;
      /*
        ★**引き分けを「負け」に混ぜない**（高校野球には引き分け再試合がある）。
        `won` は両方 false になるので、得点が同じかで見分ける。
      */
      if (!first.won && !second.won && first.score === second.score) entry.draws += 1;
      else if (first.won) entry.aWins += 1;
      else if (second.won) entry.bWins += 1;
    }
  }

  /*
    ★**並びは新しい順**（年 → 季節 → 県）。**「すごい順」は付けない** ——
    大会の格を機械的に決められないし、決めると誤情報になる。
  */
  const seasonOrder: Record<RegionalSeason, number> = {
    spring: 0,
    summer: 1,
    autumn: 2,
  };
  champions.sort(
    (p, q) =>
      (q.year ?? 0) - (p.year ?? 0) ||
      seasonOrder[q.season] - seasonOrder[p.season] ||
      p.district.localeCompare(q.district, "ja"),
  );

  const rivalries = [...pairs.values()]
    .filter((r) => r.meetings >= 3)
    .sort((p, q) => q.meetings - p.meetings || p.a.name.localeCompare(q.a.name, "ja"))
    .map(({ key: _key, ...rest }) => rest);

  return { champions, rivalries };
}

function records(): Promise<Records> {
  if (!promise) promise = build();
  return promise;
}

/** 公立が優勝した地方大会。**新しい順** */
export async function listPublicChampions(): Promise<PublicChampion[]> {
  return (await records()).champions;
}

/**
 * よく当たるカードを**都道府県ごと**に返す。
 *
 * ------------------------------------------------------------------
 * ★★★**全国を1つの順位にしないこと**（2026-08-29。実際に作って戻した）。
 *
 * 全国を対戦数で並べたら、**上位120組がほぼ全部 山口**になった。
 * 山口は26年ぶん、他県は数年ぶんしか収録していないので、
 * **順位が「対戦の多さ」ではなく「収録の深さ」を表してしまう。**
 * ★**それを「多い順」と書いて出すのは、読者に対して嘘に近い。**
 *
 * ★**県ごとに区切れば、比べているのが同じ土俵の中だけになる。**
 * 副産物として、**41県ぶんの `/vs` ページへ内部リンクが散る**（全国順位だと
 * 1県に偏る）。
 *
 * ★**3回以上の組だけ**。sitemap に載せている `/vs` の条件と同じにしてある
 * （1〜2回の組まで並べると、**sitemap に無いページへの内部リンクが
 * 何千本も生える**）。
 */
export async function listRivalriesByDistrict(
  perDistrict = 5,
): Promise<DistrictRivalries[]> {
  const all = (await records()).rivalries;

  const byDistrict = new Map<string, DistrictRivalries>();
  for (const r of all) {
    let group = byDistrict.get(r.districtSlug);
    if (!group) {
      group = {
        district: r.district,
        districtSlug: r.districtSlug,
        rivalries: [],
      };
      byDistrict.set(r.districtSlug, group);
    }
    // ★**`all` は対戦の多い順に並んでいる**ので、先着 N でその県の上位になる
    if (group.rivalries.length < perDistrict) group.rivalries.push(r);
  }

  // 県の並びは地区マスタの順（北から南）
  const rank = new Map(PREFECTURES.map((p, i) => [p.slug, i]));
  return [...byDistrict.values()].sort(
    (a, b) => (rank.get(a.districtSlug) ?? 0) - (rank.get(b.districtSlug) ?? 0),
  );
}
