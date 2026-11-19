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
export function LiveRefresh({
  seconds = 60,
  until,
  activeHours,
}: {
  seconds?: number;
  /** 自動更新する時間帯（日本時間の時。`[7, 20]` なら7時以上20時未満）。省くと終日 */
  activeHours?: [number, number];
  /**
   * この時刻（ISO。`2026-11-24T23:59:00+09:00` など）を過ぎたら自動更新をやめる。
   * ★**明治神宮大会の特設ページ用**（大会の最終日まで。2026-11-19）。省くと止めない（速報ページ）。
   */
  until?: string;
}) {
  const router = useRouter();
  const [on, setOn] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const label = seconds % 60 === 0 && seconds >= 120 ? `${seconds / 60}分` : `${seconds}秒`;

  useEffect(() => {
    if (!on) return;
    const tick = () => {
      // ★**終了日を過ぎたら止める**（大会が終わった画面を取り直し続けない）
      if (until && Date.now() > new Date(until).getTime()) {
        setOn(false);
        return;
      }
      // ★**試合のない時間帯（日本時間の20時〜7時）は取り直さない**（開きっぱなしのタブが夜通し叩かない）。
      //   `activeHours` を渡したページだけ。速報ページは渡さない（夏の夜まで試合がある）
      if (activeHours) {
        const hour = Number(
          new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", hour12: false }).format(
            new Date(),
          ),
        );
        if (hour < activeHours[0] || hour >= activeHours[1]) return;
      }
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
  }, [on, seconds, until, activeHours, router]);

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
        {on ? `${label}ごとに更新` : "自動更新は止まっています"}
        {updatedAt && `／最終 ${updatedAt}`}
      </span>
    </div>
  );
}
