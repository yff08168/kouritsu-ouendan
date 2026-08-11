import { AlertTriangle } from "lucide-react";
import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";

type Props = {
  title: string;
  lead?: string;
  /** 最終更新日（YYYY-MM-DD） */
  updatedAt?: string;
  children: React.ReactNode;
};

/** 運営者情報・規約などの固定ページの共通枠 */
export function StaticPage({ title, lead, updatedAt, children }: Props) {
  return (
    <Container size="narrow" className="pb-4">
      <Breadcrumb items={[{ label: title }]} />

      <article className="rounded-xl border border-line bg-white p-5 sm:p-8">
        <h1 className="text-xl font-bold text-navy-800 sm:text-2xl">{title}</h1>
        {lead && (
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">{lead}</p>
        )}
        {updatedAt && (
          <p className="mt-3 text-xs text-ink-faint">
            最終更新日：
            <time dateTime={updatedAt}>{updatedAt.replace(/-/g, "/")}</time>
          </p>
        )}

        <div className="markdown mt-8">{children}</div>
      </article>
    </Container>
  );
}

/**
 * 公開前に埋める必要がある項目の警告。
 * 実在しない運営者名を仮に入れると虚偽の情報を掲載することになるため、
 * 空欄であることを隠さずに出す。
 */
export function UnsetNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-accent-500 bg-accent-50 p-3 text-sm text-ink">
      <AlertTriangle
        size={16}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-accent-600"
      />
      <span>
        <strong className="font-bold">未設定：</strong>
        {children}
      </span>
    </p>
  );
}
