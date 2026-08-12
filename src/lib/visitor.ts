/**
 * 訪問者キー。
 *
 * 応援ボタンの二重押しと、投票の重複を防ぐためだけの値。
 * ブラウザの localStorage に置くUUIDで、**本人確認ではない。**
 * 消せば別人になれるし、開発者ツールから書き換えられる。
 *
 * それでもこの形にしているのは、
 *   - ログイン機構を持たない（MVPの方針）
 *   - IPアドレスを保存したくない（個人情報を持たない方針）
 * という2つの制約の中で、素直に使う利用者の二重投稿を防げる最小の手段だから。
 *
 * 本格的な多重投稿対策が要るようになったら Supabase Auth を入れる。
 * そのときはこのキーを捨てて user.id に置き換える。
 */
const STORAGE_KEY = "kouritsu-ouendan.visitor";

/** DB側の domain public.visitor_key と同じ形にする（16〜64文字の英数字とハイフン） */
function generate(): string {
  // globalThis 経由で受けるのは、`"randomUUID" in crypto` で分岐すると
  // TypeScript が else 側の crypto を never に狭めてしまうため
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();

  // randomUUID が無い環境向けの予備
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 訪問者キーを取り出す。無ければ作る。
 * localStorage が使えない場合（プライベートモード等）は null を返し、
 * 呼び出し側は「参加できないが閲覧はできる」状態にする。
 */
export function getVisitorKey(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && /^[0-9a-zA-Z_-]{16,64}$/.test(existing)) return existing;

    const created = generate();
    window.localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    return null;
  }
}

/** 応援済み・投票済みをブラウザ側で覚えておくための印 */
export function markDone(kind: string, id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${STORAGE_KEY}.${kind}.${id}`, "1");
  } catch {
    // 保存できなくても動作は続ける（DBの一意制約が本体の防御）
  }
}

export function isDone(kind: string, id: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(`${STORAGE_KEY}.${kind}.${id}`) === "1";
  } catch {
    return false;
  }
}
