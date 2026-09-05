import type { Metadata } from "next";
import Link from "next/link";
import { Radio } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { SectionHeading } from "@/components/common/SectionHeading";
import { PREFECTURES } from "@/lib/constants";
import {
  LIVE_SOURCE,
  PHASE_LABEL,
  fetchLiveDistricts,
  isLiveCovered,
  type LiveDistrict,
  type LivePhase,
} from "@/lib/live/hsb";

/**
 * 速報の入口（全国）。
 *
 * ★★**1リクエストで作れる**（`hsbflash.jp/top` の9.6KB）。**県ごとに叩かない。**
 * ★**トップのカードは「本日試合あり」だけ**を出すが、ここは**41県すべて**を状態つきで並べる ——
 * 「今日は試合が無い」ことも知りたい人がいる。
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "試合速報",
  description:
    "全国の公立高校が出場する地方大会の試合を、イニングごとに出しています。都道府県を選んでください。",
};

/** ★**並びは「いま動いているものが上」。** 五十音でも地理でもない */
const ORDER: LivePhase[] = ["today", "running", "drawn", "done", "before"];

export default async function LiveIndexPage() {
  const districts = await fetchLiveDistricts().catch((): LiveDistrict[] => []);
  const bySlug = new Map(districts.map((d) => [d.slug, d]));
  /*
    ★**出典から取れなくても、県の一覧は出す。**
    このサイトが収録している41地区は `PREFECTURES` 側で決まっており、
    **出典が止まっているかどうかとは別のこと。**
  */
  const covered = PREFECTURES.filter((p) => isLiveCovered(p.slug));
  const groups = ORDER.map((phase) => ({
    phase,
    list: covered.filter((p) => bySlug.get(p.slug)?.phase === phase),
  })).filter((g) => g.list.length > 0);
  const unknown = covered.filter((p) => !bySlug.has(p.slug));

  return (
    <Container className="py-6">
      <Breadcrumb items={[{ label: "試合速報" }]} />

      <h1 className="mt-4 text-2xl font-bold">試合速報</h1>
      <p className="mt-2 text-sm text-ink-muted">
        地方大会の試合を、イニングごとに出しています。都道府県を選ぶと、その日の試合が並びます。
      </p>

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
        ★★**収録していない6県のことを書く。**「まだ対応していない」と読まれないように、
        **理由まで書く**（AGENTS の「まだ対応していませんと書かない」）。
      */}
      <p className="mt-5 text-xs text-ink-faint">
        北海道・青森・宮城・秋田・東京・鳥取は、高校野球連盟が転載を制限しているため
        地方大会の結果を扱っていません。
      </p>
      <p className="mt-2 text-xs text-ink-faint">
        出典:{" "}
        <a href={LIVE_SOURCE.url} className="underline" rel="noopener noreferrer" target="_blank">
          {LIVE_SOURCE.name}
        </a>
      </p>
    </Container>
  );
}
