import Link from "next/link";

import { cn } from "@/lib/utils";
import type { PublicEntrant } from "@/lib/national-tournaments";

/**
 * その大会に出場した公立高校。**このサイトの主語**なので、大会ページの上に置く。
 *
 * ------------------------------------------------------------------
 * ★★ 敗戦数を出さない（AGENTS.md の決めごと）
 *
 *   出すのは**勝った数**と、**負けた回戦の名前**だけ。
 *   ★**「ベスト16」のような段階名に言い換えない** —— 出場校数が
 *   大会によって違うので、同じ「3回戦敗退」でも段階名が変わる。
 *   **紙に書いてある回戦の名前をそのまま出す。**
 *
 * ★**成績が読めない学校は「成績不明」**と書く。
 *   **「初戦敗退」に混ぜないこと**（AGENTS.md）。
 */
export function PublicEntrantList({ entrants }: { entrants: PublicEntrant[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {entrants.map((e) => (
        <li key={e.slug}>
          <Link
            href={`/schools/${e.slug}`}
            className="flex min-h-11 items-center gap-3 rounded-lg border border-line px-3 py-2 hover:bg-navy-50"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-accent-800">
                {e.display}
              </span>
              <span className="block truncate text-xs text-ink-faint">
                {e.name}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span
                className={cn(
                  "block text-xs font-bold",
                  e.result === "優勝" || e.result === "準優勝"
                    ? "text-accent-800"
                    : "text-ink-muted",
                )}
              >
                {e.result}
              </span>
              {e.wins > 0 && (
                <span className="block text-[0.6875rem] text-ink-faint">
                  {e.wins}勝
                </span>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
