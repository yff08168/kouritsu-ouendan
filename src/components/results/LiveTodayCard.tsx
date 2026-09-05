import Link from "next/link";
import { Radio } from "lucide-react";

import { SectionHeading } from "@/components/common/SectionHeading";
import { LIVE_SOURCE, type LiveDistrict } from "@/lib/live/hsb";

/**
 * トップの「速報中の都道府県」。
 *
 * ------------------------------------------------------------------
 * ★★**元は1リクエスト**（`hsbflash.jp/top` の 9.6KB に47県ぶんの状態が入っている）。
 * **県ごとに叩いてはいけない** —— 41県ぶん取りに行くことになる。
 *
 * ★**「本日試合あり」の県だけ出す。** 開催中でも試合の無い日は出さない
 * （押しても「今日は試合がありません」しか出ないため）。
 * ★**1県も無い日はカードごと出さない**（空の枠を置かない。`results-slot.ts` と同じ構え）。
 */
export function LiveTodayCard({ districts }: { districts: LiveDistrict[] }) {
  if (districts.length === 0) return null;

  return (
    <section
      aria-labelledby="live-today"
      className="rounded-xl border border-accent-500/40 bg-white p-5"
    >
      <SectionHeading
        id="live-today"
        title="速報中の都道府県"
        note={`${districts.length} 県`}
        icon={<Radio size={18} className="text-accent-500" />}
        moreHref="/live"
        moreLabel="都道府県から探す"
      />
      <p className="mt-1 text-sm text-ink-muted">
        今日、試合が行われている県です。県を選ぶと、試合ごとの経過が出ます。
      </p>

      <ul className="mt-3 flex flex-wrap gap-2">
        {districts.map((d) => (
          <li key={d.slug}>
            <Link
              href={`/live/${d.slug}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-bold text-navy-800 hover:bg-navy-50"
            >
              {/* ★**点は飾り。** 読み上げからは外す（県名だけで足りる） */}
              <span className="size-1.5 rounded-full bg-accent-500" aria-hidden />
              {d.name}
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-ink-faint">
        出典:{" "}
        <a href={LIVE_SOURCE.url} className="underline" rel="noopener noreferrer" target="_blank">
          {LIVE_SOURCE.name}
        </a>
      </p>
    </section>
  );
}
