# Supabase のセットアップ手順

Supabase CLI は使わず、**ブラウザのダッシュボードだけ**で完結する手順にしてある。
（ローカルに追加のツールを入れない方針のため）

## 1. プロジェクトを作る

1. https://supabase.com にサインアップ
2. New project
   - Name: `kouritsu-ouendan`
   - Region: **Northeast Asia (Tokyo)** ← 日本のユーザー向けなので必ずこれ
   - Database Password: 自動生成のものを控えておく（後で使うことがある）

## 2. スキーマを流し込む

ダッシュボード左メニューの **SQL Editor** を開き、次の順で1ファイルずつ貼り付けて実行する。
**順番を守ること。**

| 順 | ファイル | 内容 |
|---|---|---|
| 1 | `migrations/0001_init.sql` | 列挙型・10テーブル・インデックス・トリガ |
| 2 | `migrations/0002_rls.sql` | 行レベルセキュリティ |
| 3 | `seed.sql` | 開発用サンプルデータ |

> `seed.sql` は冒頭で全テーブルを `truncate` する。**本番データが入ったあとは実行しないこと。**

エラーが出たらその場で止めて、メッセージをそのまま共有してほしい。
途中まで作られたテーブルが残っている場合は、SQL Editor で
`drop schema public cascade; create schema public;` を実行してからやり直す。

## 3. 接続情報をアプリに設定する

**Project Settings → API** から2つの値をコピーし、プロジェクト直下に `.env.local` を作る。

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`service_role` キーはこの段階では**不要**。ブラウザに露出すると RLS を無視して
全データを読み書きできてしまうため、必要になるまで設定しない。

`.env.local` は `.gitignore` 済みなのでコミットされない。

## 4. 動作を確認する

SQL Editor で以下を実行すると、投入結果が確認できる。

```sql
select
  (select count(*) from public.prefectures)          as 都道府県,
  (select count(*) from public.schools)              as 学校,
  (select count(*) from public.news)                 as ニュース,
  (select count(*) from public.phenomena)            as 公立旋風,
  (select count(*) from public.features)             as 特集,
  (select count(*) from public.school_championships) as 甲子園出場歴;
```

期待値: 都道府県47 / 学校10 / ニュース7 / 公立旋風4 / 特集4 / 甲子園出場歴18

RLS が効いているかは、**Table Editor ではなく** アプリ側から確認する。
`news` の7件のうち1件は `status = 'draft'` にしてあるので、
サイトに表示されるのが6件なら RLS が正しく動いている。

## 設計メモ

- テーブルは10個。増やしすぎない方針。
- 「公立」に国立・高専を含めるため、`is_public` のような真偽値は持たず
  `establishment` と `school_kind` の2軸で表現している。
- 未公開コンテンツはアプリのクエリ条件ではなく **RLS で隠している**。
- 画像は `image_url` / `image_credit` / `image_source_url` の3点セット。
  CC BY-SA 画像などは帰属表示が法的義務のため。
- 甲子園出場回数は `schools` に非正規化してある。出場歴を編集したら
  `select public.recalc_school_koshien_counts();` を実行して再計算する。
