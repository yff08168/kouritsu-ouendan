import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** ページ固有の注記を足す */
  children?: React.ReactNode;
  className?: string;
};

/**
 * ランキングの前提と出典。
 *
 * **どのランキングにも必ず出す。** 順位を載せる以上、
 * 「何を数えていないのか」を同じ画面に書いておかないと誤読される。
 * 特に大事なのは次の2つ。
 *   - 私立を収録していないので、ここでの順位は全国順位ではない
 *   - 出典が二次情報（Wikipedia）で、取りこぼしがありうる
 */
export function DataNote({ children, className }: Props) {
  return (
    <aside
      className={cn("rounded-xl border border-line bg-navy-50/60 p-4", className)}
      aria-labelledby="data-note-heading"
    >
      <div className="flex items-center gap-1.5">
        <Info size={15} aria-hidden="true" className="shrink-0 text-navy-600" />
        <h2 id="data-note-heading" className="text-xs font-bold text-navy-800">
          このページの数字について
        </h2>
      </div>
      <ul className="mt-2 space-y-1.5 text-[0.6875rem] leading-relaxed text-ink-muted">
        <li>
          <strong className="text-ink">私立高校は収録していません。</strong>
          このサイトが扱うのは公立・国立・高専だけです。ここでの順位は全国順位ではなく、
          公立勢の中での順位です。
        </li>
        <li>
          出場歴の出典は{" "}
          <a
            href="https://ja.wikipedia.org/wiki/全国高等学校野球選手権大会"
            className="underline underline-offset-2 hover:text-accent-800"
            target="_blank"
            rel="noopener noreferrer"
          >
            ウィキペディア日本語版
          </a>
          の大会別記事（CC BY-SA 4.0）です。統廃合した学校の記録は現在の学校に引き継いでいます。
        </li>
        <li>
          二次情報のため、校名の表記ゆれなどで取りこぼしがありえます。数字は
          <strong className="text-ink">やや少なめに出る</strong>方向にずれます。
        </li>
        <li>
          成績は勝敗から到達段階（ベスト8など）を計算しています。試合の記録が
          そろわず段階を確定できない出場は、推測で埋めずに「不明」としています。
        </li>
        {children}
      </ul>
    </aside>
  );
}
