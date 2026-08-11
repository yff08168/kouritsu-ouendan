import { ExternalLink, Info } from "lucide-react";

type Props = {
  sourceName: string | null;
  sourceUrl: string | null;
};

/**
 * 出典表示。
 *
 * このサイトは他社記事の全文を転載しない。掲載できるのは
 * 「見出し＋自分の言葉による要約＋出典名＋元記事へのリンク」まで。
 * その方針を読者にも見える形にするため、記事末尾に必ず出す。
 */
export function SourceNote({ sourceName, sourceUrl }: Props) {
  if (!sourceName && !sourceUrl) return null;

  const isExternalSource = Boolean(sourceUrl);

  return (
    <aside className="mt-8 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-start gap-2">
        <Info
          size={16}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-ink-faint"
        />
        <div className="min-w-0 text-xs leading-relaxed text-ink-muted">
          <p>
            <span className="font-bold text-ink">出典</span>
            {sourceName && `：${sourceName}`}
          </p>

          {sourceUrl && (
            <p className="mt-1.5">
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 break-all text-navy-700 underline underline-offset-2 hover:text-accent-600"
              >
                元記事を読む
                <ExternalLink size={12} aria-hidden="true" className="shrink-0" />
              </a>
            </p>
          )}

          {isExternalSource && (
            <p className="mt-1.5 text-ink-faint">
              本記事は出典元の内容をもとに編集部が要約したものです。詳細は元記事をご確認ください。
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
