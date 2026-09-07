import Link from "next/link";
import { ChevronRight, Radio } from "lucide-react";

import { cn } from "@/lib/utils";
import { splitPlace, type LiveBoard as Board, type LiveGame } from "@/lib/live/hsb";
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
  pref,
  stadiums,
  tournamentHref,
}: {
  board: Board;
  /** 公立かどうかを引く。**引けない校名は無印**（当て推量をしない） */
  index: SchoolNameIndex | null;
  /**
   * ★★★**校名を引く県**（2026-09-08。運営者から「橘高校は公立です。川崎市立橘高校」）。
   *
   * **県を渡さないと、同じ校名が全国に2つ以上ある学校を引けない** ——
   * `橘高校` は**福島・東東京・神奈川の3県にあり**、
   * `SchoolNameIndex` は「どれか分からない」として null を返す。
   * **川崎市立橘は公立なのに、盤で太字にならなかった。**
   *
   * ★**`prefectureKey` が 北北海道・南北海道 → 北海道、東東京・西東京 → 東京 に
   * そろえる**ので、速報の県の名前（`北海道` `東京`）をそのまま渡してよい。
   * ★★**県で引けなければ結び付けない**（全国に広げると県外の同名校に当たる。
   * AGENTS の「県大会で県外の学校に結び付けない」）。
   */
  pref: string;
  /**
   * ★**球場名の略称 → 正式名称**（`fetchStadiumNames`）。取れなければ null。
   * **盤の球場欄は略称1文字のことがある**（`メ` `県` `黒`）ので、下に対応表を出す。
   */
  stadiums: Map<string, string> | null;
  /**
   * ★**この大会のページ**（`/prefectures/<県>/<大会>`）。**無ければ null。**
   * 盤の大会名がそのままリンクになる（`src/lib/live-tournament.ts` が決める）。
   */
  tournamentHref?: string | null;
}) {
  const playing = board.games.filter((g) => g.playing).length;
  const finished = board.games.filter((g) => g.finished).length;

  /*
    ★★**正式名称は「表の下」に置く**（2026-09-07。運営者の指示
    「幅的に難しければ略称のままとし、正式名称を表下部に記載」）。

    ★**行の中に入れない** —— 2列にしたぶん行が狭く、
    **`いせはらサンシャイン・スタジアム` のような長い名前が校名の幅を食う。**
    **校名はこのサイトの主役**（AGENTS の「校名を切ってはいけない」）。
    ★**出すのはその日に使われている略称だけ**（対応表は他県ぶんまで並んでいることがある）。
    ★**並びは盤に出てくる順**（読む人が上から突き合わせられる）。
  */
  const used: { abbr: string; name: string }[] = [];
  if (stadiums) {
    for (const game of board.games) {
      const { abbr } = splitPlace(game.place);
      if (!abbr || abbr === "未") continue;
      const name = stadiums.get(abbr);
      if (!name || name === abbr) continue;
      if (!used.some((u) => u.abbr === abbr)) used.push({ abbr, name });
    }
  }

  return (
    <section aria-labelledby="live-board" className="rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="live-board" className="flex items-center gap-2 text-lg font-bold">
          <Radio size={18} className="text-accent-500" aria-hidden />
          {board.name}の速報
        </h2>
        {board.day && <p className="text-sm text-ink-muted">{board.day}</p>}
      </div>

      {/*
        ★★**大会名からその大会のページへ行けるようにする**（2026-09-08。運営者の指示
        「各都道府県の速報ページに、その大会のページに飛ぶリンクを設置したほうがよい」）。
        ★**リンクにするのは、その大会がこのサイトに載っているときだけ**
        （`findLiveTournamentHref` が決める）。**無いときは今までどおりただの文字。**
        ★**行き先は大会のページ**（トーナメント表と全試合）。県のページは下のリンクが持つ。
      */}
      {board.tournament &&
        (tournamentHref ? (
          <p className="mt-1 text-sm">
            <Link
              href={tournamentHref}
              className="inline-flex items-center gap-0.5 font-bold text-navy-800 underline"
            >
              {board.tournament}
              <ChevronRight size={14} aria-hidden />
            </Link>
          </p>
        ) : (
          <p className="mt-1 text-sm text-ink-muted">{board.tournament}</p>
        ))}
      <p className="mt-1 text-xs text-ink-faint">
        {board.games.length} 試合（試合中 {playing}・終了 {finished}）
      </p>

      {board.games.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">今日はこの県の試合がありません。</p>
      ) : (
        /*
          ★★**2列にする**（2026-09-07。運営者の指示）。
          ★**狭い画面では1列**（半分の幅に校名2つとスコアは入らない）。
          ★**列の区切りは余白だけ**（縦線は入れていない）——
          **行ごとに下線が引いてある**ので、縦線まで足すと枠が細かくなりすぎる。
          ★★**並びは「左の列を上から、次に右の列」ではなく、行ごとに左→右** ——
          **試合は開始時刻の順に並んでいる**ので、列で切ると読む順が時刻の順でなくなる。
          `grid` に流し込めば、そのまま左→右→次の行の順になる。
        */
        <ul className="mt-4 grid border-t border-line sm:grid-cols-2 sm:gap-x-5">
          {board.games.map((game, i) => (
            <li
              key={`${game.first}-${game.third}-${i}`}
              className="border-b border-line"
            >
              <GameRow slug={board.slug} game={game} index={index} pref={pref} />
            </li>
          ))}
        </ul>
      )}

      {/*
        ★**球場名の対応表**（2026-09-07。運営者の指示）。
        ★**その日に使われている略称だけ**を、盤に出てくる順で出す。
        ★**取れなければ何も出さない**（出典が対応表を出していない県がありうる）。
      */}
      {used.length > 0 && (
        <dl className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-faint">
          {used.map((u) => (
            <div key={u.abbr} className="flex gap-1.5">
              <dt className="font-bold">{u.abbr}</dt>
              <dd>{u.name}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* ★**出典は 2026-09-06 に画面から外した**（運営者の判断）。下の注記は残す */}
      <p className="mt-4 text-xs text-ink-faint">試合中は約1分ごとに取り直しています。</p>
    </section>
  );
}

function GameRow({
  slug,
  game,
  index,
  pref,
}: {
  slug: string;
  game: LiveGame;
  index: SchoolNameIndex | null;
  pref: string;
}) {
  const body = (
    <div className="flex items-center gap-3 py-2.5">
      <StatusChip game={game} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <TeamName name={game.first} index={index} pref={pref} />
          <Score value={game.scoreFirst} lead={isLead(game.scoreFirst, game.scoreThird)} />
          <span className="text-xs text-ink-faint">-</span>
          <Score value={game.scoreThird} lead={isLead(game.scoreThird, game.scoreFirst)} />
          <TeamName name={game.third} index={index} pref={pref} />
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
function TeamName({
  name,
  index,
  pref,
}: {
  name: string;
  index: SchoolNameIndex | null;
  pref: string;
}) {
  /*
    ★★**県まで渡して引く**（2026-09-08）。**渡さないと `橘` のような
    全国に2つ以上ある校名が「どれか分からない」で引けず、公立なのに無印になる。**
  */
  const ref = index?.find(name, pref) ?? null;
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
  /*
    ★★★**出典が何か書いていれば、それをそのまま出す**（2026-09-06。運営者から
    「9時30分の試合が開始前になっている」）。

    **福岡の3試合は出典が `〔中止〕` と刷っていた**のに、
    **こちらが「終了でも試合中でもない」を全部「開始前」に落としていた**ので、
    **22時になっても朝9時半の試合が「開始前」**と出ていた。
    ★**読み落としであって、出典の誤りではない**（`fukuoka.hsbflash.jp` を直接見て確かめた）。

    ★★**語を名指しで拾わないこと** —— いま見えているのは「中止」だけだが、
    **順延・ノーゲーム・継続試合など、他の書き方がありうる。**
    **「何か書いてあるならそれを出す」**にしておけば、どれが来ても画面に出る。
    ★**何も書いていないときだけ「開始前」**（それが本当に開始前の試合）。
  */
  if (game.status)
    return (
      <span className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[11px] font-bold text-ink-muted">
        {game.status}
      </span>
    );
  return (
    <span className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-faint">
      開始前
    </span>
  );
}
