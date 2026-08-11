import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  images: {
    /*
     * 画像は原則 Supabase Storage に保存したものだけを表示する（設計判断⑫）。
     * 外部ホストを無制限に許可すると、他サイトの画像を勝手に配信できてしまう。
     */
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
};

export default nextConfig;
