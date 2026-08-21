"use client";

import { useState } from "react";
import { postCheerMessage } from "@/lib/mutations/community";
import { cn } from "@/lib/utils";

const MAX_BODY = 200;

type Props = {
  schoolId: string;
  schoolName: string;
};

/**
 * 応援メッセージの投稿欄。**学校ページに置く**（0008）。
 *
 * かつては都道府県ページに置いていた。学校ページに自由記述欄を作ると
 * 「○○高校の△△君」という書き込みが出るためで、これは
 * 「選手個人のページ・個人成績は作らない」という方針（AGENTS.md）と
 * 揃えたものだった。**2026-08-20 に運営者の判断で学校単位に変えた。**
 *
 * ★選手個人を取り上げない方針そのものは変わっていない。
 * 置き場所が学校ページに移ったぶん個人名が書かれやすくなるので、
 * 歯止めは全部残してある。
 *
 *   - 投稿は必ず下書きとして入り、承認したものだけ公開される
 *     （DBトリガ force_cheer_message_draft が status を強制する）
 *   - 個人名を書かないよう、送信前と送信後の両方で伝える
 *   - 利用規約 5-2 が「選手・生徒個人を名指しした内容は掲載しない」と
 *     定めている。**承認する人はここを基準に見る**
 *
 * お題（cheer_topics）は 2026-08-20 にやめた。宛先が学校に決まったので
 * 「何を書く場所か」は見出しで足りる。
 */
export function CheerMessageForm({ schoolId, schoolName }: Props) {
  const [body, setBody] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remaining = MAX_BODY - body.length;
  const tooLong = remaining < 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || tooLong || body.trim().length === 0) return;

    setPending(true);
    setError(null);

    const result = await postCheerMessage({
      schoolId,
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
        {schoolName}へ応援メッセージ
      </h3>

      {/*
        ★注意書きは本文欄の「前」に置く。書いたあとに条件を知らせても、
        書き直しになるだけで守られにくい。
      */}
      <p className="mt-2 rounded-lg bg-navy-50 px-3 py-2 text-xs leading-relaxed text-ink-muted">
        チームへの応援としてお書きください。
        <strong className="font-bold text-navy-800">
          選手・生徒個人のお名前が入った投稿は掲載しません。
        </strong>
        称賛のつもりでも同じ扱いになります。
      </p>

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
          placeholder={`${schoolName}を応援する言葉をどうぞ。`}
        />
        <div className="mt-1 flex items-center justify-between gap-3">
          <p id="cheer-body-help" className="text-xs text-ink-faint">
            個人名は伏せて、チームへの言葉としてお書きください。
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
