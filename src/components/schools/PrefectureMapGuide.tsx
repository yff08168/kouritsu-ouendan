import Link from "next/link";
import { Search } from "lucide-react";

type Props = {
  /** 掲載している学校数の合計 */
  totalSchools: number;
  /** 色分けと集計の基準になる年。出場歴が入っている最も新しい年 */
  thisYear: number | null;
  /** その年の春に公立校が出た地区の数 */
  springDistricts: number;
  /** その年の夏に公立校が出た地区の数 */
  summerDistricts: number;
  /** その年の春夏そろって公立校が出た地区の数 */
  bothSeasons: number;
};

/**
 * タイル地図の**左上の空き**に入れる案内。
 *
 * 49地区を日本の形に並べると1〜8列目・1〜5行目が丸ごと空く。
 * 以前はここを空けたまま、凡例と「学校名から探す」を地図の下に積んでいた。
 * 空きに入れたぶん縦が詰まり、凡例が地図と同じ視界に入るようになる。
 *
 * ------------------------------------------------------------------
 * **この欄はPCで約850px×360pxと横に長い。**
 *
 *   縦1列に積むと下に大きな空きが残る（実際、囲みとボタンの間に61pxの
 *   不自然な間があいた）。幅が足りるときは「凡例｜数字とボタン」の**2列**にして、
 *   横を使いきる。判定は**この欄自身の幅**（`@container`）で、地図の外側の
 *   コンテナクエリは流用しない（地図の幅とこの欄の幅は別物）。
 *
 *   2列に切り替える 40rem は「凡例が読める幅＋ボタンの 20rem」から。
 *   **この 40rem は globals.css の 51rem と対になっている。** 1列に折り返すと
 *   320pxを超えて左上の3〜5行目に入らないので、地図の下に回す判断がそこで決まる。
 *
 *   縦は `content-center` でそろえる。`mt-auto` でボタンだけ下に押しつけると、
 *   空きが1か所に寄って不格好になる。
 *
 * ------------------------------------------------------------------
 * ★**中身を増やすときは高さに気をつけること。** 5行ぶん（約350px）を
 * 超えると、同じ行にある北海道・東北のマスまで伸びて高さが揃わなくなる。
 * 詳細は globals.css の `.prefecture-map__aside`。
 *
 * 色分けは色だけで意味を持たせず、必ず文字でも書く（要件のアクセシビリティ）。
 *
 * **「49地区で並べた図」「私立を含まない」の断り書きはここには置かない**
 * （2026-08-13 にユーザーの指示で削除）。凡例と数字の文言が公立校であることを
 * 明示しているため。同じ断り書きは `/prefectures` のページ側に残してある。
 */
export function PrefectureMapGuide({
  totalSchools,
  thisYear,
  springDistricts,
  summerDistricts,
  bothSeasons,
}: Props) {
  return (
    <div className="@container h-full rounded-lg border border-line bg-surface p-4">
      {/*
        `content-center` で行を縦中央にそろえる。割り当てられた行より枠が
        高いときに、余りを1か所（`mt-auto` など）に寄せるとそこだけ不自然に空く。
      */}
      <div className="grid h-full content-center gap-x-6 gap-y-4 @min-[40rem]:grid-cols-[minmax(0,1fr)_auto] @min-[40rem]:items-center @min-[40rem]:gap-y-0">
        {/* 左（狭いときは上）: 凡例 */}
        <div>
          <h3 className="text-sm font-bold text-navy-800">地図の見方</h3>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-ink-muted">
            <li className="flex items-baseline gap-1.5">
              <span
                aria-hidden="true"
                className="shrink-0 rounded-sm bg-navy-100 px-1 text-[0.625rem] font-bold text-navy-700"
              >
                春
              </span>
              <span
                aria-hidden="true"
                className="shrink-0 rounded-sm bg-navy-100 px-1 text-[0.625rem] font-bold text-navy-700"
              >
                夏
              </span>
              <span>
                その地区から
                <strong className="font-medium text-ink">最後に甲子園へ出た公立校</strong>
                と、その年
              </span>
            </li>
            <li className="flex items-baseline gap-1.5">
              <span
                aria-hidden="true"
                className="shrink-0 text-[0.625rem] font-bold text-accent-800"
              >
                12
              </span>
              <span>
                県名の右肩の数字は
                <strong className="font-medium text-ink">掲載している学校数</strong>
              </span>
            </li>
            {thisYear != null && (
              <li className="flex items-baseline gap-1.5">
                <span
                  aria-hidden="true"
                  className="mt-0.5 inline-block h-3 w-5 shrink-0 rounded-sm border border-accent-500 bg-accent-50"
                />
                <span>
                  オレンジの枠は{thisYear}年の
                  <strong className="font-medium text-ink">春夏そろって</strong>
                  公立校が出場した地区
                  {bothSeasons > 0 ? `（${bothSeasons}地区）` : "（まだありません）"}
                </span>
              </li>
            )}
          </ul>
        </div>

        {/*
          右（狭いときは下）: 数字と導線。

          区切り線は向きを変える。2列のときは縦線、1列のときは横線。
          数字は**地図から読み取れるものだけ**にしてある。地図と食い違う
          数字を並べると、どちらが正なのか分からなくなるため。
        */}
        <div className="flex flex-col items-center gap-2.5 border-t border-line pt-4 @min-[40rem]:w-80 @min-[40rem]:border-t-0 @min-[40rem]:border-l @min-[40rem]:pt-0 @min-[40rem]:pl-6">
          <dl className="flex flex-wrap items-baseline justify-center gap-x-2">
            <dt className="text-xs text-ink-faint">掲載している公立校</dt>
            <dd className="text-base font-bold text-navy-800">
              {totalSchools.toLocaleString("ja-JP")}
              <span className="ml-0.5 text-xs font-normal text-ink-muted">校</span>
            </dd>
          </dl>

          {/*
            **「2026年 春」のような見出しだけにしない。** 何の数なのかが
            伝わらないので、春夏の2つは「甲子園に公立校が出場した地区」という
            1行の見出しでまとめて受け、囲って見出しと一体にする。
          */}
          {thisYear != null && (
            <div className="w-full rounded-lg border border-navy-300 bg-white px-4 py-2">
              <p className="text-center text-xs font-medium text-ink-muted">
                {thisYear}年の甲子園に公立校が出場した地区
              </p>
              <dl className="mt-1 flex flex-wrap items-baseline justify-center gap-x-7 gap-y-1">
                <div className="flex items-baseline gap-x-1.5">
                  <dt className="text-xs text-ink-muted">春（選抜）</dt>
                  <dd className="text-lg font-bold text-navy-800">
                    {springDistricts}
                    <span className="ml-0.5 text-xs font-normal text-ink-muted">
                      地区
                    </span>
                  </dd>
                </div>
                <div className="flex items-baseline gap-x-1.5">
                  <dt className="text-xs text-ink-muted">夏（選手権）</dt>
                  <dd className="text-lg font-bold text-navy-800">
                    {summerDistricts}
                    <span className="ml-0.5 text-xs font-normal text-ink-muted">
                      地区
                    </span>
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {/*
            ボタンは囲みと同じ幅にそろえる。幅いっぱい（PCで約850px）に
            伸ばすと1本の帯になって凡例より目立ちすぎる。
          */}
          <Link
            href="/schools"
            className="inline-flex min-h-11 w-full max-w-xs items-center justify-center gap-2 rounded-lg bg-navy-800 px-5 text-sm font-bold text-white hover:bg-navy-700"
          >
            <Search size={16} aria-hidden="true" />
            学校名から探す
          </Link>
        </div>
      </div>
    </div>
  );
}
