import type { Metadata } from "next";
import Link from "next/link";
import { Radio } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { SectionHeading } from "@/components/common/SectionHeading";
import { LeadText } from "@/components/common/LeadText";
import {
  PHASE_LABEL,
  fetchLiveDistricts,
  livePrefectures,
  type LiveDistrict,
  type LivePhase,
} from "@/lib/live/hsb";

/**
 * 速報の入口（全国）。
 *
 * ★★**1リクエストで作れる**（`hsbflash.jp/top` の9.6KB）。**県ごとに叩かない。**
 * ★**トップのカードは「本日試合あり」だけ**を出すが、ここは**47県すべて**を状態つきで並べる ——
 * 「今日は試合が無い」ことも知りたい人がいる。
 */
export const revalidate = 300;

/**
 * ★★**「速報」だけの見出しにしない**（2026-09-05）。
 * 探されるのは「高校野球 速報」で、**競技名が入っていないと当たらない。**
 * ★**47都道府県を数として出す** —— このページの値打ちは「全国から選べる」ことなので、
 * それを題にも説明にも書く。
 */
export const metadata: Metadata = {
  title: "高校野球の試合速報｜47都道府県",
  description:
    "全国47都道府県の高校野球（春季・夏の選手権予選・秋季）の試合を、イニングごとの得点つきで出しています。" +
    "都道府県を選ぶと、その日の全試合と経過が並びます。公立・国立の高校が出ている試合は校名を太字にしています。",
  alternates: { canonical: "/live" },
};

/** ★**並びは「いま動いているものが上」。** 五十音でも地理でもない */
const ORDER: LivePhase[] = ["today", "running", "drawn", "done", "before"];

export default async function LiveIndexPage() {
  const districts = await fetchLiveDistricts().catch((): LiveDistrict[] => []);
  const bySlug = new Map(districts.map((d) => [d.slug, d]));
  /*
    ★**出典から取れなくても、県の一覧は出す。**
    このサイトが速報を出す47県は `livePrefectures()` が持っており、
    **出典が止まっているかどうかとは別のこと。**
  */
  const covered = livePrefectures();
  // ★リード文に使う「今日試合がある県」（`liveToday` と同じ判定）
  const today = districts.filter((d) => d.phase === "today");
  const groups = ORDER.map((phase) => ({
    phase,
    list: covered.filter((p) => bySlug.get(p.slug)?.phase === phase),
  })).filter((g) => g.list.length > 0);
  const unknown = covered.filter((p) => !bySlug.has(p.slug));

  return (
    <Container className="py-6">
      <Breadcrumb items={[{ label: "試合速報" }]} />

      <h1 className="mt-4 text-2xl font-bold">高校野球の試合速報</h1>

      {/*
        ★★**リード文はここで組み立てる**（`live-lead.ts` は県のページ用で、こちらは全国の数）。
        ★**数は取れた一覧から数えたものだけ。** 出典が止まっていれば数が出ないので、
        **そのときは件数の文を出さない**（0県と書かない）。
      */}
      <LeadText
        label="このページの概要"
        className="mt-3"
        paragraphs={[
          `全国47都道府県の高校野球（春季・夏の選手権予選・秋季）の試合を、` +
            `イニングごとの得点つきで出しています。都道府県を選ぶと、その日の全試合と経過が並びます。`,
          ...(districts.length > 0
            ? [
                today.length > 0
                  ? `今日は${today.length}の都道府県で試合が行われています（${today.map((p) => p.name).join("・")}）。`
                  : `今日は試合が行われている都道府県がありません。大会が始まると、ここに県名が並びます。`,
              ]
            : []),
          `公立・国立の高校が出ている試合は校名を太字にしています。試合を選ぶと、イニングごとの得点が見られます。`,
        ]}
      />

      {groups.map(({ phase, list }) => (
        <section key={phase} className="mt-5 rounded-xl border border-line bg-white p-5">
          <SectionHeading
            title={PHASE_LABEL[phase]}
            note={`${list.length} 地区`}
            icon={
              phase === "today" ? <Radio size={18} className="text-accent-500" /> : undefined
            }
          />
          <ul className="mt-3 flex flex-wrap gap-2">
            {list.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/live/${p.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-bold text-navy-800 hover:bg-navy-50"
                >
                  {/* ★点は飾り。読み上げからは外す（県名だけで足りる） */}
                  {phase === "today" && (
                    <span className="size-1.5 rounded-full bg-accent-500" aria-hidden />
                  )}
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {unknown.length > 0 && (
        <p className="mt-5 text-sm text-ink-muted">
          {/* ★**「試合が無い」と書かない。** 取れなかっただけかもしれない */}
          いま状態を取れなかった地区: {unknown.map((p) => p.name).join("・")}
        </p>
      )}

      {/*
        ★★**北海道と東京は「県」でひとまとまり**（2026-09-05）。
        甲子園の区分では北北海道・南北海道／東東京・西東京に割れるが、
        **割れるのは夏の予選だけ**で、出典の速報板も県で1つ。
      */}
      <p className="mt-5 text-xs text-ink-faint">
        北海道と東京は県でひとまとめにしています。夏の大会だけ北北海道・南北海道、
        東東京・西東京に分かれます。
      </p>
    </Container>
  );
}
