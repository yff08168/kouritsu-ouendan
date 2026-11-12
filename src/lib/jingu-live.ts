/**
 * 開催中の明治神宮大会（高校の部）の特設ページ（`/jingu/<年>`）が読むデータ。
 *
 * ------------------------------------------------------------------
 * ★★ 生成物にしない。**描くときに主催者のページを取りに行く**
 *
 *   終わった大会は `scripts/build-jingu-games.mjs` が `jingu-games.json` に書き出す
 *   （検算つき）。**開催中はそれを待てない** —— 取得 → コミット → 再ビルドは
 *   ビルドだけで約20分かかり、5日間の大会が終わってしまう。
 *   だから試合速報（`src/lib/live/hsb.ts`）と同じ作りにして、
 *   **`fetch` の `next.revalidate` を秒で回す。**
 *
 *   ★★**`cache: "force-cache"` を必ず書く。** この版の Next は fetch を既定でキャッシュしない
 *   （AGENTS.md「この版の Next は fetch を既定でキャッシュしない」）。
 *   ★★**打ち切りに `signal` を使わない**（キャッシュとメモ化が両方外れる）。`Promise.race` で待つ。
 *   ★★**ページを `force-dynamic` にしないこと**（見ている人の数だけサーバーが動く。
 *   2026-09-10 にそれでサイトが止まった）。ISR で、費用は時間で頭打ちにする。
 *
 * ★★**検算は付けていない。** 主催者の表示をそのまま映す（取りに行くたびに試合が増える）。
 *   終わった大会は、いつもの生成物（検算A・B・C つき）に入った時点で
 *   `/jingu/<年>` が通常の大会ページに替わる（`findJinguTournament` が先に当たる）。
 *
 * ★**出典は公益財団法人 日本学生野球協会（大会の主催者）。**
 *   取るのは校名・日付・回戦・得点だけ（`build-jingu-games.mjs` と同じ線）。
 * ★**大学の部は読まない。** 同じ日程表に並ぶので、見出しの区切りを持って読む。
 */

/*
  ★★**ここで `national-tournaments` や `jingu-games` を読まないこと。** どちらも甲子園の生成物
  （`koshien-games.json`・2.5MB）を連れてくる。**この関数はトップが呼ぶ**ので、
  トップのサーバー側の束に2.5MBが増える。**「その年の大会が生成物に入ったか」には
  年の一覧だけが要る**ので、小さい神宮のJSON（64KB）を直接読む。
*/
import jinguRaw from "@/lib/data/jingu-games.json";

/** 生成物（`jingu-games.json`）にその年の大会が入っているか */
const hasGeneratedYear = (year: number): boolean =>
  (jinguRaw as { year: number }[]).some((g) => g.year === year);

const BASE = "https://www.student-baseball.or.jp";
const UA = "kouritsu-ouendan/1.0 (+https://kouritsu-ouendan.com)";
const TIMEOUT_MS = 8000;

/** 日程・結果は5分。出場校と開催要項は大会中に変わらないので1時間 */
const SCHEDULE_REVALIDATE = 300;
const STATIC_REVALIDATE = 3600;

const WEEKDAYS = "月火水木金土日";

export type JinguLiveEntrant = {
  /** 「関東地区」 */
  zone: string;
  /** 「横浜高校」。出典の表記のまま */
  name: string;
  /** 「神奈川県」 */
  pref: string;
  /** 「2年ぶり5回目」「初出場」 */
  history: string;
  debut: boolean;
};

export type JinguLiveGame = {
  month: number;
  day: number;
  /** 「木」 */
  weekday: string;
  /** その日の何試合目か（高校の部の中で） */
  order: number;
  /** 「8:30」。出典に無ければ null */
  time: string | null;
  /** 「1回戦」「準決勝」「決勝」 */
  round: string;
  /** 出場校が決まっていなければ null */
  teams: [string | null, string | null];
  /** 得点（試合が始まっていなければ null） */
  scores: [number, number] | null;
  /** 出典が書いている状況（「中止」など）。無ければ null */
  note: string | null;
};

export type JinguLive = {
  year: number;
  /** 「明治神宮外苑創建百年記念 第五十七回 明治神宮野球大会」など。取れなければ null */
  officialName: string | null;
  /** 「第57回」 */
  no: string | null;
  /** 「11月19日(木)〜24日(火)」。取れなければ null */
  period: string | null;
  venue: string | null;
  entrants: JinguLiveEntrant[];
  games: JinguLiveGame[];
};

// ---------------------------------------------------------------------
// 取得

async function fetchPage(url: string, revalidate: number): Promise<string | null> {
  const load = async (): Promise<string | null> => {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      cache: "force-cache",
      next: { revalidate },
    });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    const head = new TextDecoder("latin1").decode(buf.slice(0, 1500));
    const charset = head.match(/charset=["']?([\w-]+)/i)?.[1] ?? "utf-8";
    return new TextDecoder(charset).decode(buf);
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

const flatten = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** 校名の空白・全角を整える（出典は表記が揃っているので最小限） */
const cleanName = (s: string): string => s.normalize("NFKC").replace(/\s+/g, "").trim();

// ---------------------------------------------------------------------
// 解析（純粋な関数。取得とは分けてある）

/**
 * 出場校一覧（`teams.php`）。
 *
 *   `北海道地区 北海高校 北海道 3年ぶり5回目 東北地区 仙台育英学園高校 宮城県 …`
 *
 * ★**大学の部の行は拾わない。** 大学は「中国地区大学」のように「地区」の直後が空白でないので
 * この形に当たらない（`地区\s+` を要求している）。
 */
export function parseEntrants(html: string): JinguLiveEntrant[] {
  const text = flatten(html);
  const re =
    /(北海道|東北|関東|東京|北信越|東海|近畿|中国|四国|九州)地区\s+(\S+)\s+(\S+)\s+(初出場|\d+年ぶり\d+回目|\d+年連続\d+回目|\d+回目)/g;
  const seen = new Set<string>();
  const out: JinguLiveEntrant[] = [];
  for (const m of text.matchAll(re)) {
    const zone = `${m[1]}地区`;
    if (seen.has(zone)) continue;
    seen.add(zone);
    out.push({
      zone,
      name: cleanName(m[2]),
      pref: m[3],
      history: m[4],
      debut: m[4] === "初出場",
    });
  }
  return out;
}

/**
 * 日程と結果（`schedule.php`）。**高校の部だけ。**
 *
 * ★**区切りと試合を同じ順番で拾う。** 日付・「高校／大学」の見出し・試合の頭を
 * 1つの正規表現で流し、**どの試合がどの見出しの下にあるか**を順番だけで決める
 * （`build-jingu-games.mjs` と同じ考え方）。
 *
 * ★**高校・大学の見出しは、本文に流す前に目印へ置き換える。** 校名の中に
 * 「高校」「大学」の字が入る学校があっても、見出しと取り違えないため。
 *
 * 試合の本文は4通りある:
 *   `仙台育英高 - 鹿児島城西高`   … まだ（出場校は決まっている）
 *   `横浜高 -`／`- 京都国際高`    … まだ（片方が未定）
 *   `英明高 5 - 2 帝京長岡高 詳細` … 終わった（または途中）
 */
export function parseSchedule(html: string): JinguLiveGame[] {
  const marked = html.replace(
    /(>)[\s　]*(高校|大学)[\s　]*(<\/div>)/g,
    "$1@@$2@@$3",
  );
  const text = flatten(marked);

  const re = new RegExp(
    String.raw`(\d{1,2})\/(\d{1,2})\(([${WEEKDAYS}])\)の試合|@@(高校|大学)@@|第(\d+)試合\s*(\d{1,2}:\d{2})?\s*\[([^\]]+)\]`,
    "g",
  );
  const marks = [...text.matchAll(re)];

  const games: JinguLiveGame[] = [];
  let date: { month: number; day: number; weekday: string } | null = null;
  let section: string | null = null;

  marks.forEach((m, i) => {
    if (m[1]) {
      date = { month: Number(m[1]), day: Number(m[2]), weekday: m[3] };
      return;
    }
    if (m[4]) {
      section = m[4];
      return;
    }
    // ★大学の部は取らない
    if (section !== "高校" || !date) return;

    const start = (m.index ?? 0) + m[0].length;
    const end = marks[i + 1]?.index ?? text.length;
    const body = text
      .slice(start, end)
      // 最後の試合の本文には、ページの末尾（問い合わせ先など）が続いてしまう
      .split(/お問い合わせ|©/)[0]
      .trim();

    const b = body.match(
      /^(?:([^\s\d\-−–][^\s]*)\s+)?(?:(\d+)\s*[-−–]\s*(\d+)|[-−–])(?:\s+([^\s]+))?\s*(.*)$/,
    );
    if (!b) return;

    const note = b[5].replace(/詳細/g, "").trim();
    games.push({
      month: date.month,
      day: date.day,
      weekday: date.weekday,
      order: Number(m[5]),
      time: m[6] ?? null,
      round: m[7].trim(),
      teams: [b[1] ? cleanName(b[1]) : null, b[4] ? cleanName(b[4]) : null],
      scores: b[2] !== undefined && b[3] !== undefined ? [Number(b[2]), Number(b[3])] : null,
      note: note || null,
    });
  });
  return games;
}

/**
 * 開催要項（大会名・期間・会場）。**取れなければ項目ごと null**
 * （画面はその項目を出さないだけ）。
 *
 * ★**「開会式」「組合せ抽選」の日付は読まない。** 主催者の開催要項は
 * 前の年の文面が残っていることがあり、曜日と日付が合わない行がある（2026年版で確認）。
 * 期間と会場だけが、日程表と突き合わせて合っている。
 */
export function parseOutline(html: string): {
  officialName: string | null;
  no: string | null;
  period: string | null;
  venue: string | null;
} {
  const text = flatten(html);
  const name = text.match(/名称\s+(.+?)\s+主催/)?.[1]?.trim() ?? null;
  // ★開催要項の「名称」は漢数字（第五十七回）。回数は出場校のページ（第57回）から読む
  const no = text.match(/第(\d+)回\s*明治神宮野球大会/)?.[1] ?? null;
  const period = text.match(
    new RegExp(
      String.raw`期間\s+令和\d+年(\d{1,2})月(\d{1,2})日\(([${WEEKDAYS}])\)\s*[〜～~]\s*(\d{1,2})日\(([${WEEKDAYS}])\)`,
    ),
  );
  const venue = text.match(/会場\s+(\S*野球場)/)?.[1] ?? null;
  return {
    officialName: name,
    no: no ? `第${no}回` : null,
    period: period ? `${period[1]}月${period[2]}日(${period[3]})〜${period[4]}日(${period[5]})` : null,
    venue,
  };
}

// ---------------------------------------------------------------------
// 画面が使う判定

/**
 * 試合が終わったか。
 *
 * ★★**得点が出ていても、途中かもしれない。** 主催者の表は途中経過も同じ形で出し、
 * 終了の印を持っていない（`詳細` のリンクは途中でも付くことがある）。
 * 勝者の印は**開始から3時間たった試合にだけ**付ける（高校野球の1試合は2時間前後）。
 * ★**得点そのものは、途中でもそのまま出す。** 隠すと「始まっているのに何も出ない」になる。
 * ★**出典が「中止」「ノーゲーム」などを書いているときは終わった扱いにしない。**
 */
export function isFinished(game: JinguLiveGame, year: number, now: Date): boolean {
  if (!game.scores || game.note) return false;
  const [hh, mm] = (game.time ?? "0:0").split(":").map(Number);
  // 日本時間（UTC+9）の開始時刻
  const startsAt = Date.UTC(year, game.month - 1, game.day, (hh || 0) - 9, mm || 0);
  return now.getTime() >= startsAt + 3 * 60 * 60 * 1000;
}

/**
 * 特設ページを出す年。**出さないときは null。**
 *
 * ★**日付だけで決める**（取りに行かない）。`/jingu` の案内と sitemap がここを使うが、
 * どちらも**ページの作り直しの間隔を縮めたくない**（sitemap は2MBあり、
 * 5分ごとの作り直しにすると枠を食う。AGENTS.md「公立旋風を5分にしたら…」）。
 * ★**窓は10月下旬〜12月上旬。** 出場校が決まるのは秋の地区大会が終わる10月下旬で、
 * 大会は11月。窓の外では `/jingu/<年>` は今までどおり404になる。
 */
export function jinguFeatureYear(now: Date = new Date()): number | null {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const month = jst.getUTCMonth() + 1;
  const day = jst.getUTCDate();
  const inWindow = (month === 10 && day >= 20) || month === 11 || (month === 12 && day <= 10);
  return inWindow ? jst.getUTCFullYear() : null;
}

/**
 * 案内（トップのバナーなど）を出す年。**出さないときは null。**
 *
 * `jinguFeatureYear` に加えて、**その年の大会が生成物（`jingu-games.json`）に入ったら出さない**
 * （その年の `/jingu/<年>` は通常の大会ページに替わっており、終わった大会を「特設」と呼ばない）。
 * ★**日付と生成物だけで決める**（主催者のページは取りに行かない。理由は `jinguFeatureYear`）。
 */
export function jinguAnnounceYear(now: Date = new Date()): number | null {
  const year = jinguFeatureYear(now);
  return year !== null && !hasGeneratedYear(year) ? year : null;
}

/**
 * その年の特設ページのデータ。**出せないときは null**（ページ側で404にする）。
 *
 * ★**今年の窓の中の年しか取りに行かない。** `/jingu/2030` のような任意のURLで
 * 主催者のサイトを叩かせないため。
 * ★**出場校か日程のどちらかが空なら null。** 半分だけ出さない
 * （組み合わせの発表前に「出場校 0 校」のページを検索エンジンに見せない）。
 */
export async function getJinguLive(year: number): Promise<JinguLive | null> {
  if (jinguFeatureYear() !== year) return null;

  const [teamsHtml, scheduleHtml, outlineHtml] = await Promise.all([
    fetchPage(`${BASE}/system/prog/teams.php?m=pc&e=jingu&s=${year}&k=all`, STATIC_REVALIDATE),
    fetchPage(
      `${BASE}/system/prog/schedule.php?m=pc&k=all&e=jingu&s=${year}`,
      SCHEDULE_REVALIDATE,
    ),
    fetchPage(`${BASE}/game/jingu/${year}/${year}jingu.html`, STATIC_REVALIDATE),
  ]);
  if (!teamsHtml || !scheduleHtml) return null;

  const entrants = parseEntrants(teamsHtml);
  const games = parseSchedule(scheduleHtml);
  if (entrants.length === 0 || games.length === 0) return null;

  const outline = outlineHtml
    ? parseOutline(outlineHtml)
    : { officialName: null, no: null, period: null, venue: null };
  const no = flatten(teamsHtml).match(/第(\d+)回\s*明治神宮野球大会/)?.[1];

  return { year, ...outline, no: outline.no ?? (no ? `第${no}回` : null), entrants, games };
}

// ---------------------------------------------------------------------
// リード文（持っているデータの並べ替えだけ。AGENTS.md「自動で出す文章」）

/** 「11月19日(木)」 */
export const dayLabel = (g: { month: number; day: number; weekday: string }): string =>
  `${g.month}月${g.day}日(${g.weekday})`;

/**
 * ★**データに無いことは書かない。** 公立の有無は「学校マスタに収録されているか」で言う
 * （収録していない学校を「私立」と言い切らない）。
 * ★**優勝校は、決勝が終わったと判断できるときだけ**書く。
 */
export function buildJinguLiveLead(input: {
  live: JinguLive;
  /** 出場校のうち学校マスタに公立として当たった校名 */
  publicNames: string[];
  now: Date;
}): string[] {
  const { live, publicNames, now } = input;
  const out: string[] = [];

  const when = live.period ? `${live.period}の日程で、` : "";
  const where = live.venue ? `${live.venue}で` : "";
  out.push(
    `${live.no ? `${live.no}` : ""}明治神宮野球大会 高校の部は、${when}${where}開かれます。` +
      `出場するのは秋の地区大会を勝ち抜いた${live.entrants.length}校です。`,
  );

  const debut = live.entrants.filter((e) => e.debut).map((e) => e.name);
  if (debut.length > 0) {
    out.push(`神宮大会の初出場は${debut.join("、")}です。`);
  }

  if (publicNames.length === 0) {
    out.push(
      `出場${live.entrants.length}校のうち、公立・国立・高専として学校マスタに収録されている学校はありません。` +
        "このページでは、日程と結果、過去の神宮大会に出場した公立高校を並べています。",
    );
  } else {
    out.push(`出場校のうち、公立は${publicNames.join("、")}です。`);
  }

  const final = live.games.find((g) => g.round === "決勝");
  if (final && final.scores && final.teams[0] && final.teams[1] && isFinished(final, live.year, now)) {
    const [a, b] = final.scores;
    if (a !== b) {
      const win = a > b ? 0 : 1;
      out.push(
        `決勝は${final.teams[win]}が${Math.max(a, b)}対${Math.min(a, b)}で${final.teams[1 - win]}を下しました。`,
      );
    }
  }
  return out;
}
