import Link from "next/link";
import { FEATURE_CATEGORIES } from "@/lib/constants";
import { Thumbnail } from "@/components/common/Thumbnail";
import type { FeatureSummary } from "@/types/app";

/** 特集カード。画像の上に文字を重ねるので、無画像時もフォールバックで成立する。 */
export function FeatureCard({ feature }: { feature: FeatureSummary }) {
  return (
    <article className="group relative overflow-hidden rounded-lg">
      <Thumbnail
        image={feature.image}
        seed={feature.slug}
        className="h-40 w-full sm:h-44"
        sizes="(max-width: 640px) 50vw, 25vw"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-navy-900/85 via-navy-900/35 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-3">
        <p className="text-[0.6875rem] font-bold text-accent-500">
          {FEATURE_CATEGORIES[feature.category]}
        </p>
        <h3 className="mt-0.5 text-sm font-bold leading-snug text-white">
          <Link
            href={`/features/${feature.slug}`}
            className="after:absolute after:inset-0 group-hover:underline"
          >
            {feature.title}
          </Link>
        </h3>
        {feature.subtitle && (
          <p className="mt-1 line-clamp-2 text-[0.6875rem] leading-relaxed text-white/80">
            {feature.subtitle}
          </p>
        )}
      </div>
    </article>
  );
}
