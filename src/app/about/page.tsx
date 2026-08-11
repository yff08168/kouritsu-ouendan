import type { Metadata } from "next";
import Link from "next/link";
import { StaticPage, UnsetNotice } from "@/components/common/StaticPage";
import { OPERATOR, PHENOMENON, SITE } from "@/lib/constants";

export const metadata: Metadata = {
  title: "このサイトについて",
  description:
    "「公立応援団」は全国の公立高校野球を応援する人のためのサイトです。掲載の方針、対象とする学校の範囲、情報の扱いについて説明します。",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <StaticPage
      title="このサイトについて"
      lead={SITE.description}
      updatedAt="2026-08-11"
    >
      <h2>目的</h2>
      <p>
        「{SITE.name}」は、全国の公立高校野球を「見る・知る・応援する」ための
        Webメディアです。高校野球全体の情報量で大手メディアと競うのではなく、
        <strong>公立高校というテーマ</strong>に絞ることで、
        地元の学校や母校を応援する人にとって使いやすい場所を目指しています。
      </p>

      <h2>対象とする学校</h2>
      <p>
        本サイトは<strong>私立以外のすべての高校</strong>を対象とします。
        具体的には次のとおりです。
      </p>
      <ul>
        <li>都道府県立（道立・都立・府立・県立）</li>
        <li>市立・町村立・組合立</li>
        <li>
          <strong>国立</strong>（大学附属高校など）
        </li>
        <li>
          <strong>高等専門学校（高専）</strong>
        </li>
      </ul>
      <p>
        サイト名は「公立応援団」ですが、国立高校と高専も応援対象に含めています。
        いずれも私学のような選手獲得の仕組みを持たない環境で戦っており、
        本サイトが応援したい対象と重なるためです。
      </p>
      <p>
        なお、東京都立<strong>国立</strong>高校（くにたちこうこう）は
        「都立」であり「国立（こくりつ）」ではありません。
        学校区分は自動判定せず、一校ずつ確認して登録しています。
      </p>

      <h2>掲載しているもの</h2>
      <ul>
        <li>
          <Link href="/news">ニュース</Link> — 地方大会の結果、注目校の話題、コラム
        </li>
        <li>
          <Link href="/schools">公立高校</Link> — 学校情報、甲子園出場歴、最近の戦績
        </li>
        <li>
          <Link href="/phenomenon">{PHENOMENON.label}</Link> — {PHENOMENON.tagline}
        </li>
        <li>
          <Link href="/features">特集</Link> — 観戦ガイド、歴史、チーム紹介など
        </li>
        <li>
          <Link href="/prefectures">都道府県</Link> — 47都道府県ごとのまとめ
        </li>
      </ul>

      <h2>情報の扱いについて</h2>

      <h3>ニュースの引用</h3>
      <p>
        他社の記事を全文転載することはありません。掲載するのは
        <strong>見出し・編集部による要約・出典名・元記事へのリンク</strong>
        までです。詳細は必ず元記事をご確認ください。
      </p>

      <h3>選手個人について</h3>
      <p>
        本サイトでは<strong>選手個人のページや個人成績を作成しません</strong>。
        高校生は未成年であり、個人に紐づく情報を蓄積・公開することの影響を
        考慮したためです。掲載するのは学校単位・チーム単位の情報に限ります。
      </p>

      <h3>掲載内容の正確性</h3>
      <p>
        掲載情報には誤りが含まれる可能性があります。お気づきの点があれば
        <Link href="/contact">お問い合わせ</Link>からご連絡ください。
        確認のうえ訂正します。公式な記録については各高等学校野球連盟の
        発表をご確認ください。
      </p>

      <h3>画像について</h3>
      <p>
        本サイトでは、権利関係が明確な画像のみを掲載しています。
        出典の表示が必要な画像には、画像上または記事内にクレジットを記載します。
      </p>

      <h2>運営者</h2>
      {OPERATOR.name ? (
        <p>{OPERATOR.name}</p>
      ) : (
        <UnsetNotice>
          運営者名が設定されていません。
          <code>src/lib/constants.ts</code> の <code>OPERATOR.name</code>
          を設定してください。
        </UnsetNotice>
      )}
      <p>開設：{OPERATOR.establishedYear}年</p>

      <h2>お問い合わせ</h2>
      <p>
        ご意見・訂正のご連絡・掲載のご相談は
        <Link href="/contact">お問い合わせ</Link>ページからお願いします。
      </p>
    </StaticPage>
  );
}
