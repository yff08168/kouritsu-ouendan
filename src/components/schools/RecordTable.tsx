import type { SchoolRecord } from "@/types/app";

export function RecordTable({ items }: { items: SchoolRecord[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        最近の戦績はまだ登録されていません。
      </p>
    );
  }

  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[24rem] border-collapse text-sm">
        <caption className="sr-only">最近の戦績</caption>
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
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-line last:border-0">
              <td className="whitespace-nowrap px-1 py-2.5 font-medium text-ink">
                {item.year}
              </td>
              <td className="px-1 py-2.5 text-ink">{item.tournamentName}</td>
              <td className="px-1 py-2.5 text-ink-muted">
                {item.result ?? "－"}
                {item.note && (
                  <span className="ml-2 text-xs text-ink-faint">
                    {item.note}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
