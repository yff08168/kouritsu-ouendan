import type { Metadata } from "next";
import { StaticPage, UnsetNotice } from "@/components/common/StaticPage";
// ★`XIcon` は X の窓口を戻すときに一緒に戻す（下の注記を読むこと）
import { OPERATOR, SITE } from "@/lib/constants";

export const metadata: Metadata = {
  title: "お問い合わせ",
  description:
    "「公立応援団」へのご意見、掲載内容の訂正依頼、掲載のご相談はこちらから。",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <StaticPage
      title="お問い合わせ"
      lead={`${SITE.name}へのご意見、掲載内容の訂正依頼、掲載のご相談を受け付けています。`}
      updatedAt="2026-08-12"
    >
      <h2>こんなときにご連絡ください</h2>
      <ul>
        <li>掲載内容に誤りがある</li>
        <li>学校情報の掲載停止・修正を希望する</li>
        <li>
          <strong>応援メッセージの削除を希望する</strong>
          （ご自身の投稿・他の方の投稿のいずれも）
        </li>
        <li>取り上げてほしい公立高校・話題がある</li>
        <li>サイトの使い方で困っている</li>
        <li>取材・掲載のご相談</li>
      </ul>

      <h2>連絡方法</h2>

      {/*
        ★★**Xの窓口は 2026-08-24 に外した**（運営者の判断。運用予定が無い）。
        **まだ無いアカウントへ誘導しない。**

        ★★**連絡手段はメール1つだけ**（2026-08-28 に `OPERATOR.contactEmail` を設定した）。
        独自ドメインのアドレスで、**Cloudflare Email Routing で運営者のGmailへ転送する。**
        ★**転送が実際に届くことを確かめるまで公開しないこと** ——
        ここは応援メッセージの削除依頼を受ける窓口なので、
        **届かない窓口を出すのは、窓口が無いより悪い。**
      */}
      <h3>メール</h3>
      {OPERATOR.contactEmail ? (
        <p>
          <a href={`mailto:${OPERATOR.contactEmail}`}>
            {OPERATOR.contactEmail}
          </a>
        </p>
      ) : (
        <UnsetNotice>
          問い合わせ用メールアドレスが設定されていません。
          <code>src/lib/constants.ts</code> の{" "}
          <code>OPERATOR.contactEmail</code> を設定してください。
          <strong>設定するまで連絡手段がありません。</strong>
        </UnsetNotice>
      )}

      <h2>ご連絡の前にご確認ください</h2>
      <p>
        本サイトは<strong>選手個人に関する情報を掲載していません</strong>。
        個人成績や進路に関するお問い合わせにはお答えできません。
      </p>
      <p>
        大会の日程・結果・出場校などの公式な情報については、
        各都道府県の高等学校野球連盟または主催者へお問い合わせください。
        本サイトは公式の窓口ではありません。
      </p>
      <p>
        いただいたご連絡すべてに返信できるとは限りません。
        あらかじめご了承ください。
      </p>

      <h2>訂正のご依頼について</h2>
      <p>
        掲載内容の誤りについては、確認のうえ速やかに訂正します。
        該当ページのURLと、どの記述が誤っているかをお知らせいただけると
        対応が早くなります。
      </p>

      <h2>応援メッセージの削除について</h2>
      <p>
        投稿の取り消しは、利用者ご自身では行えません。
        削除をご希望の場合は、該当ページのURLと投稿の書き出しをお知らせください。
      </p>
      <p>
        他の方の投稿について、
        <strong>選手個人を名指ししている、誹謗中傷にあたる、個人が特定される情報が含まれる</strong>
        といった問題にお気づきの場合もご連絡ください。
        確認のうえ、削除を含めて対応します。掲載の基準は
        <a href="/terms">利用規約</a>の「利用者による投稿について」に定めています。
      </p>
    </StaticPage>
  );
}
