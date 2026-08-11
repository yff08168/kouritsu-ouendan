"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X as CloseIcon } from "lucide-react";
import { NAV, SITE } from "@/lib/constants";
import { SearchBar } from "@/components/common/SearchBar";

/** スマートフォン用のメニュー。タップ領域は最低44pxを確保する（要件26）。 */
export function MobileMenu() {
  const [open, setOpen] = useState(false);

  // 開いている間は背面をスクロールさせない / Escで閉じる
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        className="grid h-11 w-11 place-items-center rounded-lg text-navy-800 hover:bg-navy-50 lg:hidden"
      >
        <span className="sr-only">メニューを開く</span>
        <Menu size={24} aria-hidden="true" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="メニューを閉じる"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-navy-900/50"
          />
          <div
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="メニュー"
            className="absolute inset-y-0 right-0 flex w-[min(20rem,85vw)] flex-col bg-white shadow-xl"
          >
            <div className="flex h-16 items-center justify-between border-b border-line px-4">
              <span className="text-sm font-bold text-navy-800">メニュー</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-11 w-11 place-items-center rounded-lg text-navy-800 hover:bg-navy-50"
              >
                <span className="sr-only">メニューを閉じる</span>
                <CloseIcon size={22} aria-hidden="true" />
              </button>
            </div>

            <div className="border-b border-line p-4">
              <SearchBar />
            </div>

            <nav aria-label="メインナビゲーション" className="flex-1 overflow-y-auto p-2">
              <ul>
                {NAV.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex min-h-12 items-center rounded-lg px-4 text-base font-medium text-ink hover:bg-navy-50"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="border-t border-line p-4">
              <a
                href={SITE.xUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-12 items-center justify-center rounded-lg bg-navy-800 px-4 text-sm font-bold text-white hover:bg-navy-700"
              >
                X（旧Twitter）をフォロー
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
