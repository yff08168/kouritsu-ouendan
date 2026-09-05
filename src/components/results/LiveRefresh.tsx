"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play } from "lucide-react";

/**
 * 速報のページを一定間隔で描き直す。
 *
 * ------------------------------------------------------------------
 * ★**サーバー側は60秒でキャッシュを作り直す**（`hsb.ts` の `revalidate`）が、
 * **開いたままの画面はそれだけでは新しくならない。** ここで取り直す。
 *
 * ★★**自動で動くものには止める手段を付ける**（AGENTS の決めごと。WCAG 2.2.2）。
 * 電光掲示板と違い**これは情報そのもの**なので、
 * ①目に見える切り替え ②タブが裏なら止める、の2つを入れてある。
 * ★**`prefers-reduced-motion` は見ない** —— 画面は動かない（数字が変わるだけ）。
 *
 * ★**間隔をサーバーより短くしないこと。** 短くしても新しい値は来ない
 * （キャッシュが変わるのは60秒ごと）。出典への負荷も増えない代わりに、
 * こちらのサーバーを無駄に叩くことになる。
 */
export function LiveRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  const [on, setOn] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!on) return;
    const tick = () => {
      // ★**裏に回っているタブでは取り直さない**（見ていない画面のために叩かない）
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setUpdatedAt(
        new Intl.DateTimeFormat("ja-JP", {
          timeZone: "Asia/Tokyo",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date()),
      );
    };
    const id = setInterval(tick, seconds * 1000);
    return () => clearInterval(id);
  }, [on, seconds, router]);

  return (
    <div className="flex items-center gap-3 text-xs text-ink-faint">
      <button
        type="button"
        onClick={() => setOn((v) => !v)}
        aria-pressed={on}
        className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 font-bold text-ink-muted hover:bg-navy-50"
      >
        {on ? <Pause size={12} aria-hidden /> : <Play size={12} aria-hidden />}
        {on ? "自動更新を止める" : "自動更新を再開する"}
      </button>
      <span aria-live="polite">
        {on ? `${seconds}秒ごとに更新` : "自動更新は止まっています"}
        {updatedAt && `／最終 ${updatedAt}`}
      </span>
    </div>
  );
}
