"use client";

import { useState } from "react";
import { postCheerMessage } from "@/lib/mutations/community";
import { cn } from "@/lib/utils";
import type { CheerTopic } from "@/types/app";

const MAX_BODY = 200;

type Props = {
  prefectureId: number;
  prefectureName: string;
  topics: CheerTopic[];
};

/**
 * 応援メッセージの投稿欄。
 *
 * **学校ページではなく都道府県ページに置く。** 学校ページに自由記述欄を作ると
 * 「○○高校の△△君」という書き込みが出る。このサイトは選手個人のページを
 * 作らない方針（AGENTS.md）なので、自分が載せない情報を利用者に書かせる
 * 場所も作らない。都道府県単位なら個人が特定されにくい。
 *
 * お題を選ばせるのは、自由記述の幅を狭めて内容を誘導するため。
 * 投稿は必ず下書きとして入り、運営が承認したものだけ公開される
 * （DBトリガ force_cheer_message_draft が status を強制する）。
 */
export function CheerMessageForm({ prefectureId, prefectureName, topics }: Props) {
  const [topicId, setTopicId] = useState<string>(topics[0]?.id ?? "");
  const [body, setBody] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = MAX_BODY - body.length;
  const tooLong = remaining < 0;
  const selectedTopic = topics.find((t) => t.id === topicId);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || tooLong || body.trim().length === 0) return;

    setPending(true);
    setError(null);

    const result = await postCheerMessage({
      prefectureId,
      topicId: topicId || null,
      body,
      displayName: displayName || null,
    });

    setPending(false);

    if (result.ok) {
      setDone(true);
      setBody("");
      setDisplayName("");
      return;
    }
    setError(result.message);
  }

  if (done) {
    return (
      <div className="rounded-xl border border-line bg-navy-50 p-5">
        <p className="text-sm font-bold text-navy-800">投稿を受け付けました。</p>
        <p className="mt-1 text-sm text-ink-muted">
          内容を確認したうえで掲載します。すぐには表示されません。
        </p>
        <button
          type="button"
          onClick={() => setDone(false)}
          className="mt-3 text-sm font-medium text-navy-800 underline"
        >
          続けて投稿する
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-line bg-white p-5"
    >
      <h3 className="text-base font-bold text-navy-800">
        {prefectureName}の公立校へ応援メッセージ
      </h3>

      {topics.length > 0 && (
        <div className="mt-3">
          <label
            htmlFor="cheer-topic"
            className="block text-sm font-medium text-ink"
          >
            お題
          </label>
          <select
            id="cheer-topic"
            value={topicId}
            onChange={(e) => setTopicId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink"
          >
            {topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.title}
              </option>
            ))}
          </select>
          {selectedTopic?.description && (
            <p className="mt-1 text-xs text-ink-muted">
              {selectedTopic.description}
            </p>
          )}
        </div>
      )}

      <div className="mt-3">
        <label htmlFor="cheer-body" className="block text-sm font-medium text-ink">
          本文
        </label>
        <textarea
          id="cheer-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          required
          aria-describedby="cheer-body-help"
          className="mt-1 w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink"
          placeholder="地元の公立校を応援する言葉をどうぞ。"
        />
        <div className="mt-1 flex items-center justify-between gap-3">
          <p id="cheer-body-help" className="text-xs text-ink-faint">
            選手個人の名前は書かないでください。
          </p>
          <span
            className={cn(
              "shrink-0 text-xs tabular-nums",
              tooLong ? "font-bold text-accent-800" : "text-ink-faint",
            )}
          >
            残り {remaining}
          </span>
        </div>
      </div>

      <div className="mt-3">
        <label htmlFor="cheer-name" className="block text-sm font-medium text-ink">
          お名前（任意・20文字まで）
        </label>
        <input
          id="cheer-name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={20}
          className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink"
          placeholder="未入力なら「名無しの応援団」になります"
        />
      </div>

      <p className="mt-3 text-xs text-ink-muted">
        投稿は内容を確認したうえで掲載します。すぐには表示されません。
        本名・連絡先など、ご自身や他の方が特定される情報は書かないでください。
      </p>

      <button
        type="submit"
        disabled={pending || tooLong || body.trim().length === 0}
        className={cn(
          "mt-3 rounded-lg bg-navy-800 px-4 py-2 text-sm font-bold text-white transition",
          "hover:bg-navy-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-800 focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {pending ? "送信中…" : "投稿する"}
      </button>

      {error && (
        <p role="alert" className="mt-2 text-sm text-accent-800">
          {error}
        </p>
      )}
    </form>
  );
}
