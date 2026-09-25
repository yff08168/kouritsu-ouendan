"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 県のページの結果欄で「公立が出た試合」と「全試合」を切り替えるボタン。
 *
 * ------------------------------------------------------------------
 * ★★ 2026-09-25。運営者の提案「ボタンで公立のみの試合か、全試合を表示するかを選択できるように」
 *
 *   ★**最初は公立のみ**（運営者の指示）。サイトの決めごと
 *   「私立の戦績も引用し、**着目するところを公立にする**」に合わせる。
 *   ★**選んだ表示は覚えさせない。** 開くたびに公立のみから始める
 *   （「最初は公立のみ」を端末ごとに崩さないため）。
 *
 * ------------------------------------------------------------------
 * ★★ 試合の行は全部サーバーで描いてある。ここは見せる行を切り替えるだけ
 *
 *   私立どうしの行と、その行しか無い日の見出しに \`VIEW_HIDDEN_WHEN_PUBLIC\` を付けておく。
 *   この部品が \`data-view\` を切り替え、CSS がその行を隠す。
 *   ★**検索エンジンにも両方の中身が見える**（トップの横スライドと同じ考え方）。
 *   ★**JavaScript が動かない環境では公立のみのまま読める。**
 */
export function ResultsViewSwitch({
  publicCount,
  allCount,
  children,
}: {
  publicCount: number;
  allCount: number;
  children: ReactNode;
}) {
  const [view, setView] = useState<"public" | "all">("public");

  const options = [
    { key: "public", label: "公立が出た試合", count: publicCount },
    { key: "all", label: "全試合", count: allCount },
  ] as const;

  return (
    <div data-view={view} className="group/view">
      <div
        role="group"
        aria-label="表示する試合"
        className="mt-3 inline-flex rounded-lg border border-line p-0.5"
      >
        {options.map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            aria-pressed={view === key}
            onClick={() => setView(key)}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-bold",
              // ★選んでいるほうは navy の面（オレンジは面で使わない）
              view === key ? "bg-navy-800 text-white" : "text-ink-muted hover:bg-navy-50",
            )}
          >
            {label}
            <span className="font-normal tabular-nums">{count}</span>
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}

