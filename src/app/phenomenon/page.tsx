import type { Metadata } from "next";
import Link from "next/link";
import { Flame } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { Pagination } from "@/components/common/Pagination";
import { EmptyState } from "@/components/common/EmptyState";
import { PhenomenonCard } from "@/components/phenomenon/PhenomenonCard";
import { AdSlot } from "@/components/ads/AdSlot";

import {
  getPhenomenaList,
  getPhenomenonYears,
} from "@/lib/queries/phenomena";
import { PHENOMENON, PHENOMENON_LEVELS } from "@/lib/constants";
import type { PhenomenonLevel } from "@/types/app";
import { cn } from "@/lib/utils";

export const revalidate = 600;

type SearchParams = {
  year?: string;
  level?: string;
  page?: string;
};

type Props = {
  searchParams: Promise<SearchParams>;
};

function parseLevel(value: string | undefined): PhenomenonLevel | undefined {
  if (value && value in PHENOMENON_LEVELS) return value as PhenomenonLevel;
  return undefined;
}

function buildUrl(params: SearchParams): string {
  const search = new URLSearchParams();
  if (params.year) search.set("year", params.year);
  if (params.level) search.set("level", params.level);
  if (params.page && params.page !== "1") search.set("page", params.page);
  const query = search.toString();
  return query ? `/phenomenon?${query}` : "/phenomenon";
}

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const { year } = await searchParams;
  const parsedYear = Number.parseInt(year ?? "", 10);

  return {
    title: Number.isFinite(parsedYear)
      ? `${parsedYear}年の${PHENOMENON.label}`
      : `${PHENOMENON.label} — ${PHENOMENON.tagline}`,
    description: PHENOMENON.description,
    alternates: { canonical: "/phenomenon" },
  };
}

export default async function PhenomenonListPage({ searchParams }: Props) {
  const params = await searchParams;
  const parsedYear = Number.parseInt(params.year ?? "", 10);
  const year = Number.isFinite(parsedYear) ? parsedYear : undefined;
  const level = parseLevel(params.level);
  const page = Number.parseInt(params.page ?? "1", 10) || 1;

  const [result, years] = await Promise.all([
    getPhenomenaList({ year, level, page }),
    getPhenomenonYears(),
  ]);

  return (
    <Container className="pb-4">
      <Breadcrumb
        items={[
          { label: PHENOMENON.label, href: "/phenomenon" },
          ...(year ? [{ label: `${year}年` }] : []),
        ]}
      />

      <header className="overflow-hidden rounded-xl border border-line bg-gradient-to-br from-navy-800 to-navy-600 p-5 sm:p-7">
        <div className="flex items-center gap-2">
          <Flame size={24} aria-hidden="true" className="text-accent-500" />
          <h1 className="text-xl font-bold text-white sm:text-2xl">
            {PHENOMENON.label}
          </h1>
        </div>
        {/* 名前だけでは何のページか伝わらないため、必ず説明を添える */}
        <p className="mt-1 text-sm font-medium text-accent-500">
          {PHENOMENON.tagline}
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-navy-100">
          {PHENOMENON.description}
        </p>
      </header>

      {/* ------- 絞り込み ------- */}
      <section
        aria-labelledby="phenomenon-filter"
        className="mt-4 rounded-xl border border-line bg-white p-5"
      >
        <h2 id="phenomenon-filter" className="sr-only">
          絞り込み
        </h2>

        <div>
          <p className="text-xs font-medium text-ink-muted">年から探す</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            <li>
              <FilterChip
                label="すべて"
                href={buildUrl({ level: params.level })}
                isActive={!year}
              />
            </li>
            {years.map((y) => (
              <li key={y}>
                <FilterChip
                  label={`${y}年`}
                  href={buildUrl({ year: String(y), level: params.level })}
                  isActive={year === y}
                />
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4">
          <p className="text-xs font-medium text-ink-muted">規模から探す</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            <li>
              <FilterChip
                label="すべて"
                href={buildUrl({ year: params.year })}
                isActive={!level}
              />
            </li>
            {(Object.keys(PHENOMENON_LEVELS) as PhenomenonLevel[]).map((key) => (
              <li key={key}>
                <FilterChip
                  label={PHENOMENON_LEVELS[key]}
                  href={buildUrl({ year: params.year, level: key })}
                  isActive={level === key}
                />
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------- 一覧 ------- */}
      <section aria-labelledby="phenomenon-list" className="mt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-t-xl border border-b-0 border-line bg-white px-5 pt-5">
          <h2 id="phenomenon-list" className="text-sm font-bold text-navy-800">
            {year ? `${year}年の記録` : "すべての記録"}
          </h2>
          <p className="text-xs text-ink-muted">
            全 <strong className="text-ink">{result.total}</strong> 件
          </p>
        </div>

        <div className="rounded-b-xl border border-line bg-white px-5 pb-5 pt-3">
          {result.phenomena.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {result.phenomena.map((item) => (
                <li key={item.id}>
                  <PhenomenonCard item={item} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="該当する記録が見つかりませんでした"
              description="年や規模の条件を変えて探してみてください。"
              actionHref="/phenomenon"
              actionLabel={`すべての${PHENOMENON.label}を見る`}
            />
          )}
        </div>

        <Pagination
          page={result.page}
          totalPages={result.totalPages}
          buildHref={(p) =>
            buildUrl({
              year: params.year,
              level: params.level,
              page: String(p),
            })
          }
        />
      </section>

      <AdSlot slot="sidebar" />
    </Container>
  );
}

function FilterChip({
  label,
  href,
  isActive,
}: {
  label: string;
  href: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={isActive ? "true" : undefined}
      className={cn(
        "inline-flex min-h-9 items-center rounded-full border px-3.5 text-xs font-medium transition-colors",
        isActive
          ? "border-navy-800 bg-navy-800 text-white"
          : "border-line bg-white text-navy-800 hover:border-navy-600 hover:bg-navy-50",
      )}
    >
      {label}
    </Link>
  );
}
