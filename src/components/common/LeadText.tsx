/**
 * ページ見出しの直後に置く導入文。
 *
 * ★**見出しを付けていない。** 独立した節ではなく見出し直下の導入文であって、
 * `<h2>` を挟むと目次の並び（甲子園出場歴・最近の戦績…）に割り込む。
 *
 * ★★**文の組み立てはここに書かないこと。** ページごとの組み立ては
 * `src/lib/school-lead.ts` / `prefecture-lead.ts` / `tournament-lead.ts` にある。
 * **ここは器だけ**（3種類のページで同じ見た目にするために1つにしてある）。
 */

type Props = {
  /** `build◯◯Lead` が返した段落。空なら何も描かない */
  paragraphs: string[];
  /** 読み上げ用のラベル */
  label?: string;
  className?: string;
};

export function LeadText({
  paragraphs,
  label = "このページの概要",
  className = "mt-4",
}: Props) {
  if (paragraphs.length === 0) return null;

  return (
    <section
      aria-label={label}
      className={`${className} rounded-xl border border-line bg-white p-5`}
    >
      {paragraphs.map((text) => (
        <p key={text} className="text-sm leading-relaxed text-ink [&+p]:mt-2.5">
          {text}
        </p>
      ))}
    </section>
  );
}
