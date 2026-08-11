/**
 * 構造化データ（JSON-LD）を埋め込む。
 *
 * 値はすべてDBやアプリ内で組み立てたオブジェクトを JSON.stringify したもので、
 * 利用者の入力をそのまま流し込むことはない。
 * それでも </script> で閉じられるのを防ぐため、< をエスケープしておく。
 */
export function JsonLd({ data }: { data: object }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");

  return (
    <script
      type="application/ld+json"
      // JSON-LD は script の中身として出す必要があるため、ここだけは
      // dangerouslySetInnerHTML を使う（上でエスケープ済み）
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
