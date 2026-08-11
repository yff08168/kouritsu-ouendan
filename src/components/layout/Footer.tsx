import Link from "next/link";
import { NAV, PREFECTURES, SITE } from "@/lib/constants";
import { Container } from "@/components/layout/Container";
import { Logo } from "@/components/layout/Logo";
import { XIcon } from "@/components/common/XIcon";

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
            <a
              href={SITE.xUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-navy-800 hover:bg-navy-50"
            >
              <XIcon size={16} />
              {SITE.xHandle}
            </a>
          </div>

          <nav aria-label="コンテンツ">
            <h2 className="text-sm font-bold text-white">コンテンツ</h2>
            <ul className="mt-4 space-y-2.5">
              {NAV.map((item) => (
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
