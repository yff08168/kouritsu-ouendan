import type { LiveBoard } from "@/lib/live/hsb";

/**
 * 速報ページのリード文を組み立てる。
 *
 * ------------------------------------------------------------------
 * ★★★**自動で出す文章は、持っているデータの並べ替えだけにする**（AGENTS.md）。
 * ★**盤に無いことは書かない。** 大会の位置づけも、勝敗の見通しも書かない。
 * ★★**同じ文が47枚並ぶと逆効果**（自動生成の薄いページと見なされる）ので、
 * **文を差し込むのではなく、その日の状態で段落の構成そのものが変わる**作りにしてある:
 *
 *     試合が無い日   … 1段落（大会が無い／今日は組まれていない）
 *     始まる前       … 開始時刻のいちばん早い試合まで書く
 *     試合中         … 何試合動いているかと、いちばん進んでいる回
 *     全部終わった   … 終わった試合数と、公立が絡んだ数
 *
 * ★**「公立が0」を書かない**（`0校が勝ちました` のような言い換えの敗戦数と同じ筋）。
 * ★**器は `LeadText`**（`school-lead.ts` などと同じ）。**組み立てをあちらに書かない。**
 */
export function buildLiveLead({
  board,
  name,
  publicCount,
}: {
  board: LiveBoard | null;
  /** 見出しに使う名前（夏は「北北海道」などになる） */
  name: string;
  /** 公立が絡む試合の数。**引けなかったときは null**（当て推量で0にしない） */
  publicCount: number | null;
}): string[] {
  if (!board) return [];

  const games = board.games;
  if (games.length === 0) {
    return [
      `${name}では、今日の試合が組まれていません。` +
        `大会が始まると、この画面に当日の全試合と経過が出ます。`,
    ];
  }

  const playing = games.filter((g) => g.playing);
  const finished = games.filter((g) => g.finished);
  const before = games.filter((g) => !g.playing && !g.finished);
  const day = board.day ? `${board.day}の` : "今日の";
  const where = board.tournament ? `${board.tournament}は、` : "";

  const out: string[] = [];

  /*
    ★**1段落目は「いま何が起きているか」。** 状態によって書き出しが変わる。
    ★**数は盤から数えたものだけ**（出典が書いていない見通しは書かない）。
  */
  if (playing.length > 0) {
    const deepest = playing
      .map((g) => ({ g, n: Number(/(\d+)回/.exec(g.status)?.[1] ?? 0) }))
      .sort((a, b) => b.n - a.n)[0];
    out.push(
      `${where}${day}${games.length}試合のうち${playing.length}試合が進行中です。` +
        (deepest.n > 0
          ? `いちばん進んでいるのは${deepest.g.first}と${deepest.g.third}の試合で、${deepest.g.status}です。`
          : "") +
        (finished.length > 0 ? `すでに${finished.length}試合が終わっています。` : ""),
    );
  } else if (finished.length === games.length) {
    out.push(
      `${where}${day}${games.length}試合はすべて終わりました。` +
        `試合を選ぶと、イニングごとの得点が見られます。`,
    );
  } else if (finished.length > 0) {
    out.push(
      `${where}${day}${games.length}試合のうち${finished.length}試合が終わり、` +
        `残り${before.length}試合はこれからです。`,
    );
  } else {
    const first = before.map((g) => g.place ?? "").find((p) => /\d{1,2}:\d{2}/.test(p));
    out.push(
      `${where}${day}${games.length}試合はこれから始まります。` +
        (first ? `いちばん早い試合は${first}から。` : ""),
    );
  }

  /*
    ★**公立の数は「あるときだけ」書く**（0のときは書かない）。
    このサイトの切り口が公立なので、**何試合が公立の試合なのか**は出す値がある。
  */
  if (publicCount != null && publicCount > 0) {
    out.push(
      `このうち${publicCount}試合に、公立・国立の高校が出ています。` +
        `校名が太字になっているのが、このサイトに載っている学校です。`,
    );
  }

  return out;
}
