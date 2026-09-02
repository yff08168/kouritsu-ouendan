import Link from "next/link";
import { BookOpen, School, Search, Star } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Hero } from "@/components/layout/Hero";
import { SectionHeading } from "@/components/common/SectionHeading";
import { AdSlot } from "@/components/ads/AdSlot";
import { LiveResultsCard } from "@/components/results/LiveResultsCard";
import { RegionalResultsCard } from "@/components/results/RegionalResultsCard";
import { ResultsTicker } from "@/components/results/ResultsTicker";
import { SchoolCard } from "@/components/schools/SchoolCard";
import { PrefectureMap } from "@/components/schools/PrefectureMap";
import { PrefectureMapGuide } from "@/components/schools/PrefectureMapGuide";
import { PhenomenonRanking } from "@/components/phenomenon/PhenomenonRanking";
import { FeatureCard } from "@/components/features/FeatureCard";

import { LIVE_RESULTS } from "@/lib/data/live-results";
import { REGIONAL_PICKUPS } from "@/lib/data/regional-pickup";
import { pickResultsSlot } from "@/lib/results-slot";
import { spotlightTitle } from "@/lib/regional-results";
import { statusBySlug } from "@/lib/live-results";
import {
  getSchoolsBySlugs,
  getSchoolCountByPrefecture,
} from "@/lib/queries/schools";
import { getRandomPhenomena } from "@/lib/queries/phenomena";
import { getLatestFeatures } from "@/lib/queries/features";
import {
  getKoshienDataset,
  latestPublicByPrefecture,
} from "@/lib/queries/rankings";

// 一覧系は10分ごとに作り直す。ニュース更新の反映と負荷のバランス。
export const revalidate = 600;

export default async function HomePage() {
  const [phenomena, prefectureCounts, features, koshien] = await Promise.all([
    /*
      ★**公立旋風は「枠に入る最大数」をランダムに出す**（2026-08-24）。
      件数の根拠は `getRandomPhenomena` の説明にある（実測で4件）。
    */
    getRandomPhenomena(5),
    getSchoolCountByPrefecture(),
    getLatestFeatures(4),
    getKoshienDataset(),
  ]);

  /*
    「今夏の甲子園に出場している公立校」。
    大会が終わって次の春が入るまではその夏の出場校を出し続ける。

    **出場歴（DB）から作る。** 結果速報（Wikipedia由来の生成物）だけだと、
    初戦がまだの学校が落ちる。並びは「勝ち残り→勝ち数の多い順」にして、
    いま追いかける価値のある学校を上に置く。
  */
  const liveStatus = statusBySlug(LIVE_RESULTS);
  const summerSchools = koshien.schools
    .filter(
      (s) => koshien.latestYear != null && s.lastSummerYear === koshien.latestYear,
    )
    .sort((a, b) => {
      const sa = liveStatus.get(a.slug);
      const sb = liveStatus.get(b.slug);
      return (
        Number(sb?.alive ?? false) - Number(sa?.alive ?? false) ||
        (sb?.wins ?? 0) - (sa?.wins ?? 0) ||
        a.name.localeCompare(b.name, "ja")
      );
    });
  const summerCards = await getSchoolsBySlugs(summerSchools.map((s) => s.slug));

  const latestByPrefecture = latestPublicByPrefecture(koshien.schools);
  /*
    「今年」は今日の日付ではなく、**出場歴が入っている最も新しい年**で決める。
    1月〜3月は今年の大会がまだ1つも無いので、日付で判定すると
    どの地区も色が付かず、色分けの説明だけが浮いてしまう。
  */
  const thisYear = koshien.latestYear;
  /*
    地図の左上の欄に出す数字。**地図から読み取れるものだけ**にしてある。
    地図と食い違う数字を並べると、どちらが正なのか分からなくなる。
  */
  const mapEntries = Object.values(latestByPrefecture);
  const countDistricts = (season: "spring" | "summer") =>
    thisYear == null
      ? 0
      : mapEntries.filter((entry) => entry[season]?.year === thisYear).length;
  const springDistricts = countDistricts("spring");
  const summerDistricts = countDistricts("summer");
  const bothSeasons = mapEntries.filter(
    (entry) =>
      thisYear != null &&
      entry.spring?.year === thisYear &&
      entry.summer?.year === thisYear,
  ).length;
  const totalSchools = Object.values(prefectureCounts).reduce(
    (sum, count) => sum + count,
    0,
  );

  /*
    結果速報の枠に甲子園と地方大会のどちらを出すか。
    **今日の日付ではなく、最後の試合が新しいほうを出す**（`pickResultsSlot`）。
    右カラム（出場校／勝ち上がり）も同じ判定で一緒に入れ替える。
  */
  const resultsSlot = pickResultsSlot(LIVE_RESULTS, REGIONAL_PICKUPS);
  /*
    **勝ち上がりが1校も無いときは切り替えない。** 大会の谷間や、
    どの県も初戦前のときに空の枠が出てしまう。そのときは
    従来どおり甲子園の出場校を出しておくほうが、情報として空にならない。
  */
  const showRegionalSpotlight =
    resultsSlot === "regional" &&
    REGIONAL_PICKUPS.spotlightSeason != null &&
    REGIONAL_PICKUPS.spotlight.length > 0;
  const spotlightBySlug = new Map(
    REGIONAL_PICKUPS.spotlight.map((s) => [s.slug, s]),
  );
  // 学校カードに出す情報はDBから引く（甲子園の出場校と同じ作り）
  const spotlightCards = showRegionalSpotlight
    ? await getSchoolsBySlugs(REGIONAL_PICKUPS.spotlight.map((s) => s.slug))
    : [];

  return (
    <>
      {/*
        PCでは「ヒーロー」と「公立旋風」を横並びにする。
        スマホでは要件9の順序どおり、ヒーロー → 公立旋風 → 最新ニュース … と縦に並ぶ。
      */}
      <Container className="pt-5 sm:pt-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
          <Hero />
          <PhenomenonRanking phenomena={phenomena} />
        </div>
      </Container>

      {/*
        ★★**電光掲示板**（2026-08-31。運営者の提案）。球場のリボンボードのつもり。

        ★**`Container` の外に置いて画面の端から端まで敷く。**
        中に入れると左右に余白ができ、**帯ではなく箱に見える。**
        ★**JavaScriptを使っていない**（`ResultsTicker` の説明を読むこと）。
      */}
      <div className="mt-4 sm:mt-5">
        <ResultsTicker pickups={REGIONAL_PICKUPS} />
      </div>

      <Container className="mt-4 sm:mt-5">
        {/*
          ★★★**`items-start` にしてある**（2026-09-01。運営者の「目いっぱい使って」）。

          左右のカードは中身の量が別々に決まる（左＝抜粋の試合数／右＝まだ負けていない
          公立校の数）ので、**どちらが高いかは日によって入れ替わる。**
          既定の `stretch` だと**低いほうのカードに大きな空白**ができていた
          （実測：右が3校の日は右に246ポイント、右が8校の日は左に230ポイント）。

          ★**右のカードは中身なりの高さで終わらせる**（`items-start`）。
          ★★**左（結果）のカードだけ `h-full` で行の高さいっぱいに伸ばし、中身に使わせる**
          —— こちらは横スライドなので、伸びたぶんを行が分け合える。
          ★**`h-full` は `items-start` でも効く**（%の高さはグリッド領域＝行の高さに対して解く）。
        */}
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {/*
            結果速報。**時期によって中身が入れ替わる枠。**

            大会期間中は甲子園、それ以外は地方大会（秋季・春季・選手権予選）。
            公立校が絡む試合だけに絞ってあるのがこのサイトの切り口で、
            そこは甲子園でも地方大会でも同じ。

            ★**切り替えは今日の日付ではなくデータで決める**（`pickResultsSlot`）。
            日付で切ると大会の谷間に何も出ない期間ができ、雨天順延にも追随できない。
          */}
          {resultsSlot === "koshien" ? (
            <LiveResultsCard results={LIVE_RESULTS} />
          ) : (
            <RegionalResultsCard pickups={REGIONAL_PICKUPS} />
          )}

          {/*
            右カラムも左の枠と一緒に入れ替える。**左が地方大会なのに右が
            夏の出場校のままだと、秋・冬に古い情報が残り続ける。**

            甲子園の期間中 … 今夏の甲子園に出場している公立校
            それ以外       … いま開催中の地方大会で勝ち上がっている公立校

            以前は「甲子園出場回数の多い順」の3校を出していたが、
            **大会期間中に見たいのは殿堂ではなく「いま出ている学校」。**
            地方大会のときも同じ考えで「いま勝ち上がっている学校」を出す。
          */}
          {showRegionalSpotlight ? (
            <section
              aria-labelledby="featured-heading"
              className="rounded-xl border border-line bg-white p-4 sm:p-5"
            >
              <SectionHeading
                id="featured-heading"
                title={spotlightTitle(REGIONAL_PICKUPS.spotlightSeason!)}
                icon={<Star size={22} />}
                moreHref="/schools"
              />
              <p className="mt-1 text-sm text-ink-muted">
                まだ1度も負けていない公立校　{spotlightCards.length}校
              </p>
              <ul className="mt-1 divide-y divide-line">
                {spotlightCards.map((school) => {
                  const record = spotlightBySlug.get(school.slug);
                  return (
                    <li key={school.id}>
                      <SchoolCard
                        school={school}
                        compact
                        note={
                          record ? (
                            <span className="font-bold text-accent-800">
                              {record.district}・
                              {/*
                                **「1勝」ではなく「ベスト16」を出す。**
                                参加校数が県で大きく違うので、勝ち数だけでは
                                どこまで勝ち上がったのか伝わらない。
                                数えられなかったときだけ勝ち数に落とす。
                              */}
                              {record.standing ?? `${record.wins}勝で勝ち上がり`}
                            </span>
                          ) : null
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : (
          <section
            aria-labelledby="featured-heading"
            className="rounded-xl border border-line bg-white p-4 sm:p-5"
          >
            <SectionHeading
              id="featured-heading"
              title={
                koshien.latestYear
                  ? `${koshien.latestYear}年夏の出場校`
                  : "注目の公立高校"
              }
              icon={<Star size={22} />}
              moreHref="/schools?koshien=yes&sort=recent"
            />
            <p className="mt-1 text-sm text-ink-muted">
              甲子園に出場している公立校
              {summerCards.length > 0 && `　${summerCards.length}校`}
            </p>
            <ul className="mt-1 divide-y divide-line">
              {summerCards.map((school) => {
                const status = liveStatus.get(school.slug);
                return (
                  <li key={school.id}>
                    <SchoolCard
                      school={school}
                      compact
                      note={
                        status ? (
                          status.alive ? (
                            <span className="font-bold text-accent-800">
                              {status.wins > 0
                                ? `${status.wins}勝で勝ち残り`
                                : "勝ち残り"}
                            </span>
                          ) : (
                            <>
                              {status.wins > 0 && `${status.wins}勝　`}
                              {status.lostAt ?? "－"}で敗退
                            </>
                          )
                        ) : null
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </section>
          )}
        </div>
      </Container>

      {/*
        都道府県から探す導線は横幅いっぱいで置く。
        狭いカラムに入れるとタイル地図が潰れて県名が読めなくなるため。
      */}
      <Container className="mt-4 sm:mt-5">
        <section
          aria-labelledby="search-heading"
          className="rounded-xl border border-line bg-white p-4 sm:p-5"
        >
          {/*
            **見出しも含めて、地図の左上の空きに入れる**（`aside`）。
            49地区を日本の形に並べると1〜8列目・1〜5行目が丸ごと空くので、
            凡例も数字も「学校名から探す」も地図の下に積む必要がない。

            見出しを地図の外に置くと、地図の左上が見出しのぶんだけ下から
            始まって右隣の北北海道と上端が揃わず、そこに空きができる。
            狭いときは地図が横並びのボタンに変わり、`aside` は先頭に回る
            （見出しが地区ボタンより下に来ないようにするため）。
          */}
          <PrefectureMap
            counts={prefectureCounts}
            latest={latestByPrefecture}
            highlightYear={thisYear}
            heading={
              <>
                <SectionHeading
                  id="search-heading"
                  title="公立高校を探す"
                  icon={<Search size={20} />}
                />
                <p className="mt-2 text-sm font-medium text-ink">
                  都道府県から探す
                  <span className="ml-2 text-xs font-normal text-ink-muted">
                    春・夏それぞれで、その地区から最後に甲子園へ出た公立校を出しています
                  </span>
                </p>
              </>
            }
            aside={
              <PrefectureMapGuide
                totalSchools={totalSchools}
                thisYear={thisYear}
                springDistricts={springDistricts}
                summerDistricts={summerDistricts}
                bothSeasons={bothSeasons}
              />
            }
          />
        </section>
      </Container>

      <AdSlot slot="home-mid" />

      <Container className="mt-4 sm:mt-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {/* 特集 */}
          <section
            aria-labelledby="features-heading"
            className="rounded-xl border border-line bg-white p-4 sm:p-5"
          >
            <SectionHeading
              id="features-heading"
              title="公立高校野球特集"
              icon={<BookOpen size={22} />}
              moreHref="/features"
            />
            {/*
              ★**列数を件数に合わせる**（2026-08-24）。
              特集をいったん1件だけにしたので、4列のまま出すと
              **1枚が左端に寄って、右3枠が空いたように見える。**
              件数が増えたら自動で4列に戻る（`getLatestFeatures` は最大4件）。
            */}
            <ul
              className={
                features.length >= 3
                  ? "mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4"
                  : features.length === 2
                    ? "mt-3 grid grid-cols-2 gap-3"
                    : "mt-3"
              }
            >
              {features.map((feature) => (
                <li key={feature.id}>
                  <FeatureCard feature={feature} />
                </li>
              ))}
            </ul>
          </section>

          {/*
            ★**Xのフォロー枠は 2026-08-21 に外した**（運営者の判断）。
            アカウントを追って作るので、**まだ無いアカウントへ誘導しない。**
            作ったら XFollowCard を戻すだけ（コンポーネントは残してある）。
          */}
        </div>
      </Container>

      {/* 学校ページへの導線を最後にもう一度置き、回遊を切らさない（要件23） */}
      <Container className="mt-4 sm:mt-5">
        <section className="flex flex-col items-start gap-4 rounded-xl border border-line bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <School
              size={26}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-accent-500"
            />
            <div>
              <h2 className="text-lg font-bold text-navy-800 sm:text-xl">
                応援したい学校は決まっていますか？
              </h2>
              <p className="mt-1 text-base text-ink-muted">
                地元の公立高校、母校、気になるあの学校。学校ページから戦績や関連ニュースをまとめて追えます。
              </p>
            </div>
          </div>
          <Link
            href="/schools"
            className="inline-flex min-h-12 shrink-0 items-center rounded-lg border border-navy-800 px-5 text-base font-bold text-navy-800 hover:bg-navy-50"
          >
            公立高校を探す
          </Link>
        </section>
      </Container>
    </>
  );
}
