/**
 * 地方大会（秋季・春季・選手権の県大会）の結果。
 *
 * データ本体は `scripts/build-regional-results.mjs` が作る**生成物**。
 * 甲子園（`live-results.ts`）とは別に持っている。出典が県ごとに違い、
 * 大会も県ごとに独立しているので、1つにまとめると1県のサイト変更で
 * 全国の生成が止まる。
 *
 * ------------------------------------------------------------------
 * ★**ファイルを2種類に分けている。**
 *
 *   `src/lib/data/regional/<県slug>.ts`  … その県の全試合（1県あたり約120KB）
 *   `src/lib/data/regional-pickup.ts`    … トップ用の抜粋（数十件）
 *
 *   47県ぶんを1つのファイルにすると6MB近くになり、トップページが
 *   全国ぶんを読み込むことになる。**トップは抜粋だけ、県のページは
 *   その県だけ**を読む形にしてある。
 */

export type RegionalSeason = "spring" | "summer" | "autumn";

export type RegionalTeam = {
  /**
   * 出典サイトの表記。**表示用の空白は落としてある**（「横 浜」→「横浜」）。
   * ★**連合チームだけは空白を残す**（「寒川 藤沢総合 深沢 厚木清南」は
   * 空白が学校の区切りなので、詰めると1校に見える）。
   */
  display: string;
  /** 学校マスタの校名。結び付かなければ display と同じ */
  name: string;
  /** 公立校なら slug。私立・県外・連合チームは null */
  slug: string | null;
  score: number;
  won: boolean;
  /**
   * 複数校の連合チーム（「寒川・藤沢総合・深沢・厚木清南」）。
   * **1校の戦績として数えない。** 公立が含まれていても、どの学校の
   * 記録にするかを決められないため。
   */
  combined?: boolean;
};

export type RegionalGame = {
  /** 「2026-07-26」 */
  date: string;
  season: RegionalSeason;
  /** 「第108回 全国高等学校野球選手権長野大会」 */
  tournament: string | null;
  /** 「1回戦」「準々決勝」 */
  round: string | null;
  venue: string | null;
  teams: RegionalTeam[];
};

export type RegionalDistrict = {
  /** 都道府県の slug */
  slug: string;
  /** 「長野」。甲子園の大会区分名 */
  district: string;
  /**
   * 出典の名前。**連盟とは限らない。**
   * 埼玉・神奈川は連盟のサイトではなく個人運営の情報サイトから取っている。
   */
  sourceName: string;
  /**
   * 出典へのリンク。**トップページに向けること。**
   * 深いページへのリンクを断っている連盟がある（岩手・宮城・島根）。
   */
  sourceUrl: string;
  games: RegionalGame[];
};

/** 県ごとのファイルが持つ形 */
export type RegionalResults = {
  districts: RegionalDistrict[];
};

/** トップの速報カードに出す1件。**県の情報を持ち歩く**ので単体で表示できる */
export type RegionalPickup = {
  districtSlug: string;
  district: string;
  sourceName: string;
  sourceUrl: string;
  date: string;
  season: RegionalSeason;
  tournament: string | null;
  round: string | null;
  teams: RegionalTeam[];
};

/**
 * いま開催中の地方大会で勝ち上がっている公立校。
 *
 * **「まだ1度も負けていない」で判定している。** 地方大会はブラケットを
 * 持っていないので「次に誰と当たるか」は出せないが、**負けていない＝
 * まだ勝ち残っている**は、行われた試合だけから確実に言える。
 *
 * 大会が終わったあとは優勝校だけが残る。これは不具合ではなく、
 * 「その大会を勝ち上がった学校」としてそのまま意味を持つ。
 */
export type RegionalSpotlight = {
  slug: string;
  /** 出典サイトの表記（「市ケ尾」） */
  display: string;
  /** 学校マスタの校名 */
  name: string;
  /** 「長野」。甲子園の大会区分名 */
  district: string;
  districtSlug: string;
  wins: number;
  /**
   * 「ベスト16」「決勝進出」「優勝」。数えられなければ null。
   *
   * **参加校数が県で大きく違う**（神奈川172チーム、少ない県は30校台）ので、
   * 「1勝」だけでは、どこまで勝ち上がったのかが伝わらない。
   *
   * 出し方は推測ではなく実測。**同じ大会でまだ負けておらず、その学校と
   * 同じだけ勝ち進んでいる学校の数**がそのままベストNになる。
   * 端数は2の冪に切り上げる（24校残っていれば全員ベスト32の枠にいる）。
   */
  standing: string | null;
};

export type RegionalPickups = {
  /** 反映されている最新の試合日。鮮度の表示に使う */
  latestDate: string | null;
  /**
   * `spotlight` がどの大会のものか。
   * いちばん新しい試合が属する季節で、見出しの文言を決めるのに使う。
   */
  spotlightSeason: RegionalSeason | null;
  /** 勝ち上がっている公立校。多い順 */
  spotlight: RegionalSpotlight[];
  games: RegionalPickup[];
};

const SPOTLIGHT_TITLE: Record<RegionalSeason, string> = {
  spring: "春季大会を勝ち上がっている公立校",
  summer: "選手権予選を勝ち上がっている公立校",
  autumn: "秋季大会を勝ち上がっている公立校",
};

export function spotlightTitle(season: RegionalSeason): string {
  return SPOTLIGHT_TITLE[season];
}

/** 「2026-07-26」→「7月26日」 */
export function formatRegionalDate(iso: string): string {
  const m = iso.match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${Number(m[1])}月${Number(m[2])}日`;
}

const SEASON_LABEL: Record<RegionalSeason, string> = {
  spring: "春季大会",
  summer: "選手権予選",
  autumn: "秋季大会",
};

export function seasonLabel(season: RegionalSeason): string {
  return SEASON_LABEL[season];
}

/**
 * トップに出す数件を選ぶ。
 *
 * ★**シャッフルは表示のときにやる。生成時にやらないこと。**
 * 生成時に混ぜると、試合が1つも増えていなくても実行のたびに中身が変わり、
 * 3時間おきのCIが意味のないコミットを積み続ける（生成物にタイムスタンプを
 * 入れないのと同じ理由）。
 *
 * `seed` を渡すと同じ並びを再現できる。省略すると毎回変わる。
 * ページは ISR（10分）なので、実際に切り替わるのは再生成のタイミング。
 */
export function pickRegionalGames(
  pickups: RegionalPickups,
  count: number,
  seed?: number,
): RegionalPickup[] {
  const games = [...pickups.games];
  // 乱数は seed から作る。Math.random だとサーバー描画のたびに変わって検証しづらい
  let state = seed ?? Math.floor(Math.random() * 2 ** 31);
  const next = () => {
    // xorshift。分布の良さより「同じ seed で同じ並び」が目的
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return Math.abs(state) / 2 ** 31;
  };
  for (let i = games.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [games[i], games[j]] = [games[j], games[i]];
  }
  return games.slice(0, count);
}

/** その試合に出ている公立校（連合チームは除く） */
export function publicTeams(game: { teams: RegionalTeam[] }): RegionalTeam[] {
  return game.teams.filter((t) => t.slug && !t.combined);
}

/**
 * 県のページ用。**その県のファイルだけを読み込む。**
 *
 * ★**`REGIONAL_LOADERS` は動的 import の表**（生成物）。
 * ここで全県を静的に import すると、どの県のページにも全国ぶんが入る。
 *
 * まだ対応していない県は null。**47県すべてにデータがあるわけではない**
 * （2026-08-13 時点で6県）。
 */
export async function getRegionalDistrict(
  prefectureSlug: string,
): Promise<RegionalDistrict | null> {
  /*
    ★**ディレクトリ指定（`@/lib/data/regional`）で import しないこと。**
    本番ビルドは通るのに、`next dev` のブラウザ側のコンパイルだけが
    「Module not found」になり、リクエストのたびにエラーが出る。ファイルを名指しする。
  */
  const { REGIONAL_LOADERS } = await import("@/lib/data/regional/loaders");
  const load = REGIONAL_LOADERS[prefectureSlug];
  return load ? await load() : null;
}

/**
 * 県のページに出す試合を選ぶ。
 *
 * ★**季節をまたいで並べない。** 1つのファイルには春・夏・秋が入っている。
 * 日付順に混ぜると「7月（選手権予選）の次が9月（秋季大会）」と、別の大会の
 * 試合が地続きに見える。**いちばん新しい試合が属する季節だけ**を出す
 * （トップの勝ち上がりと同じ考え方）。
 *
 * ★**古い季節を「最新」として出さない。** 秋のページがまだ前年ぶんしか無い
 * 県があるので、画面には年を必ず添えること（`RegionalDistrictCard`）。
 */
export function latestSeasonGames(
  district: RegionalDistrict,
  limit: number,
): {
  season: RegionalSeason;
  /** 新しい順。`limit` 件まで */
  games: RegionalGame[];
  /** その季節に取れている試合の総数（`limit` で切る前） */
  total: number;
  /** 出している試合の大会名（重複を除く） */
  tournaments: string[];
} | null {
  if (!district.games.length) return null;
  const newest = [...district.games].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  if (!newest) return null;

  const games = district.games
    .filter((g) => g.season === newest.season)
    // 同じ日の中の並びは出典の順のまま（時刻を持っていないため入れ替えない）
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    season: newest.season,
    games: games.slice(0, limit),
    total: games.length,
    tournaments: [...new Set(games.slice(0, limit).map((g) => g.tournament).filter(Boolean))] as string[],
  };
}

/** 日付ごとにまとめる。並びは渡された順（新しい順）のまま */
export function groupGamesByDate(games: RegionalGame[]): { date: string; games: RegionalGame[] }[] {
  const out: { date: string; games: RegionalGame[] }[] = [];
  for (const game of games) {
    const last = out.at(-1);
    if (last?.date === game.date) last.games.push(game);
    else out.push({ date: game.date, games: [game] });
  }
  return out;
}

/** 「2026-07-26」→「2026年7月26日」。**県のページでは年も出す**（前年の秋があるため） */
export function formatRegionalDateWithYear(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`;
}
