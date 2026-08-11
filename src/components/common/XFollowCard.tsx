import { Megaphone } from "lucide-react";
import { SITE } from "@/lib/constants";
import { XIcon } from "@/components/common/XIcon";

/** Xへの導線（要件22）。新規ユーザーを連れてくるチャネルなので目立つ位置に置く。 */
export function XFollowCard() {
  return (
    <section
      aria-labelledby="x-heading"
      className="flex h-full flex-col rounded-xl border border-line bg-white p-4 sm:p-5"
    >
      <div className="flex items-center gap-2">
        <XIcon size={18} className="text-navy-800" />
        <h2 id="x-heading" className="text-base font-bold text-navy-800">
          X（旧Twitter）でも発信中！
        </h2>
      </div>

      <p className="mt-3 text-sm font-medium text-navy-700">{SITE.xHandle}</p>

      <div className="mt-2 flex items-start gap-2">
        <Megaphone
          size={18}
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-accent-500"
        />
        <p className="text-xs leading-relaxed text-ink-muted">
          公立高校野球の最新情報や注目校を発信中！
          地方大会の速報、公立旋風、過去の名勝負まで。
        </p>
      </div>

      <a
        href={SITE.xUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`X（旧Twitter）で${SITE.name}をフォローする`}
        className="mt-5 flex min-h-11 items-center justify-center gap-2 rounded-lg bg-navy-800 px-4 text-sm font-bold text-white hover:bg-navy-700 sm:mt-auto"
      >
        <XIcon size={15} />
        <span aria-hidden="true">をフォローする</span>
      </a>
    </section>
  );
}
