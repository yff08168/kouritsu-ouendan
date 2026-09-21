import type { Metadata } from "next";
import Link from "next/link";
import { Info, MapPin, Sun, Trophy } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { SectionHeading } from "@/components/common/SectionHeading";
import { LeadText } from "@/components/common/LeadText";
import { AdSlot } from "@/components/ads/AdSlot";
import { KoshienStat } from "@/components/results/KoshienStat";
import { GuideLinkBox } from "@/components/guide/GuideLinkBox";

import {
  buildKoshienChampionsLead,
  listKoshienChampions,
  shortLabel,
  type ChampionRow,
  type ChampionSchool,
} from "@/lib/koshien-champions";
import { venueLabel, type Resolve } from "@/lib/koshien-public";
import { getSchoolNameIndex } from "@/lib/queries/schools";

/**
 * 甲子園の歴代優勝校（`/koshien/champions`）。
 *
 * ------------------------------------------------------------------
 * ★★ なぜ作ったか（2026-09-21。運営者の指示）
 *
 *   キーワードプランナーの実測で「甲子園 歴代優勝校」が月平均6,600・8月49,500。
 *   優勝校・準優勝校・スコアは大会ページが1大会ずつ持っていたが、1枚に並べた入口が無かった。
 *   組み立ては `src/lib/koshien-champions.ts`（出典の重ね方もそこに書いてある）。
 *
 * ★ 私立も公立も全部載せる（大会の記録は全部そろって初めて意味がある。大会ページと同じ）。
 *   **公立だけオレンジ**で学校ページにつながる（`getSchoolNameIndex("koshien")`。大会ページと同じ規則）。
 * ★ 索引が取れなくてもページを落とさない（`loadResolve`。解説ページと同じ構え）。
 * ★ タブ（JavaScript）にしない。夏・春・都道府県別は同じページに縦に並べ、上のリンクで飛ぶ。
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

const TITLE = "甲子園の歴代優勝校一覧（春・夏）｜準優勝校・決勝スコア・都道府県別の優勝回数";

export async function generateMetadata(): Promise<Metadata> {
  const data = listKoshienChampions(await loadResolve());
  const description = buildKoshienChampionsLead(data).slice(0, 2).join("");
  return {
    title: TITLE,
    description,
    alternates: { canonical: "/koshien/champions" },
    openGraph: { type: "website", title: `${TITLE}｜公立応援団`, description },
  };
}

export default async function KoshienChampionsPage() {
  const data = listKoshienChampions(await loadResolve());
  const lead = buildKoshienChampionsLead(data);

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[{ label: "甲子園の記録", href: "/koshien" }, { label: "歴代優勝校" }]}
      />

      <header className="rounded-xl border border-line bg-white p-5 sm:p-7">
        <p className="text-sm font-bold text-accent-800">春の選抜・夏の選手権</p>
        <h1 className="mt-1 text-2xl font-bold text-navy-800 sm:text-3xl">
          甲子園の歴代優勝校
        </h1>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
          <KoshienStat label="収録した大会" value={`${data.rows.length}`} unit="大会" />
          <KoshienStat label="夏の選手権" value={`${data.summer.length}`} unit="大会" />
          <KoshienStat label="春の選抜" value={`${data.spring.length}`} unit="大会" />
          <KoshienStat
            label="公立が優勝"
            value={`${data.publicChampionCount}`}
            unit="大会"
            accent
          />
        </dl>
        <nav aria-label="このページの中" className="mt-4">
          <ul className="flex flex-wrap gap-2 text-sm">
            <JumpLink href="#summer" label="夏の選手権" />
            <JumpLink href="#spring" label="春の選抜" />
            <JumpLink href="#prefectures" label="都道府県別の優勝回数" />
            <li>
              <Link
                href="/koshien/public/champions"
                className="inline-flex min-h-11 items-center rounded-lg border border-accent-200 bg-accent-50 px-3 font-bold text-accent-800 hover:bg-accent-100"
              >
                優勝した公立高校の一覧
              </Link>
            </li>
          </ul>
        </nav>
      </header>

      <LeadText paragraphs={lead} />

      <GuideLinkBox className="mt-4" slugs={["senbatsu-selection", "tournament-rules", "extra-innings"]} />

      {/* ------- 夏の選手権 ------- */}
      <section
        id="summer"
        aria-labelledby="kc-summer"
        className="mt-4 scroll-mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="kc-summer"
          title="夏の選手権の歴代優勝校"
          icon={<Sun size={18} />}
          note="新しい順"
        />
        <ChampionTable rows={data.summer} />
        <p className="mt-3 text-xs text-ink-faint">
          校名は出典の大会記事の表記です。1924年以前の大会は球場が甲子園ではありません（豊中・鳴尾）。
        </p>
      </section>

      <AdSlot slot="sidebar" />

      {/* ------- 春の選抜 ------- */}
      <section
        id="spring"
        aria-labelledby="kc-spring"
        className="mt-4 scroll-mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="kc-spring"
          title="春の選抜の歴代優勝校"
          icon={<Trophy size={18} />}
          note="新しい順"
        />
        <ChampionTable rows={data.spring} />
        <p className="mt-3 text-xs text-ink-faint">
          第1回（1924年）は名古屋の山本球場で行われました。
        </p>
      </section>

      {/* ------- 都道府県別 ------- */}
      <section
        id="prefectures"
        aria-labelledby="kc-pref"
        className="mt-4 scroll-mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="kc-pref"
          title="都道府県別の優勝回数"
          icon={<MapPin size={18} />}
          note="多い順"
        />
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-muted">
                <th scope="col" className="py-1.5 pr-3 font-medium">都道府県</th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">優勝</th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">夏</th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">春</th>
                <th scope="col" className="py-1.5 font-medium">直近の優勝</th>
              </tr>
            </thead>
            <tbody>
              {data.byPrefecture.map((p) => (
                <tr key={p.name} className="border-b border-line last:border-0">
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
                  <td className="py-2 pr-3 text-right tabular-nums text-ink">{p.summer}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-ink">{p.spring}</td>
                  <td className="py-2 whitespace-nowrap text-ink">
                    {shortLabel(p.latest)} <SchoolName s={p.latest.champion} withPref={false} />
                  </td>
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
                  <Link href={`/prefectures/${p.slug}`} className="underline decoration-line underline-offset-2 hover:text-accent-800">
                    {p.name}
                  </Link>
                ) : (
                  p.name
                )}
              </span>
            ))}
          </p>
        )}
        <p className="mt-3 text-xs text-ink-faint">
          北北海道・南北海道は北海道、東東京・西東京は東京として数えています。記念大会の北大阪・南大阪、東神奈川・西神奈川なども、それぞれの府県に入れています。
        </p>
      </section>

      <aside
        className="mt-4 rounded-xl border border-line bg-navy-50/60 p-4"
        aria-labelledby="kc-note"
      >
        <div className="flex items-center gap-1.5">
          <Info size={15} aria-hidden="true" className="shrink-0 text-navy-600" />
          <h2 id="kc-note" className="text-xs font-bold text-navy-800">
            このページの記録について
          </h2>
        </div>
        <ul className="mt-2 space-y-1.5 text-[0.6875rem] leading-relaxed text-ink-muted">
          <li>
            <strong className="text-ink">私立を含む全大会を載せています。</strong>
            このサイトが学校ページを持つのは公立・国立・高専だけなので、
            <strong className="text-accent-800">オレンジ</strong>の校名だけが学校ページにつながります。
          </li>
          <li>
            <strong className="text-ink">学校ごとの優勝回数は出していません。</strong>
            校名が時代で変わっており（中京商 → 中京 → 中京大中京）、記事の表記のまま数えると同じ学校が別々に数えられるためです。
            公立高校については学校ごとに数えた
            <Link href="/koshien/public/champions" className="underline decoration-line underline-offset-2 text-accent-800">
              優勝した公立高校の一覧
            </Link>
            があります。
          </li>
          <li>
            <strong className="text-ink">決勝が引き分け再試合になった大会</strong>
            （1969年夏・2006年夏）は、引き分けのスコアも一緒に出しています。
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

function SchoolName({ s, withPref = true }: { s: ChampionSchool; withPref?: boolean }) {
  return (
    <>
      {s.school ? (
        <Link
          href={`/schools/${s.school.slug}`}
          className="font-bold text-accent-800 underline decoration-line underline-offset-2"
        >
          {s.name}
        </Link>
      ) : (
        <span className="text-ink">{s.name}</span>
      )}
      {withPref && <span className="ml-1 text-xs text-ink-faint">（{s.pref}）</span>}
    </>
  );
}

function ChampionTable({ rows }: { rows: ChampionRow[] }) {
  if (rows.length === 0) {
    return <p className="mt-3 text-sm text-ink-muted">該当する大会はありません。</p>;
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-muted">
            <th scope="col" className="py-1.5 pr-3 font-medium">大会</th>
            <th scope="col" className="py-1.5 pr-3 font-medium">優勝校</th>
            <th scope="col" className="py-1.5 pr-3 font-medium tabular-nums">決勝</th>
            <th scope="col" className="py-1.5 font-medium">準優勝校</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const e = r.entry;
            const label = `${e.year}年 第${e.no}回`;
            return (
              <tr key={`${e.year}-${e.season}`} className="border-b border-line last:border-0 align-top">
                <td className="py-2 pr-3 whitespace-nowrap">
                  {r.tournament ? (
                    <Link
                      href={`/koshien/${r.tournament.slug}`}
                      className="text-navy-800 underline decoration-line underline-offset-2 hover:text-accent-800"
                      title={r.tournament.name}
                    >
                      {label}
                    </Link>
                  ) : (
                    <span className="text-navy-800">{label}</span>
                  )}
                  {venueLabel(e.year) !== "甲子園" && (
                    <span className="ml-1 text-[0.6875rem] text-ink-faint">甲子園以前</span>
                  )}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  <SchoolName s={r.champion} />
                </td>
                <td className="py-2 pr-3 whitespace-nowrap tabular-nums text-ink">
                  {e.replay.map((d) => (
                    <span key={d} className="mr-1 text-xs text-ink-faint">
                      {d}
                      <span className="ml-0.5">引き分け</span>
                      <span className="mx-0.5">→</span>
                    </span>
                  ))}
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
