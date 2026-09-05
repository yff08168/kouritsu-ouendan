import Link from "next/link";
import { ChevronRight, Radio } from "lucide-react";

import { cn } from "@/lib/utils";
import { LIVE_SOURCE, type LiveBoard as Board, type LiveGame } from "@/lib/live/hsb";
import type { SchoolNameIndex } from "@/lib/queries/schools";

/**
 * 県の速報板（`/live/<県>`）。
 *
 * ------------------------------------------------------------------
 * ★★**このカードだけが「いま」を出す。** 他のカード（`RegionalDistrictCard` など）は
 * **生成物**で、1日2回しか変わらない。**混ぜないこと。**
 *
 * ★**未開始の試合は得点を出さない**（`0 - 0` にしない）。出典も空にしてある。
 * ★**私立も出す。** 大会の姿を歪めないため。**公立には印を付けて、そこに目を向けさせる**
 * （AGENTS の「私立の戦績も引用し、着目するところを公立にする」と同じ構え）。
 */
export function LiveBoard({
  board,
  index,
}: {
  board: Board;
  /** 公立かどうかを引く。**引けない校名は無印**（当て推量をしない） */
  index: SchoolNameIndex | null;
}) {
  const playing = board.games.filter((g) => g.playing).length;
  const finished = board.games.filter((g) => g.finished).length;

  return (
    <section aria-labelledby="live-board" className="rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="live-board" className="flex items-center gap-2 text-lg font-bold">
          <Radio size={18} className="text-accent-500" aria-hidden />
          {board.name}の速報
        </h2>
        {board.day && <p className="text-sm text-ink-muted">{board.day}</p>}
      </div>

      {board.tournament && <p className="mt-1 text-sm text-ink-muted">{board.tournament}</p>}
      <p className="mt-1 text-xs text-ink-faint">
        {board.games.length} 試合（試合中 {playing}・終了 {finished}）
      </p>

      {board.games.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">今日はこの県の試合がありません。</p>
      ) : (
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {board.games.map((game, i) => (
            <li key={`${game.first}-${game.third}-${i}`}>
              <GameRow slug={board.slug} game={game} index={index} />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-ink-faint">
        出典:{" "}
        <a href={LIVE_SOURCE.url} className="underline" rel="noopener noreferrer" target="_blank">
          {LIVE_SOURCE.name}
        </a>
        （試合中は約1分ごとに取り直しています）
      </p>
    </section>
  );
}

function GameRow({
  slug,
  game,
  index,
}: {
  slug: string;
  game: LiveGame;
  index: SchoolNameIndex | null;
}) {
  const body = (
    <div className="flex items-center gap-3 py-2.5">
      <StatusChip game={game} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <TeamName name={game.first} index={index} />
          <Score value={game.scoreFirst} lead={isLead(game.scoreFirst, game.scoreThird)} />
          <span className="text-xs text-ink-faint">-</span>
          <Score value={game.scoreThird} lead={isLead(game.scoreThird, game.scoreFirst)} />
          <TeamName name={game.third} index={index} />
        </div>
        {/*
          ★**「未」だけの欄を出さない。** 球場も開始時刻も決まっていない試合で
          出典がそう書く（大阪の秋季で実際に出た）。**1文字だけ並ぶと読めない。**
        */}
        {game.place && game.place !== "未" && (
          <p className="mt-0.5 text-xs text-ink-faint">{game.place}</p>
        )}
      </div>
      {game.token && <ChevronRight size={16} className="shrink-0 text-ink-faint" aria-hidden />}
    </div>
  );

  /*
    ★**未開始の試合に詳細のリンクを張らない。** 出典が詳細を出しておらず、
    開いても空のイニング表になる。**押せないものにリンクの見た目を与えない**
    （`ResultsTicker` で決めた線と同じ）。
  */
  return game.token ? (
    <Link href={`/live/${slug}/${game.token}`} className="block hover:bg-navy-50">
      {body}
    </Link>
  ) : (
    body
  );
}

const isLead = (a: number | null, b: number | null) => a !== null && b !== null && a > b;

function Score({ value, lead }: { value: number | null; lead: boolean }) {
  // ★**未開始・未到達は空。** 0 と書くと「0点だった」と読めてしまう
  if (value === null) return <span className="w-6 text-center text-sm text-ink-faint">–</span>;
  return (
    <span className={cn("w-6 text-center text-base tabular-nums", lead ? "font-bold" : "font-medium")}>
      {value}
    </span>
  );
}

/**
 * ★**引けた校名＝このサイトが収録している学校＝公立**（学校マスタは私立を持たない）。
 * ★**引けない校名は無印のまま出す。** 当て推量で「私立」と書かない ——
 * **同じ県に同名が2校あるときも引けない**（`SchoolNameIndex` の説明）。
 */
function TeamName({ name, index }: { name: string; index: SchoolNameIndex | null }) {
  const ref = index?.find(name) ?? null;
  /*
    ★★★**校名を切らない**（AGENTS の決めごと。結果カードを2列にしたときに決めた）。
    **切ると `サレジオ学院` が `サレジ…` になる** ——
    **校名はこのサイトの主役**なので、行が2行になるほうを選ぶ。
  */
  return (
    <span className="min-w-0 flex-1 last:text-right">
      <span className={cn("text-sm", ref ? "font-bold" : "text-ink-muted")}>{name}</span>
    </span>
  );
}

function StatusChip({ game }: { game: LiveGame }) {
  if (game.finished)
    return (
      <span className="shrink-0 rounded bg-navy-100 px-1.5 py-0.5 text-[11px] font-bold text-navy-800">
        終了
      </span>
    );
  if (game.playing)
    return (
      <span className="shrink-0 rounded bg-accent-500 px-1.5 py-0.5 text-[11px] font-bold text-white">
        {game.status}
      </span>
    );
  return (
    <span className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-faint">
      開始前
    </span>
  );
}
