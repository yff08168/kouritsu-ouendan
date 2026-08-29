import Link from "next/link";
import { NAV, PREFECTURES, SITE } from "@/lib/constants";
import { Container } from "@/components/layout/Container";
import { Logo } from "@/components/layout/Logo";
// ★`XIcon` は X のボタンを戻すときに一緒に戻す（下の注記を読むこと）

/**
 * ★**グローバルナビ（`NAV`）に入れずフッターにだけ置くもの**（2026-08-29）。
 *
 * 年別アーカイブはハブであって、毎日見に来る人の導線ではない。
 * ★**`NAV` に足さない理由は幅**（1024px でナビの右端639px・ボタンの左端847px。
 * 6つ目を足すとあふれる）。**クローラには全ページのフッターから届く。**
 */
const FOOTER_EXTRA_LINKS = [{ href: "/archive", label: "年別アーカイブ" }];

const ABOUT_LINKS = [
  { href: "/about", label: "このサイトについて" },
  { href: "/contact", label: "お問い合わせ" },
  { href: "/privacy", label: "プライバシーポリシー" },
  { href: "/terms", label: "利用規約" },
];

/** フッターに並べる主要都道府県（内部リンク用）。全47件は /prefectures へ。 */
const FOOTER_PREFECTURE_SLUGS = [
  "hokkaido",
  "miyagi",
  "tokyo",
  "kanagawa",
  "aichi",
  "osaka",
  "hiroshima",
  "fukuoka",
];

export function Footer() {
  const footerPrefectures = FOOTER_PREFECTURE_SLUGS.map((slug) =>
    PREFECTURES.find((p) => p.slug === slug),
  ).filter((p) => p !== undefined);

  return (
    <footer className="mt-16 bg-navy-800 text-navy-100">
      <Container className="py-12">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_auto_auto] md:gap-16">
          <div>
            <Logo tone="onDark" withTagline />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-navy-100/80">
              {SITE.description}
            </p>
            {/*
              ★**Xのボタンは 2026-08-24 に外した**（運営者の判断。運用予定が無い）。
              **まだ無いアカウントへ誘導しない。** 作ったらこの塊を戻すだけ。
            */}
          </div>

          <nav aria-label="コンテンツ">
            <h2 className="text-sm font-bold text-white">コンテンツ</h2>
            <ul className="mt-4 space-y-2.5">
              {[...NAV, ...FOOTER_EXTRA_LINKS].map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-navy-100/80 hover:text-white hover:underline"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="text-sm font-bold text-white">都道府県から探す</h2>
            <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5">
              {footerPrefectures.map((p) => (
                <li key={p.slug}>
                  <Link
                    href={`/prefectures/${p.slug}`}
                    className="text-sm text-navy-100/80 hover:text-white hover:underline"
                  >
                    {p.name}
                  </Link>
                </li>
              ))}
              <li className="col-span-2">
                <Link
                  href="/prefectures"
                  className="inline-flex min-h-6 items-center py-1 text-sm font-medium text-accent-500 hover:underline"
                >
                  47都道府県すべて見る
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-white/15 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {ABOUT_LINKS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-xs text-navy-100/70 hover:text-white hover:underline"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-xs text-navy-100/60">
            © {new Date().getFullYear()} {SITE.name}
          </p>
        </div>
      </Container>
    </footer>
  );
}
