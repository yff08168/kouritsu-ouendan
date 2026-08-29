/**
 * 学校ページのリード文。
 *
 * ★**見出しを付けていない。** 見出し直下の導入文であって独立した節ではなく、
 * `<h2>` を挟むと目次の並び（甲子園出場歴・最近の戦績…）に割り込む。
 *
 * ★**文の組み立ては `src/lib/school-lead.ts` にある。** ここは器だけ。
 */

type Props = {
  /** `buildSchoolLead` が返した段落。空なら何も描かない */
  paragraphs: string[];
};

export function SchoolLead({ paragraphs }: Props) {
  if (paragraphs.length === 0) return null;

  return (
    <section
      aria-label="このページの概要"
      className="mt-4 rounded-xl border border-line bg-white p-5"
    >
      {paragraphs.map((text) => (
        <p
          key={text}
          className="text-sm leading-relaxed text-ink [&+p]:mt-2.5"
        >
          {text}
        </p>
      ))}
    </section>
  );
}
