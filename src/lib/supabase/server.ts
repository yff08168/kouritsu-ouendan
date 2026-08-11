import { createClient } from "@supabase/supabase-js";

/**
 * サーバーコンポーネント / Route Handler から使う Supabase クライアント。
 *
 * MVPは公開データの読み取りしか行わないため anon キーだけを使う。
 * anon キーはブラウザに出ても問題ない鍵だが、実際に何が読めるかは
 * RLS ポリシー（supabase/migrations/0002_rls.sql）が決めている。
 *
 * service_role キーは RLS を無視できてしまうため、ここでは絶対に使わない。
 * 管理機能やニュース自動収集を作るときに、専用のクライアントを別途用意する。
 *
 * TODO(Phase 3適用後): Supabase CLI で database.types.ts を生成し、
 *   createClient<Database>(...) と型を付ける。
 */
export function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabaseの環境変数が設定されていません。.env.example を参考に .env.local を作成してください。",
    );
  }

  return createClient(url, anonKey, {
    auth: {
      // 公開データの読み取りだけなのでセッションを持たない
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
