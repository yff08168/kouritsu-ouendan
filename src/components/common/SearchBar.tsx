import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** 初期値（検索結果ページで入力を保持するため） */
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  size?: "sm" | "lg";
  /** ラベルを読み上げ用に隠さず表示するか */
  labelText?: string;
  /** 送信先。既定は横断検索の /search */
  action?: string;
  /** 同じページに複数置く場合にidが衝突しないようにする */
  id?: string;
};

/**
 * 学校・地域の検索フォーム。
 * JSを使わない素のGETフォームにしているので、
 * サーバーコンポーネントのまま使えて、JS無効環境でも動く。
 */
export function SearchBar({
  defaultValue = "",
  placeholder = "学校名・地域で検索",
  className,
  size = "sm",
  labelText = "学校名・地域で検索",
  action = "/search",
  id = "site-search",
}: Props) {
  const inputId = id;

  return (
    <form
      action={action}
      role="search"
      className={cn("relative w-full", className)}
    >
      <label htmlFor={inputId} className="sr-only">
        {labelText}
      </label>
      <input
        id={inputId}
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-full border border-line bg-white pl-4 text-ink placeholder:text-ink-faint",
          "focus:border-navy-600 focus:outline-none",
          size === "sm" ? "h-10 pr-11 text-sm" : "h-12 pr-12 text-base",
        )}
      />
      <button
        type="submit"
        className={cn(
          "absolute right-1 top-1/2 -translate-y-1/2 rounded-full text-navy-800",
          "hover:bg-navy-50 focus-visible:bg-navy-50",
          size === "sm" ? "h-8 w-8" : "h-10 w-10",
          "grid place-items-center",
        )}
      >
        <span className="sr-only">検索する</span>
        <Search size={size === "sm" ? 18 : 20} aria-hidden="true" />
      </button>
    </form>
  );
}
