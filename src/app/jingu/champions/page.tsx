import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ExternalLink, Info, MapPin, ListOrdered, Trophy, Flag } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { SectionHeading } from "@/components/common/SectionHeading";
import { LeadText } from "@/components/common/LeadText";
import { AdSlot } from "@/components/ads/AdSlot";
import { KoshienStat } from "@/components/results/KoshienStat";
import { GuideLinkBox } from "@/components/guide/GuideLinkBox";

import {
  buildJinguChampionsLead,
  listJinguChampions,
  type ChampionSchool,
  type HeldRow,
  type TimelineRow,
} from "@/lib/jingu-champions";
import { JINGU_CHAMPIONS, JINGU_CHAMPIONS_SOURCE } from "@/lib/data/jingu-champions";
import { jinguFeatureYear } from "@/lib/jingu-live";
import type { Resolve } from "@/lib/koshien-public";
import { getSchoolNameIndex } from "@/lib/queries/schools";

/**
 * 明治神宮大会（高校の部）の歴代優勝校（`/jingu/champions`）。`/koshien/champions` の神宮版。
 *
 * ------------------------------------------------------------------
 * ★★ なぜ作ったか（2026-11-20。運営者の指示）
 *
 *   `/jingu/<年>` は全試合を持っている24大会（1999〜2025年）しか作れず、
 *   高校の部が始まった第4回（1973年）からの優勝校・準優勝校・決勝スコアと、
 *   地区別・都道府県別の優勝回数を1枚に並べた入口が無かった。
 *   組み立ては `src/lib/jingu-champions.ts`（出典の扱いと公立の引き方もそこに書いてある）。
 *
 * ★ 私立も公立も全部載せる（大会の記録は全部そろって初めて意味がある。大会ページと同じ）。
 *   **公立だけオレンジ**で、学校ページのある学校はそこにつながる。
 *   ★公立の判定は **`getSchoolNameIndex("koshien")`**（記事の校名は略称で、「商業→商」を寄せる規則が要る）。
 *   ★**`slug` が null の公立校（閉校して学校ページが無い）はオレンジのままリンクだけ張らない。**
 * ★ 索引が取れなくてもページを落とさない（`loadResolve`）。
 * ★ **主催者のページを取りに行かない**（取るとこのページが5分ごとの作り直しになる）。
 *   `revalidate = 3600`。**`force-dynamic` にしないこと。**
 *   開催中の年は、窓の間だけ特設ページ（`/jingu/<年>`）への入口を置く（日付だけで決める。`jinguFeatureYear`）。
 *   ★**その年の結果は Wikipedia の歴代結果に載るまでこのページに出ない**
 *   （大会が終わったら `npm run jingu-games` と `npm run jingu-champions` を回す。README）。
 * ★ タブ（JavaScript）にしない。一覧・地区別・都道府県別・公立は同じページに縦に並べ、上のリンクで飛ぶ。
 */
export const revalidate = 3600;

async function loadResolve(): Promise<Resolve | null> {
  try {
    const index = await getSchoolNameIndex("koshien");
    return (d, p) => index.find(d, p);
  } catch {
    return null;
  }
}

const TITLE = "明治神宮大会 高校の部 歴代優勝校・結果一覧｜準優勝校・決勝スコア・地区別の優勝回数";

export async function generateMetadata(): Promise<Metadata> {
  const data = listJinguChampions(await loadResolve());
  const description = buildJinguChampionsLead(data).slice(0, 2).join("");
  return {
    title: TITLE,
    description,
    alternates: { canonical: "/jingu/champions" },
    openGraph: { type: "website", title: `${TITLE}｜公立応援団`, description },
  };
}

export default async function JinguChampionsPage() {
  const data = listJinguChampions(await loadResolve());
  const lead = buildJinguChampionsLead(data);

  const oldest = data.rows.at(-1);
  /*
    ★**開催中の年の入口は日付の窓だけで決める**（主催者のページは取りに行かない）。
    その年の結果がこのページの表に入ったら出さない（表の1行になる）。
  */
  const windowYear = jinguFeatureYear();
  const featureYear =
    windowYear !== null && !JINGU_CHAMPIONS.some((c) => c.year === windowYear) ? windowYear : null;

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[
          { label: "甲子園の記録", href: "/koshien" },
          { label: "明治神宮大会", href: "/jingu" },
          { label: "歴代優勝校" },
        ]}
      />

      <header className="rounded-xl border border-line bg-white p-5 sm:p-7">
        <p className="text-sm font-bold text-accent-800">全国大会</p>
        <h1 className="mt-1 text-2xl font-bold text-navy-800 sm:text-3xl">
          <span className="whitespace-nowrap">明治神宮大会</span>
          <span className="whitespace-nowrap">（高校の部）の</span>
          <span className="whitespace-nowrap">歴代優勝校</span>
        </h1>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
          <KoshienStat label="収録した大会" value={`${data.rows.length}`} unit="大会" />
          {oldest && <KoshienStat label="最初の大会" value={`${oldest.entry.year}`} unit="年" />}
          {data.publicChampionCount > 0 && (
            <KoshienStat label="公立が優勝" value={`${data.publicChampionCount}`} unit="大会" accent />
          )}
          {data.publicRunnerUpCount > 0 && (
            <KoshienStat label="公立が準優勝" value={`${data.publicRunnerUpCount}`} unit="大会" accent />
          )}
        </dl>
        <nav aria-label="このページの中" className="mt-4">
          <ul className="flex flex-wrap gap-2 text-sm">
            <JumpLink href="#list" label="歴代の優勝校" />
            <JumpLink href="#regions" label="地区別の優勝回数" />
            <JumpLink href="#prefectures" label="都道府県別の優勝回数" />
            {data.publicRows.length > 0 && <JumpLink href="#public" label="公立高校の優勝・準優勝" />}
            <li>
              <Link
                href="/jingu"
                className="inline-flex min-h-11 items-center rounded-lg border border-accent-200 bg-accent-50 px-3 font-bold text-accent-800 hover:bg-accent-100"
              >
                大会ごとの全試合
              </Link>
            </li>
            <li>
              <Link
                href="/koshien/champions"
                className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-ink hover:bg-navy-50"
              >
                甲子園の歴代優勝校
              </Link>
            </li>
          </ul>
        </nav>
      </header>

      <LeadText paragraphs={lead} />

      {featureYear !== null && (
        /*
          ★**特設ページへの入口は日付の窓だけで決める**（`/jingu` と同じ。主催者のページは取りに行かない）。
        */
        <Link
          href={`/jingu/${featureYear}`}
          className="mt-4 flex min-h-11 items-center justify-between gap-3 rounded-xl border border-accent-500 bg-white px-4 py-3 hover:bg-navy-50"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-navy-800">
              {featureYear}年の大会　組み合わせ・日程・結果
            </span>
            <span className="block text-xs text-ink-muted">
              出場校と試合の結果を、大会の進み具合に合わせて載せています
            </span>
          </span>
          <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-accent-500" />
        </Link>
      )}

      <GuideLinkBox className="mt-4" slugs={["senbatsu-selection"]} />

      {/* ------- 歴代の優勝校 ------- */}
      <section
        id="list"
        aria-labelledby="jc-list"
        className="mt-4 scroll-mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading id="jc-list" title="歴代の優勝校" icon={<Trophy size={18} />} note="新しい順" />
        <ChampionTable rows={data.timeline} />
        <p className="mt-3 text-xs text-ink-faint">
          校名は出典の表記（略称）です。
          {data.cancelled.length > 0 &&
            `${data.cancelled.map((c) => `${c.year}年`).join("・")}は開催が中止されました。`}
        </p>
      </section>

      <AdSlot slot="sidebar" />

      {/* ------- 地区別 ------- */}
      <section
        id="regions"
        aria-labelledby="jc-regions"
        className="mt-4 scroll-mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading id="jc-regions" title="地区別の優勝回数" icon={<Flag size={18} />} note="多い順" />
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-muted">
                <th scope="col" className="py-1.5 pr-3 font-medium">地区</th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">優勝</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">優勝した県の内訳</th>
                <th scope="col" className="py-1.5 font-medium">直近の優勝</th>
              </tr>
            </thead>
            <tbody>
              {data.byRegion.map((r) => (
                <tr key={r.region} className="border-b border-line align-top last:border-0">
                  <td className="py-2 pr-3 whitespace-nowrap font-bold text-navy-800">{r.region}</td>
                  <td className="py-2 pr-3 text-right tabular-nums font-bold text-navy-800">{r.total}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-ink">
                    {r.prefectures.map((p, i) => (
                      <span key={p.name}>
                        {i > 0 && "・"}
                        {p.name}
                        <span className="tabular-nums text-ink-muted">{p.count}</span>
                      </span>
                    ))}
                  </td>
                  <td className="py-2 whitespace-nowrap text-ink">
                    {r.latest.entry.year}年 <SchoolName s={r.latest.champion} withPref={false} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.noTitleRegions.length > 0 && (
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            まだ優勝のない地区：{data.noTitleRegions.join("・")}
          </p>
        )}
        <p className="mt-3 text-xs text-ink-faint">
          地区は出典の表記のままです。東京と北海道は、都道府県と同じ名前で1つの地区として載っています。
        </p>
      </section>

      {/* ------- 都道府県別 ------- */}
      <section
        id="prefectures"
        aria-labelledby="jc-pref"
        className="mt-4 scroll-mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading id="jc-pref" title="都道府県別の優勝回数" icon={<MapPin size={18} />} note="多い順" />
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-muted">
                <th scope="col" className="py-1.5 pr-3 font-medium">都道府県</th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">優勝</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">直近の優勝</th>
                <th scope="col" className="py-1.5 font-medium">優勝した年</th>
              </tr>
            </thead>
            <tbody>
              {data.byPrefecture.map((p) => (
                <tr key={p.name} className="border-b border-line align-top last:border-0">
                  <td className="py-2 pr-3 whitespace-nowrap font-bold text-navy-800">
                    {p.slug ? (
                      <Link
                        href={`/prefectures/${p.slug}`}
                        className="underline decoration-line underline-offset-2 hover:text-accent-800"
                      >
                        {p.name}
                      </Link>
                    ) : (
                      p.name
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums font-bold text-navy-800">{p.total}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-ink">
                    {p.latest.entry.year}年 <SchoolName s={p.latest.champion} withPref={false} />
                  </td>
                  <td className="py-2 tabular-nums text-ink-muted">{p.years.join("・")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.noTitle.length > 0 && (
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            まだ優勝のない都道府県：
            {data.noTitle.map((p, i) => (
              <span key={p.name}>
                {i > 0 && "・"}
                {p.slug ? (
                  <Link
                    href={`/prefectures/${p.slug}`}
                    className="underline decoration-line underline-offset-2 hover:text-accent-800"
                  >
                    {p.name}
                  </Link>
                ) : (
                  p.name
                )}
              </span>
            ))}
          </p>
        )}
        <p className="mt-3 text-xs text-ink-faint">優勝校の都道府県で数えています。</p>
      </section>

      {/* ------- 公立高校の優勝・準優勝 ------- */}
      {data.publicRows.length > 0 && (
        <section
          id="public"
          aria-labelledby="jc-public"
          className="mt-4 scroll-mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading
            id="jc-public"
            title="公立高校が優勝・準優勝した大会"
            icon={<ListOrdered size={18} />}
            note="新しい順"
          />
          <ChampionTable rows={data.publicRows} showPublicResult />
        </section>
      )}

      <aside className="mt-4 rounded-xl border border-line bg-navy-50/60 p-4" aria-labelledby="jc-note">
        <div className="flex items-center gap-1.5">
          <Info size={15} aria-hidden="true" className="shrink-0 text-navy-600" />
          <h2 id="jc-note" className="text-xs font-bold text-navy-800">
            このページの記録について
          </h2>
        </div>
        <ul className="mt-2 space-y-1.5 text-[0.6875rem] leading-relaxed text-ink-muted">
          <li>
            <strong className="text-ink">出典は Wikipedia の「歴代結果（高校の部）」です。</strong>
            回・年・出場校数・優勝校・準優勝校・決勝のスコアと、校名の脇の都道府県・地区は、
            <a
              href={JINGU_CHAMPIONS_SOURCE.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 underline decoration-line underline-offset-2 text-accent-800"
            >
              ja.wikipedia「明治神宮野球大会」
              <ExternalLink size={11} aria-hidden="true" className="shrink-0" />
            </a>
            の表のとおりです。
          </li>
          <li>
            <strong className="text-ink">大学の部は収録していません。</strong>
            高校の部は第4回大会（1973年）からです。
          </li>
          <li>
            <strong className="text-ink">私立を含む全大会を載せています。</strong>
            このサイトが載せるのは公立・国立・高専だけなので、
            <strong className="text-accent-800">オレンジ</strong>の校名が公立です。
            学校ページのある学校は押すとそのページへ進めます。
          </li>
          <li>
            <strong className="text-ink">学校ごとの優勝回数は出していません。</strong>
            校名が時代で変わっており（1981年の「明徳」と2017年の「明徳義塾」は同じ学校です）、
            表の表記のまま数えると同じ学校が別々に数えられるためです。
          </li>
        </ul>
      </aside>
    </Container>
  );
}

function JumpLink({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <a
        href={href}
        className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-ink hover:bg-navy-50"
      >
        {label}
      </a>
    </li>
  );
}

/** 公立が優勝か準優勝か（決勝が公立どうしならどちらも） */
function publicResult(r: HeldRow): string {
  if (r.champion.school && r.runnerUp.school) return "優勝・準優勝";
  return r.champion.school ? "優勝" : "準優勝";
}

function SchoolName({ s, withPref = true }: { s: ChampionSchool; withPref?: boolean }) {
  return (
    <>
      {s.school?.slug ? (
        <Link
          href={`/schools/${s.school.slug}`}
          className="font-bold text-accent-800 underline decoration-line underline-offset-2"
        >
          {s.name}
        </Link>
      ) : s.school ? (
        /* ★公立だが学校ページが無い（閉校して DB に承継先が無い）。色だけ付けてリンクは張らない */
        <span className="font-bold text-accent-800">{s.name}</span>
      ) : (
        <span className="text-ink">{s.name}</span>
      )}
      {withPref && <span className="ml-1 text-xs text-ink-faint">（{s.prefecture}）</span>}
    </>
  );
}

function ChampionTable({
  rows,
  showPublicResult = false,
}: {
  rows: readonly TimelineRow[];
  /** 公立が優勝・準優勝した大会の表。どちらが公立かの列を足す */
  showPublicResult?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="mt-3 text-sm text-ink-muted">該当する大会はありません。</p>;
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-muted">
            <th scope="col" className="py-1.5 pr-3 font-medium">大会</th>
            {showPublicResult ? (
              <th scope="col" className="py-1.5 pr-3 font-medium">公立の成績</th>
            ) : (
              <th scope="col" className="py-1.5 pr-3 text-right font-medium">出場校</th>
            )}
            <th scope="col" className="py-1.5 pr-3 font-medium">優勝校</th>
            <th scope="col" className="py-1.5 pr-3 font-medium tabular-nums">決勝</th>
            <th scope="col" className="py-1.5 font-medium">準優勝校</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            if (r.kind === "cancelled") {
              return (
                <tr key={r.year} className="border-b border-line last:border-0 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-navy-800">
                    {r.year}年 第{r.no}回
                  </td>
                  <td colSpan={4} className="py-2 text-ink-muted">
                    中止
                  </td>
                </tr>
              );
            }
            const e = r.entry;
            const label = `${e.year}年 第${e.no}回`;
            return (
              <tr key={e.year} className="border-b border-line last:border-0 align-top">
                <td className="py-2 pr-3 whitespace-nowrap">
                  {r.tournament ? (
                    <Link
                      href={`/jingu/${r.tournament.slug}`}
                      className="text-navy-800 underline decoration-line underline-offset-2 hover:text-accent-800"
                      title={r.tournament.name}
                    >
                      {label}
                    </Link>
                  ) : (
                    <span className="text-navy-800">{label}</span>
                  )}
                </td>
                {showPublicResult ? (
                  <td className="py-2 pr-3 whitespace-nowrap font-bold text-accent-800">
                    {publicResult(r)}
                  </td>
                ) : (
                  <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums text-ink-muted">
                    {e.schoolCount}校
                  </td>
                )}
                <td className="py-2 pr-3 whitespace-nowrap">
                  <SchoolName s={r.champion} />
                </td>
                <td className="py-2 pr-3 whitespace-nowrap tabular-nums text-ink">
                  {e.score}
                  {e.walkOff && <span className="ml-1 text-[0.6875rem] text-ink-faint">サヨナラ</span>}
                </td>
                <td className="py-2 whitespace-nowrap">
                  <SchoolName s={r.runnerUp} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
