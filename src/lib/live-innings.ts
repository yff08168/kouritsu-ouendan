import {
  fetchLiveBoard,
  fetchLiveBoxScore,
  isLiveCovered,
  liveSlugOf,
} from "@/lib/live/hsb";
import type { RegionalGame } from "@/lib/regional-results";

/**
 * ★★★**その日の試合の各回の得点を、速報から取ってくる**（2026-09-08。運営者から
 * 「こうなってしまうんだけど、スコアボードはないんだっけ？速報では出ているけど」）。
 *
 * ------------------------------------------------------------------
 * ★★ なぜ足りていなかったか
 *
 * **各回の得点の取り込みは1日1回（23時）**なので、
 * **その日に終わった試合は、夜まで生成物に入らない。**
 * ★**一方で速報は同じ試合の箱スコアをすでに出している。**
 * ★**画面には「出典が合計得点だけを出しているため」と書いていた** ——
 * **この試合についてはそれが事実でない。**
 *
 * ------------------------------------------------------------------
 * ★★**見に行くのは「今日の試合」だけ。**
 *
 * **試合は7万件以上ある。** 古い試合まで速報を叩きに行くと、
 * **開かれるたびに出典へ1〜2リクエスト**することになる。
 * ★**速報の盤はその日のぶんしか持っていない**ので、そもそも当たらない。
 *
 * ------------------------------------------------------------------
 * ★★★**取り違えるくらいなら出さない**（取り込みのスクリプトと同じ構え）。
 *
 * **両校名と両方の得点で照合し、1件に決まらなければ何も返さない。**
 * ★**得点は完全一致**（同じ日に同じ顔合わせが2試合ある紙がある）。
 * ★**校名は書き方が出典で違う**ので部分一致まで許す（連盟「広島商」／速報「広島商業」）。
 */
export async function findLiveInnings(
  districtSlug: string,
  game: RegionalGame,
): Promise<number[][] | null> {
  if (!game.date || game.date !== todayInJapan()) return null;
  const slug = liveSlugOf(districtSlug);
  if (!isLiveCovered(slug)) return null;

  const board = await fetchLiveBoard(slug).catch(() => null);
  if (!board) return null;

  const want = game.teams.map((t) => ({ name: t.display, score: t.score }));
  if (want.length !== 2) return null;

  const hits = board.games.filter(
    (g) =>
      g.token &&
      (pairMatches(want, [g.first, g.scoreFirst], [g.third, g.scoreThird]) ||
        pairMatches(want, [g.third, g.scoreThird], [g.first, g.scoreFirst])),
  );
  // ★**1件に決まるときだけ**（当て推量で別の試合の得点を貼らない）
  if (hits.length !== 1) return null;

  const box = await fetchLiveBoxScore(slug, hits[0].token!).catch(() => null);
  if (!box || box.teams.length !== 2) return null;

  /*
    ★★**盤とこちらで先攻・後攻の並びが同じとは限らない**ので、
    **箱スコアの側の校名で並べ直す。**
    ★**合計が食い違ったら出さない**（読み違えているということ）。
  */
  const ordered = game.teams.map((t) =>
    box.teams.find((b) => sameSchool(b.name, t.display)),
  );
  if (ordered.some((b) => !b)) return null;
  if (ordered.some((b, i) => b!.total !== game.teams[i].score)) return null;

  const innings = ordered.map((b) =>
    b!.innings.filter((n): n is number => n !== null),
  );
  // ★**各回の和が合計と合うことまで確かめる**（取り込みのスクリプトと同じ検算）
  if (innings.some((row, i) => row.reduce((a, b) => a + b, 0) !== game.teams[i].score)) {
    return null;
  }
  return innings;
}

/** 日本時間の「今日」（`2026-09-08`）。★**サーバーはUTCで動いている** */
function todayInJapan(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** 校名は書き方が出典で違うので、どちらかがもう一方を含めば同じとみなす */
function sameSchool(a: string, b: string): boolean {
  const x = a.replace(/[\s　]+/g, "");
  const y = b.replace(/[\s　]+/g, "");
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

function pairMatches(
  want: { name: string; score: number }[],
  first: [string, number | null],
  second: [string, number | null],
): boolean {
  return (
    sameSchool(first[0], want[0].name) &&
    sameSchool(second[0], want[1].name) &&
    first[1] === want[0].score &&
    second[1] === want[1].score
  );
}
