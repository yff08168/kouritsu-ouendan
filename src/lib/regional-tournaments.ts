/**
 * 県の中の「大会」を数え上げる。**過去の大会をURLで指せるようにするため。**
 *
 * ------------------------------------------------------------------
 * ★★ なぜ要るか
 *
 *   県のページは**いちばん新しい季節**しか出していなかった（`latestSeasonGames`）。
 *   生成物には過去ぶんが残っている（2026-08-23 に120日の窓を外した）ので、
 *   **大会ごとにページを分けて、勝ち上がりを見られるようにする。**
 *
 * ------------------------------------------------------------------
 * ★★ slug はローマ字にする
 *
 *   大会名は `第108回全国高等学校野球選手権富山大会` のような日本語で、
 *   **そのままURLにすると共有したときに読めなくなる**（AGENTS.md の決めごと）。
 *   `2026-summer` の形にする。
 *
 *   ★**1つの季節に複数の大会が入る県がある**（徳島の秋は5大会）。
 *   そのときは `2025-autumn-2` のように連番を足す。
 *   ★**連番は「大会名の並び順」で決める。** 試合数や日付で決めると、
 *   **出典が更新されて試合が増えただけでURLが入れ替わる。**
 *
 * ------------------------------------------------------------------
 * ★ 年の出し方
 *
 *   `yearOfTournament` と同じ考え方で、**日付ではなく大会名から出す。**
 *   **日付が1つも無い季節がある**ので（実測：夏7県・春3県・秋1県）、
 *   日付に頼ると年が付かない大会ができる。
 */
import type {
  RegionalDistrict,
  RegionalGame,
  RegionalSeason,
} from "@/lib/regional-results";

/**
 * 大会の年。**推測はしない。決められなければ null。**
 *
 * ★★**`scripts/build-regional-results.mjs` の `yearOfTournament` と同じ規則。**
 * **スクリプトは .mjs なので TS を import できない。規則を変えるときは両方直す**
 * （`labelCandidates` と `src/lib/school-name.ts` の関係と同じ）。
 *
 * 順に見る:
 *   1. その大会の試合に日付があれば、その年（いちばん確か）
 *   2. `第N回…選手権…大会` は **N + 1918**
 *   3. `令和N年度` / `令和N年` は **2018 + N**
 *
 * ★**九州地区大会の「第157回」のような通し番号から年を出さないこと**
 * （選手権の回数とは別の系列で、年とは関係がない）。
 */
export function yearOfTournament(
  name: string | null,
  games: RegionalGame[],
): number | null {
  const dated = games
    .map((g) => g.date)
    .filter((d): d is string => Boolean(d))
    .sort();
  if (dated.length) return Number(dated.at(-1)!.slice(0, 4));

  const t = (name ?? "").normalize("NFKC");
  /*
    ★★**大会名に西暦がそのまま入る形がある**（2026-08-25。大阪）。
    `令和5(2023)年度 秋季近畿地区高校野球大会 大阪府予選`。
    **`令和(\d+)年` は当たらない**（`令和5` の次が `(` なので）。
    ★**括弧の中の西暦をいちばん先に見る。** これを入れる前、大阪の2023年秋だけ
    「年が分からない大会」として別枠に出ていた。
  */
  const seireki = t.match(/[(（](\d{4})[)）]/);
  if (seireki) return Number(seireki[1]);
  /*
    ★★**西暦がそのまま頭に付く形もある**（2026-08-27。宮崎の春季・秋季）。
    `2026年 第158回九州地区高等学校野球大会宮崎県予選`。
    ★**回数は九州地区大会の通し番号**で年とは関係が無く、**日付も1つも無い**ので、
    ここを見ないと**年の分からない大会**になる（同じ季節の2年ぶんが並ぶと見分けが付かない）。
    ★**括弧つきより後に見る**（`令和5(2023)年度` は括弧の中が正しい）。
  */
  const bare = t.match(/(?:^|[^\d])(\d{4})年/);
  if (bare) return Number(bare[1]);
  const senshuken = t.match(/第(\d+)回.*選手権/);
  if (senshuken) return Number(senshuken[1]) + 1918;
  /*
    ★**元号は「令和」だけではない**（2026-08-26。群馬は平成18年まで遡れる）。
    ★**「令和元年度」は `令和(\d+)年` に当たらない**ので `元` も受ける。
    ★**規則は `scripts/build-regional-results.mjs` にも同じものがある。両方直すこと。**
  */
  const gengo = t.match(/(令和|平成)(元|\d+)年/);
  if (gengo) return (gengo[1] === "令和" ? 2018 : 1988) + (gengo[2] === "元" ? 1 : Number(gengo[2]));
  return null;
}

/*
  ★★**出典のページ見出しが大会名に混ざっている**（2026-08-29 に発覚）。

  神奈川の出典は個人運営の情報サイトで、**記事のページ題をそのまま大会名にしている** ——
  `令和5年度神奈川県高校野球春季県大会 ＜ 大会掲示板 ＞`
  `2019年神奈川県高校野球春季県大会 組み合わせ 日程 トーナメント表`
  ★**596件中14件。全部が神奈川**（他の40県は1件も無い）。

  ------------------------------------------------------------------
  ★★**生成物（`tournament`）は直さない。**

  ①**神奈川は `tournament: null` の試合を持つ県**で、AGENTS のとおり
    **`--year` で遡ると静かに壊れる。** 名前を変えると引き継ぎの鍵が変わるので、
    **生成物を消して年ごとに走らせ直す**ことになり、割に合わない。
  ②`name` は**スラッグの連番を決める並び順**と、県のページの**大会の照合**にも
    使われている。**変えるとURLが入れ替わる。**

  ★**そこで「表示のときだけ」掃除する**（`displayName`）。
  **並び・スラッグ・照合は `name` のまま。**

  ------------------------------------------------------------------
  ★★**文字を名指しで消さないこと。**

  このリポジトリが繰り返し踏んできた罠（千葉の「宣」、沖縄の凡例）と同じで、
  **含まれていたら消す**にすると本物の校名・大会名を巻き込む。
  **「空白か ＜ の直後から始まる、決まった語」から後ろを丸ごと落とす**形にしてある。
  ★**足すときは、41県596件を通して差分が神奈川の14件だけであることを必ず確かめる。**
*/
const TITLE_JUNK = ["組み合わせ", "日程", "トーナメント表", "抽選会", "速報", "＜"];

export function tournamentDisplayName(name: string | null): string | null {
  if (!name) return null;
  let cut = -1;
  for (const word of TITLE_JUNK) {
    /*
      ★**区切り（空白）の直後に現れたものだけを見る。**
      ★**正規表現を使わない** —— `[\s　]` を組み立てる書き方は
      エスケープが1段落ちて `[s　]` になっても**例外が出ず、静かに1件も
      当たらなくなる**（実際にそうなった。検算していなければ気づけなかった）。
    */
    for (const sep of [" ", "　"]) {
      const at = name.indexOf(sep + word);
      if (at >= 0 && (cut < 0 || at < cut)) cut = at;
    }
  }
  if (cut < 0) return name;
  const cleaned = name.slice(0, cut).trim();
  // ★**全部消えるなら掃除しない**（元の名前のほうがまし）
  return cleaned || name;
}

export type TournamentEntry = {
  /**
   * 大会名（生成物のまま）。
   * ★★**並び順・スラッグの連番・大会の照合はこれを使う。**
   * **画面に出すのは `displayName`。**
   */
  name: string | null;
  /** 画面に出す大会名（出典のページ見出しを落としたもの） */
  displayName: string | null;
  /** URLに使うローマ字の slug */
  slug: string;
  season: RegionalSeason;
  /** 大会の年。分からなければ null */
  year: number | null;
  games: RegionalGame[];
  /** いちばん新しい試合の日付（無い大会がある） */
  lastDate: string | null;
};

const SEASON_ORDER: Record<RegionalSeason, number> = {
  spring: 0,
  summer: 1,
  autumn: 2,
};

/**
 * その県の全大会。**新しい順**（年 → 季節 → 大会名）。
 *
 * ★**`district.games` を渡すこと**（私立どうしの試合も含む）。
 * 枝を組むのに要る。
 */
/**
 * ★★★**県ごとに1回だけ作る**（2026-08-29 追加）。
 *
 * **学校ページ3,505枚がこれを呼ぶ**（その学校が出た大会へのリンクを作るため）。
 * 中身は県の全試合をなめて Map を組み、`localeCompare` で並べ替える処理で、
 * **神奈川なら1回あたり2,942試合ぶん**。**毎回作り直すとビルドが落ちる**
 * （`koshien-games.ts` の `normalizedCache` の説明を読むこと）。
 *
 * ★**`district` は生成物から作った不変のオブジェクト**なので、
 * 同じものが来たら同じ結果を返してよい。**WeakMap なので溜め込まない。**
 */
const tournamentsCache = new WeakMap<RegionalDistrict, TournamentEntry[]>();

export function listTournaments(district: RegionalDistrict): TournamentEntry[] {
  const hit = tournamentsCache.get(district);
  if (hit) return hit;
  const built = buildTournaments(district);
  tournamentsCache.set(district, built);
  return built;
}

function buildTournaments(district: RegionalDistrict): TournamentEntry[] {
  const byName = new Map<string, RegionalGame[]>();
  for (const game of district.games) {
    // 大会名の無い試合は「季節」でひとまとめにする（名前が無いと分けようがない）
    const key = `${game.season}\t${game.tournament ?? ""}`;
    const list = byName.get(key);
    if (list) list.push(game);
    else byName.set(key, [game]);
  }

  const entries = [...byName.entries()].map(([key, games]) => {
    const [season, name] = key.split("\t") as [RegionalSeason, string];
    const dates = games.map((g) => g.date).filter((d): d is string => Boolean(d));
    return {
      name: name || null,
      displayName: tournamentDisplayName(name || null),
      season,
      year: yearOfTournament(name || null, games),
      games,
      lastDate: dates.length ? dates.sort().at(-1)! : null,
      slug: "",
    };
  });

  /*
    ★**slug を決める。** 同じ `年-季節` が複数あるときだけ連番を足す。
    **並びは大会名**（試合数や日付だと、出典が更新されただけで入れ替わる）。
  */
  const buckets = new Map<string, TournamentEntry[]>();
  for (const e of entries) {
    const base = `${e.year ?? "unknown"}-${e.season}`;
    const list = buckets.get(base);
    if (list) list.push(e);
    else buckets.set(base, [e]);
  }
  for (const [base, list] of buckets) {
    list.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "ja"));
    list.forEach((e, i) => {
      e.slug = i === 0 ? base : `${base}-${i + 1}`;
    });
  }

  return entries.sort(
    (a, b) =>
      (b.year ?? 0) - (a.year ?? 0) ||
      SEASON_ORDER[b.season] - SEASON_ORDER[a.season] ||
      (a.name ?? "").localeCompare(b.name ?? "", "ja"),
  );
}

/** slug から1つ引く。無ければ null */
/**
 * ★**大会ページの description に出す数字**（2026-08-29 追加）。
 *
 * ------------------------------------------------------------------
 * ★★**当て推量を1つも入れないこと。**
 *
 * description は検索結果とSNSに出る文で、**画面より先に読まれる。**
 * このサイトは「出典のある事実だけを出す」で通してあるので、
 * **読み取れなかったものは null にして、呼ぶ側が書かない。**
 *
 * ★**優勝校は「決勝がちょうど1試合あって、勝者がいる」ときだけ。**
 * 決勝が複数ある大会（ブロック予選）と、引き分けのまま終わっている
 * 大会（再試合が出典に無い）は**優勝校を名乗らせない。**
 */
export type TournamentSummary = {
  /** 試合数 */
  games: number;
  /** 公立が出た試合数 */
  publicGames: number;
  /** 出場したチーム数（校名の異なり数） */
  teams: number;
  /** 優勝校の表示名。決勝が読めないときは null */
  champion: string | null;
  /**
   * ★**優勝校が公立なら slug**（2026-08-29 追加）。
   * 私立・県外・連合チームは null。
   * ★**「公立が優勝した大会」を数えるのに要る**（`lib/records.ts`）。
   * ★**ここで返すのは、決勝がちょうど1試合のときだけという上の規則を
   * 通ったものだけ。** 呼ぶ側で決勝を探し直さないこと。
   */
  championSlug: string | null;
  /** 準優勝校。優勝校が取れたときだけ */
  runnerUp: string | null;
};

export function summarizeTournament(entry: TournamentEntry): TournamentSummary {
  const names = new Set<string>();
  for (const g of entry.games) for (const t of g.teams) names.add(t.display);

  /*
    ★**決勝がちょうど1試合のときだけ優勝校を出す。**
    ブロックごとに「決勝」がある大会があり、そこで1つ選ぶと嘘になる。
  */
  const finals = entry.games.filter((g) => g.round === "決勝");
  const final = finals.length === 1 ? finals[0] : null;
  const champ = final?.teams.find((t) => t.won) ?? null;
  // ★**引き分けは勝者なし**（`won` が両方 false）。そのときは名乗らせない
  const runner = champ ? (final?.teams.find((t) => t !== champ) ?? null) : null;

  return {
    games: entry.games.length,
    publicGames: entry.games.filter((g) =>
      g.teams.some((t) => t.slug && !t.combined),
    ).length,
    teams: names.size,
    champion: champ?.display ?? null,
    // ★**連合チームは1校の記録にしない**（生成側で slug は null だが、念のため揃える）
    championSlug: champ && !champ.combined ? champ.slug : null,
    runnerUp: runner?.display ?? null,
  };
}

export function findTournament(
  district: RegionalDistrict,
  slug: string,
): TournamentEntry | null {
  return listTournaments(district).find((t) => t.slug === slug) ?? null;
}
