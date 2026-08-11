import { SchoolCard } from "@/components/schools/SchoolCard";
import { EmptyState } from "@/components/common/EmptyState";
import type { SchoolSummary } from "@/types/app";

/** 一覧ページ用の学校リスト。0件のときの案内もここで持つ。 */
export function SchoolList({ schools }: { schools: SchoolSummary[] }) {
  if (schools.length === 0) {
    return (
      <EmptyState
        title="該当する学校が見つかりませんでした"
        description="学校名の一部だけ、または市区町村名でも探せます。都道府県から選び直すこともできます。"
        actionHref="/schools"
        actionLabel="条件をリセットして一覧を見る"
      />
    );
  }

  return (
    <ul className="grid gap-x-6 sm:grid-cols-2">
      {schools.map((school) => (
        <li key={school.id} className="border-b border-line">
          <SchoolCard school={school} />
        </li>
      ))}
    </ul>
  );
}
