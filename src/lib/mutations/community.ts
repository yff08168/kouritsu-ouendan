import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getVisitorKey } from "@/lib/visitor";

/**
 * コミュニティ機能の書き込み。ブラウザから呼ぶ。
 *
 * ページから直接 supabase-js を触らない方針（AGENTS.md）なので、
 * 読み取りの src/lib/queries/ と対になる形でここに集める。
 *
 * **ここでの検査は利用者への案内のためのもので、防御ではない。**
 * anon キーは公開鍵なので、この関数を通さない書き込みが常に可能。
 * 実際の防御は RLS ポリシーとDBトリガ（supabase/migrations/0005_community.sql）。
 */

export type MutationResult =
  | { ok: true }
  | { ok: false; reason: "no-visitor-key" | "already" | "rejected"; message: string };

/** PostgREST のエラーを、画面に出せる日本語に直す */
function toFailure(error: { code?: string; message: string }): MutationResult {
  // 一意制約違反＝すでに押している／投票済み
  if (error.code === "23505") {
    return { ok: false, reason: "already", message: "すでに参加ありがとうございます。" };
  }
  // トリガの raise exception はメッセージをそのまま見せてよい文面にしてある
  return { ok: false, reason: "rejected", message: error.message };
}

const NO_KEY: MutationResult = {
  ok: false,
  reason: "no-visitor-key",
  message:
    "ブラウザの設定により参加できません。プライベートモードを解除するか、サイトのデータ保存を許可してください。",
};

/** 学校を応援する */
export async function cheerSchool(schoolId: string): Promise<MutationResult> {
  const visitorKey = getVisitorKey();
  if (!visitorKey) return NO_KEY;

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase
    .from("school_cheers")
    .insert({ school_id: schoolId, visitor_key: visitorKey });

  return error ? toFailure(error) : { ok: true };
}

/** 設問に投票する */
export async function votePoll(
  pollId: string,
  optionId: string,
): Promise<MutationResult> {
  const visitorKey = getVisitorKey();
  if (!visitorKey) return NO_KEY;

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("poll_votes").insert({
    poll_id: pollId,
    poll_option_id: optionId,
    visitor_key: visitorKey,
  });

  return error ? toFailure(error) : { ok: true };
}

/**
 * 学校あての応援メッセージを投稿する（0008 で都道府県単位から移した）。
 *
 * status は送らない。**送っても意味がない**（DBトリガが draft で上書きする）。
 * **prefecture_id も送らない。** DBトリガが学校から引いて入れる。
 * 送れる形にしておくと、ある県の学校あての投稿を別の県のページに
 * 混ぜ込めてしまう。
 */
export async function postCheerMessage(input: {
  schoolId: string;
  body: string;
  displayName: string | null;
}): Promise<MutationResult> {
  const visitorKey = getVisitorKey();
  if (!visitorKey) return NO_KEY;

  const body = input.body.trim();
  if (body.length === 0) {
    return { ok: false, reason: "rejected", message: "本文を入力してください。" };
  }
  if (body.length > 200) {
    return { ok: false, reason: "rejected", message: "本文は200文字までです。" };
  }

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("cheer_messages").insert({
    school_id: input.schoolId,
    body,
    display_name: input.displayName?.trim() || null,
    visitor_key: visitorKey,
  });

  return error ? toFailure(error) : { ok: true };
}
