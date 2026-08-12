import Link from "next/link";
import type { SchoolKoshienStats } from "@/types/app";

type Props = {
  schools: SchoolKoshienStats[];
  /** 校名の後ろに出す小さな文字（達成年など） */
  annotate?: (stats: SchoolKoshienStats) => string | null;
  className?: string;
};

/**
 * 学校名を並べる。
 *
 * 数十〜数百校を出す場面で使う。1行1校のリストにすると縦に長くなりすぎて
 * 「何校いるのか」が掴めなくなるため、折り返す小さなリンクにしている。
 */
export function SchoolChips({ schools, annotate, className }: Props) {
  return (
    <ul className={className}>
      {schools.map((school) => {
        const note = annotate?.(school) ?? null;
        return (
          <li key={school.slug} className="inline-block">
            <Link
              href={`/schools/${school.slug}`}
              className="m-0.5 inline-flex items-baseline gap-1 rounded-md border border-line bg-white px-2 py-1 text-xs hover:border-navy-300 hover:bg-navy-50"
            >
              <span className="font-bold text-ink">{school.name}</span>
              <span className="text-[0.625rem] text-ink-faint">
                {school.prefecture.name}
                {note && `・${note}`}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
