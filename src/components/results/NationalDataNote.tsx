import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * 全国大会のページに出す「このページの数字について」。
 *
 * ------------------------------------------------------------------
 * ★★ ランキングの `DataNote` とは書くことが違う
 *
 *   ランキングは**公立しか数えていない**ので「順位は全国順位ではない」と
 *   書く必要がある。**こちらは全試合を収録している**（私立も含む）ので、
 *   同じ文を出すと**嘘になる。**
 *
 *   ★**代わりに書くべきは「読めていない大会がある」こと。**
 *   出典の大会記事は年代によって書き方が違い、**検算に落ちた大会は
 *   1試合も出していない**（だいたい合っている表を出さない）。
 *   ★**「全大会そろっている」と読ませないこと。**
 */
export function NationalDataNote({
  className,
  missing,
  source,
}: {
  className?: string;
  /** 収録できていない大会の数 */
  missing?: number;
  /**
   * ★**その大会だけ出所が違うときに渡す。**
   * 既定（ウィキペディア）の説明を、実際の出所で上書きする。
   * **出典の表示は実際の出所と一致させること**（AGENTS.md）。
   */
  source?: { name: string; url?: string } | null;
}) {
  return (
    <aside
      className={cn("rounded-xl border border-line bg-navy-50/60 p-4", className)}
      aria-labelledby="national-note-heading"
    >
      <div className="flex items-center gap-1.5">
        <Info size={15} aria-hidden="true" className="shrink-0 text-navy-600" />
        <h2 id="national-note-heading" className="text-xs font-bold text-navy-800">
          このページの記録について
        </h2>
      </div>
      <ul className="mt-2 space-y-1.5 text-[0.6875rem] leading-relaxed text-ink-muted">
        <li>
          <strong className="text-ink">私立を含む全試合を載せています。</strong>
          大会の記録は全試合がそろって初めて勝ち上がりを追えるためです。
          このサイトが学校ページを持つのは公立・国立・高専だけなので、
          <strong className="text-accent-800">オレンジ</strong>
          の校名だけが学校ページにつながります。
        </li>
        {source ? (
          <li>
            <strong className="text-ink">この大会の出典は</strong>{" "}
            {source.url ? (
              <a
                href={source.url}
                className="underline underline-offset-2 hover:text-accent-800"
                target="_blank"
                rel="noopener noreferrer"
              >
                {source.name}
              </a>
            ) : (
              source.name
            )}
            <strong className="text-ink">です。</strong>
            ほかの大会はウィキペディア日本語版の大会別記事（CC BY-SA 4.0）から作っていますが、
            この大会は記事の作りが原因で機械的に読めなかったため、別の出典から補っています。
            引用しているのは対戦相手・スコア・回戦だけです。
          </li>
        ) : (
          <li>
            出典は{" "}
            <a
              href="https://ja.wikipedia.org/wiki/全国高等学校野球選手権大会"
              className="underline underline-offset-2 hover:text-accent-800"
              target="_blank"
              rel="noopener noreferrer"
            >
              ウィキペディア日本語版
            </a>
            の大会別記事（CC BY-SA 4.0）です。記事の本文は取り込まず、
            対戦相手・スコア・日付・回戦だけを引用しています。
          </li>
        )}
        <li>
          <strong className="text-ink">確かでない大会は載せていません。</strong>
          「優勝校以外はちょうど1回だけ負ける」「次の回戦に出るのは前の回戦の勝者」
          という条件で機械的に検算し、
          {missing != null && missing > 0 ? `${missing}大会は` : "合わない大会は"}
          1試合も出していません。
        </li>
        <li>
          不戦勝・ノーゲームは試合として数えていません（行われていないため）。
          引き分け再試合は、引き分けと再試合の両方を載せています。
        </li>
      </ul>
    </aside>
  );
}
