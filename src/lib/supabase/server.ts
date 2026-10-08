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
    global: { fetch: cachedFetch },
  });
}

/*
  ------------------------------------------------------------------
  ★★★ 読み取りは全部 Next のデータキャッシュに通す（2026-10-08）

  **Supabase の無料枠（転送量 月5GB）を、9月13日に戻ってから17日で使い切った**（7.2GB）。
  ログの量も 3.8GB（上限 1GB の378%）で、**問い合わせの回数そのものが多かった。**

  ★**原因は「ページを作るたびに読み直す」読み取りがまだ残っていたこと。**
  学校一覧（`/schools`）は検索語・県・並べ替え・ページ送りを受け取るので**開かれるたびに作る**が、
  そこで**甲子園の出場歴約3,000件と学校約700件（1回約0.5MB）**を、
  リクエストをまたぐキャッシュ無しで読んでいた（`getKoshienDataset` は React の `cache()` だけ）。
  **絞り込みのリンクは数千通りあり、検索エンジンがたどるたびに0.5MBずつ読む。**
  トップも10分ごとの作り直しのたびに同じものを読んでいた。

  ★★**1つずつ `unstable_cache` で包む直し方はやめた** —— 読み取りが50か所近くあり、
  **包み忘れた1か所が訪問者・検索エンジンの数に比例して読む**（今回がそれ）。
  **クライアントの `fetch` を差し替えれば、包み忘れが起きない。**

  ★★**これで Supabase を読む回数は「時間」で頭打ちになる** ——
  同じ問い合わせ（URL）は、何人が開いても**期限内なら1回しか Supabase に行かない。**
  ★**期限が切れても、取り直しは裏で行い、それまでは古いものを返す**（Next のデータキャッシュの作り）。
  **取り直しに失敗したときは古いものを返し続ける**ので、
  **Supabase が止まっても、一度読めたページは表示できる**（止まったとき学校ページが500になっていた）。

  ★★**期限は表ごとに決める**（下の `TTL_BY_TABLE`）:
  - **学校マスタ・出場歴・記録・都道府県 … 1時間**。文科省の一覧や甲子園の結果を
    入れ直したときしか変わらない。**それまでの `unstable_cache`（`MASTER_TTL_MS`）と同じ。**
  - **応援メッセージ・投票 … 5分**。承認したらすぐ出したいもの（`EDITORIAL_TTL_MS` と同じ）。
  - **公立旋風・ニュース・特集 … 1時間**。運営者が手で入れるもので、変わることはまれ。
    ★**5分にしないこと** —— これらは sitemap（2MB・1時間）や特集・公立旋風のページ（1時間）も読むので、
    **期限につられてそちらまで5分ごとに作り直すことになる**（下の項）。
    ★それまで学校ページでは5分で追いかけていた（`EDITORIAL_TTL_MS`）ので、**ここだけ最長1時間遅れる。**
  ★**試合の速報と結果は Supabase を使っていない**（速報は HSB flash を60秒で、
  結果は生成物を読む）ので、**この変更で鮮度は変わらない。**

  ★★**期限は「ページの作り直しの間隔」を短くする方向にだけ効く**（Next の決まり。
  `node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md` の
  「Individual fetch requests can set a lower revalidate than the route's default」）。
  **期限をページの間隔より短くすると、そのページの作り直しが増え、Vercel の枠を食う。**
  ★**5分にしてある表（応援メッセージ・投票）を直に読むのは県ページだけで、もともと5分ごと**（`revalidate = 300`）。
  学校ページは `unstable_cache` の中で読むので、ページの間隔には響かない。
  ★**ランキング（1日）は学校マスタを読むので1時間になる**（数ページだけ。ビルドの一覧で確かめた）。
  ★★**表の期限を変えたら `next build` の一覧で各ページの間隔が変わっていないかを見ること**
  （sitemap が1時間から5分になっていたのはこれで気づいた）。

  ★**書き込み（POST など）は素通しする。** ここは読み取り専用のクライアントだが、
  将来どこかで書き込みに使ったときにキャッシュされると事故になる。
  ★**`unstable_cache` の中から呼ばれても二重にはならない** —— 外側の `unstable_cache` の期限と、
  この `fetch` の期限の**長いほうで鮮度が決まる**だけ（期限を既存の `unstable_cache` と同じ値にしてある）。

  ★**PostgREST が206（件数付きで一部だけ返した）を返す問い合わせはキャッシュされない**
  （Next は200だけを保存する）。学校一覧の検索・ニュースと公立旋風の一覧の3か所で、
  **どれも1ページぶんの小さな応答**なのでそのままにしてある。

  ★★**1件2MBまで**（Next のデータキャッシュの上限。超えると保存されず毎回読む）。
  PostgREST は1回に1,000行しか返さないので、いまの表はどれも収まる（学校1,000行で約0.6MB）。
*/

/** 表ごとの期限（秒）。**表を足したらここに書くこと**（書かなければ `DEFAULT_TTL_SECONDS`） */
const TTL_BY_TABLE: Record<string, number> = {
  // 学校マスタと甲子園の記録。入れ直したときしか変わらない
  schools: 3600,
  prefectures: 3600,
  school_championships: 3600,
  school_records: 3600,
  school_counts_by_prefecture: 3600,
  // 利用者が投稿するもの。承認したらすぐ出したい
  cheer_messages: 300,
  polls: 300,
  // 運営者が手で入れるもの。sitemap（1時間）が読むので、それより短くしない
  phenomena: 3600,
  news: 3600,
  features: 3600,
  // poll_votes・school_cheers は書き込み専用（ブラウザから入れる）。ここは通らない
};

/** 表に無いものは短いほうに倒す（古いものを長く出すより、読む回数が少し増えるほうがまし） */
const DEFAULT_TTL_SECONDS = 300;

/** `https://xxx.supabase.co/rest/v1/schools?select=…` → `schools` */
function tableOf(url: string): string {
  const m = url.match(/\/rest\/v1\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

const cachedFetch: typeof fetch = (input, init) => {
  const method = (
    init?.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  if (method !== "GET") return fetch(input, init);

  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const table = tableOf(url);
  const revalidate = TTL_BY_TABLE[table] ?? DEFAULT_TTL_SECONDS;

  return fetch(input, {
    ...init,
    cache: "force-cache",
    next: {
      revalidate,
      // 入れ直したときに `revalidateTag` で即座に捨てられるよう、表の名前を付けておく
      tags: ["supabase", `supabase:${table}`],
    },
  });
};
