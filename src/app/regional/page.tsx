import type { Metadata } from "next";
import Link from "next/link";
import { MapPinned } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import {
  PrefectureMap,
  type PrefectureMapDetail,
} from "@/components/schools/PrefectureMap";
import { REGIONAL_PROGRESS } from "@/lib/data/regional-progress";
import {
  formatRegionalDate,
  seasonLabel,
  type RegionalProgress,
} from "@/lib/regional-results";
import { PREFECTURES } from "@/lib/constants";

export const revalidate = 3600;

const SEASON = REGIONAL_PROGRESS.season;

export const metadata: Metadata = {
  title: SEASON
    ? `地方大会の進捗（${seasonLabel(SEASON)}）`
    : "地方大会の進捗",
  description:
    "全国の地方大会が、いまどこまで進んでいるかを地図で一覧できます。地区を選ぶと、その大会で公立高校が出た試合を見られます。",
  alternates: { canonical: "/regional" },
};

/**
 * 地方大会の進捗地図。
 *
 * ------------------------------------------------------------------
 * ★**季節は「今日の日付」で決めない。**
 *
 * `REGIONAL_PROGRESS.season` は生成時に「**いちばん新しい試合の季節**」で
 * 決めてある。日付で切ると**大会の谷間に何も出ない期間**ができ、
 * 雨天順延にも追随できない（`results-slot.ts` と同じ考え方）。
 * 秋が始まれば秋、春になれば春に、**データのほうから**切り替わる。
 *
 * ------------------------------------------------------------------
 * ★★**「まだ」と「対応していない」を混ぜないこと。**
 *
 *   出典を読んでいる地区 … `playing`（開催中）／`done`（決勝まで）／`pending`（今季はまだ）
 *   出典が無い地区       … 生成物に行が無い（＝規約で外している地区など）
 *
 * 同じ灰色にすると「まだ始まっていない」と「そもそも取っていない」が
 * 見分けられない。**文言で分ける。**
 *
 * ------------------------------------------------------------------
 * ★**マスの中は2行まで。** 3行入れるとその行のマスだけ背が高くなり、
 * 同じ行の他県まで引き伸ばされる（`PrefectureMap` の `detail` の注意）。
 */
export default function RegionalPage() {
  const bySlug = new Map<string, RegionalProgress>(
    REGIONAL_PROGRESS.districts.map((d) => [d.slug, d]),
  );

  const detail: Record<string, PrefectureMapDetail> = {};
  const counts: Record<string, number> = {};
  for (const pref of PREFECTURES) {
    const p = bySlug.get(pref.slug);
    if (!p) continue; // 出典が無い地区。マスは「未対応」の見た目のまま
    if (p.state === "pending") {
      detail[pref.slug] = {
        lines: [{ text: "まだ試合がありません" }],
        label: `${pref.name}、今季の試合はまだありません`,
      };
      continue;
    }
    counts[pref.slug] = p.publicGames;
    const done = p.state === "done";
    detail[pref.slug] = {
      /*
        1行目 … どこまで進んだか（終わっていれば優勝校）
        2行目 … 大会名（長いので2行で打ち切られる。CSS の line-clamp）
      */
      lines: [
        done
          ? { label: "優勝", text: p.champion?.display ?? "決勝まで" }
          : { label: p.round ?? "開催中", text: `${p.publicGames}試合` },
        { text: shortTournament(p.tournament) },
      ],
      // ★**開催中のほうを目立たせる。** 終わった大会ではなく「いま見る場所」
      highlight: !done,
      label: [
        pref.name,
        p.tournament ?? "",
        done
          ? `終了。優勝は${p.champion?.display ?? "不明"}`
          : `${p.round ?? "開催中"}まで進行中`,
        `公立が出た試合は${p.publicGames}件`,
      ]
        .filter(Boolean)
        .join("、"),
    };
  }

  const playing = REGIONAL_PROGRESS.districts.filter((d) => d.state === "playing");
  const done = REGIONAL_PROGRESS.districts.filter((d) => d.state === "done");
  const covered = REGIONAL_PROGRESS.districts.length;

  return (
    <Container className="pb-4">
      <Breadcrumb items={[{ label: "地方大会" }]} />

      <header className="rounded-xl border border-line bg-white p-5 sm:p-7">
        <div className="flex items-center gap-2">
          <MapPinned size={22} aria-hidden="true" className="text-accent-500" />
          <h1 className="text-xl font-bold text-navy-800 sm:text-2xl">
            地方大会の進捗
            {SEASON && (
              <span className="ml-2 text-base font-bold text-accent-800">
                {seasonLabel(SEASON)}
              </span>
            )}
          </h1>
        </div>

        <p className="mt-2 text-base leading-relaxed text-ink-muted">
          いま行われている{SEASON ? seasonLabel(SEASON) : "地方大会"}が、
          地区ごとにどこまで進んでいるかを出しています。
          マスを選ぶと、その地区で
          <strong className="text-ink">公立高校が出た試合</strong>
          を見られます。
          {REGIONAL_PROGRESS.latestDate && (
            <>
              {" "}
              <strong className="text-ink">
                {formatRegionalDate(REGIONAL_PROGRESS.latestDate)}
              </strong>
              の試合まで反映しています。
            </>
          )}
        </p>

        <div className="mt-6">
          <PrefectureMap
            counts={counts}
            detail={detail}
            buildHref={(slug) => `/prefectures/${slug}`}
          />
        </div>

        <p className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-3.5 w-6 rounded-sm border border-accent-500 bg-accent-50"
            />
            開催中（{playing.length}地区）
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-3.5 w-6 rounded-sm border border-navy-300 bg-navy-50"
            />
            決勝まで（{done.length}地区）
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-3.5 w-6 rounded-sm border border-line bg-white"
            />
            未対応
          </span>
        </p>

        {/*
          ★**「未対応」の理由を書く。** 白いマスが「試合が無い」に見えると、
          **その地区で大会が行われていない**という誤解になる。
        */}
        <p className="mt-3 text-center text-xs leading-relaxed text-ink-faint">
          ※ 結果を掲載しているのは <strong className="font-medium">{covered}地区</strong>
          です。白いマスは大会が無いという意味ではなく、
          <strong className="font-medium">当サイトがまだ結果を掲載していない</strong>地区です。
          <br />
          右肩の数字は、その大会で公立高校が出た試合の数です。
          <br />※ 甲子園の大会区分（49地区）で並べた図です。実際の県の形や面積とは異なります。
        </p>
      </header>

      <section
        aria-labelledby="regional-note"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <h2 id="regional-note" className="text-sm font-bold text-navy-800">
          この一覧について
        </h2>
        <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink-muted">
          <li>
            出している季節は
            <strong className="text-ink">いちばん新しい試合が属する大会</strong>
            で決めています。カレンダーの月では切り替えていないので、
            大会の谷間や雨天順延でも空白になりません。
          </li>
          <li>
            進み具合は<strong className="text-ink">その地区でいちばん新しい大会</strong>
            のものです。ブロック予選と県大会が並行している地区では、
            新しいほうを出しています。
          </li>
          <li>
            <Link href="/prefectures" className="underline hover:text-navy-800">
              都道府県から公立高校を探す
            </Link>
            では、同じ地図で甲子園の出場校を見られます。
          </li>
        </ul>
      </section>
    </Container>
  );
}

/**
 * マスに収まる長さへ縮める。
 *
 * ★**回数と主催の部分を落とす。** 「第79回秋季関東地区高等学校野球茨城県大会 一次予選」は
 * マスの幅では2行に折れても入らない。**大会の性格が分かるところだけ残す。**
 * ★**元の名前は県のページに出る**ので、ここで削っても記録は失われない。
 */
function shortTournament(name: string | null): string {
  if (!name) return "";
  return (
    name
      // 「第79回」「令和8年度」のような頭の飾りを落とす
      .replace(/^第\d+回/, "")
      .replace(/^令和\d+年度?/, "")
      // 「◯◯地区高等学校野球」「高等学校野球」「高校野球」は共通なので落とす
      .replace(/[^\s]*地区高等学校野球/, "")
      .replace(/高等学校野球|高校野球/, "")
      .replace(/高等学校|高校/, "")
      .trim() || name
  );
}
