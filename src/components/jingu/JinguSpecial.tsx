import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ListOrdered, Trophy, Users } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { SectionHeading } from "@/components/common/SectionHeading";
import { LeadText } from "@/components/common/LeadText";
import { GuideLinkBox } from "@/components/guide/GuideLinkBox";
import { AdSlot } from "@/components/ads/AdSlot";

import {
  buildJinguLiveLead,
  dayLabel,
  isFinished,
  type JinguLive,
  type JinguLiveGame,
} from "@/lib/jingu-live";
import { jinguPrefectureOf } from "@/lib/jingu-games";
import {
  entrantCallName,
  finalists,
  listJinguTournaments,
  publicEntrants,
} from "@/lib/national-tournaments";
import { getSchoolNameIndex } from "@/lib/queries/schools";
import type { SchoolNameRef } from "@/lib/school-name-index";

/**
 * 開催中の明治神宮大会（高校の部）の特設ページ。**`/jingu/<年>`**。
 *
 * ★**終わった大会の `/jingu/<年>`（`[year]/page.tsx` の通常ページ）とURLが同じ。**
 * 生成物（`jingu-games.json`）にその年が入ると通常ページが先に当たり、
 * このページは自然に役目を終える（`findJinguTournament` を先に見ている）。
 *
 * ★★**このサイトの主語は公立高校。** 出場校がすべて私立の年もある（2026年がそう）ので、
 * 「出場校に公立はいない」と**データから言い切れる形で書く**（学校マスタに収録されていないこと。
 * 私立と断定しない）うえで、**過去の神宮大会に出た公立校**を並べて、
 * 公立の目で見る入口を残してある。
 */

const nf = new Intl.NumberFormat("ja-JP");

export function jinguSpecialMetadata(live: JinguLive): Metadata {
  const title = `${live.year}年 明治神宮大会（高校の部）の組み合わせ・日程・結果`;
  const where = [live.period, live.venue].filter(Boolean).join("・");
  const description = [
    `${live.no ?? ""}明治神宮野球大会 高校の部${where ? `（${where}）` : ""}の`,
    `出場${live.entrants.length}校と、日程・結果をまとめています。`,
    "過去の神宮大会に出場した公立高校の成績も見られます。",
  ].join("");
  return {
    title,
    description,
    alternates: { canonical: `/jingu/${live.year}` },
    openGraph: { type: "article", title: `${title}｜公立応援団`, description },
  };
}

/**
 * 出場校を学校マスタで引く。**出典は「宮城県」のように県の語尾を付けて書く**ので、
 * そのままと、語尾を落とした形の両方で引く（北海道はそのまま）。
 * ★引けなければ null（私立・収録していない学校）。当て推量で結び付けない。
 */
function resolveEntrant(
  find: (display: string, pref?: string) => SchoolNameRef | null,
  name: string,
  pref: string,
): SchoolNameRef | null {
  return find(name, pref) ?? find(name, pref.replace(/[都府県]$/, ""));
}

function TeamCell({
  name,
  score,
  won,
  side,
}: {
  name: string | null;
  score: number | null;
  won: boolean;
  side: "left" | "right";
}) {
  return (
    <span
      className={
        side === "left"
          ? "flex min-w-0 flex-1 items-baseline justify-end gap-2 text-right"
          : "flex min-w-0 flex-1 items-baseline gap-2"
      }
    >
      {side === "left" && (
        <span className={`min-w-0 truncate text-sm ${won ? "font-bold text-navy-800" : "text-ink"}`}>
          {name ?? <span className="text-ink-faint">未定</span>}
        </span>
      )}
      <span
        className={`w-5 shrink-0 text-center text-base tabular-nums ${
          won ? "font-bold text-accent-800" : "text-ink"
        }`}
        aria-hidden={score === null}
      >
        {score ?? ""}
      </span>
      {side === "right" && (
        <span className={`min-w-0 truncate text-sm ${won ? "font-bold text-navy-800" : "text-ink"}`}>
          {name ?? <span className="text-ink-faint">未定</span>}
        </span>
      )}
    </span>
  );
}

function GameRow({ game, year, now }: { game: JinguLiveGame; year: number; now: Date }) {
  const finished = isFinished(game, year, now);
  const [a, b] = game.scores ?? [null, null];
  const aWon = finished && a !== null && b !== null && a > b;
  const bWon = finished && a !== null && b !== null && b > a;
  return (
    <li className="py-3">
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
        <span className="font-bold text-navy-800">第{game.order}試合</span>
        {game.time && <span className="tabular-nums">{game.time}</span>}
        <span className="rounded border border-line px-1.5 py-px">{game.round}</span>
        {game.note && <span className="text-accent-800">{game.note}</span>}
        {game.scores && !finished && !game.note && (
          <span className="text-accent-800">試合中の場合があります</span>
        )}
      </p>
      <p className="mt-1.5 flex items-baseline gap-2">
        <TeamCell name={game.teams[0]} score={a} won={aWon} side="left" />
        <span className="shrink-0 text-xs text-ink-faint">{game.scores ? "−" : "vs"}</span>
        <TeamCell name={game.teams[1]} score={b} won={bWon} side="right" />
      </p>
    </li>
  );
}

export async function JinguSpecial({ live }: { live: JinguLive }) {
  const now = new Date();
  const index = await getSchoolNameIndex("jingu");
  const find = (display: string, pref?: string) => index.find(display, pref);
  /*
    ★**神宮の出典は県を書いていない**ので、過去の大会は甲子園の生成物から借りた県で引く
    （`jinguPrefectureOf`。県が1つに決まる校名だけ借りる）。今年の出場校は県が分かっている。
  */
  const resolvePast = (display: string, pref?: string) =>
    index.find(display, pref ?? jinguPrefectureOf(display));

  const entrants = live.entrants.map((e) => ({
    ...e,
    school: resolveEntrant(find, e.name, e.pref),
  }));
  const publicNames = entrants.filter((e) => e.school).map((e) => e.name);

  const lead = buildJinguLiveLead({ live, publicNames, now });

  // 日ごとにまとめる（順番は出典のまま）
  const days: { key: string; label: string; games: JinguLiveGame[] }[] = [];
  for (const g of live.games) {
    const key = `${g.month}-${g.day}`;
    const last = days.at(-1);
    if (last && last.key === key) last.games.push(g);
    else days.push({ key, label: dayLabel(g), games: [g] });
  }

  /*
    ★★**過去の神宮大会に出た公立高校。** 生成物（2013〜2025年）から、
    学校マスタに当たった学校を年ごとに並べる。**成績は紙に書いてある回戦の名前のまま**
    （`publicEntrants`。「ベスト4」のような言い換えをしない）。
  */
  const past = listJinguTournaments()
    .map((t) => ({ t, entrants: publicEntrants(t, resolvePast) }))
    .filter((x) => x.entrants.length > 0);

  const lastYear = listJinguTournaments()[0] ?? null;
  const lastFinal = lastYear ? finalists(lastYear) : null;

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[
          { label: "甲子園の記録", href: "/koshien" },
          { label: "明治神宮大会", href: "/jingu" },
          { label: `${live.year}年` },
        ]}
      />

      <header className="rounded-xl border border-line bg-white p-5 sm:p-7">
        <p className="text-sm font-bold text-accent-800">{live.year}年　秋</p>
        <h1 className="mt-1 text-xl font-bold text-navy-800 sm:text-2xl">
          {live.no ?? ""}明治神宮野球大会 高校の部
        </h1>
        <p className="mt-1 text-sm text-ink-muted">組み合わせ・日程・結果</p>
        <dl className="mt-4 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
          {live.period && (
            <>
              <dt className="text-ink-muted">期間</dt>
              <dd className="font-medium text-ink">
                {live.period}
                <span className="ml-1.5 text-xs text-ink-muted">（雨天順延）</span>
              </dd>
            </>
          )}
          {live.venue && (
            <>
              <dt className="text-ink-muted">会場</dt>
              <dd className="font-medium text-ink">{live.venue}</dd>
            </>
          )}
          <dt className="text-ink-muted">出場校</dt>
          <dd className="font-medium text-ink">
            {live.entrants.length}校
            {publicNames.length > 0 && (
              <span className="ml-1.5 text-accent-800">（公立 {publicNames.length}校）</span>
            )}
          </dd>
        </dl>
      </header>

      <LeadText paragraphs={lead} />

      <GuideLinkBox className="mt-4" slugs={["senbatsu-selection"]} />

      <section
        aria-labelledby="js-schedule"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="js-schedule"
          title="日程と結果"
          icon={<CalendarDays size={18} />}
          note="約5分ごとに更新"
        />
        <div className="mt-3 space-y-5">
          {days.map((d) => (
            <div key={d.key}>
              <h3 className="border-b border-line pb-1.5 text-sm font-bold text-navy-800">
                {d.label}
              </h3>
              <ul className="divide-y divide-line">
                {d.games.map((g) => (
                  <GameRow key={`${g.month}-${g.day}-${g.order}`} game={g} year={live.year} now={now} />
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-ink-muted">
          {"出場校が決まっていない試合は「未定」と出ます。勝ち上がりに合わせて、大会主催者の発表のとおりに入れ替わります。" +
            "得点が出ていても試合の途中のことがあるため、勝った学校の印は試合の開始から3時間たってから付けています。"}
        </p>
      </section>

      <AdSlot slot="sidebar" />

      <section
        aria-labelledby="js-entrants"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="js-entrants"
          title={`出場${live.entrants.length}校`}
          icon={<Users size={18} />}
          note="秋の地区大会の代表"
        />
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {entrants.map((e) => {
            const body = (
              <>
                <span className="block text-xs text-ink-muted">
                  {e.zone}
                  {e.debut && (
                    <span className="ml-1.5 rounded border border-accent-500 px-1 align-middle text-[0.625rem] font-medium text-accent-800">
                      初出場
                    </span>
                  )}
                </span>
                <span
                  className={`block truncate text-sm font-bold ${
                    e.school ? "text-accent-800" : "text-navy-800"
                  }`}
                >
                  {e.name}
                </span>
                <span className="block text-xs text-ink-muted">
                  {e.pref}
                  <span className="ml-1.5">{e.history}</span>
                </span>
              </>
            );
            return (
              <li key={e.zone}>
                {e.school?.slug ? (
                  <Link
                    href={`/schools/${e.school.slug}`}
                    className="block min-h-11 rounded-lg border border-line px-3 py-2 hover:bg-navy-50"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="min-h-11 rounded-lg border border-line px-3 py-2">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-ink-muted">
          出場歴は大会主催者の発表のとおりです。学校ページにつながるのは、公立・国立・高専だけです。
        </p>
      </section>

      <section
        aria-labelledby="js-past"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="js-past"
          title="過去の神宮大会に出場した公立高校"
          icon={<Trophy size={18} />}
          moreHref="/jingu"
          moreLabel="大会一覧へ"
        />
        {past.length > 0 ? (
          <ul className="mt-3 divide-y divide-line border-t border-line">
            {past.map(({ t, entrants: list }) => (
              <li key={t.slug} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                <Link
                  href={`/jingu/${t.slug}`}
                  className="w-14 shrink-0 text-sm font-bold tabular-nums text-navy-800 underline decoration-line underline-offset-2 hover:text-accent-800"
                >
                  {t.year}年
                </Link>
                <span className="min-w-0 flex-1 text-sm text-ink">
                  {list.map((e, i) => (
                    <span key={e.slug ?? e.name}>
                      {i > 0 && "、"}
                      {e.slug ? (
                        <Link
                          href={`/schools/${e.slug}`}
                          className="font-bold text-accent-800 hover:underline"
                        >
                          {entrantCallName(e)}
                        </Link>
                      ) : (
                        <span className="font-bold text-accent-800">{entrantCallName(e)}</span>
                      )}
                      <span className="text-ink-muted">（{e.result}）</span>
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">
            収録している神宮大会に、公立高校の出場はありません。
          </p>
        )}
        <p className="mt-3 text-xs text-ink-muted">
          収録している{nf.format(listJinguTournaments().length)}大会のうち、学校マスタに公立・国立・高専として収録されている学校だけを並べています。
        </p>
      </section>

      {lastYear && (
        <section
          aria-labelledby="js-last"
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading id="js-last" title="前の大会" icon={<ListOrdered size={18} />} />
          <Link
            href={`/jingu/${lastYear.slug}`}
            className="mt-3 flex min-h-11 items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 hover:bg-navy-50"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{lastYear.name}</span>
              {lastFinal && (
                <span className="block truncate text-xs text-ink-muted">
                  優勝 {lastFinal.champion}
                </span>
              )}
            </span>
            <span className="shrink-0 text-xs text-ink-muted">{lastYear.games.length}試合</span>
          </Link>
        </section>
      )}

      <aside className="mt-4 rounded-xl border border-line bg-navy-50/60 p-4 text-[0.6875rem] leading-relaxed text-ink-muted">
        {"日程と結果・出場校は、大会の主催者（日本学生野球協会）が公開している情報を取り直して表示しています。" +
          "試合の最新の状況は主催者の公式ページでご確認ください。大学の部は収録していません。"}
      </aside>
    </Container>
  );
}
