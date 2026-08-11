import { Container } from "@/components/layout/Container";
import { SITE } from "@/lib/constants";

// TODO(Phase 4): DBに接続して本番のトップページに差し替える。
// 現時点はヘッダー／フッター／ブランドトークンの確認用。
export default function HomePage() {
  return (
    <Container className="py-16">
      <p className="text-sm font-bold text-accent-500">Phase 2 完了</p>
      <h1 className="mt-3 text-3xl font-bold text-navy-800 sm:text-4xl">
        {SITE.catchphrase}
      </h1>
      <p className="mt-4 max-w-2xl text-ink-muted">{SITE.description}</p>
    </Container>
  );
}
