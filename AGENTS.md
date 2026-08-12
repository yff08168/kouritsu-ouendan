<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# 公立応援団

公立高校野球応援サイト。全国の公立・国立高校の野球を「見る・知る・応援する」ためのWebメディア。

**現在の進捗・未完了事項・次にやることは `README.md` にまとめてある。作業を始める前に読むこと。**
要約：MVP全12フェーズ完了。未公開。運営者情報とドメイン取得が未了。

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
  **写真に選手が写ることはこれとは別扱い**（2026-08-12 方針変更）。
  運営者自身が観客席から撮った試合写真はヒーローで使っている。
  報道写真や第三者が撮った試合写真は著作権の面から引き続き不可。
- **データ取得は `src/lib/queries/` を経由する。** ページから直接 supabase-js を呼ばない。
- **`src/types/database.ts` は手書き。** Supabase CLI の型自動生成は使っていない
  （ローカルにツールを増やさないため）。`supabase/migrations/` を変更したら
  **必ずこのファイルも合わせること。** ずれても TypeScript は気づけない。
  `node --env-file=.env.local scripts/check-supabase.mjs` で実データを見て確認する。
- **クエリで `status = 'published'` を書かない。** RLS が公開済みの行しか返さない。
  アプリ側で二重に条件を書くと、RLSが壊れたときに気づけなくなる。
- **広告は `AdSlot` コンポーネント経由のみ。** ページに広告ネットワーク固有のコードを書かない。
- **未公開コンテンツの除外は RLS で強制する。** アプリ側のクエリ条件だけに頼らない。
- **利用者の投稿は都道府県単位まで。学校ページに自由記述欄を置かない。**
  学校ページに置くと「○○高校の△△君」という書き込みを招き、選手個人のページを
  作らないという方針を自分で破ることになる。学校ページは応援ボタン（テキストなし）まで。
- **anon の書き込みはRLSとDBトリガだけが守っている。** anonキーは公開鍵なので、
  アプリを経由しない書き込みが常に可能。API ルートを挟んでも裏口は塞げないため、
  検査をフロント側やクエリ層に書いても防御にならない。必ずDB側に置くこと。
- **集計トリガは `security definer` にする。** そうしないと呼び出した anon の権限で
  動き、RLSポリシーが無いテーブルへの update が**エラーにならず0行更新**になる。
  数が増えない不具合になり、画面上は成功に見えるので気づきにくい
  （`supabase/migrations/0006_community_fixes.sql` の経緯）。
- **オレンジ（accent）は小面積のアクセントのみ。** 面で使わない。
- **ロゴ画像は `npm run logo` で生成する。** `public/logo*.png` を直接編集しない。
  原本は `assets/logo-source.png`。詳細は README の「ロゴ」。
- **ヒーローの写真も同じで `npm run hero`。** 原本は `assets/hero/`、
  出力は `public/hero/`、表示順とクレジットは `src/lib/hero.ts`。
  **写真の上には navy-900 の膜を重ねる**（`globals.css` の `.hero-veil`）。
  一様に濃くすると写真が見えないので、**見出しのある左側だけ濃くする**。
  濃さは「いちばん明るい青空の上でも白文字が4.5:1」から決めてある。
  **`prefers-reduced-motion` では切り替えない。**
  **出典が確認できない写真を足さない**（広告を載せる＝営利なので個人利用限定の素材は不可）。
  出典は `HeroSlide.source` に必ず書く（画面には出さない記録用）。画面に出す
  `credit` は表示義務があるときだけ。**Wikimedia Commons の写真は使わない**（2026-08-12 決定）。
- **敗戦数を画面に出さない。** DBには `losses` が入っているが、表示するのは勝利数だけ。
  ランキングでも同じ（`wins`勝 とだけ書く）。
- **`prefectures` は都道府県ではなく「甲子園の大会区分」49件。**
  北海道は北北海道・南北海道、東京は東東京・西東京に分かれる。
  分割していない45件の id はJISコードのまま、分割した4件は48〜51。
  学校の住所としての「北海道」「東京都」は `schools.city` 側にある。
- **学校名・所在地・設置区分を手で書かない。** 文部科学省の学校コード一覧から
  `scripts/build-school-seed.mjs` で生成する。生成AIに校名を書かせると
  実在しない学校が混ざる。補ってよいのは読み・表示名・地区だけ（README参照）。
- **甲子園出場歴・戦績も生成AIに書かせない。** 校名と同じ扱いで、出典のある事実だけを入れる。
  統廃合・校名変更で現存しない学校の出場歴は現存校に引き継ぎ、`note` に旧校名を残す。
  **出典サイトは規約を読んでから選ぶ。** 見るのは①自動取得の禁止 ②**営利目的での利用の禁止**
  の2点。②があると目視での転記も塞がる（このサイトは広告を載せるので営利）。
  一球速報.com・バーチャル高校野球はどちらも確認済みで除外（README参照）。
- **硬式野球部の有無は各県高野連の加盟校名簿でしか判断しない。**
  校名や設置区分から推測しない。名簿は `data/baseball-clubs.json`。
  部が無い学校は削除せず `status = 'draft'` にする。
- **ランキング（`/rankings`）の集計はアプリ側でやる。DBのビューを足さない。**
  このプロジェクトは Supabase CLI を使わず人がSQL Editorで適用する運用なので、
  ビューを増やすと「適用し忘れてページが落ちる」が起きる。対象は出場歴3千件・
  学校700件で、1回あたり4リクエスト・1.5秒。ページの `revalidate` は1日。
  **PostgREST は1回に1,000行しか返さない。** 出場歴はページングで取る必要があり、
  そのとき**並び順を一意に決めてから**取ること（`school_id, year, season`）。
  並びが不定だとページの境目で行が重複したり抜けたりする。
- **ランキングには「私立を収録していない」と必ず書く。** 学校マスタが公立だけなので
  ここでの1位は全国1位ではない。`DataNote` コンポーネントを各ページに置く。
- **成績が不明な出場を「初戦敗退」に混ぜない。** 最高成績の一覧でも、
  段階が確定しない学校はどの段階にも入れず別に数える。
- **21世紀枠は `src/lib/data/twenty-first-century.ts`（生成物）。**
  年に1〜3件しか増えないのでDBに入れていない。
  `scripts/build-21st-century.mjs` が Wikipedia「選抜高等学校野球大会」の
  「21世紀枠出場校一覧」から作る。**選考理由の文章は取り込まない**
  （事実の抽出ではCC BY-SAの継承は発動しないが、文章を持ってくると発動する）。
  成績もこの表からは取らない。DBの `school_championships` と表記が揃わなくなるため。
- **甲子園のスコアを `WebFetch` の要約で取らない。★**
  Wikipediaの大会記事を要約させると**対戦相手も勝敗も入れ替わって出てくる**
  （実際に大社2024が1勝3敗、金足農の3回戦の相手が横浜でなく東海大熊本星翔、
  佐賀北が1回戦敗退、という出力になった）。
  `data/wikipedia-cache/summer-NNN.json` の `wikitext` を直接読むこと。
  勝ち上がり表は**太字が勝者**、`x` 付きがサヨナラ。
  書いたあとは `school_championships` の勝敗数と必ず検算する。
- **勝ち上がりは `src/lib/content/tournament-runs.ts`（手書き）。**
  試合単位のテーブルを足すと人がSQLを流す作業が増え、忘れると詳細ページが落ちる。
  `phenomena.slug` と `phenomenonSlug` が対応しているので片方だけ変えないこと。
- **動画は権利者の公式チャンネルのものだけ埋め込む。**
  判断は `isEmbeddableVideo()` の1か所に閉じ込める。テレビ放送を個人が
  上げたものは、埋め込めても侵害動画と分かって案内すると幇助になりうる。
- **新聞社のスコアページからスコアを取らない。★**
  一球速報.com とバーチャル高校野球は**利用規約**で外してある（著作権ではない）。
  バーチャル高校野球は第8項(3)が営利目的の利用を禁じており、**目視での転記も塞がる**。
  「人が読んで渡せば規約に触れない」は**この2媒体には通用しない**。
  使えるのは Wikipedia・**運営者自身のスコアブック**・市販の記録集・高野連公式（当年のみ）。
- **出典の表示は実際の出所と一致させること。**
  手元に同じ記録があっても、転記した経路が別ならその経路が本当の出所。
  読者に対する出典表示の信頼性は規約の問題より優先する。
  `sources` の `url` は任意（運営者の記録・書籍にはURLが無い）。
- **都道府県セレクタの表示切り替えは画面幅ではなくコンテナ幅で判定する。**
  幅の狭いカラムに入れたときにマスが潰れて県名が読めなくなるため
  （`.prefecture-map` のコンテナクエリ）。
- 日本語Webフォントは読み込まない（スマホの表示速度優先）。システムフォントスタックを使う。

## ディレクトリ

- `src/app/` — ルーティング（App Router）
- `src/components/` — layout / news / schools / phenomenon / features / rankings / community / common / ads
- `src/lib/queries/` — DBアクセス層
- `src/lib/data/` — **スクリプトが生成するデータ。直接編集しない**
  （`twenty-first-century.ts` / `koshien-tournaments.ts`）
- `src/lib/content/` — **手で書く編集コンテンツ**（`tournament-runs.ts`）。
  生成物と紛らわしいのでディレクトリを分けている
- `src/lib/constants.ts` — サイト定数・47都道府県マスタ・各種区分
- `supabase/migrations/` — スキーマ（SQLをGit管理）
