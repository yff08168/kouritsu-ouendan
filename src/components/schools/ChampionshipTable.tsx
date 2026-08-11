import { SEASONS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Championship } from "@/types/app";

/** 優勝・準優勝など、特に目立たせたい成績 */
const HIGHLIGHT_RESULTS = ["優勝", "準優勝"];

export function ChampionshipTable({ items }: { items: Championship[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        甲子園（春の選抜・夏の選手権）への出場記録はまだありません。
      </p>
    );
  }

  return (
    // 横幅の狭い画面でも表が崩れないよう、表だけを横スクロールさせる
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[26rem] border-collapse text-sm">
        <caption className="sr-only">甲子園出場歴</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-muted">
            <th scope="col" className="px-1 py-2 font-medium">
              年
            </th>
            <th scope="col" className="px-1 py-2 font-medium">
              大会
            </th>
            <th scope="col" className="px-1 py-2 font-medium">
              成績
            </th>
            <th scope="col" className="px-1 py-2 text-right font-medium">
              勝敗
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-line last:border-0">
              <td className="whitespace-nowrap px-1 py-2.5 font-medium text-ink">
                {item.year}
              </td>
              <td className="whitespace-nowrap px-1 py-2.5 text-ink-muted">
                {SEASONS[item.season]}
              </td>
              <td className="px-1 py-2.5">
                <span
                  className={cn(
                    "font-medium",
                    item.result && HIGHLIGHT_RESULTS.includes(item.result)
                      ? "text-accent-600"
                      : "text-ink",
                  )}
                >
                  {item.result ?? "－"}
                </span>
                {item.note && (
                  <span className="ml-2 text-xs text-ink-faint">
                    {item.note}
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap px-1 py-2.5 text-right tabular-nums text-ink-muted">
                {item.wins !== null && item.losses !== null
                  ? `${item.wins}勝${item.losses}敗`
                  : "－"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
