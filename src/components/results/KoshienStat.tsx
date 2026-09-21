/**
 * 見出しの下に並べる数字の枠（`/koshien/public` と `/koshien/public/<年>`）。
 * `/koshien` の `Stat` と同じ見た目。**面ではなく字の色でアクセント**（AGENTS.md）。
 */
export function KoshienStat({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line px-2 py-3">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-1">
        <span
          className={
            accent
              ? "text-xl font-bold text-accent-800 sm:text-2xl"
              : "text-xl font-bold text-navy-800 sm:text-2xl"
          }
        >
          {value}
        </span>
        <span className="ml-0.5 text-xs text-ink-muted">{unit}</span>
      </dd>
    </div>
  );
}
