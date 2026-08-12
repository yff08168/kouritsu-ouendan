import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * ブラウザから使う Supabase クライアント。
 *
 * 読み取りはサーバーコンポーネント（supabase/server.ts）で行う方針だが、
 * 応援ボタン・投票・メッセージ投稿は利用者の操作なのでブラウザから書き込む。
 *
 * **anon キーは公開鍵なので、このクライアントを通さず直接 Supabase を
 * 叩かれる前提で考えること。** アプリ側でどう制限しても裏口は塞げない。
 * 何を書き込めるかは RLS ポリシーとDBトリガ（0005_community.sql）が決める。
 *
 * service_role キーはブラウザに置かない。置いた時点でRLSが無意味になる。
 */
let client: SupabaseClient | null = null;

export function createSupabaseBrowserClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabaseの環境変数が設定されていません。");
  }

  client = createClient(url, anonKey, {
    auth: {
      // ログイン機構を持たないのでセッションは不要
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return client;
}
