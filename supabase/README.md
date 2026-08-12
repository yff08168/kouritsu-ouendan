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
| 3 | `migrations/0003_phenomena_badge_and_view.sql` | badge列・都道府県別学校数ビュー |
| 4 | `migrations/0004_split_hokkaido_tokyo.sql` | 49地区に分割 |
| 5 | `seed.sql` | 地区マスタ・情報源・特集 |
| 6 | `schools_*.sql` 8ファイル | 全国3,531校（順不同） |

> `seed.sql` は truncate しない。**何度実行しても安全**（upsert）。
> 架空の10校を消す `remove_sample_data.sql` は、実データを確認したあと
> 公開前に一度だけ実行する。詳しくはプロジェクト直下の README「適用の順番」。

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

期待値は `verify.sql` にまとめてある（そのまま貼れば項目ごとに出る）。
架空10校を残したまま実データを入れた状態なら、地区49 / 学校3,541 /
ニュース7 / 公立旋風4 / 特集4 / 甲子園出場歴18。

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
