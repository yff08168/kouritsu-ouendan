import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  /*
    ★★★**Vercel の「ワーカー1つ」をローカルで再現するための逃げ道**（2026-08-29）。

    `BUILD_ONE_WORKER=1 npm run build` で、ページ生成を1ワーカーに絞る。

    ★★**なぜ要るか** —— Vercel のビルドは **2コア・8GB で「1 worker」**。
    4,419ページを**1つのヒープ**で作るので、ページごとの処理が重いと
    **後半でGCが効かなくなり、1ページ60秒の上限を超えてビルドごと落ちる。**
    ★**開発機はコアが多くワーカーも複数**なので、**ローカルで通ってもVercelで落ちる。**
    実際に2回続けて落ち、**落ちるページは毎回違った**（`kaifu` → `sano`）。
    ★**「ローカルで通る」をVercelで通る根拠にしないこと。**
  */
  experimental: process.env.BUILD_ONE_WORKER ? { cpus: 1 } : {},
  images: {
    /*
     * ★★★**Next.js の画像最適化を使わない**（2026-08-29）。
     *
     * ------------------------------------------------------------------
     * ★★**使っていたら本番の画像が全部消えた。**
     *
     * `/_next/image?url=...` が **HTTP 402**
     * （`OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED`）を返すようになり、
     * **学校の校舎写真とヒーローが1枚も出なくなった。**
     * Vercel の画像最適化の無料枠を使い切ったため。
     * ★**画像ファイル自体は 200 で配信できていた**（`/schools/seiseiko.webp`）。
     * **落ちていたのは最適化だけ。**
     *
     * ------------------------------------------------------------------
     * ★★**枠を増やすのではなく、最適化そのものをやめるのが正しい。**
     *
     * このサイトの画像は**すべて自前のスクリプトが生成した完成品**で、
     * 実行時に変換する必要が無い:
     *
     *   `public/schools/*.webp` … 3,059枚。**640x480 webp / quality 80**
     *                             （`build-school-images.mjs`）。平均54KB・最大130KB
     *   `public/hero/*.webp`    … 5枚（`npm run hero`）
     *   `public/logo*.png`      … `npm run logo`
     *
     * **3,059枚を8種類の幅に変換させる意味が無い。** Pro に上げても
     * 費用がかかるだけで、表示は1バイトも良くならない。
     *
     * ★★**元画像が大きいものを置かないこと。** 最適化が効かないので、
     * **置いたサイズがそのまま利用者に届く。**
     * `public/operator.png` は 1.3MB だったので、**原本を
     * `assets/operator-source.png` に移し、表示サイズに合わせて作り直した。**
     */
    unoptimized: true,
    /*
     * 画像は原則 Supabase Storage に保存したものだけを表示する（設計判断⑫）。
     * 外部ホストを無制限に許可すると、他サイトの画像を勝手に配信できてしまう。
     * ★**`unoptimized` でもこの制限は残す**（`next/image` が拒む）。
     */
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
};

export default nextConfig;
