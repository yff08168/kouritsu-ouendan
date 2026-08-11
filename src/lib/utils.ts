/** クラス名を結合する。falsy な値は無視する。 */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

/** ISO文字列を「2024.05.18」形式にする（一覧のメタ表示用） */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

/** ISO文字列を「2024年5月18日」形式にする（詳細ページの本文用） */
export function formatDateLong(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** <time datetime=""> に渡す値 */
export function toDateAttr(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}
