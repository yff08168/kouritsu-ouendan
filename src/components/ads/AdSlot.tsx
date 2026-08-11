/**
 * 広告枠のプレースホルダ（要件19）。
 *
 * MVPでは何も描画しない。将来 AdSense やスポンサー枠を入れるときは、
 * このファイルの中身だけを差し替えれば全ページに反映される。
 * ページ側に広告ネットワーク固有のコードを書かないこと。
 */
export type AdSlotName =
  | "home-mid"
  | "news-list-mid"
  | "news-article-bottom"
  | "school-detail-bottom"
  | "sidebar";

type Props = {
  slot: AdSlotName;
  className?: string;
};

export function AdSlot(_props: Props) {
  return null;
}
