"use client";

import { useState } from "react";
import Link from "next/link";
import { votePoll } from "@/lib/mutations/community";
import { markDone } from "@/lib/visitor";
import { useAlreadyDone } from "@/components/community/useAlreadyDone";
import { cn } from "@/lib/utils";
import type { Poll } from "@/types/app";

/**
 * 投票・アンケート。
 *
 * 応援ボタンと同じく**文字を投稿させない参加機能**。選択肢は運営が用意する。
 * 大会シーズンに合わせてお題を差し替えられるので、再訪の動機になる。
 *
 * 投票前は選択肢のボタン、投票後は結果の棒グラフに切り替える。
 * 先に結果を見せると票が引きずられるため。
 */
export function PollCard({ poll }: { poll: Poll }) {
  const [counts, setCounts] = useState(
    () => new Map(poll.options.map((o) => [o.id, o.voteCount])),
  );
  const [chosen, setChosen] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // 過去に投票済みか（localStorage）と、いま投票したかを合わせて見る
  const alreadyVoted = useAlreadyDone("poll", poll.id);
  const [justVoted, setJustVoted] = useState(false);
  const voted = alreadyVoted || justVoted;

  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);

  async function handleVote(optionId: string) {
    if (voted || pending) return;
    setPending(true);
    setMessage(null);

    const result = await votePoll(poll.id, optionId);
    setPending(false);

    if (result.ok || result.reason === "already") {
      if (result.ok) {
        setCounts((prev) => {
          const next = new Map(prev);
          next.set(optionId, (next.get(optionId) ?? 0) + 1);
          return next;
        });
      }
      setChosen(optionId);
      setJustVoted(true);
      markDone("poll", poll.id);
      return;
    }

    setMessage(result.message);
  }

  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <h3 className="text-base font-bold text-navy-800">{poll.question}</h3>
      {poll.description && (
        <p className="mt-1 text-sm text-ink-muted">{poll.description}</p>
      )}

      <ul className="mt-4 space-y-2">
        {poll.options.map((option) => {
          const count = counts.get(option.id) ?? 0;
          const percent = total === 0 ? 0 : Math.round((count / total) * 100);

          if (!voted) {
            return (
              <li key={option.id}>
                <button
                  type="button"
                  onClick={() => handleVote(option.id)}
                  disabled={pending}
                  className={cn(
                    "w-full rounded-lg border border-line px-3 py-2.5 text-left text-sm font-medium text-ink transition",
                    "hover:border-navy-800 hover:bg-navy-50",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-800",
                    pending && "opacity-60",
                  )}
                >
                  {option.label}
                </button>
              </li>
            );
          }

          return (
            <li key={option.id}>
              {/* 投票後は結果。棒の長さは装飾なので、数値も必ず文字で出す */}
              <div className="relative overflow-hidden rounded-lg border border-line px-3 py-2.5">
                <div
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-y-0 left-0",
                    option.id === chosen ? "bg-accent-100" : "bg-navy-50",
                  )}
                  style={{ width: `${percent}%` }}
                />
                <div className="relative flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-ink">
                    {option.school ? (
                      <Link
                        href={`/schools/${option.school.slug}`}
                        className="hover:text-navy-800 hover:underline"
                      >
                        {option.label}
                      </Link>
                    ) : (
                      option.label
                    )}
                    {option.id === chosen && (
                      <span className="ml-2 text-xs text-accent-800">投票しました</span>
                    )}
                  </span>
                  <span className="shrink-0 tabular-nums text-ink-muted">
                    {percent}％（{count.toLocaleString()}票）
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs text-ink-faint">
        {voted
          ? `合計 ${total.toLocaleString()} 票`
          : "ログイン不要。1つ選ぶと結果が見られます。"}
        {poll.endsAt && (
          <>
            　受付は
            {new Date(poll.endsAt).toLocaleDateString("ja-JP", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
            まで
          </>
        )}
      </p>

      {message && (
        <p role="alert" className="mt-1 text-xs text-accent-800">
          {message}
        </p>
      )}
    </section>
  );
}
