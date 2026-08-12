"use client";

import { useCallback, useSyncExternalStore } from "react";
import { isDone } from "@/lib/visitor";

/**
 * 「この端末で応援済み・投票済みか」を localStorage から読む。
 *
 * useEffect の中で setState して反映するやり方は使えない
 * （React が「効果の中での同期的な setState」を禁じている）。
 * localStorage は React の外にある状態なので、そのための
 * useSyncExternalStore を使う。**サーバー側の値を false に固定できる**ので、
 * サーバーとクライアントで描画が食い違う問題も同時に解決する。
 *
 * 購読は行わない（他のタブでの変更に追随する必要が無い）ので
 * subscribe は何もしない関数を返す。
 */
const noopSubscribe = () => () => {};

export function useAlreadyDone(kind: string, id: string): boolean {
  const getSnapshot = useCallback(() => isDone(kind, id), [kind, id]);
  // サーバー描画時は必ず false。押していない状態のHTMLを返す
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(noopSubscribe, getSnapshot, getServerSnapshot);
}
