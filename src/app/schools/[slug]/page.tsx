import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Building2,
  ExternalLink,
  Flame,
  MapPin,
  MessageSquareHeart,
  Swords,
  Newspaper,
  Trophy,
} from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { Badge } from "@/components/common/Badge";
import { Thumbnail } from "@/components/common/Thumbnail";
import { SectionHeading } from "@/components/common/SectionHeading";
import { SchoolRegionalRecord } from "@/components/schools/SchoolRegionalRecord";
import { HeadToHeadList } from "@/components/schools/HeadToHeadList";
import { SchoolKoshienRecord } from "@/components/schools/SchoolKoshienRecord";
import { KOSHIEN_GAMES, koshienGamesOf } from "@/lib/koshien-games";
import { JINGU_GAMES, jinguGamesOf } from "@/lib/jingu-games";
import { shortSchoolName } from "@/lib/school-name";
import {
  getRegionalDistrict,
  regionalGamesOf,
  seasonLabel,
} from "@/lib/regional-results";
import { isIndexableSchool } from "@/lib/school-index";
import { listTournaments } from "@/lib/regional-tournaments";
import { headToHead } from "@/lib/head-to-head";
import { AdSlot } from "@/components/ads/AdSlot";
import { NewsCard } from "@/components/news/NewsCard";
import { SchoolCard } from "@/components/schools/SchoolCard";
import { ChampionshipTable } from "@/components/schools/ChampionshipTable";
import { RecordTable } from "@/components/schools/RecordTable";
import { PhenomenonCard } from "@/components/phenomenon/PhenomenonCard";
import { CheerButton } from "@/components/community/CheerButton";
import { CheerMessageForm } from "@/components/community/CheerMessageForm";
import { CheerMessageList } from "@/components/community/CheerMessageList";

import {
  getAllSchoolSlugs,
  getRelatedSchools,
  getSchoolBySlug,
  getSchoolChampionships,
  getSchoolRecords,
} from "@/lib/queries/schools";
import { getNewsBySchool } from "@/lib/queries/news";
import { getPhenomenaBySchool } from "@/lib/queries/phenomena";
import { getCheerMessages } from "@/lib/queries/community";
import { JsonLd } from "@/components/common/JsonLd";
import { schoolJsonLd } from "@/lib/seo";

import { ESTABLISHMENTS, SCHOOL_KINDS, establishmentLabel } from "@/lib/constants";
import { bestResultBySeason } from "@/lib/koshien";
import { TWENTY_FIRST_CENTURY_BERTHS } from "@/lib/data/twenty-first-century";

// 学校情報は頻繁には変わらないので長めに保つ
export const revalidate = 3600;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const slugs = await getAllSchoolSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const school = await getSchoolBySlug(slug);

  if (!school) {
    return { title: "学校が見つかりません" };
  }

  const koshienTotal =
    school.koshienSpringCount + school.koshienSummerCount;

  /*
    ★**地方大会の戦績**（2026-08-28 追加）。
    **index の判定材料**であり、**description に書く中身**でもある。

    ★**その県のファイルだけを読む**（全国ぶんは6MB近くある）。
    **対応していない県は0件**になるだけで、判定は甲子園出場歴で従来どおり通る。
    ★**本文側でも同じものを読んでいる**が、Next の import キャッシュが効くので
    県ごとに1回しか読み込まれない。
  */
  const regionalDistrict = await getRegionalDistrict(school.prefecture.slug);
  const regionalGames = regionalGamesOf(
    regionalDistrict?.games ?? [],
    school.slug,
  ).length;

  const description = [
    `${school.officialName}（${school.prefecture.name}${school.city ? `・${school.city}` : ""}）の野球部情報。`,
    koshienTotal > 0
      ? `甲子園出場${koshienTotal}回。`
      : "",
    /*
      ★**何が載っているかを数で書く。**
      ★★**どちらも無いページに「戦績を掲載」と書かないこと** ——
      画面には「まだありません」しか出ない。**検索結果とSNSに出る文なので、
      無いものを書かない**（サイト全体で守っている線）。
    */
    regionalGames > 0 ? `地方大会の試合結果${regionalGames}件を掲載。` : "",
    koshienTotal === 0 && regionalGames === 0
      ? "所在地・設置区分などの基本情報を掲載しています。"
      : "同じ都道府県の公立高校、公立旋風もまとめて確認できます。",
  ].join("");

  /*
    ★★**title に市区町村と「野球部」を入れる**（2026-08-29）。

    それまでは `新城高校（神奈川）` で、**「野球」が1文字も入っていなかった。**
    運営者が挙げた流入経路の1つが**「高校名 野球」という狭いワード**なので、
    **検索語そのものが title に無い**のは効きが悪い。

    ★**市区町村は同名校の見分けに効く**（`新城高校` は神奈川と愛知にある）。
    ★**「◯◯市」だけを持っている**（`schools.city`）。都道府県は付いていない。

    ★★**`prefecture.name` は住所ではなく甲子園の大会区分。**
    北海道の学校は `北北海道・旭川市` になる。**住所として直さないこと** ——
    このサイトは学校を大会区分で並べており、description・パンくず・
    検索結果の表示もすべてこの形で揃えてある。**title だけ別の見せ方にしない。**
  */
  return {
    title: `${school.name}（${school.prefecture.name}${school.city ? `・${school.city}` : ""}）の野球部`,
    description,
    alternates: { canonical: `/schools/${school.slug}` },
    // 中身の無いページは検索インデックスに入れない。理由は `lib/school-index.ts`。
    robots: isIndexableSchool({ koshienCount: koshienTotal, regionalGames })
      ? undefined
      : { index: false, follow: true },
    openGraph: {
      type: "article",
      title: `${school.name}（${school.prefecture.name}）| 公立応援団`,
      description,
    },
  };
}

/*
  ★**index の判定は `lib/school-index.ts` に移した**（2026-08-28）。
  **sitemap と同じ関数を見るため。** ここに書き戻さないこと ——
  2か所に置くと「sitemap に載っているのに noindex」がいつか必ず起きる。
*/

export default async function SchoolDetailPage({ params }: Props) {
  const { slug } = await params;
  const school = await getSchoolBySlug(slug);

  if (!school) notFound();

  const [championships, records, news, phenomena, relatedSchools, cheerMessages] =
    await Promise.all([
      getSchoolChampionships(school.id),
      getSchoolRecords(school.id),
      getNewsBySchool(school.id),
      getPhenomenaBySchool(school.id),
      getRelatedSchools(school.prefecture.slug, school.id),
      // 応援メッセージは学校あて（0008）。承認済みのものだけ返る
      getCheerMessages({ schoolId: school.id, limit: 20 }),
    ]);

  /*
    ★**地方大会の戦績**（2026-08-23）。その県の生成物からこの学校の試合を拾う。
    ★**県のファイルだけを読む**（全国ぶんは6MBある）。**対応していない県は空。**
  */
  const regionalDistrict = await getRegionalDistrict(school.prefecture.slug);
  // ★**index の判定（generateMetadata）と同じ関数で絞る。** 片方だけ変えない
  const regionalRecord = regionalGamesOf(
    regionalDistrict?.games ?? [],
    school.slug,
  );
  /*
    ★★**その学校が出た大会のページへのリンク**（2026-08-29 追加）。

    鍵は `SchoolRegionalRecord` のグループ分けと同じ `${季節}\t${大会名 ?? ""}`。
    ★**スラッグの決め方は `listTournaments` の中にある**ので、
    **部品側で組み立てないこと**（連番の規則が2か所に散る）。
  */
  const tournamentLinks: Record<string, { href: string; name: string }> = {};
  if (regionalDistrict) {
    for (const t of listTournaments(regionalDistrict)) {
      tournamentLinks[`${t.season}\t${t.name ?? ""}`] = {
        href: `/prefectures/${school.prefecture.slug}/${t.slug}`,
        // ★**大会ページの見出しと同じ作り方**（名前が無い大会は年＋季節）
        name: t.displayName ?? `${t.year ?? ""}年${seasonLabel(t.season)}`,
      };
    }
  }
  /*
    ★**甲子園の試合**（2026-08-23）。大会記事から作った生成物。
    ★★**校名は完全一致でしか結び付けない**（`koshienGamesOf`）。
    大会記事は略称なので、**部分一致で拾うと別の学校に当たる**
    （「横浜」と「横浜清陵」、「市和歌山」と「和歌山」）。
    ★**当たらなければ出さない。** 取りこぼすほうが、誤って別の学校の戦績を
    出すよりましである。
  */
  const nationalNames = [
    school.name,
    school.officialName,
    shortSchoolName(school.name, school.slug),
  ];
  const koshienRecord = [
    // ★県も渡す（同名の別校に当てないため。2026-08-26）
    ...koshienGamesOf(KOSHIEN_GAMES, nationalNames, school.prefecture.name),
    // ★明治神宮大会も同じ枠に出す（どちらも全国大会。見出しのバッジで分ける）
    ...jinguGamesOf(JINGU_GAMES, nationalNames, school.prefecture.name),
  ];

  /*
    ★**直接対決・通算成績**（2026-08-26）。
    甲子園・明治神宮・その県の地方大会から、**同じ顔合わせを集める。**
    ★**新しい出典は要らない**（持っている試合の見せ方の話）。
    ★**相手が公立なら `/vs/…` の対戦ページへ繋ぐ。**
  */
  const rivals = headToHead({
    names: nationalNames,
    pref: school.prefecture.name,
    slug: school.slug,
    regional: regionalDistrict?.games ?? [],
  });

  const koshienTotal = school.koshienSpringCount + school.koshienSummerCount;
  // 春・夏それぞれの最高成績。バッジに出す
  const bestKoshien = bestResultBySeason(championships);
  // 21世紀枠での出場。数が少なく特別な選出なので、回数ではなく年をそのまま出す
  const berthYears = TWENTY_FIRST_CENTURY_BERTHS.filter(
    (berth) => berth.schoolSlug === school.slug,
  ).map((berth) => berth.year);

  return (
    <Container className="pb-4">
      <JsonLd data={schoolJsonLd(school)} />
      <Breadcrumb
        items={[
          { label: "公立高校", href: "/schools" },
          {
            label: school.prefecture.name,
            href: `/schools?pref=${school.prefecture.slug}`,
          },
          { label: school.name },
        ]}
      />

      {/* ------- 学校の見出し ------- */}
      <header className="rounded-xl border border-line bg-white p-5">
        {/*
          写真を左・情報を右に置く。

          **横帯にしない理由。** 学校の写真として手に入るのはWikipediaの
          校舎写真で、実測した縦横比は中央値1.33（4:3）・上位10%でも1.50。
          以前のような横長（約5:1）の帯に嵌めると高さの7割以上が捨てられ、
          建物の横帯しか残らない。

          **カードの端いっぱいに広げず、余白の内側に4:3で置く。** 端まで
          広げて高さを右の列に合わせると、右の情報量（キャッチコピーの有無、
          バッジの数）で写真の縦横比が変わり、切り取られる量が学校ごとに
          ばらつく。比率を固定してしまえば、どの学校でも切らずに済む。

          狭い画面では写真を上に積む。
        */}
        {/* items-start が要る。既定の stretch だと右の列の高さに引き伸ばされ、
            aspect-[4/3] が効かずに写真が縦長へ切り取られる */}
        <div className="sm:flex sm:items-start sm:gap-5">
          <div className="mb-4 shrink-0 sm:mb-0 sm:w-56 md:w-64">
            <Thumbnail
              image={school.image}
              seed={school.slug}
              school={{ name: school.name, slug: school.slug }}
              emblemVariant="panel"
              className="aspect-[4/3] w-full rounded-lg"
              sizes="(max-width: 640px) 100vw, 256px"
            />

            {/*
              帰属表示。**写真に重ねず、下に書く。**
              CC BY-SA が求めるのは撮影者・ライセンス・改変の告知に加えて
              **元の作品へのリンク**で、10pxの帯に重ねると256px幅では
              入りきらず、リンクも押しにくい。
            */}
            {school.image?.credit && (
              <p className="mt-1.5 text-[0.6875rem] leading-snug text-ink-faint">
                {school.image.sourceUrl ? (
                  <a
                    href={school.image.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-navy-800"
                  >
                    {school.image.credit}
                  </a>
                ) : (
                  school.image.credit
                )}
              </p>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">
                {establishmentLabel(
                  school.establishment,
                  school.prefecture.name,
                )}
              </Badge>
              {school.schoolKind !== "high_school" && (
                <Badge variant="outline">
                  {SCHOOL_KINDS[school.schoolKind]}
                </Badge>
              )}
              {koshienTotal > 0 && <Badge>甲子園 {koshienTotal}回</Badge>}
              {berthYears.length > 0 && (
                <Badge variant="accent">
                  21世紀枠 {berthYears.join("・")}年
                </Badge>
              )}
              {bestKoshien.summer && (
                <Badge variant="outline">
                  夏の甲子園　最高成績：{bestKoshien.summer.result}
                </Badge>
              )}
              {bestKoshien.spring && (
                <Badge variant="outline">
                  春の甲子園　最高成績：{bestKoshien.spring.result}
                </Badge>
              )}
              {school.lastKoshienYear && (
                <Badge variant="outline">
                  最終出場 {school.lastKoshienYear}年
                </Badge>
              )}
            </div>

            <h1 className="mt-2.5 text-2xl font-bold text-navy-800 sm:text-3xl">
              {school.name}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">{school.officialName}</p>

            {school.catchcopy && (
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink">
                {school.catchcopy}
              </p>
            )}

            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">所在地</dt>
                <MapPin
                  size={15}
                  aria-hidden="true"
                  className="text-ink-faint"
                />
                <dd className="text-ink-muted">
                  <Link
                    href={`/schools?pref=${school.prefecture.slug}`}
                    className="hover:text-navy-800 hover:underline"
                  >
                    {school.prefecture.name}
                  </Link>
                  {school.city && `　${school.city}`}
                </dd>
              </div>

              <div className="flex items-center gap-1.5">
                <dt className="sr-only">区分</dt>
                <Building2
                  size={15}
                  aria-hidden="true"
                  className="text-ink-faint"
                />
                <dd className="text-ink-muted">
                  {ESTABLISHMENTS[school.establishment]}・
                  {SCHOOL_KINDS[school.schoolKind]}
                  {school.foundedYear && `　${school.foundedYear}年創立`}
                </dd>
              </div>
            </dl>

            {school.nameAliases.length > 0 && (
              <p className="mt-2 text-xs text-ink-faint">
                通称：{school.nameAliases.join("／")}
              </p>
            )}

            <div className="mt-5">
              {/*
              応援ボタン。テキストを投稿させない、いちばん軽い参加の形。
              文字で応援したい人は、同じページ下部のメッセージ欄へ送る
              （0008 で都道府県ページから学校ページへ移した）。
            */}
              <CheerButton
                schoolId={school.id}
                schoolName={school.name}
                initialCount={school.cheerCount}
              />

              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href="#school-cheers"
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-5 text-sm font-bold text-ink-muted hover:border-navy-800 hover:text-navy-800"
                >
                  <MessageSquareHeart size={16} aria-hidden="true" />
                  応援メッセージを書く
                </a>

                {school.websiteUrl && (
                  <a
                    href={school.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-navy-800 px-5 text-sm font-bold text-navy-800 hover:bg-navy-50"
                  >
                    学校公式サイト
                    <ExternalLink size={14} aria-hidden="true" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {school.description && (
        <section
          aria-labelledby="school-about"
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading id="school-about" title="学校紹介" />
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink">
            {school.description}
          </p>
        </section>
      )}

      {/* ------- 戦績 ------- */}
      {/*
        min-w-0 が要る。グリッドの子要素は既定で min-width:auto のため、
        中の表（min-w-[26rem]）が親を押し広げてしまい、
        表側の overflow-x-auto が効かずページごと横スクロールしてしまう。
      */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section
          aria-labelledby="koshien"
          className="min-w-0 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading
            id="koshien"
            title="甲子園出場歴"
            icon={<Trophy size={18} />}
            note={koshienTotal > 0 ? `通算${koshienTotal}回` : undefined}
          />
          <div className="mt-3">
            <ChampionshipTable items={championships} />
          </div>
        </section>

        <section
          aria-labelledby="records"
          className="min-w-0 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading id="records" title="最近の戦績" />
          {/*
            ★**地方大会の戦績は生成物から出す**（2026-08-23。運営者の指示）。
            DBの `school_records` は未着手で0件なので、**実データはこちら。**
            ★**その県のファイルだけを読む**（`getRegionalDistrict`）。
            ★**私立との試合も出る**（相手が私立でもこの学校の戦績である）。
          */}
          {koshienRecord.length > 0 && (
            <div className="mt-3">
              <SchoolKoshienRecord games={koshienRecord} names={nationalNames} />
            </div>
          )}
          {regionalRecord.length > 0 ? (
            <div className="mt-3">
              <SchoolRegionalRecord
                games={regionalRecord}
                schoolSlug={school.slug}
                tournamentLinks={tournamentLinks}
              />
            </div>
          ) : (
            koshienRecord.length === 0 && (
              <div className="mt-3">
                <RecordTable items={records} />
              </div>
            )
          )}
        </section>
      </div>

      <AdSlot slot="school-detail-bottom" />

      {/* ------- 直接対決・通算成績 ------- */}
      {rivals.length > 0 && (
        <section
          aria-labelledby="school-rivals"
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading
            id="school-rivals"
            title="直接対決・通算成績"
            icon={<Swords size={18} />}
            note="対戦の多い順"
          />
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">
            甲子園・明治神宮・地方大会で当たった相手を、対戦の多い順に並べています。
            <strong className="font-medium text-accent-800">オレンジ</strong>
            の校名は、その2校の全対戦を並べたページへ進めます。
          </p>
          <div className="mt-2">
            <HeadToHeadList items={rivals} schoolSlug={school.slug} />
          </div>
        </section>
      )}

      {/* ------- 関連する公立旋風 ------- */}
      {phenomena.length > 0 && (
        <section
          aria-labelledby="school-phenomena"
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading
            id="school-phenomena"
            title="この学校の公立旋風"
            icon={<Flame size={18} />}
            moreHref="/phenomenon"
          />
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {phenomena.map((item) => (
              <li key={item.id}>
                <PhenomenonCard item={item} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ------- 応援メッセージ（0008 で都道府県ページから移した） ------- */}
      <section
        aria-labelledby="school-cheers"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="school-cheers"
          title={`${school.name}への応援メッセージ`}
          icon={<MessageSquareHeart size={18} />}
        />
        <div className="mt-3">
          <CheerMessageList items={cheerMessages} />
        </div>
        <div className="mt-4">
          <CheerMessageForm schoolId={school.id} schoolName={school.name} />
        </div>
      </section>

      {/* ------- 関連ニュース ------- */}
      <section
        aria-labelledby="school-news"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="school-news"
          title={`${school.name}の関連ニュース`}
          icon={<Newspaper size={18} />}
          moreHref="/news"
          moreLabel="ニュース一覧へ"
        />
        {news.length > 0 ? (
          <ul className="mt-1 divide-y divide-line">
            {news.map((item) => (
              <li key={item.id}>
                <NewsCard news={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">
            この学校に関連づけられたニュースはまだありません。
          </p>
        )}
      </section>

      {/* ------- 同じ都道府県の学校 ------- */}
      {relatedSchools.length > 0 && (
        <section
          aria-labelledby="related-schools"
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading
            id="related-schools"
            title={`${school.prefecture.name}の他の公立高校`}
            moreHref={`/schools?pref=${school.prefecture.slug}`}
            moreLabel="すべて見る"
          />
          <ul className="mt-1 grid gap-x-6 sm:grid-cols-2">
            {relatedSchools.map((item) => (
              <li key={item.id} className="border-b border-line last:border-0">
                <SchoolCard school={item} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </Container>
  );
}
