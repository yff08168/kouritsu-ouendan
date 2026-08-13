import Link from "next/link";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  ESTABLISHMENTS,
  SCHOOL_KINDS,
  TARGET_ESTABLISHMENTS,
  type Establishment,
  type SchoolKind,
} from "@/lib/constants";
import {
  SCHOOL_KOSHIEN_FILTERS,
  SCHOOL_SORTS,
  type SchoolKoshienFilter,
  type SchoolSort,
} from "@/lib/queries/schools";

export type SchoolFilterState = {
  q?: string;
  pref?: string;
  establishment?: Establishment;
  kind?: SchoolKind;
  koshien?: SchoolKoshienFilter;
  sort?: SchoolSort;
};

/**
 * 絞り込みと並び替え。
 *
 * **ただのリンクの集まりにしてある。** クライアントコンポーネントにすれば
 * 見た目は良くなるが、JSが動かない環境で絞り込めなくなるし、
 * 状態を選ぶたびにURLが変わらないと結果を共有できない。
 * 押すと `?establishment=municipal` のようなURLに飛ぶだけ。
 *
 * 押されている選択肢をもう一度押すと解除になる（トグル）。
 */
export function SchoolFilters({
  state,
  buildHref,
  sortUnavailable,
}: {
  state: SchoolFilterState;
  /** 変更後の状態からURLを作る。ページ番号は呼び出し側で1に戻すこと */
  buildHref: (next: SchoolFilterState) => string;
  /** 並び替えが効かなかった（マイグレーション0007が未適用） */
  sortUnavailable?: boolean;
}) {
  const hasFilter =
    state.pref || state.establishment || state.kind || state.koshien || state.q;

  return (
    <div className="space-y-3">
      <Row label="設置区分">
        {TARGET_ESTABLISHMENTS.map((key) => (
          <Chip
            key={key}
            active={state.establishment === key}
            href={buildHref({
              ...state,
              establishment: state.establishment === key ? undefined : key,
            })}
          >
            {ESTABLISHMENTS[key]}
          </Chip>
        ))}
      </Row>

      <Row label="学校の種類">
        {(Object.keys(SCHOOL_KINDS) as SchoolKind[]).map((key) => (
          <Chip
            key={key}
            active={state.kind === key}
            href={buildHref({
              ...state,
              kind: state.kind === key ? undefined : key,
            })}
          >
            {SCHOOL_KINDS[key]}
          </Chip>
        ))}
      </Row>

      <Row label="甲子園">
        {(Object.keys(SCHOOL_KOSHIEN_FILTERS) as SchoolKoshienFilter[]).map(
          (key) => (
            <Chip
              key={key}
              active={state.koshien === key}
              href={buildHref({
                ...state,
                koshien: state.koshien === key ? undefined : key,
              })}
            >
              {SCHOOL_KOSHIEN_FILTERS[key]}
            </Chip>
          ),
        )}
      </Row>

      <Row label="並び替え">
        {(Object.keys(SCHOOL_SORTS) as SchoolSort[]).map((key) => (
          <Chip
            key={key}
            active={(state.sort ?? "pref") === key}
            title={SCHOOL_SORTS[key].note}
            href={buildHref({ ...state, sort: key === "pref" ? undefined : key })}
          >
            {SCHOOL_SORTS[key].label}
          </Chip>
        ))}
      </Row>

      {sortUnavailable && (
        <p className="rounded-lg bg-accent-50 px-3 py-2 text-xs leading-relaxed text-accent-800">
          「甲子園出場回数順」はまだ使えません（DBの準備が済んでいないため、
          都道府県順で表示しています）。
        </p>
      )}

      {hasFilter && (
        <p>
          <Link
            href={buildHref({})}
            className="inline-flex min-h-9 items-center gap-1 rounded-full border border-line px-3.5 text-sm font-medium text-ink-muted hover:border-navy-800 hover:text-navy-800"
          >
            <X size={14} aria-hidden="true" />
            条件をすべて解除
          </Link>
        </p>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
      <span className="w-full shrink-0 text-xs font-bold text-ink-muted sm:w-20">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  href,
  active,
  title,
  children,
}: {
  href: string;
  active: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      title={title}
      // 選択中は読み上げにも伝える。色だけだと分からない
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-medium transition-colors",
        active
          ? "border-navy-800 bg-navy-800 text-white"
          : "border-line bg-white text-ink-muted hover:border-navy-600 hover:text-navy-800",
      )}
    >
      {children}
    </Link>
  );
}
