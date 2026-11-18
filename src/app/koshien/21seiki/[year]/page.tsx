import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ExternalLink, Sparkles } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { Badge } from "@/components/common/Badge";
import { LeadText } from "@/components/common/LeadText";
import { AdSlot } from "@/components/ads/AdSlot";
import { StatTile } from "@/components/rankings/StatTile";
import { GuideLinkBox } from "@/components/guide/GuideLinkBox";

import { PREFECTURES } from "@/lib/constants";
import { getSchoolNameIndex } from "@/lib/queries/schools";
import {
  NINE_AREAS,
  getRecommendedList,
  recommendedUrl,
  shortRecommendedName,
  snapshotYears,
  type RecommendedRow,
} from "@/lib/senbatsu-21seiki";
import {
  RECOMMENDED_SCHOOL_OVERRIDES,
  SENBATSU_21SEIKI,
  SENBATSU_21SEIKI_PREVIOUS,
} from "@/lib/content/senbatsu-21seiki";
import {
  TWENTY_FIRST_CENTURY_BERTHS,
  TWENTY_FIRST_CENTURY_SOURCE,
} from "@/lib/data/twenty-first-century";

/**
 * 来季の選抜の21世紀枠の特設ページ（都府県の推薦校・選考の日程・過去の選出校）。
 *
 * ★★**推薦校の一覧は描くときに日本高野連のページを取りに行く**（`src/lib/senbatsu-21seiki.ts`）。
 *   ページは ISR（1時間）。**`force-dynamic` にしない**（見ている人の数だけサーバーが動く）。
 * ★**公立かどうかは学校マスタに引けたかで決める**（校名から推測しない）。
 *   出典の「県◯◯」は**県名の略で、県立とは限らない**（「県鴻城」は私立）。
 * ★**文章は取らない**（各連盟の推薦理由）。校名・成績・日付だけ。
 */
export const revalidate = 3600;
export const dynamicParams = false;

type Props = { params: Promise<{ year: string }> };

const knownYears = (): number[] =>
  snapshotYears().filter((y) => SENBATSU_21SEIKI[y] && SENBATSU_21SEIKI_PREVIOUS[y]);

export function generateStaticParams() {
  return knownYears().map((y) => ({ year: String(y) }));
}

const yearOf = (raw: string): number | null => {
  const y = Number(raw);
  return Number.isInteger(y) && knownYears().includes(y) ? y : null;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const year = yearOf((await params).year);
  if (year === null) return {};
  const cfg = SENBATSU_21SEIKI[year];
  return {
    title: `センバツ${year} 21世紀枠の推薦校一覧と選考スケジュール`,
    description: `第${cfg.edition}回選抜高校野球（${year}年春）の21世紀枠。各都府県の高野連が推薦した学校を地区ごとに一覧にし、12月の9地区候補校・1月の選考委員会までの日程と、過去の21世紀枠の選出校をまとめました。`,
    alternates: { canonical: `/koshien/21seiki/${year}` },
  };
}

/** 「11月5日」 */
const dateText = (r: RecommendedRow): string | null =>
  r.announced ? `${r.announced.month}月${r.announced.day}日` : null;

const prefectureSlug = (name: string): string | null =>
  PREFECTURES.find((p) => p.name === name)?.slug ?? null;

type Resolved = { slug: string | null; name: string };
type Resolve = (display: string, pref?: string) => Resolved | null;

/** 索引が取れなくてもページを落とさない（取れなければ公立の印なしで描く） */
async function loadResolve(): Promise<Resolve | null> {
  try {
    const index = await getSchoolNameIndex("koshien");
    return (d, p) => index.find(d, p);
  } catch {
    return null;
  }
}

export default async function Senbatsu21seikiPage({ params }: Props) {
  const year = yearOf((await params).year);
  if (year === null) notFound();

  const cfg = SENBATSU_21SEIKI[year];
  const prevCfg = SENBATSU_21SEIKI_PREVIOUS[year];

  const [list, prevList, resolve] = await Promise.all([
    getRecommendedList(year),
    getRecommendedList(prevCfg.year),
    loadResolve(),
  ]);
  if (!list) notFound();

  // ---- 推薦校ごとの付随情報 -------------------------------------------
  const lookup = (row: RecommendedRow): Resolved | null => {
    if (!row.school) return null;
    const short = shortRecommendedName(row.school);
    const over = RECOMMENDED_SCHOOL_OVERRIDES[short];
    const hit = resolve?.(short, row.prefecture) ?? null;
    if (hit) return hit;
    // 手書きの対応は、マスタが引けなかったときだけ（学校ページの slug だけを渡す）
    return over ? { slug: over.slug, name: row.school } : null;
  };

  const prevKeys = new Set(
    (prevList?.rows ?? [])
      .filter((r) => r.school)
      .map((r) => `${r.prefecture}:${shortRecommendedName(r.school!)}`),
  );

  const berthsBySlug = new Map<string, number[]>();
  for (const b of TWENTY_FIRST_CENTURY_BERTHS) {
    if (!b.schoolSlug) continue;
    berthsBySlug.set(b.schoolSlug, [...(berthsBySlug.get(b.schoolSlug) ?? []), b.year]);
  }

  const rowInfo = new Map(
    list.rows.map((r) => {
      const ref = lookup(r);
      return [
        r.prefecture,
        {
          ref,
          repeat: r.school ? prevKeys.has(`${r.prefecture}:${shortRecommendedName(r.school)}`) : false,
          pastYears: ref?.slug ? (berthsBySlug.get(ref.slug) ?? []) : [],
        },
      ] as const;
    }),
  );

  const announced = list.rows.filter((r) => r.school);
  const pending = list.rows.filter((r) => !r.school && !r.none).map((r) => r.prefecture);
  const publicCount = announced.filter((r) => rowInfo.get(r.prefecture)?.ref).length;
  const repeatCount = announced.filter((r) => rowInfo.get(r.prefecture)?.repeat).length;

  const dates = announced
    .filter((r) => r.announced)
    .sort(
      (a, b) =>
        a.announced!.month * 100 + a.announced!.day - (b.announced!.month * 100 + b.announced!.day),
    );
  const first = dates[0];
  const last = dates[dates.length - 1];

  // ---- 導入文（持っているデータの並べ替えだけ。生成AIに書かせない）------
  const lead = [
    `第${cfg.edition}回選抜高校野球（${year}年3月19日開幕）の21世紀枠は、各都府県の高野連が推薦校を1校ずつ発表している段階です。` +
      `日本高野連の一覧（${list.updatedAt ?? "更新日時不明"}更新）では${announced.length}都府県が発表済みで、` +
      (pending.length > 0
        ? `${pending.join("・")}は未発表です。`
        : "47都道府県すべてが出そろいました。") +
      (publicCount > 0
        ? `そのうち公立・国立・高専は${publicCount}校です。`
        : ""),
    `この先は、12月に日本高野連が9地区から推薦された候補校9校を発表し、${cfg.schedule.committee}の選考委員会で出場校に選ばれる学校が決まります。` +
      `このページでは、推薦校の一覧と選考の日程、過去の21世紀枠の選出校を1か所にまとめています。`,
  ];

  // ---- 歴代の選出校（新しい年が上）------------------------------------
  const berthYears = [...new Set(TWENTY_FIRST_CENTURY_BERTHS.map((b) => b.year))].sort(
    (a, b) => b - a,
  );

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[
          { label: "記録・ランキング", href: "/rankings" },
          { label: "21世紀枠の出場校", href: "/rankings/21seiki-waku" },
          { label: `センバツ${year}の推薦校` },
        ]}
      />

      <header className="rounded-xl border border-line bg-white p-5">
        <div className="flex items-center gap-2">
          <Sparkles size={22} aria-hidden="true" className="text-accent-500" />
          <h1 className="text-xl font-bold text-navy-800 sm:text-2xl">
            センバツ{year} 21世紀枠の推薦校一覧
          </h1>
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          第{cfg.edition}回選抜高等学校野球大会（{year}年春）
        </p>
      </header>

      <LeadText paragraphs={lead} />

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="推薦校が発表された都府県"
          value={String(announced.length)}
          unit="/ 47"
          note={
            pending.length > 0
              ? `${pending.join("・")}は未発表（${list.updatedAt ?? "更新日時不明"}時点）`
              : "47都道府県すべて"
          }
        />
        <StatTile
          label="公立・国立・高専の推薦校"
          value={String(publicCount)}
          unit="校"
          note={`このサイトの収録対象。ほかの${announced.length - publicCount}校はリンクなし`}
        />
        <StatTile
          label={`前回（第${prevCfg.edition}回）も推薦`}
          value={String(repeatCount)}
          unit="校"
          note="2年続けて同じ都府県の推薦校になった学校"
        />
        <StatTile
          label="発表の期間"
          value={first && last ? `${first.announced!.month}/${first.announced!.day}〜${last.announced!.month}/${last.announced!.day}` : "－"}
          note={first && last ? `${first.prefecture}が最初、${last.prefecture}が最後` : "発表待ち"}
        />
      </div>

      <GuideLinkBox className="mt-4" slugs={["senbatsu-selection"]} />

      {/* ---------------- 選定スケジュール ---------------- */}
      <section
        aria-labelledby="schedule"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <h2 id="schedule" className="flex items-center gap-1.5 text-sm font-bold text-navy-800">
          <CalendarDays size={16} aria-hidden="true" className="text-accent-500" />
          今後の選定スケジュール
        </h2>
        <ol className="mt-3 space-y-3">
          <ScheduleItem
            when={first && last ? `${first.announced!.month}月${first.announced!.day}日〜${last.announced!.month}月${last.announced!.day}日` : "11月上旬〜中旬"}
            title="各都府県の高野連が推薦校を1校ずつ発表"
            body={`秋季都府県大会でベスト16以上（加盟校が多い都府県はベスト32以上）の学校から推薦されます。${pending.length > 0 ? `${pending.join("・")}はまだです。` : ""}日本高野連の一覧では、前回（第${prevCfg.edition}回）も北海道は最後まで「―」のままで、北海道の学校は12月の9地区候補校の発表で初めて載りました。`}
            done={pending.length === 0}
          />
          <ScheduleItem
            when="12月中旬（日付は未発表）"
            title="日本高野連が9地区から推薦された候補校9校を発表"
            body={`推薦校46〜47校が、北海道・東北・関東・東京・東海・北信越・近畿・中国・四国・九州の9地区から1校ずつに絞られます。第${prevCfg.edition}回は${prevCfg.candidatesDate}でした。第${cfg.edition}回の発表日は決まり次第この欄に書きます。`}
          />
          <ScheduleItem
            when={cfg.schedule.committee}
            title="選考委員会で21世紀枠の出場校が決まる"
            body={`9校の中から選ばれます。選ばれる校数は第96回から第${prevCfg.edition}回まで毎回2校です（第${cfg.edition}回の校数は大会要項の公表を待ちます）。一般選考の出場校・補欠校も同じ日に発表されます。`}
          />
          <ScheduleItem
            when={cfg.schedule.draw}
            title="組み合わせ抽選会"
            body="出場32校の初戦の相手が決まります。"
          />
          <ScheduleItem
            when={cfg.schedule.period}
            title={`第${cfg.edition}回選抜高校野球大会（阪神甲子園球場）`}
            body="準々決勝・準決勝の翌日の休養日各1日を含みます（雨天順延）。"
          />
        </ol>
        <p className="mt-3 text-[0.6875rem] text-ink-faint">
          日程は{" "}
          <ExtLink href={cfg.topUrl}>日本高野連「第{cfg.edition}回選抜高等学校野球大会」</ExtLink>
          から。
        </p>
      </section>

      {/* ---------------- 地区別の推薦校一覧 ---------------- */}
      <section
        aria-labelledby="recommended"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <h2 id="recommended" className="text-sm font-bold text-navy-800">
          都府県の推薦校（9地区別）
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          日本高野連の一覧の並びに、9地区の区分を重ねています。「公立等」は公立・国立・高専で、
          学校名から学校ページに移れます。成績は各学校が推薦された秋季都府県大会のものです。
        </p>

        <div className="mt-4 space-y-5">
          {NINE_AREAS.map((area) => (
            <div key={area.name}>
              <h3 className="text-xs font-bold text-navy-600">{area.name}</h3>
              <ul className="mt-1.5 divide-y divide-line rounded-lg border border-line">
                {area.prefectures.map((pref) => {
                  const row = list.rows.find((r) => r.prefecture === pref);
                  if (!row) return null;
                  const info = rowInfo.get(pref)!;
                  const prefSlug = prefectureSlug(pref);
                  const shown = info.ref?.name ?? row.school;

                  return (
                    <li
                      key={pref}
                      className="grid grid-cols-[3.5rem_1fr] gap-x-3 gap-y-1 px-3 py-2.5 sm:grid-cols-[4rem_1fr_auto]"
                    >
                      <div className="text-xs font-bold text-ink-muted">
                        {prefSlug ? (
                          <Link href={`/prefectures/${prefSlug}`} className="hover:text-accent-800">
                            {pref}
                          </Link>
                        ) : (
                          pref
                        )}
                      </div>

                      <div className="min-w-0">
                        {row.school ? (
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            {info.ref?.slug ? (
                              <Link
                                href={`/schools/${info.ref.slug}`}
                                className="text-sm font-bold text-navy-800 underline decoration-line underline-offset-2 hover:text-accent-800"
                              >
                                {shown}
                              </Link>
                            ) : (
                              <span className="text-sm font-bold text-ink">{shown}</span>
                            )}
                            {info.ref && <Badge variant="navy">公立等</Badge>}
                            {info.repeat && <Badge variant="outline">前回も推薦</Badge>}
                            {info.pastYears.length > 0 && (
                              <Badge variant="accent">
                                {info.pastYears.join("・")}年に選出
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-ink-faint">
                            {row.none
                              ? "推薦校なし"
                              : pref === "北海道"
                                ? `未発表（第${prevCfg.edition}回は12月の9地区候補校の発表で明らかになりました）`
                                : "未発表"}
                          </p>
                        )}
                      </div>

                      {row.school && (
                        <p className="col-start-2 text-[0.6875rem] text-ink-faint sm:col-start-3 sm:text-right">
                          {[row.record ? `秋季大会 ${row.record}` : null, dateText(row) ? `${dateText(row)}発表` : null]
                            .filter(Boolean)
                            .join("　")}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- 昨年の流れ ---------------- */}
      <section
        aria-labelledby="previous"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <h2 id="previous" className="text-sm font-bold text-navy-800">
          昨年（第{prevCfg.edition}回）はこう絞られました
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          {prevCfg.candidatesDate}に日本高野連が9地区の候補校を発表し、
          {prevCfg.year}年1月の選考委員会で{prevCfg.candidates.filter((c) => c.selected).length}
          校が選ばれました。都府県の推薦校{prevList ? prevList.rows.filter((r) => r.school).length : "46"}
          校 → 9地区の候補校9校 → 出場2校、という順です。
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-3">
          {prevCfg.candidates.map((c) => {
            const ref = resolve?.(c.school, c.prefecture) ?? null;
            return (
              <li
                key={c.area}
                className="rounded-lg border border-line px-3 py-2"
              >
                <p className="text-[0.6875rem] font-bold text-navy-600">{c.area}</p>
                <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                  {ref?.slug ? (
                    <Link
                      href={`/schools/${ref.slug}`}
                      className="text-sm font-bold text-navy-800 underline decoration-line underline-offset-2 hover:text-accent-800"
                    >
                      {ref.name}
                    </Link>
                  ) : (
                    <span className="text-sm font-bold text-ink">{c.school}</span>
                  )}
                  <span className="text-[0.6875rem] text-ink-muted">{c.prefecture}</span>
                  {c.selected && <Badge variant="accent">出場</Badge>}
                </p>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[0.6875rem] text-ink-faint">
          出典:{" "}
          <ExtLink href={prevCfg.noticeUrl}>
            日本高野連「第{prevCfg.edition}回選抜高校野球大会 9地区推薦21世紀枠候補校」
          </ExtLink>
        </p>
      </section>

      {/* ---------------- 過去の選出校 ---------------- */}
      <section
        aria-labelledby="past"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <h2 id="past" className="text-sm font-bold text-navy-800">
          過去の21世紀枠の選出校（{Math.min(...berthYears)}〜{Math.max(...berthYears)}年）
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          延べ{TWENTY_FIRST_CENTURY_BERTHS.length}校が選ばれています。成績・都道府県ごとの分布は
          <Link
            href="/rankings/21seiki-waku"
            className="underline underline-offset-2 hover:text-accent-800"
          >
            21世紀枠の出場校
          </Link>
          のページにあります。
        </p>
        <dl className="mt-3 divide-y divide-line">
          {berthYears.map((y) => (
            <div key={y} className="grid grid-cols-[3rem_1fr] gap-x-3 py-1.5">
              <dt className="text-xs font-bold tabular-nums text-navy-800">{y}</dt>
              <dd className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm">
                {TWENTY_FIRST_CENTURY_BERTHS.filter((b) => b.year === y).map((b) => (
                  <span key={b.article}>
                    {b.schoolSlug ? (
                      <Link
                        href={`/schools/${b.schoolSlug}`}
                        className="font-bold text-navy-800 underline decoration-line underline-offset-2 hover:text-accent-800"
                      >
                        {b.displayName}
                      </Link>
                    ) : (
                      <span className="font-bold text-ink">{b.displayName}</span>
                    )}
                    <span className="ml-1 text-[0.6875rem] text-ink-muted">
                      {b.prefectureText}
                    </span>
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------------- 注記・出典 ---------------- */}
      <aside className="mt-4 rounded-xl border border-line bg-navy-50/60 p-4">
        <h2 className="text-xs font-bold text-navy-800">このページの出典と注意</h2>
        <ul className="mt-2 space-y-1.5 text-[0.6875rem] leading-relaxed text-ink-muted">
          <li>
            推薦校の一覧は{" "}
            <ExtLink href={recommendedUrl(year)}>
              日本高野連「第{cfg.edition}回選抜高等学校野球大会・都府県連盟推薦の21世紀枠推薦校一覧」
            </ExtLink>
            （{list.updatedAt ?? "更新日時不明"}更新）です。
            {list.via === "snapshot"
              ? "いま出典を読み込めなかったため、取り込んである控えの内容を表示しています。"
              : "発表が進むたびに自動で読み直しています（最大1時間遅れ）。"}
            各連盟の推薦理由などの文章は載せていません。
          </li>
          <li>
            「公立等」は公立・国立・高専で、このサイトの収録対象です。出典の「県◯◯」は
            都府県名の略で、県立とは限りません。リンクのない学校は収録対象外の学校です。
          </li>
          <li>
            過去の選出校の出典は{" "}
            <ExtLink href={TWENTY_FIRST_CENTURY_SOURCE.url}>
              ウィキペディア日本語版「{TWENTY_FIRST_CENTURY_SOURCE.title}」
            </ExtLink>
            （{TWENTY_FIRST_CENTURY_SOURCE.license}）で、年・地区・校名だけを取り込んでいます。
            学校名は統廃合後の現在の名前に読み替えています。
          </li>
          <li>日程は変わることがあります。最新の情報は日本高野連の発表で確認してください。</li>
        </ul>
      </aside>

      <nav aria-label="関連ページ" className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <Link
          href="/regional/autumn/2026"
          className="text-navy-800 underline underline-offset-2 hover:text-accent-800"
        >
          2026年 秋季大会のまとめ（都道府県大会の優勝校）
        </Link>
        <Link href="/jingu" className="text-navy-800 underline underline-offset-2 hover:text-accent-800">
          明治神宮大会（高校の部）
        </Link>
        <Link href="/guide/senbatsu-selection" className="text-navy-800 underline underline-offset-2 hover:text-accent-800">
          選抜の出場校はどう決まるか
        </Link>
      </nav>

      <AdSlot slot="sidebar" />
    </Container>
  );
}

function ScheduleItem({
  when,
  title,
  body,
  done,
}: {
  when: string;
  title: string;
  body: string;
  done?: boolean;
}) {
  return (
    <li className="grid gap-x-4 gap-y-0.5 sm:grid-cols-[11rem_1fr]">
      <p className="text-xs font-bold text-navy-600">
        {when}
        {done && <span className="ml-1.5 text-ink-faint">（出そろいました）</span>}
      </p>
      <div>
        <p className="text-sm font-bold text-ink">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{body}</p>
      </div>
    </li>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-accent-800"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      <ExternalLink size={11} aria-hidden="true" />
    </a>
  );
}
