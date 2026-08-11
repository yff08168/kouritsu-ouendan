import Link from "next/link";
import { Star } from "lucide-react";
import { SITE } from "@/lib/constants";
import { Container } from "@/components/layout/Container";
import { Logo } from "@/components/layout/Logo";
import { NavLinks } from "@/components/layout/NavLinks";
import { MobileMenu } from "@/components/layout/MobileMenu";
import { SearchBar } from "@/components/common/SearchBar";
import { XIcon } from "@/components/common/XIcon";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white">
      <Container className="flex h-16 items-center gap-3 lg:h-[4.5rem] lg:gap-6">
        <Logo withTagline className="shrink-0" />

        <div className="hidden lg:block">
          <NavLinks />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden w-56 xl:block">
            <SearchBar />
          </div>

          <a
            href={SITE.xUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden h-10 w-10 place-items-center rounded-full bg-navy-800 text-white hover:bg-navy-700 sm:grid"
          >
            <span className="sr-only">X（旧Twitter）で公立応援団をフォローする</span>
            <XIcon />
          </a>

          {/*
            将来のコミュニティ機能（学校フォロー）の入口。
            MVPでは未ログインでも使える「注目の公立高校」へ誘導しておき、
            ユーザー機能の実装後に /mypage へ差し替える。
          */}
          <Link
            href="/schools"
            className="hidden h-10 items-center gap-1.5 rounded-full bg-navy-800 px-4 text-sm font-bold text-white hover:bg-navy-700 md:inline-flex"
          >
            <Star size={16} aria-hidden="true" className="text-accent-500" />
            応援する学校
          </Link>

          <MobileMenu />
        </div>
      </Container>
    </header>
  );
}
