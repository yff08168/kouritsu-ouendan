"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * PC用のグローバルナビ。
 * 現在地をオレンジの下線で示す（アクセントは小面積のみという方針）。
 */
export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav aria-label="メインナビゲーション">
      <ul className="flex items-center gap-1">
        {NAV.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative block px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "text-navy-800"
                    : "text-ink-muted hover:text-navy-800",
                )}
              >
                {item.label}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent-500",
                    isActive ? "opacity-100" : "opacity-0",
                  )}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
