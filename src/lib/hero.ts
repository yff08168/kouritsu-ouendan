/**
 * トップのヒーローで順に切り替える背景写真。
 *
 * 画像そのものは `public/hero/`。**直接編集しない。**
 * 原本を `assets/hero/` に置いて `npm run hero` で書き出す（README「ヒーローの写真」）。
 *
 * ★ 出典が確認できない写真をここに足さないこと。★
 * このサイトは広告を載せる＝営利なので、「個人利用のみ可」のフリー素材は使えない。
 * 素材サイトから取るときは**規約で商用利用の可否を確かめてから** `source` に書く。
 */
export type HeroSlide = {
  /** public/ からのパス */
  url: string;
  /**
   * **画面に出す**クレジット。表示義務があるときだけ入れる。
   * 義務が無ければ null でよいが、`source` は必ず書くこと。
   */
  credit: string | null;
  /** クレジットからのリンク先 */
  sourceUrl?: string;
  /**
   * 出典の記録。**画面には出さないが必ず書く。**
   * あとから「この写真はどこから来たのか」を追えるようにするため。
   * 素材サイトのものは規約を確認した日も残す。
   */
  source: string;
  /**
   * 左右を反転して表示する。
   *
   * 見出しは左側に置いてあるので、被写体が写真の左に寄っていると文字と重なる。
   * 反転すれば被写体が右に来て、両方が見えるようになる。
   * **文字や左右が意味を持つものが写っている写真には使わない**（鏡文字になる）。
   */
  flipHorizontal?: boolean;
  /**
   * 何が写っているか。背景の装飾なので alt には出さないが、
   * どの写真か分からなくなるのを防ぐためにコードには残す。
   */
  note: string;
};

/** 切り替えの間隔。速いと落ち着かず、遅すぎると変わったことに気づかれない。 */
export const HERO_SLIDE_INTERVAL_MS = 7000;

/** 重なりの切り替えにかける時間。CSSのdurationと合わせる。 */
export const HERO_FADE_MS = 1200;

export const HERO_SLIDES: HeroSlide[] = [
  {
    url: "/hero/koshien-gaikan.jpg",
    // 写真AC は商用利用可・クレジット表記不要。禁止されているのは
    // 「素材を独立の取引対象として頒布すること」で、背景としての利用は該当しない。
    credit: null,
    source:
      "写真AC https://www.photo-ac.com/main/detail/34771680/1" +
      "（商用利用可・クレジット不要。2026-08-12 規約確認）",
    note: "阪神甲子園球場の外観。ツタに覆われた壁面と入場券売場",
  },
  {
    url: "/hero/koshien-seibi.jpg",
    credit: null,
    source: "運営者が撮影",
    note: "試合後の甲子園。夕暮れのグラウンド整備",
  },
  {
    url: "/hero/koshien-kaikaishiki.jpg",
    credit: null,
    source: "運営者が撮影",
    note: "選抜大会の開会式。満員のスタンドと整列する選手",
  },
  {
    url: "/hero/jingu-game.jpg",
    credit: null,
    source: "運営者が撮影",
    note: "明治神宮野球場での高校野球。バックネット越しの投球",
  },
  {
    url: "/hero/ball.jpg",
    // ぱくたそ は商用利用可・クレジット任意。禁止は再配布・商品化と、
    // **素材への直接リンク**。ここでは public/ に置いて自分で配信するので該当しない。
    credit: null,
    source:
      "ぱくたそ https://www.pakutaso.com/" +
      "（商用利用可・クレジット任意。2026-08-12 規約確認）",
    // 元の写真はボールが左寄り。そのままだと見出しの裏に隠れる
    flipHorizontal: true,
    note: "夕暮れのグラウンドに置かれた硬式球",
  },
];
