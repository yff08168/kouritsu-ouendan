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

/*
  ★**`regional-tournaments.ts` からは型しか import されていない**ので、
  ここから関数を読んでも実行時の循環にはならない（型の import は消える）。
*/
import { yearOfTournament } from "@/lib/regional-tournaments";

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
  /**
   * 「2026-07-26」。★**日付を持たない出典がある**（2026-08-14 に許容）。
   *
   * 三重のように**組合せ表に日付が1つも書かれていない**県がある。
   * 以前はそういう県を丸ごと見送っていたが、**回戦が分かれば掲載する**方針に変えた。
   *
   * ★**日付が無いときに推測で埋めないこと。** null のまま持ち、
   * 画面は回戦ごとに並べる（`groupGamesForDistrict`）。
   * ★**日付の無い試合はトップの抜粋と勝ち上がりに出さない。**
   * どちらも「新しい順」で選ぶので、順番を決められない試合を混ぜられない。
   */
  date: string | null;
  season: RegionalSeason;
  /** 「第108回 全国高等学校野球選手権長野大会」 */
  tournament: string | null;
  /** 「1回戦」「準々決勝」 */
  round: string | null;
  venue: string | null;
  teams: RegionalTeam[];
  /**
   * ★**試合に添えられた注記**（2026-08-26 追加。全国大会のため）。
   *
   * 「延長15回」「サヨナラ」など。**地方大会の生成物は持っていない**が、
   * 甲子園・明治神宮の出典は持っており、**捨てると試合の性格が落ちる。**
   * ★**任意の項目**なので、足しても既存の生成物は1バイトも変わらない。
   */
  note?: string | null;
  /**
   * ★**その試合だけ出所が違うときに書く**（2026-08-24 追加。富山のため）。
   *
   * 既定では県の `sourceName` / `sourceUrl` がその県の全試合の出所だが、
   * **1つの県の中で出所が分かれることがある。**
   * 富山は連盟の紙が準々決勝までしか埋まっておらず、**決勝は Wikipedia、
   * 準決勝は運営者自身の記録**から入れている。
   *
   * ★**「手元に同じ記録があるから」で県の出典にまとめないこと。**
   * 転記した経路が別なら、その経路が本当の出所
   * （AGENTS.md「出典の表示は実際の出所と一致させること」）。
   *
   * ★**いまは画面に出していない**（出典の表示は 2026-08-21 に画面から外した）。
   * データとして正しく持っておくためのもの。
   */
  source?: { name: string; url?: string };
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
  /**
   * ★**組み合わせ（まだ行われていない試合）**（2026-08-22 に追加）。
   *
   * ★**`games` とは別の入れ物。混ぜないこと。** `games` は
   * **スコアと勝敗を必ず持つ**形で、画面・トーナメント表・検算のすべてが
   * それを前提にしている。**未実施の試合をそこへ入れると全部に波及する。**
   *
   * ★**結果が出たものは生成側で落としている**ので、ここに残るのは本当に
   * これからの試合だけ。**無い県では省略される。**
   */
  upcoming?: RegionalUpcoming[];
};

/** 組み合わせの1試合。**スコアも勝敗も持たない**（まだ行われていない） */
export type RegionalUpcoming = {
  date: string | null;
  season: RegionalSeason;
  tournament: string | null;
  round: string | null;
  venue: string | null;
  /** 対戦する2校。**決まっている試合しか入っていない**（勝者未定の枠は作らない） */
  teams: { display: string; name: string; slug: string | null; combined?: boolean }[];
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

/**
 * ★**タイル地図に出す「今季の進捗」**（2026-08-22 に追加）。
 *
 * `src/lib/data/regional-progress.ts`（生成物）。**47地区ぶんの1行だけ**で、
 * 県ごとの試合（1県100KB超）は入っていない。地図は49地区ぶんを一度に描くので、
 * 県のファイルを読むわけにいかない。
 *
 * ★**この表に行が無い地区は「未対応」**（出典をまだ読んでいない）。
 * `pending`（出典はあるが今季の試合がまだ無い）と**画面で区別すること。**
 * 同じ見た目にすると「まだ始まっていない」と「取れていない」が混ざる。
 */
export type RegionalProgress =
  | {
      slug: string;
      district: string;
      /** 出典はあるが、今季の試合がまだ取れていない */
      state: "pending";
    }
  | {
      slug: string;
      district: string;
      /** ★**組み合わせだけ出ている**（試合はまだ0件だが開幕日が分かっている） */
      state: "scheduled";
      season: RegionalSeason;
      tournament: string | null;
      /** 開幕日 */
      opensOn: string | null;
      /** 組み合わせが読めている試合数 */
      games: number;
    }
  | {
      slug: string;
      district: string;
      /** `playing`＝開催中（決勝が読めていない）／`done`＝決勝まで読めた */
      state: "playing" | "done";
      season: RegionalSeason;
      /** いちばん試合数の多い大会名 */
      tournament: string | null;
      /** 取れている試合数（**私立どうしも含む**） */
      games: number;
      /** うち公立が絡む試合数（画面に出るのはこちら） */
      publicGames: number;
      /** いちばん深い回戦。「4回戦」「準決勝」「決勝」 */
      round: string | null;
      latestDate: string | null;
      /** 優勝校。**決勝が読めたときだけ。** 私立なら slug は null */
      champion: { display: string; slug: string | null } | null;
    };

export type RegionalProgressBoard = {
  /**
   * 地図全体の季節。**地区ごとに変えない。**
   * 混ぜると「どの大会の一覧なのか」が言えなくなる。
   */
  season: RegionalSeason | null;
  latestDate: string | null;
  districts: RegionalProgress[];
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
 * （2026-08-14 時点で12県）。
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
  if (!load) return null;
  const district = await load();
  /*
    ★**手で書いた補足を合流させる**（2026-08-24。富山のため）。
    出典の紙に入っていない試合を、別の出所から足すためのもの。
    **生成物には触らない**（再生成で消えるため。`content/` 側に置いてある）。
  */
  const { mergeRegionalSupplements } = await import("@/lib/content/regional-supplements");
  const games = mergeRegionalSupplements(prefectureSlug, district.games);
  return games === district.games ? district : { ...district, games };
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
  /*
    ★★**生成物には私立どうしの試合も入っている**（2026-08-21 に方針を変えた）。
    **絞り込みはここでやる。**「取るときは私立の戦績も引用し、
    **着目するところを公立にする**」という決め方なので、
    **データは全部持ち、画面に出すのは公立が絡む試合だけ**にする。

    ★**この1行を外すと県のページに私立どうしの試合が並ぶ。**
    ★**総数（`total`）も公立が絡む試合の数**である（画面の「N件あり、うち…」の N）。
    トーナメント表を作るときは `district.games` を直に読むこと（そちらは全試合）。
  */
  const publicGames = district.games.filter((g) => g.teams.some((t) => t.slug));
  if (!publicGames.length) return null;
  /*
    ★**日付を持たない県がある**ので、日付だけで「いちばん新しい季節」を
    決められない。日付のある試合があればそれで決める。

    ~~日付の無い出典は1つの大会ぶんしか持たないので、季節も1つに決まる~~
    ★**これは 2026-08-17 に成り立たなくなった。** 滋賀は**夏と春の両方**を
    持っていて、**どちらも日付が無い**（紙に日にちしか書かれておらず、
    月がどこにも無いため）。**配列の先頭を採ると、アダプタの `seasons` に
    書いた順で結果が変わる。** 季節の順で決める。
  */
  /** 日付が無いときの新しい順。春 → 夏 → 秋（同じ年の中での順） */
  const SEASON_ORDER: Record<RegionalSeason, number> = { spring: 0, summer: 1, autumn: 2 };
  const dated = publicGames.filter((g) => g.date);
  const seasons = [...new Set(publicGames.map((g) => g.season))];
  const byOrder = seasons.reduce((a, b) => (SEASON_ORDER[b] > SEASON_ORDER[a] ? b : a));
  /*
    ★★**日付のある季節と無い季節が混ざる県がある**（2026-08-21。大分）。
    大分は**夏のやぐら表に日にちが1つも書かれていない**のに、
    春の紙には書いてある。日付だけで決めると、**7月に終わった夏が
    5月に終わった春に負けて、県のページに春が出る。**

    ★**日付の無い季節が、日付で選ばれた季節より「あと」にあるなら、
    どちらが新しいかは分からない。** そのときは季節の順で決める。
    ★**逆（日付の無い季節のほうが前）なら迷わない**ので、今までどおり日付で決める
    —— 福井は春だけ日付が無く、夏（今年）と秋（前年）は日付があるので、
    この分岐に入らず**夏のまま**（2026-08-21 に全県で確認した）。
  */
  const undatedSeasons = seasons.filter((s) => !dated.some((g) => g.season === s));
  /*
    ★★**日付を1つも持たない県が、複数の年ぶん持つようになった**（2026-08-27）。

    ~~日付が無ければ季節の順（春→夏→秋）で決める~~ は**1年ぶんしか無いときの決め方**で、
    **年をまたぐと古い大会が県のページに出る** ——
    宮崎は 2025年の春夏秋 と 2026年の春夏 を持っているのに、
    **季節の順だけで決めると「2025年の秋」**が出ていた（群馬・滋賀も同じ）。

    ★**大会名から年を出して、いちばん新しい大会の季節を採る**（`yearOfTournament`。
    **同じ年なら今までどおり季節の順**）。★**年が1つも出せなければ今までどおり。**
    ★**日付のある県は1件も変わらない**（この分岐に入らない）。
  */
  const newestSeasonByYear = (() => {
    const byTournamentName = new Map<string, RegionalGame[]>();
    for (const g of publicGames) {
      const k = `${g.season}\t${g.tournament ?? ""}`;
      const list = byTournamentName.get(k);
      if (list) list.push(g);
      else byTournamentName.set(k, [g]);
    }
    let best: { year: number; season: RegionalSeason } | null = null;
    for (const [k, list] of byTournamentName) {
      const year = yearOfTournament(k.split("\t")[1] || null, list);
      if (year === null) continue;
      const season = list[0].season;
      if (!best || year > best.year || (year === best.year && SEASON_ORDER[season] > SEASON_ORDER[best.season])) {
        best = { year, season };
      }
    }
    return best?.season ?? null;
  })();
  const newestSeason = (() => {
    if (!dated.length) return newestSeasonByYear ?? byOrder;
    const byDate = [...dated].sort((a, b) => a.date!.localeCompare(b.date!)).at(-1)!.season;
    const ambiguous = undatedSeasons.some((s) => SEASON_ORDER[s] > SEASON_ORDER[byDate]);
    return ambiguous ? byOrder : byDate;
  })();

  /*
    ★★**同じ季節が複数の年ぶん入るようになった**（2026-08-23。120日の窓を外した）。

    それまでは「いちばん新しい試合から120日」で切っていたので、
    **1つの季節に1大会しか入らなかった。** 窓を外すと、長野のように
    **2022〜2026年の春季が全部**入っている県が出る。
    ★**季節だけで絞ると、5年ぶんの春季大会が1つの大会として並ぶ**
    （「この大会で公立が出た試合は N 件」の N も5年ぶんの合計になる）。

    ★**いちばん新しい大会だけに絞る。** 大会名で分け、
    **その中でいちばん新しい試合を持つ大会**を採る（進捗地図と同じ決め方）。

    ~~★**日付の無い県は大会名が1つしか無い**ので、この分岐に入っても変わらない。~~
    ★★**2026-08-25 に成り立たなくなった。** 大阪は**日付を1つも持たないのに
    5年ぶん×3季＝15大会**ある。日付が無いと上の並べ替えが全部同点になり、
    **次の「試合数の多い順」で決まっていた** ——
    結果、**2023年の秋（公立114試合）が2025年の秋（103試合）より新しい**
    ことになり、**県のページの先頭に2年前の大会が出ていた。**

    ★**AGENTS.md に「試合数で選ばない」と書いてあるとおり。**
    **大会名から年を出して比べる**（`yearOfTournament`。日付があればそれを使うので、
    今までどおりの県は1件も変わらない）。
  */
  const seasonGames = publicGames.filter((g) => g.season === newestSeason);
  const byTournament = new Map<string, RegionalGame[]>();
  for (const g of seasonGames) {
    const k = g.tournament ?? "";
    const list = byTournament.get(k);
    if (list) list.push(g);
    else byTournament.set(k, [g]);
  }
  const newestOf = (list: RegionalGame[]) =>
    list.map((g) => g.date).filter(Boolean).sort().at(-1) ?? "";
  const yearOf = (name: string, list: RegionalGame[]) =>
    yearOfTournament(name || null, list) ?? -1;
  const newestTournament = [...byTournament.entries()].sort(
    ([an, a], [bn, b]) =>
      newestOf(b).localeCompare(newestOf(a)) ||
      yearOf(bn, b) - yearOf(an, a) ||
      b.length - a.length,
  )[0][1];

  const games = newestTournament
    .filter((g) => g.season === newestSeason)
    /*
      日付があれば新しい順。**無ければ回戦の深い順**（決勝がいちばん上）。
      同じ日・同じ回戦の中の並びは出典の順のまま（時刻を持っていないため）。
    */
    .sort((a, b) =>
      a.date && b.date
        ? b.date.localeCompare(a.date)
        : roundDepth(b.round) - roundDepth(a.round),
    );

  return {
    season: newestSeason,
    games: games.slice(0, limit),
    total: games.length,
    tournaments: [...new Set(games.slice(0, limit).map((g) => g.tournament).filter(Boolean))] as string[],
  };
}

/**
 * 回戦の深さ。**日付を持たない県を並べるのに使う。**
 * 表に無い書き方が来ても落ちないよう、分からないものは -1 にする。
 */
const ROUND_DEPTH = [
  "1回戦", "2回戦", "3回戦", "4回戦", "5回戦", "6回戦", "7回戦",
  "代表決定戦", "準々決勝", "準決勝", "決勝",
];
export function roundDepth(round: string | null): number {
  return round ? ROUND_DEPTH.indexOf(round) : -1;
}

/**
 * 見出しごとにまとめる。並びは渡された順のまま。
 *
 * ★**日付があれば日付で、無ければ回戦でまとめる。**
 * 三重のように**組合せ表に日付が1つも無い**県があり、日付で見出しを作れない。
 * 日付を推測して埋めるより、**回戦を見出しにするほうが嘘が無い。**
 */
export function groupGamesForDistrict(
  games: RegionalGame[],
): { key: string; label: string; games: RegionalGame[] }[] {
  const out: { key: string; label: string; games: RegionalGame[] }[] = [];
  for (const game of games) {
    const key = game.date ?? `round:${game.round ?? "?"}`;
    const label = game.date
      ? formatRegionalDateWithYear(game.date)
      : (game.round ?? "回戦不明");
    const last = out.at(-1);
    if (last?.key === key) last.games.push(game);
    else out.push({ key, label, games: [game] });
  }
  return out;
}

/** 「2026-07-26」→「2026年7月26日」。**県のページでは年も出す**（前年の秋があるため） */
export function formatRegionalDateWithYear(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`;
}
