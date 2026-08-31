/**
 * 画面の好み（この端末だけに残る設定）。
 *
 * ------------------------------------------------------------------
 * ★**`visitor.ts` と分けてある。**
 *
 * あちらは「応援済み・投票済み」を覚えるためのもので、**DBの重複防止と対**になっている。
 * こちらは**見え方の好み**だけで、消えても何も壊れない。混ぜると
 * 「訪問者キーを消したら自動スライドの設定も消えた」のような紛らわしさが出る。
 *
 * ------------------------------------------------------------------
 * ★★**localStorage は使えないことがある**（プライベートモード・サイトデータの
 * 遮断）。**読み書きとも例外を握りつぶして既定値で動かす**（`visitor.ts` と同じ）。
 */

const KEY = "kouritsu-ouendan.pref.autoplay";

/** 変更を購読する人たち。同じページ内の複数のカルーセルが揃って切り替わるように */
const listeners = new Set<() => void>();

export function subscribeAutoplay(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 「自動でめくる」の設定。
 *
 * ★**未設定は `null`。** `false` と区別すること ——
 * **「動きを減らす」設定の人には既定で止めておきたい**が、
 * **その人が自分で「めくる」を選んだのなら、その選択のほうを尊重する。**
 * 3値にしていないとこの2つを見分けられない。
 */
export function readAutoplay(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(KEY);
    if (value === "1") return true;
    if (value === "0") return false;
    return null;
  } catch {
    return null;
  }
}

export function writeAutoplay(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // 保存できなくても、そのページのあいだは効く（状態はReact側にもある）
  }
  for (const listener of listeners) listener();
}
