import type { Metadata } from "next";
import { StaticPage, UnsetNotice } from "@/components/common/StaticPage";
import { XIcon } from "@/components/common/XIcon";
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
      updatedAt="2026-08-11"
    >
      <h2>こんなときにご連絡ください</h2>
      <ul>
        <li>掲載内容に誤りがある</li>
        <li>学校情報の掲載停止・修正を希望する</li>
        <li>取り上げてほしい公立高校・話題がある</li>
        <li>サイトの使い方で困っている</li>
        <li>取材・掲載のご相談</li>
      </ul>

      <h2>連絡方法</h2>

      <h3>X（旧Twitter）</h3>
      <p>
        いちばん早く届きます。ダイレクトメッセージまたはリプライでご連絡ください。
      </p>
      <p>
        <a
          href={SITE.xUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-navy-800 px-5 text-sm font-bold text-white no-underline hover:bg-navy-700"
        >
          <XIcon size={15} />
          {SITE.xHandle}
        </a>
      </p>

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
          設定するまでは X からのみ受け付ける形になります。
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
    </StaticPage>
  );
}
