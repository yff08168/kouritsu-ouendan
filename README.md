# 公立応援団

公立高校野球応援サイト「公立応援団」— 全国の公立・国立高校と高専の野球を
「見る・知る・応援する」ためのWebメディア。

**キャッチコピー：** 公立高校野球が、もっと面白くなる。

---

## 現在の状態（2026-08-11 時点）

**MVP の全12フェーズが完了。** ローカルで全85ページが動作し、本番ビルドも通る。
**まだインターネットには公開していない。**

| Phase | 内容 | 状態 |
|---|---|---|
| 1–2 | 開発環境・ブランド・共通レイアウト | 完了 |
| 3 | DBスキーマ・RLS・シードデータ | 完了 |
| 4 | トップページ | 完了 |
| 5 | 学校一覧・検索 | 完了 |
| 6 | 学校詳細 | 完了 |
| 7 | ニュース一覧・詳細 | 完了 |
| 8 | 都道府県ページ・タイル地図 | 完了 |
| 9 | 公立旋風 | 完了 |
| 10 | 特集・固定ページ | 完了 |
| 11 | SEO（sitemap / robots / JSON-LD / OGP画像） | 完了 |
| 12 | アクセシビリティ・レスポンシブ仕上げ | 完了 |

---

## ⚠️ 公開前に必ずやること

### 1. 運営者情報の設定（未完了）

`src/lib/constants.ts` の `OPERATOR` が未設定。
このままだと `/about` `/privacy` `/contact` にオレンジの「未設定」警告が表示される。

```ts
export const OPERATOR = {
  name: null,          // ← 「公立応援団 編集部」など。個人名・屋号でも可
  contactEmail: null,  // ← 公開したくなければ null のまま（Xのみで受付）
  establishedYear: 2026,
};
```

実在しない運営者名を仮に入れないこと（虚偽の運営者情報の掲載になる）。

### 2. ドメイン取得（未完了）

**`kouritsu-ouendan.com`** で決定済み。まだ取得していない。
コード側は設定済み（`SITE.url` の既定値）。

### 3. GitHub アカウント（未確認）

Vercelへのデプロイに必要。git のコミット名を仮に `yff08168` にしてあるので、
正しいユーザー名が分かったら `git config user.name` を直す。

### 4. Vercel の環境変数

デプロイ時に以下を設定する。

| 変数 | 値 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://fantodwsofxpeinnprtc.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_...`（Supabaseダッシュボード → API Keys） |
| `NEXT_PUBLIC_SITE_URL` | `https://kouritsu-ouendan.com` |

`service_role` / `Secret key` は設定しない。管理機能を作るまで不要。

---

## 開発環境

### Node.js はシステムにインストールされていない

ユーザーの希望で**ポータブル版**を置いてある。システムPATH・レジストリは
一切変更していない。コマンド実行前に毎回PATHを通すこと。

```powershell
$env:Path = "C:\Users\81809\tools\node-v24.19.0-win-x64;" + $env:Path
```

手動で起動する場合はプロジェクト直下の `開発サーバーを起動.bat`。
（※ セキュリティソフトの影響で .bat が開けない場合がある。その際は上記PATHを
通してから `npm run dev`）

### コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー（http://localhost:3000） |
| `npm run lint` | ESLint |
| `npm run typecheck` | tsc --noEmit |
| `npm run check` | lint → typecheck → build を通しで実行 |
| `node --env-file=.env.local scripts/check-supabase.mjs` | 接続とRLSの動作確認 |
| `node scripts/check-markdown-safety.mjs` | 記事本文のXSS対策が生きているか確認 |

コミット前は `npm run check` を通すこと。

### 技術構成

Next.js 16.3（App Router / Turbopack） / React 19.2 / TypeScript strict /
Tailwind CSS v4 / Supabase（PostgreSQL） / デプロイ先は Vercel（予定）

実行時の依存は7個だけ。ORM・UIキット・認証ライブラリは入れていない。

---

## Supabase

プロジェクト: `fantodwsofxpeinnprtc`（リージョン: Northeast Asia / Tokyo）

スキーマは `supabase/` にSQLで置いてある。**適用済み。**

| ファイル | 内容 |
|---|---|
| `migrations/0001_init.sql` | 列挙型7つ・テーブル10個・インデックス・トリガ |
| `migrations/0002_rls.sql` | 行レベルセキュリティ（ポリシー9件） |
| `migrations/0003_phenomena_badge_and_view.sql` | badge列・都道府県別学校数ビュー |
| `seed.sql` | 開発用サンプルデータ（**すべて架空の学校**） |
| `reset.sql` | やり直し用。作りかけを名指しで削除 |
| `verify.sql` | 投入結果の件数確認 |
| `README.md` | CLIを使わずブラウザだけで適用する手順 |

Supabase CLI は使っていない。SQL Editor に貼り付けて実行する運用。

現在のデータ: 都道府県47 / 学校10 / ニュース7（うち下書き1） / 公立旋風4 /
特集4 / 甲子園出場歴18 / 戦績8

---

## 次にやること（優先順）

1. **Vercelへデプロイして公開する** — GitHubアカウントが必要。
   一度公開しておくと以降は push だけで反映され、スマホ実機でも確認できる
2. **運営者情報の設定**
3. **全国の学校データ投入の設計** — 現在は架空10校のサンプルのみ。
   出典（公開情報の範囲）と入力方法を別途設計する必要がある
4. 画像の調達 — 現在は全ページ画像なしで成立する状態。
   ヒーロー・特集はストックフォトかAI生成、学校は校舎写真（要クレジット）
5. 「公立旋風」の呼び名の再検討 — `lib/constants.ts` の `PHENOMENON` を
   直せば全ページに反映される（URLは変えないこと）

### MVPに含めていないもの

ユーザー登録・ログイン・学校フォロー・投稿・コメント・通知 /
ニュース自動収集 / 管理画面 / X自動投稿 / 広告の実配信 / アフィリエイト

いずれも将来追加しやすい形にはしてある（`AdSlot` の空実装、RLSの先行有効化など）。

---

## 設計上の決めごと

`AGENTS.md` に集約してある。**コードを触る前に必ず読むこと。**
特に重要なのは以下。

- 収録対象は「私立以外」。**国立・高専も含む**
- 東京都立**国立**高校（くにたち）は「都立」。設置区分を機械判定しない
- ニュースは全文転載しない。見出し＋自作要約＋出典リンクまで
- 選手個人のページ・個人成績は作らない
- 未公開コンテンツの除外は**RLSで強制**。クエリに `status='published'` を書かない
- `src/types/database.ts` は手書き。マイグレーションを変えたら必ず合わせる
- オレンジは白地では4.5:1を取れない。白地の文字には `accent-800` を使う
