<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# 公立応援団

公立高校野球応援サイト。全国の公立・国立高校の野球を「見る・知る・応援する」ためのWebメディア。

## 開発環境の注意点

**Node.js はポータブル版をシステムにインストールせず使っている。** PATH が通っていないため、
npm / npx を実行する前に必ず PATH を通すこと。

```powershell
$env:Path = "C:\Users\81809\tools\node-v24.19.0-win-x64;" + $env:Path
```

手動で起動する場合はプロジェクト直下の `開発サーバーを起動.bat` を使う。

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm run lint` | ESLint |
| `npm run typecheck` | tsc --noEmit |
| `npm run check` | lint → typecheck → build を通しで実行 |

コミット前は `npm run check` を通すこと。

## 設計上の決めごと

- **収録対象は「私立以外」**。県立・市立・町村立・組合立に加え、**国立と高専も含む**。
  `is_public` のような真偽値は持たず、`establishment` と `school_kind` の2軸で表現する。
- **東京都立国立高校（くにたち）は「都立」であって「国立（こくりつ）」ではない。**
  設置区分を機械判定すると必ず誤分類するので、この種の学校は手動確認する。
- **URLのslugはローマ字**。日本語URLはエンコードで読めなくなるため使わない。
- **画像は `image_url` / `image_credit` / `image_source_url` の3点セット**で持つ。
  Wikimedia Commons の CC BY-SA 画像は帰属表示が法的義務のため。
- **画像は Supabase Storage に保存**し、外部URLを直接参照しない。
- **ニュースの全文転載はしない。** 見出し＋自作の要約＋出典名＋元記事リンクまで。
- **選手個人のページ・個人成績は作らない**（未成年の個人情報配慮）。
- **データ取得は `src/lib/queries/` を経由する。** ページから直接 supabase-js を呼ばない。
- **広告は `AdSlot` コンポーネント経由のみ。** ページに広告ネットワーク固有のコードを書かない。
- **未公開コンテンツの除外は RLS で強制する。** アプリ側のクエリ条件だけに頼らない。
- **オレンジ（accent）は小面積のアクセントのみ。** 面で使わない。
- 日本語Webフォントは読み込まない（スマホの表示速度優先）。システムフォントスタックを使う。

## ディレクトリ

- `src/app/` — ルーティング（App Router）
- `src/components/` — layout / news / schools / phenomenon / features / common / ads
- `src/lib/queries/` — DBアクセス層
- `src/lib/constants.ts` — サイト定数・47都道府県マスタ・各種区分
- `supabase/migrations/` — スキーマ（SQLをGit管理）
