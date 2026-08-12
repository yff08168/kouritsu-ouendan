import Link from "next/link";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  href?: string;
  icon?: React.ReactNode;
  className?: string;
};

/**
 * 数字を1つ大きく見せるカード。ハブページの見出し代わりに使う。
 *
 * 数字だけを置かず必ず label と note を付ける。「3,531」とだけ出ても
 * 何の数字か分からないため。
 */
export function StatTile({ label, value, unit, note, href, icon, className }: Props) {
  const body = (
    <>
      <div className="flex items-center gap-1.5">
        {icon && (
          <span aria-hidden="true" className="shrink-0 text-accent-500">
            {icon}
          </span>
        )}
        <p className="text-xs font-bold text-ink-muted">{label}</p>
      </div>
      <p className="mt-1.5 flex items-baseline gap-1 text-navy-800">
        <span className="text-2xl font-bold tabular-nums leading-none sm:text-3xl">
          {value}
        </span>
        {unit && <span className="text-xs font-bold">{unit}</span>}
      </p>
      {note && (
        <p className="mt-1.5 text-[0.6875rem] leading-snug text-ink-faint">{note}</p>
      )}
    </>
  );

  const base = "block rounded-xl border border-line bg-white p-4";

  if (!href) return <div className={cn(base, className)}>{body}</div>;

  return (
    <Link href={href} className={cn(base, "hover:border-navy-300 hover:bg-navy-50/40", className)}>
      {body}
    </Link>
  );
}
