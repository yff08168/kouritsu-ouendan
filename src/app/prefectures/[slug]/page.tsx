import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  ChevronRight,
  Flame,
  GitBranch,
  MapPin,
  MessageSquareHeart,
  Newspaper,
  Radio,
  School,
  Vote,
} from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { SectionHeading } from "@/components/common/SectionHeading";
import { SchoolList } from "@/components/schools/SchoolList";
import { NewsCard } from "@/components/news/NewsCard";
import { PhenomenonCard } from "@/components/phenomenon/PhenomenonCard";
import { AdSlot } from "@/components/ads/AdSlot";
import { PollCard } from "@/components/community/PollCard";
import { RegionalDistrictCard } from "@/components/results/RegionalDistrictCard";
import { CheerMessageList } from "@/components/community/CheerMessageList";

import { getPrefectureBySlug } from "@/lib/queries/prefectures";
import { buildPrefectureLead } from "@/lib/prefecture-lead";
import { getPrefectureKoshienSummary, searchSchools } from "@/lib/queries/schools";
import { getNewsList } from "@/lib/queries/news";
import { getPhenomenaByPrefecture } from "@/lib/queries/phenomena";
import { getActivePolls, getCheerMessages } from "@/lib/queries/community";
import { PREFECTURES } from "@/lib/constants";
import { getRegionalDistrict, latestSeasonGames } from "@/lib/regional-results";
import { listTournaments, tournamentDisplayName } from "@/lib/regional-tournaments";
import { TournamentLinks } from "@/components/results/TournamentLinks";
import { bracketForGames } from "@/lib/regional-bracket";
import { RegionalBracket } from "@/components/results/RegionalBracket";
import { RegionalUpcomingCard } from "@/components/results/RegionalUpcomingCard";

/**
 * その県の地方大会の結果を何試合まで出すか。
 *
 * 神奈川の選手権予選は公立が絡む試合だけで100件を超える。全部出すと
 * ページが長くなりすぎるうえ、**下の応援メッセージや投票まで遠くなる。**
 * 出していない試合があることは画面に明記する（`RegionalDistrictCard`）。
 */
const REGIONAL_GAMES_LIMIT = 24;

/**
 * 投票数と応援メッセージは動きが速いので、他のページより短く見直す。
 * 投票した本人には即座に結果が見えるので（PollCard が手元で数を足す）、
 * ここは「他の人が見たときにいつ反映されるか」の設定。
 */
export const revalidate = 300;

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return PREFECTURES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const prefecture = await getPrefectureBySlug(slug);

  if (!prefecture) return { title: "都道府県が見つかりません" };

  /*
    ★★**description にその県の実際の中身を書く**（2026-08-29）。

    それまでは**49地区すべてが同じ定型文**で、
    「神奈川 公立 高校野球」のような**県＋野球**の検索
    （運営者が挙げた主要な流入経路の1つ）に対して、
    **他の48県と区別が付く言葉が県名しか無かった。**

    ★**収録している大会数・試合数・いちばん新しい大会**を出す。
    ★★**地方大会を持たない地区がある**（規約で外している6県ほか）。
    **そこに「大会結果を掲載」と書かないこと** —— 画面には無い。
  */
  const [schools, district] = await Promise.all([
    // ★**件数だけ要る**ので1件だけ取る（`total` は全件の数）
    searchSchools({ prefectureSlug: slug, perPage: 1 }),
    getRegionalDistrict(slug),
  ]);
  const tournaments = district ? listTournaments(district) : [];
  const totalGames = district?.games.length ?? 0;
  // ★**いちばん新しい大会**（`listTournaments` は新しい順）
  const latest = tournaments[0] ?? null;

  const description = [
    `${prefecture.fullName}の公立高校野球。`,
    tournaments.length > 0
      ? `地方大会の結果を${tournaments.length}大会・${totalGames}試合ぶん掲載しています。`
      : "",
    latest?.displayName ? `最新は「${latest.displayName}」。` : "",
    `公立高校・国立高校・高専${schools.total}校の一覧と、公立旋風もまとめています。`,
  ].join("");

  return {
    title: `${prefecture.fullName}の公立高校野球`,
    description,
    alternates: { canonical: `/prefectures/${prefecture.slug}` },
  };
}

export default async function PrefectureDetailPage({ params }: Props) {
  const { slug } = await params;
  const prefecture = await getPrefectureBySlug(slug);

  if (!prefecture) notFound();

  const [schoolResult, newsResult, phenomena, polls, messages, regional, koshien] =
    await Promise.all([
      searchSchools({ prefectureSlug: slug, perPage: 12 }),
      getNewsList({ prefectureSlug: slug, perPage: 6 }),
      getPhenomenaByPrefecture(slug),
      getActivePolls(slug),
      /*
        この県の学校あての応援メッセージ（0008）。
        **投稿欄は学校ページにしか無い**ので、ここは集約表示に徹する。
      */
      getCheerMessages({ prefectureSlug: slug, limit: 10 }),
      /*
        地方大会の結果。**DBではなくリポジトリ内の生成物**から読む
        （`src/lib/data/regional/<県>.ts`。出典が県ごとに違うため）。
        **対応していない県は null**（2026-08-13 時点で6県だけ）。
      */
      getRegionalDistrict(slug),
      /*
        ★**その県の甲子園の集計**（2026-08-29。リード文に使う）。
        ★**`getKoshienDataset`（3,000行）は使わない** —— このページは
        `revalidate = 300` で5分ごとに作り直されうる。理由は queries/schools.ts。
      */
      getPrefectureKoshienSummary(slug),
    ]);

  const regionalGames = regional ? latestSeasonGames(regional, REGIONAL_GAMES_LIMIT) : null;
  /*
    ★★**トーナメント表は「組めたときだけ」出す**（2026-08-22）。

    生成物は枝を持っていないので、**全試合から組み直す**
    （`buildRegionalBracket` の説明を読むこと）。組めない大会が普通にある
    ―― ブロック予選（1枚から複数の代表）・出典に載っていない試合がある・
    校名が一意でない（`連合`）。**そのときは null で、下の一覧だけを出す。**

    ★**私立どうしの試合も渡すこと。** 枝が切れて必ず組めなくなる。
    `regionalGames.games` は**公立が絡む試合だけ**なので、
    **ここでは使わない**（`regional.games` を渡す）。
  */
  const bracket =
    regional && regionalGames
      ? bracketForGames(
          regional.games.filter((g) => g.season === regionalGames.season),
          regionalGames.tournaments[0] ?? null,
        )
      : null;

  /*
    ★**大会ごとのページへの入口**（2026-08-24）。
    生成物には過去の大会が残っている（120日の窓は 2026-08-23 に外した）ので、
    **県のページに一覧を置いて、勝ち上がりは大会のページで見てもらう。**
  */
  const tournaments = regional ? listTournaments(regional) : [];
  /** いま県のページに出している大会（＝トーナメント表を出している大会）の slug */
  const currentTournamentSlug =
    regionalGames?.tournaments[0] != null
      ? (tournaments.find((t) => t.name === regionalGames.tournaments[0])?.slug ?? null)
      : null;

  /*
    ★★**地方大会を持っている県かどうか**（2026-08-25）。

    **持っている県は大会を先頭に、持っていない県は学校一覧を先頭に**する。
    ★**持っていないのは8地区**（北北海道・南北海道・青森・宮城・秋田・
    東東京・西東京・鳥取。**規約で塞がれている6県**ぶん）。
    ★**この分岐を入れ忘れると、その8地区だけ「空の見出しから始まるページ」になる。**
  */
  const hasRegional = Boolean(
    (regional && regionalGames) || regional?.upcoming?.length || tournaments.length,
  );

  /*
    ★★**リード文**（2026-08-29 その3 追加）。**このページ唯一の地の文。**
    見出しは「◯◯県の公立高校野球」＝狙っている検索語そのものなのに、
    それを支える文がページに無かった。組み立ての規則は `src/lib/prefecture-lead.ts`。
    ★**ここで文を足さないこと**（規則が2か所に散る）。
  */
  const lead = buildPrefectureLead({
    prefecture,
    schoolCount: schoolResult.total,
    district: regional,
    tournaments,
    koshien,
    phenomenaCount: phenomena.length,
  });

  /* ------- 学校一覧 ------- */
  const schoolsSection = (
    <section
      aria-labelledby="pref-schools"
      className="mt-4 rounded-xl border border-line bg-white p-5"
    >
      <SectionHeading
        id="pref-schools"
        title={`${prefecture.name}の公立高校`}
        icon={<School size={18} />}
        moreHref={`/schools?pref=${prefecture.slug}`}
        moreLabel="一覧・検索へ"
      />
      <div className="mt-2">
        <SchoolList schools={schoolResult.schools} />
      </div>
    </section>
  );

  /* ------- 公立旋風 ------- */
  const phenomenaSection =
    phenomena.length > 0 ? (
      <section
        aria-labelledby="pref-phenomena"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="pref-phenomena"
          title={`${prefecture.name}の公立旋風`}
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
    ) : null;

  /*
    ------- 地方大会（いちばん新しい大会 → 大会をたどる） -------

    並びは **これからの試合 → トーナメント表 → 結果 → 大会をたどる**。
    ★**トーナメント表を結果より上に置く**（見に来た甲斐がいちばんあるもの）。
    表は横スクロールするので、狭い画面でも下が押し流されない。
  */
  const regionalSection = (
    <>
      {/*
        ★**結果より前に置く。** 開幕前・開催中は「次に誰と当たるか」のほうが
        見たい情報で、結果は下にある。
      */}
      {regional?.upcoming?.length ? (
        <RegionalUpcomingCard
          games={regional.upcoming}
          districtName={prefecture.name}
        />
      ) : null}

      {/*
        ★**組めなかった大会では何も出さない。**「だいたい合っている表」は出さない。
        ★**見出しは大会名にする**（2026-08-25）。「トーナメント表」という一般名だと、
        **ページの最初の見出しが何の大会か分からない。**
        名前を持たない出典があるので、そのときだけ一般名に落とす。
      */}
      {bracket && (
        <section
          aria-labelledby="pref-bracket"
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading
            id="pref-bracket"
            title={tournamentDisplayName(bracket.tournament) ?? "トーナメント表"}
            icon={<GitBranch size={18} />}
          />
          <RegionalBracket bracket={bracket} />
          {/* ★この大会の全試合はこちら。県のページは24件までしか出していない */}
          {currentTournamentSlug && (
            <p className="mt-3 text-right">
              <Link
                href={`/prefectures/${slug}/${currentTournamentSlug}`}
                className="text-sm font-bold text-navy-800 hover:underline"
              >
                この大会の全試合を見る →
              </Link>
            </p>
          )}
        </section>
      )}

      {regional && regionalGames && (
        <RegionalDistrictCard
          district={regional}
          season={regionalGames.season}
          games={regionalGames.games}
          total={regionalGames.total}
          tournaments={regionalGames.tournaments}
        />
      )}

      {/*
        ★**県のページはいちばん新しい大会しか出していない**ので、
        過去ぶんへの入口をここに置く（生成物には過去の大会が残っている）。

        ★★**いま出している大会も一覧に入れる。**「過去のぶんだけ」にすると、
        **大会が1つしか無くて枝も組めない県で、大会ページへの導線が消える**
        （上の「この大会の全試合を見る」は枝が組めたときにしか出ない）。
      */}
      {tournaments.length > 0 && (
        <section
          aria-labelledby="pref-tournaments"
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading
            id="pref-tournaments"
            title="大会をたどる"
            icon={<CalendarDays size={18} />}
          />
          <p className="mt-1 mb-3 text-sm text-ink-muted">
            年ごとにまとめています。大会ごとにトーナメント表と全試合を出しています。
          </p>
          <TournamentLinks prefectureSlug={slug} entries={tournaments} />
        </section>
      )}
    </>
  );

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[
          { label: "都道府県", href: "/prefectures" },
          { label: prefecture.name },
        ]}
      />

      <header className="rounded-xl border border-line bg-white p-5 sm:p-7">
        {/* 読み仮名は見出しの外に置く。h1の中に入れると「…野球しまね」と読み上げられるため */}
        <p className="flex flex-wrap items-baseline gap-2 text-xs font-bold text-accent-800">
          {prefecture.region}
          <span className="font-normal text-ink-faint">
            {prefecture.nameKana}
          </span>
        </p>
        <h1 className="mt-1 text-2xl font-bold text-navy-800 sm:text-3xl">
          {prefecture.fullName}の公立高校野球
        </h1>

        {/*
          ★★**速報への入口**（2026-09-05）。**このページには速報を埋め込まない。**
          このページは `revalidate = 300` で、Supabase の問い合わせを何本も持っている。
          速報（60秒）を混ぜると、**Next はページの中でいちばん短い間隔を採る**ので、
          **学校一覧や応援メッセージまで毎分作り直すことになる。**
          ★**速報は `/live/<県>` に分けてあり、そちらだけが「いま」を出す。**
          ★**リンクは常に出す** —— 試合の有無はこのページでは分からない
          （分かるには全国の一覧を取りに行くことになり、ここの間隔がまた縮む）。
        */}
        {hasRegional && (
          <p className="mt-3">
            <Link
              href={`/live/${prefecture.slug}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-accent-500/40 px-3 py-1.5 text-sm font-bold text-navy-800 hover:bg-navy-50"
            >
              <Radio size={14} className="text-accent-500" aria-hidden />
              今日の試合速報
            </Link>
          </p>
        )}

        {prefecture.description && (
          <p className="mt-3 text-sm leading-relaxed text-ink">
            {prefecture.description}
          </p>
        )}

        {/*
          ★リード文は見出しカードの中に置く（学校ページは外の別カード）。
          ここは数の並び（掲載校数・関連ニュース・公立旋風）が続くので、
          間に別カードを挟むと見出しと数が切り離される。
        */}
        {lead.length > 0 && (
          <div className="mt-3 space-y-2.5">
            {lead.map((text) => (
              <p key={text} className="text-sm leading-relaxed text-ink">
                {text}
              </p>
            ))}
          </div>
        )}

        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-ink-muted">掲載校数</dt>
            <dd className="text-lg font-bold tabular-nums text-navy-800">
              {schoolResult.total}
              <span className="ml-0.5 text-xs font-normal text-ink-muted">校</span>
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-ink-muted">関連ニュース</dt>
            <dd className="text-lg font-bold tabular-nums text-navy-800">
              {newsResult.total}
              <span className="ml-0.5 text-xs font-normal text-ink-muted">件</span>
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-ink-muted">公立旋風</dt>
            <dd className="text-lg font-bold tabular-nums text-navy-800">
              {phenomena.length}
              <span className="ml-0.5 text-xs font-normal text-ink-muted">件</span>
            </dd>
          </div>
        </dl>

        <Link
          href="/prefectures"
          className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-navy-800 hover:underline"
        >
          <MapPin size={13} aria-hidden="true" />
          他の都道府県を見る
          <ChevronRight size={13} aria-hidden="true" />
        </Link>
      </header>

      {/*
        ================= 並び順 =================

        ★★**地方大会を持っている県は「いちばん新しい大会」を先頭に出す**
        （2026-08-25。運営者の指示）。
        検索から来た人が最初に見るのが**素の学校一覧**だと、見に来た甲斐が無い。
        いちばん見たいトーナメント表が折りたたみの下に沈んでもいた。

        ★**学校一覧はページから消さず下に移すだけ**なので、索引には従来どおり載る。
        効くのは順位そのものより**滞在時間**と、
        **ページ最初の見出しが「第107回…大阪大会」のような具体的な文言になること。**

        ★★**地方大会を持たない8地区では学校一覧を先頭に戻す**（`hasRegional`）。
        入れ忘れると、その8地区だけ**空の見出しから始まるページ**になる。
      */}
      {hasRegional ? (
        <>
          {regionalSection}
          {phenomenaSection}
          <AdSlot slot="sidebar" />
          {schoolsSection}
        </>
      ) : (
        <>
          {schoolsSection}
          {phenomenaSection}
          <AdSlot slot="sidebar" />
        </>
      )}

      {/* ------- 投票 ------- */}
      {polls.length > 0 && (
        <section
          aria-labelledby="pref-polls"
          className="mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading
            id="pref-polls"
            title={`${prefecture.name}のみんなの投票`}
            icon={<Vote size={18} />}
          />
          <div className="mt-3 space-y-3">
            {polls.map((poll) => (
              <PollCard key={poll.id} poll={poll} />
            ))}
          </div>
        </section>
      )}

      {/* ------- 応援メッセージ（集約表示。投稿欄は学校ページ） ------- */}
      <section
        aria-labelledby="pref-cheers"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="pref-cheers"
          title={`${prefecture.name}の学校に届いた応援`}
          icon={<MessageSquareHeart size={18} />}
          moreHref={`/schools?pref=${prefecture.slug}`}
          moreLabel="学校を探す"
        />
        <div className="mt-3">
          <CheerMessageList
            items={messages}
            showSchool
            emptyText={`${prefecture.name}の学校にはまだ応援メッセージが届いていません。各校のページから投稿できます。`}
          />
        </div>
        <p className="mt-3 text-xs text-ink-faint">
          応援メッセージは各学校のページから投稿できます。
        </p>
      </section>

      {/* ------- ニュース ------- */}
      <section
        aria-labelledby="pref-news"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <SectionHeading
          id="pref-news"
          title={`${prefecture.name}のニュース`}
          icon={<Newspaper size={18} />}
          moreHref={`/news?pref=${prefecture.slug}`}
          moreLabel="もっと見る"
        />
        {newsResult.news.length > 0 ? (
          <ul className="mt-1 divide-y divide-line">
            {newsResult.news.map((item) => (
              <li key={item.id}>
                <NewsCard news={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">
            {prefecture.name}に関連づけられたニュースはまだありません。
          </p>
        )}
      </section>
    </Container>
  );
}
