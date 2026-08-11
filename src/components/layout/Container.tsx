import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  className?: string;
  /** 記事本文など、読み物として幅を絞りたい場合に使う */
  size?: "wide" | "narrow";
};

/** ページの左右余白と最大幅を一元管理する。ページ側で px-4 を書かない。 */
export function Container({ children, className, size = "wide" }: Props) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 sm:px-6",
        size === "wide" ? "max-w-6xl" : "max-w-3xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
