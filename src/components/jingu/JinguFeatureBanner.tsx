import Link from "next/link";
import { ChevronRight, Trophy } from "lucide-react";

/**
 * トップに置く、明治神宮大会の特設ページ（`/jingu/<年>`）への入口。
 *
 * ★**出すかどうかは呼び出し側が `jinguAnnounceYear()` で決めて、年を渡す**
 * （空の `Container` だけが残らないよう、判定は枠の外で見る）。
 * 日付の窓（10/20〜12/10）と、その年の大会が生成物に入ったか、だけで決まる。
 * ★**主催者のページは取りに行かない** —— トップは10分ごとに作り直しており、
 * ここで fetch の期限（5分）を持ち込むと**トップの作り直しが5分ごとになる**
 * （AGENTS.md「期限をページより短くすると…」）。
 * ★**日付も校数もここには書かない**（取りに行かないので、書けば食い違う）。
 * ★**オレンジは枠線と小さな記号だけ。** 面で使わない（AGENTS.md）。
 */
export function JinguFeatureBanner({ year }: { year: number }) {
  return (
    <Link
      href={`/jingu/${year}`}
      className="flex min-h-11 items-center gap-3 rounded-xl border border-accent-500 bg-white px-4 py-3 hover:bg-navy-50"
    >
      <Trophy size={20} aria-hidden="true" className="shrink-0 text-accent-500" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-navy-800 sm:text-base">
          {year}年 明治神宮大会（高校の部）　組み合わせ・日程・結果
        </span>
        <span className="block text-xs text-ink-muted">
          秋の地区大会を勝ち抜いた学校が集まる、その年の実質的な日本一決定戦
        </span>
      </span>
      <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-accent-500" />
    </Link>
  );
}
