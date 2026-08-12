/**
 * コミュニティ機能（0005）が意図どおり効いているかを anon キーで確かめる。
 *
 *   node --env-file=.env.local scripts/check-community.mjs
 *
 * anon キーで叩くので、**ここで通ることは「サイトの訪問者にできること」**、
 * 弾かれることは「訪問者にはできないこと」と同じ意味になる。
 *
 * ⚠️ 本番DBに実際に書き込む。テスト行は visitor_key を
 *    'zzzselftest' で始まる値にしてあるので、最後に出る掃除用SQLで消せる。
 *    anon には delete 権限が無いため、掃除はダッシュボードから行う。
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("環境変数が読めていません。--env-file=.env.local を付けて実行してください。");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failed = 0;

function ok(label, detail = "") {
  console.log(`✅ ${label}${detail ? `　${detail}` : ""}`);
}
function ng(label, detail = "") {
  failed += 1;
  console.log(`❌ ${label}${detail ? `　${detail}` : ""}`);
}

/** 期待どおり成功したか */
function expectPass(label, error) {
  if (error) ng(label, error.message);
  else ok(label);
}

/** 期待どおり拒否されたか */
function expectBlocked(label, error, hint) {
  if (!error) ng(label, "通ってしまった");
  else ok(label, hint ? `（${hint}）` : error.message.slice(0, 60));
}

// テスト用の訪問者キー。domain public.visitor_key の形（英数字とハイフン16〜64字）に合わせる
const stamp = Date.now().toString(36);
const visitorKey = `zzzselftest-${stamp}-${Math.random().toString(36).slice(2, 10)}`;

console.log(`接続先: ${url}`);
console.log(`テスト用 visitor_key: ${visitorKey}\n`);

// ------------------------------------------------------------
console.log("--- 下ごしらえ（公開中の学校と設問を1件ずつ取る）---");
const { data: schools } = await supabase
  .from("schools")
  .select("id, name, cheer_count")
  .limit(1);
const school = schools?.[0];
if (!school) {
  console.error("公開中の学校が取れませんでした。先に学校データを入れてください。");
  process.exit(1);
}
ok("学校", `${school.name}（現在の応援数 ${school.cheer_count}）`);

const { data: polls } = await supabase
  .from("polls")
  .select("id, question, poll_options ( id, label )")
  .limit(1);
const poll = polls?.[0];
if (!poll) {
  console.error("公開中の設問が取れませんでした。先に community_seed.sql を流してください。");
  process.exit(1);
}
ok("設問", poll.question);

const { data: prefs } = await supabase.from("prefectures").select("id, name").limit(1);
const prefecture = prefs?.[0];

// ------------------------------------------------------------
console.log("\n--- 1. 応援ボタン ---");
{
  const { error } = await supabase
    .from("school_cheers")
    .insert({ school_id: school.id, visitor_key: visitorKey });
  expectPass("応援できる", error);
}
{
  const { error } = await supabase
    .from("school_cheers")
    .insert({ school_id: school.id, visitor_key: visitorKey });
  expectBlocked("同じ端末から二重に応援できない", error, "一意制約");
}
{
  const { data } = await supabase
    .from("schools")
    .select("cheer_count")
    .eq("id", school.id)
    .single();
  const expected = school.cheer_count + 1;
  if (data?.cheer_count === expected) ok("応援数が1増えた", `${school.cheer_count} → ${data.cheer_count}`);
  else ng("応援数が増えていない", `期待 ${expected} / 実際 ${data?.cheer_count}`);
}
{
  const { data, error } = await supabase.from("school_cheers").select("*").limit(1);
  const blocked = error !== null || (data?.length ?? 0) === 0;
  if (blocked) ok("誰が応援したかは読めない", "select ポリシーなし");
  else ng("応援の記録が読めてしまう");
}
{
  const { error } = await supabase
    .from("school_cheers")
    .insert({ school_id: school.id, visitor_key: "short" });
  expectBlocked("おかしな visitor_key を弾く", error, "domain の CHECK");
}

// ------------------------------------------------------------
console.log("\n--- 2. 投票 ---");
const option = poll.poll_options?.[0];
{
  const { error } = await supabase
    .from("poll_votes")
    .insert({ poll_id: poll.id, poll_option_id: option.id, visitor_key: visitorKey });
  expectPass("投票できる", error);
}
{
  const other = poll.poll_options?.[1] ?? option;
  const { error } = await supabase
    .from("poll_votes")
    .insert({ poll_id: poll.id, poll_option_id: other.id, visitor_key: visitorKey });
  expectBlocked("同じ設問に2回投票できない", error, "一意制約");
}
{
  const { data } = await supabase
    .from("poll_options")
    .select("vote_count")
    .eq("id", option.id)
    .single();
  if ((data?.vote_count ?? 0) >= 1) ok("票数が増えた", `${data.vote_count} 票`);
  else ng("票数が増えていない");
}
{
  const { data, error } = await supabase.from("poll_votes").select("*").limit(1);
  const blocked = error !== null || (data?.length ?? 0) === 0;
  if (blocked) ok("誰が投票したかは読めない", "select ポリシーなし");
  else ng("投票の記録が読めてしまう");
}

// ------------------------------------------------------------
console.log("\n--- 3. 応援メッセージ ---");
let posted = 0;
{
  const { error } = await supabase.from("cheer_messages").insert({
    prefecture_id: prefecture.id,
    body: "動作確認の投稿です。",
    visitor_key: visitorKey,
  });
  expectPass("投稿できる", error);
  if (!error) posted++;
}
{
  // 投稿は draft で入るので、公開側からは見えないはず
  const { data } = await supabase
    .from("cheer_messages")
    .select("id, body")
    .eq("body", "動作確認の投稿です。");
  if ((data?.length ?? 0) === 0) ok("投稿は承認するまで表示されない", "RLS が draft を隠す");
  else ng("未承認の投稿が見えてしまう", `${data.length} 件`);
}
{
  const { error } = await supabase.from("cheer_messages").insert({
    prefecture_id: prefecture.id,
    body: "公開済みとして入れようとする試み",
    status: "published",
    visitor_key: visitorKey,
  });
  // トリガが draft に上書きするので insert 自体は通る。見えないことが大事
  if (error) {
    ok("status を指定した投稿を弾いた", error.message.slice(0, 40));
  } else {
    posted++;
    const { data } = await supabase
      .from("cheer_messages")
      .select("id")
      .eq("body", "公開済みとして入れようとする試み");
    if ((data?.length ?? 0) === 0) ok("status=published を送っても下書きに強制された", "トリガ");
    else ng("published を指定した投稿が公開されてしまった");
  }
}
{
  const { error } = await supabase.from("cheer_messages").insert({
    prefecture_id: prefecture.id,
    body: "   ",
    visitor_key: visitorKey,
  });
  expectBlocked("空白だけの投稿を弾く", error);
}
{
  const { error } = await supabase.from("cheer_messages").insert({
    prefecture_id: prefecture.id,
    body: "あ".repeat(201),
    visitor_key: visitorKey,
  });
  expectBlocked("201文字の投稿を弾く", error, "CHECK 制約");
}
{
  // 連投制限（1時間5件）。ここまでで posted 件入っているので、上限まで埋める
  let lastError = null;
  for (let i = posted; i < 6; i++) {
    const { error } = await supabase.from("cheer_messages").insert({
      prefecture_id: prefecture.id,
      body: `連投テスト ${i}`,
      visitor_key: visitorKey,
    });
    lastError = error;
    if (error) break;
    posted++;
  }
  expectBlocked("短時間の連投を止める", lastError, "1時間5件まで");
}

// ------------------------------------------------------------
console.log("\n--- 4. 書き換え・削除ができないこと ---");
{
  const { error } = await supabase
    .from("cheer_messages")
    .update({ status: "published" })
    .eq("visitor_key", visitorKey);
  expectBlocked("投稿を自分で公開できない", error, "update 権限なし");
}
{
  const { error } = await supabase.from("polls").insert({
    slug: `selftest-${stamp}`,
    question: "勝手に作った設問",
  });
  expectBlocked("設問を勝手に作れない", error, "insert 権限なし");
}

// ------------------------------------------------------------
console.log("\n--- 掃除用SQL（Supabase の SQL Editor で実行）---");
console.log(`
delete from public.cheer_messages where visitor_key like 'zzzselftest%';
delete from public.poll_votes      where visitor_key like 'zzzselftest%';
delete from public.school_cheers   where visitor_key like 'zzzselftest%';

-- 消したぶんを数え直す（削除のトリガでも減るが、念のため合わせる）
select public.recalc_school_cheer_counts();
select public.recalc_poll_vote_counts();
`);

process.exit(failed > 0 ? 1 : 0);
