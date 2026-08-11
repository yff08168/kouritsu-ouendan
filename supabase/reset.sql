-- ============================================================
-- やり直し用のリセット
--
-- 0001_init.sql の実行が途中で失敗して、テーブルや型が中途半端に
-- 残ってしまったときに使う。これを実行してから 0001 → 0002 → seed を
-- もう一度やり直す。
--
-- public スキーマごと drop する方法もあるが、Supabase が前提にしている
-- 権限設定まで消えてしまうため、このプロジェクトで作ったものだけを
-- 名指しで消している。
--
-- ★ 本番データが入ったあとは実行しないこと ★
-- ============================================================

drop table if exists
  public.news_schools,
  public.phenomenon_schools,
  public.school_championships,
  public.school_records,
  public.news,
  public.phenomena,
  public.features,
  public.schools,
  public.news_sources,
  public.prefectures
cascade;

drop function if exists public.set_updated_at() cascade;
drop function if exists public.schools_set_search_text() cascade;
drop function if exists public.recalc_school_koshien_counts() cascade;

drop type if exists
  public.establishment,
  public.school_kind,
  public.content_status,
  public.news_category,
  public.season,
  public.phenomenon_level,
  public.feature_category
cascade;
