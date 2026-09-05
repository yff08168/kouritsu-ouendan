/**
 * 試合中の速報を HSB flash（`hsbflash.jp`）から読む。
 *
 * ------------------------------------------------------------------
 * ★★★ これは生成物ではない。**描くときに取りに行く。**
 *
 *   このリポジトリの地方大会データは「取得 → 生成物をコミット → Vercel が再ビルド」
 *   という経路で、**ビルドだけで約20分**（5,300枚）かかる。
 *   ★**速報をその経路に乗せると、どんなに詰めても30分遅れになり、
 *   しかも1試合動くたびに全ページを焼き直すことになる。**
 *
 *   ★**だから速報だけは別系統にしてある** —— `fetch` の `next.revalidate` を秒で回し、
 *   **生成物にもコミットにもしない。** 既存の地方大会データ（1日2回）は一切触っていない。
 *
 * ------------------------------------------------------------------
 * ★★ 出典への負荷（2026-09-05 に運営者と決めた）
 *
 *   - **試合時間帯（8〜20時）だけ 60秒**、それ以外は 30分。
 *   - ★**訪問者ごとには取りに行かない。** Next のキャッシュが県ごとに1つなので、
 *     **見ている人が何人いても取得は「60秒に1回」**。誰も見ていない県は0回。
 *   - ★**全国の一覧は9.6KBで1リクエスト**（47県ぶんの状態が入っている）。
 *     トップの「速報中の都道府県」はこれ1本で出せる。
 *
 * ------------------------------------------------------------------
 * ★★ 規約で外している6県には広げない
 *
 *   北海道・青森・宮城・秋田・東京・鳥取。**連盟が転載・複製を制限している県**で、
 *   AGENTS.md の決めごとどおり**別経路でも取らない。**
 *   ★**HSB flash は47都道府県ぶんあるので、何もしなければ出てしまう。**
 *
 * ------------------------------------------------------------------
 * ★ 出典表示は「HSB flash」にすること（連盟の名前で出さない）。
 */
import { PREFECTURES } from "@/lib/constants";

export const LIVE_SOURCE = { name: "HSB flash", url: "https://hsbflash.jp/" } as const;

/**
 * ★★★**速報は「県単位」で持つ。甲子園の大会区分ではない**（2026-09-05）。
 *
 * このサイトの地区マスタ（`PREFECTURES`）は**甲子園の大会区分49件**で、
 * **北海道は北北海道・南北海道、東京は東東京・西東京に割れている。**
 * ★**出典（HSB flash）のホストは県ごとに1つ**（`hokkaido` / `tokyo`）なので、
 * **1対1にならない。**
 * ★★**同じ盤を2ページに出すと読む人が混乱する**ので、
 * **速報だけは `hokkaido` / `tokyo` の1件にまとめる。**
 * ★**割れるのは夏の甲子園予選だけ**で、秋季・春季はどちらも県で1つの大会。
 *
 * ★**残る45地区は、slugがそのまま出典のホスト名になっている**（実測で確認）。
 */
const MERGED: { slug: string; name: string }[] = [
  { slug: "hokkaido", name: "北海道" },
  { slug: "tokyo", name: "東京" },
];

/** 甲子園の区分で割れている地区 → 速報での県slug */
const MERGED_OF: Record<string, string> = {
  "kita-hokkaido": "hokkaido",
  "minami-hokkaido": "hokkaido",
  "higashi-tokyo": "tokyo",
  "nishi-tokyo": "tokyo",
};

/**
 * ★**速報を出す県の一覧**（47件）。
 *
 * ★★★**2026-09-05 に運営者の判断で47県すべてにした。**
 * それまでは**6県（北海道・青森・宮城・秋田・東京・鳥取）を外していた** ——
 * **連盟が自分のサイトで転載を断っている**ためで、**出典の規約が理由ではない。**
 * ★**HSB flash の掲示は47県とも同じ1文**（`記事、写真の無断転載を禁じます`）で、
 * **県ごとの出し分けは無い。** `robots.txt` も空。
 * ★**各ページに「連盟の公式ページではありません」と書いてある独立した媒体**である。
 * ★**取るのは得点・校名・回・球場という事実だけ**（記事も写真も取らない）。
 *
 * ★★**蓄積している地方大会データ（`src/lib/data/regional/`）は別の判断**で、
 * **いまも41県のまま。** 変えるならそちらは改めて決めること。
 */
const LIVE_PREFECTURES: { slug: string; name: string }[] = [
  ...PREFECTURES.filter((p) => !(p.slug in MERGED_OF)).map((p) => ({ slug: p.slug, name: p.name })),
  ...MERGED,
];

/** 出典の `phase0〜4`。**順番が意味を持つ**ので数字のまま持たない */
export type LivePhase = "before" | "drawn" | "running" | "today" | "done";

const PHASES: Record<string, LivePhase> = {
  phase0: "before",
  phase1: "drawn",
  phase2: "running",
  phase3: "today",
  phase4: "done",
};

export const PHASE_LABEL: Record<LivePhase, string> = {
  before: "抽選前",
  drawn: "組合せ決定",
  running: "開催中",
  today: "本日試合あり",
  done: "代表校決定",
};

export type LiveDistrict = {
  /** サイトの県slug（`kanagawa`）。**出典のホスト名と同じとは限らない** */
  slug: string;
  name: string;
  host: string;
  phase: LivePhase;
};

export type LiveGame = {
  /** 詳細ページの鍵。**未開始の試合には無い**（出典が詳細を出していない） */
  token: string | null;
  first: string;
  third: string;
  scoreFirst: number | null;
  scoreThird: number | null;
  /** 「8回裏」「試合終了」。未開始は空 */
  status: string;
  finished: boolean;
  playing: boolean;
  /** 「大和 09:30」。球場と開始時刻が1つの欄に入っている */
  place: string | null;
};

export type LiveBoard = {
  slug: string;
  name: string;
  /** 「9月5日(土)」 */
  day: string | null;
  tournament: string | null;
  games: LiveGame[];
};

export type LiveBoxScore = {
  tournament: string | null;
  /** 「対戦中」「試合終了」 */
  state: string | null;
  date: string | null;
  stadium: string | null;
  playBall: string | null;
  gameSet: string | null;
  /** 先攻・後攻の順。**イニングは15回ぶんと合計** */
  teams: { name: string; innings: (number | null)[]; total: number | null }[];
};

/* ------------------------------------------------------------------ */

const plain = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/**
 * ★**試合時間帯だけ短い間隔にする**（運営者と決めた 60秒）。
 * ★**日本時間で見ること。** サーバーはUTCで動いている。
 */
function revalidateSeconds(): number {
  const jstHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tokyo",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );
  return jstHour >= 8 && jstHour < 20 ? 60 : 1800;
}

/**
 * ★**取得はここ1か所に閉じる。**
 * ★**落ちても例外を投げない** —— 速報が取れないことでページ全体を落とさない
 * （このサイトの他の中身は生成物なので、出典が止まっても出せる）。
 */
async function get(url: string, revalidate = revalidateSeconds()): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "kouritsu-ouendan/1.0 (+https://kouritsu-ouendan.com)" },
      next: { revalidate },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */

/**
 * 全国の一覧（`hsbflash.jp/top`）。**9.6KBに47県ぶんの状態が入っている。**
 *
 *     <a href="https://kanagawa.hsbflash.jp/"><dd class="phase3">神奈川</dd></a>
 *
 * ★**返すのは、このサイトが収録している県だけ**（規約で外している6県は落とす）。
 * ★**県slugは出典のホスト名から引かない。** サイト側の `PREFECTURES` と突き合わせる ——
 * **北海道と東京は甲子園の区分で2つに割れており、ホスト名と1対1にならない。**
 */
export async function fetchLiveDistricts(revalidate = 300): Promise<LiveDistrict[]> {
  /*
    ★★**既定を5分にしてある。** ここを60秒にすると、これを読むページ
    （トップ）の `revalidate` まで60秒に引きずられる ——
    **Next はページの中でいちばん短い間隔を採る**ので、
    **トップの Supabase 問い合わせが毎分走る**ことになる。
    ★**県の状態（本日試合あり／開催中）は1日に数回しか変わらない。**
  */
  const html = await get("https://hsbflash.jp/top", revalidate);
  if (!html) return [];
  const out: LiveDistrict[] = [];
  for (const m of html.matchAll(
    /href="https?:\/\/([a-z]+)\.hsbflash\.jp[^"]*"[^>]*>\s*<dd class="(phase\d)">([^<]+)<\/dd>/g,
  )) {
    const [, host, phaseClass] = m;
    const phase = PHASES[phaseClass];
    if (!phase) continue;
    // ★**県名は出典の表記ではなくサイト側から出す**（表記をそろえる）
    const pref = LIVE_PREFECTURES.find((p) => p.slug === host);
    if (!pref) continue;
    out.push({ slug: pref.slug, name: pref.name, host, phase });
  }
  return out;
}

/** ★**「いま速報が出ている県」＝本日試合あり。** 開催中（試合が無い日）は含めない */
export const liveToday = (list: LiveDistrict[]) => list.filter((d) => d.phase === "today");

/**
 * ★**速報を出す県か。47県すべて true**
 * （2026-09-05 に運営者の判断で6県の除外をやめた。上の `LIVE_PREFECTURES` を読むこと）。
 * ★**甲子園の区分で割れている4地区は false** —— 速報は県単位なので、
 * `kita-hokkaido` ではなく `hokkaido` を使う（`liveSlugOf` で寄せる）。
 */
export const isLiveCovered = (slug: string) => LIVE_PREFECTURES.some((p) => p.slug === slug);

/**
 * ★★**地区slug → 速報の県slug**（北北海道・南北海道 → `hokkaido` ほか）。
 * ★**県のページから速報へリンクするときは必ず通すこと**（通さないと404になる）。
 */
export const liveSlugOf = (slug: string) => MERGED_OF[slug] ?? slug;

/** ★速報を出す県の一覧（47件）。`/live` の索引が使う */
export const livePrefectures = () => LIVE_PREFECTURES;

/**
 * ★★★**夏だけ「北北海道・南北海道」「東東京・西東京」で呼ぶ**（2026-09-05。運営者の指示）。
 *
 * **出典の作りがそのとおりになっている**（`/pasts` を開いて確かめた）:
 *
 *     春季北海道高校野球大会 / 秋季北海道高等学校野球大会        ← 県で1つ
 *     第107回全国高等学校野球選手権 南北海道大会 / 北北海道大会   ← 夏だけ2つ
 *     春季東京都高等学校野球大会 / 秋季東京都高等学校野球大会
 *     第107回…選手権大会 西東京大会 / 東東京大会
 *
 * ★**盤に出ている大会名から決める。** 月では決めない（雨天順延で季節はずれる）。
 * ★**当てはまらなければ県名のまま**（推測で割らない）。
 */
function boardName(fallback: string, tournament: string | null): string {
  const t = tournament ?? "";
  for (const n of ["北北海道", "南北海道", "東東京", "西東京"]) if (t.includes(n)) return n;
  return fallback;
}

/* ------------------------------------------------------------------ */

/**
 * 県ごとの速報板（`<host>.hsbflash.jp/`）。
 *
 *     <li class="game_item">
 *       <p class="school_name_1">茅ヶ崎北陵</p>
 *       <td class="status">〔8回裏〕</td>
 *       <td class="school_score">2</td> … <td class="school_score">6</td>
 *       <td class="place">大和 09:30</td>
 *       <p class="school_name_2">希望ケ丘</p>
 *       <a href="/flash/<token>">詳細</a>
 *
 * ★**未開始の試合は得点が空で、詳細のリンクも無い**（`〔&nbsp;〕`）。**0対0にしない。**
 */
export async function fetchLiveBoard(slug: string): Promise<LiveBoard | null> {
  const pref = LIVE_PREFECTURES.find((p) => p.slug === slug);
  if (!pref) return null;
  const html = await get(`https://${slug}.hsbflash.jp/`);
  if (!html) return null;

  const games: LiveGame[] = [];
  for (const m of html.matchAll(/<li class="game_item">([\s\S]*?)<\/li>/g)) {
    const item = m[1];
    const first = plain(/<p class="school_name_1">([\s\S]*?)<\/p>/.exec(item)?.[1] ?? "");
    const third = plain(/<p class="school_name_2">([\s\S]*?)<\/p>/.exec(item)?.[1] ?? "");
    if (!first || !third) continue;
    const scores = [...item.matchAll(/<td class="school_score">([\s\S]*?)<\/td>/g)].map((s) =>
      plain(s[1]),
    );
    const num = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : null);
    const status = plain(/<td class="status"[^>]*>([\s\S]*?)<\/td>/.exec(item)?.[1] ?? "").replace(
      /^〔|〕$/g,
      "",
    );
    games.push({
      token: /href="\/flash\/([^"]+)"/.exec(item)?.[1] ?? null,
      first,
      third,
      scoreFirst: num(scores[0]),
      scoreThird: num(scores[1]),
      status,
      finished: status.includes("試合終了"),
      playing: /回[表裏]/.test(status),
      place: plain(/<td class="place"[^>]*>([\s\S]*?)<\/td>/.exec(item)?.[1] ?? "") || null,
    });
  }
  const tournament = plain(/<p class="games_name">([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "") || null;
  return {
    slug,
    // ★**夏だけ「北北海道」「東東京」などになる**（`boardName` を読むこと）
    name: boardName(pref.name, tournament),
    day: plain(/<span class="game_day">([\s\S]*?)<\/span>/.exec(html)?.[1] ?? "") || null,
    tournament,
    games,
  };
}

/* ------------------------------------------------------------------ */

/**
 * 試合ごとのイニングスコア（`<host>.hsbflash.jp/flash/<token>`）。
 *
 * ★**イニングは15回ぶん＋合計の16個が2行**（先攻・後攻）。
 * ★**まだ来ていない回は空**（`&nbsp;`）。**0にしないこと。**
 * ★**`geme_state` は出典の綴りのまま**（`game` ではない）。直すと読めなくなる。
 */
export async function fetchLiveBoxScore(slug: string, token: string): Promise<LiveBoxScore | null> {
  if (!isLiveCovered(slug)) return null;
  // ★トークンは出典が作った鍵。**URLに入れる前に形を確かめる**（余計な経路を作らない）
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return null;
  const html = await get(`https://${slug}.hsbflash.jp/flash/${token}`);
  if (!html) return null;

  const one = (re: RegExp) => plain(re.exec(html)?.[1] ?? "") || null;
  /*
    ★★**合計の欄はクラスが違う**（`inning_score total`）。
    `class="inning_score"` の完全一致で拾うと**合計が1つも取れず、
    しかも15回目の得点を合計と取り違える**（実際にそうなった）。
  */
  const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map((m) =>
      [...m[1].matchAll(/<td class="inning_score( total)?">([\s\S]*?)<\/td>/g)].map((s) => ({
        total: Boolean(s[1]),
        text: plain(s[2]),
      })),
    )
    .filter((cells) => cells.length > 1);
  const names = [
    one(/<td class="team_name_1">([\s\S]*?)<\/td>/),
    one(/<td class="team_name_2">([\s\S]*?)<\/td>/),
  ];
  const num = (v: string) => (/^\d+$/.test(v) ? Number(v) : null);
  const teams = rows.slice(0, 2).map((cells, i) => ({
    name: names[i] ?? "",
    // ★**まだ来ていない回は空**（`&nbsp;`）。**0にしないこと**
    innings: cells.filter((c) => !c.total).map((c) => num(c.text)),
    total: num(cells.find((c) => c.total)?.text ?? ""),
  }));
  if (teams.length !== 2 || !teams[0].name || !teams[1].name) return null;

  return {
    tournament: one(/<h3 class="game_cate">([\s\S]*?)<\/h3>/),
    /*
      ★★**終わった試合はクラスが増える**（`geme_state geme_state_end`）。
      完全一致で拾うと**試合終了の表示だけが消える**（実際に消えた）。
      ★**合計の欄（`inning_score total`）と同じ罠。** この出典は状態でクラスを足す。
    */
    state: one(/<p class="geme_state[^"]*">([\s\S]*?)<\/p>/),
    date: one(/<p class="play_date">([\s\S]*?)<\/p>/),
    stadium: one(/<td class="stadium_name">([\s\S]*?)<\/td>/),
    playBall: one(/<td class="play_time_start">([\s\S]*?)<\/td>/),
    gameSet: one(/<td class="play_time_end">([\s\S]*?)<\/td>/),
    teams,
  };
}
