"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { cheerSchool } from "@/lib/mutations/community";
import { markDone } from "@/lib/visitor";
import { useAlreadyDone } from "@/components/community/useAlreadyDone";
import { cn } from "@/lib/utils";

type Props = {
  schoolId: string;
  schoolName: string;
  /** サーバーで描画した時点の応援数 */
  initialCount: number;
};

/**
 * 応援ボタン。文字を投稿させない、いちばん軽い参加の形。
 *
 * テキストが入らないので、誹謗中傷も個人情報も入りようがない。
 * 削除依頼も発生しない。**未成年が対象のサイトで最初に置ける参加機能**として
 * これを選んでいる（README「コミュニティ機能」）。
 *
 * 押したかどうかは localStorage で覚える。別の端末では押せてしまうが、
 * 本人確認をしない以上そこは割り切る。DBの一意制約
 * unique (school_id, visitor_key) が同じ端末からの重複を止める。
 */
export function CheerButton({ schoolId, schoolName, initialCount }: Props) {
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // 過去に押していたか（localStorage）と、いま押したかを合わせて見る。
  // localStorage はサーバーで読めないので useSyncExternalStore で扱い、
  // サーバー描画時は必ず「未応援」にして表示の食い違いを避ける。
  const alreadyCheered = useAlreadyDone("cheer", schoolId);
  const [justCheered, setJustCheered] = useState(false);
  const cheered = alreadyCheered || justCheered;

  async function handleClick() {
    if (cheered || pending) return;
    setPending(true);
    setMessage(null);

    // 先に数を増やしておき、失敗したら戻す。押した手応えを優先する
    setCount((n) => n + 1);
    setJustCheered(true);

    const result = await cheerSchool(schoolId);
    setPending(false);

    if (result.ok) {
      markDone("cheer", schoolId);
      return;
    }

    if (result.reason === "already") {
      // すでに押していた。数は正しくないかもしれないが、押した状態のままにする
      markDone("cheer", schoolId);
      setCount((n) => Math.max(n - 1, 0));
      return;
    }

    setCount((n) => Math.max(n - 1, 0));
    setJustCheered(false);
    setMessage(result.message);
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={cheered || pending}
        aria-pressed={cheered}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-800 focus-visible:ring-offset-2",
          cheered
            ? "cursor-default border-accent-500 bg-accent-50 text-navy-900"
            : "border-line bg-white text-navy-800 hover:border-navy-800 hover:bg-navy-50",
        )}
      >
        <Heart
          size={16}
          aria-hidden="true"
          className={cheered ? "fill-accent-500 text-accent-500" : "text-accent-800"}
        />
        <span>{cheered ? "応援しました" : "応援する"}</span>
        <span className="tabular-nums text-ink-muted">{count.toLocaleString()}</span>
      </button>

      <p className="mt-1.5 text-xs text-ink-faint">
        {cheered
          ? `${schoolName}への応援をありがとうございます。`
          : "ログイン不要。押した数だけが記録されます。"}
      </p>

      {message && (
        <p role="alert" className="mt-1 text-xs text-accent-800">
          {message}
        </p>
      )}
    </div>
  );
}
