import Link from "next/link";
import { ChevronRight, Sparkles } from "lucide-react";

/**
 * トップに置く、選抜の21世紀枠の特設ページ（`/koshien/21seiki/<年>`）への入口。
 *
 * ★**出すかどうかは呼び出し側が `senbatsu21seikiFeatureYear()` で決めて、年を渡す**
 *   （空の `Container` だけが残らないよう、判定は枠の外で見る。`JinguFeatureBanner` と同じ）。
 * ★**日付も校数もここには書かない**（取りに行かないので、書けば食い違う）。
 * ★**オレンジは枠線と小さな記号だけ。** 面で使わない（AGENTS.md）。
 */
export function SenbatsuFeatureBanner({ year }: { year: number }) {
  return (
    <Link
      href={`/koshien/21seiki/${year}`}
      className="flex min-h-11 items-center gap-3 rounded-xl border border-accent-500 bg-white px-4 py-3 hover:bg-navy-50"
    >
      <Sparkles size={20} aria-hidden="true" className="shrink-0 text-accent-500" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-navy-800 sm:text-base">
          センバツ{year} 21世紀枠　各都府県の推薦校と選考スケジュール
        </span>
        <span className="block text-xs text-ink-muted">
          発表が進む推薦校を地区別に一覧に。過去の選出校もまとめています
        </span>
      </span>
      <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-accent-500" />
    </Link>
  );
}
