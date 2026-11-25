import Link from "next/link";

import { SectionHeading } from "@/components/common/SectionHeading";
import { PRO_PREF_NAME, entryText, shortSchool, type ProSchool } from "@/lib/pro-alumni";
import { PlayerCareer } from "@/components/pro/PlayerCareer";

/**
 * 公立高校出身のプロ野球選手を、地区ごとの節で並べる（`/pro-players/<地方>` と、トップの「その他」）。
 *
 * ★**事実だけ**: 氏名・進路（高校 → 大学/社会人 → 球団）・在籍した球団と年・入団年とドラフト順位。
 *   **成績・写真・生年月日は載せない。選手ごとの個別ページへのリンクも作らない。**
 * ★学校ページは**公開済みの学校にだけ**張る（`slugs`）。閉校した公立校は校名だけ出す。
 * ★**見出しは校名をそのまま出す**（`shortSchoolName` を使わない。見出しは一意に伝える）。
 * ★タブ（JavaScript）にしない。節を縦に並べる（`id="pref-<slug>"` で上のリンクから飛ぶ）。
 */
export function ProPrefSections({
  prefs,
  slugs,
}: {
  prefs: { pref: string; schools: ProSchool[]; players: number }[];
  /** 公開済みの学校の slug。ここに無い学校にはリンクを張らない */
  slugs: Set<string>;
}) {
  return (
    <>
      {prefs.map((p) => (
        <section
          key={p.pref}
          id={`pref-${p.pref}`}
          aria-labelledby={`h-${p.pref}`}
          className="mt-4 scroll-mt-4 rounded-xl border border-line bg-white p-5"
        >
          <SectionHeading
            id={`h-${p.pref}`}
            title={`${PRO_PREF_NAME.get(p.pref) ?? "その他（閉校した学校など）"}の公立高校出身`}
            note={`${p.schools.length}校・${p.players}人`}
          />
          <div className="mt-3 space-y-5">
            {p.schools.map((s) => {
              const linked = s.slug !== null && slugs.has(s.slug);
              return (
                <div key={s.slug ?? s.officialName}>
                  <h3 className="text-base font-bold text-navy-800">
                    {linked ? (
                      <Link href={`/schools/${s.slug}`} className="text-accent-800 hover:underline">
                        {s.officialName}
                      </Link>
                    ) : (
                      s.officialName
                    )}
                    {s.slug === null && <span className="ml-2 text-xs font-normal text-ink-muted">（閉校・統合）</span>}
                    <span className="ml-2 text-xs font-normal text-ink-muted">{s.players.length}人</span>
                  </h3>
                  <ul className="mt-1 divide-y divide-line">
                    {s.players.map((pl) => (
                      <li key={`${pl.name}-${pl.draft?.year ?? pl.entryYear ?? ""}`} className="py-1.5 text-sm leading-relaxed">
                        <span className="font-bold text-navy-800">{pl.name}</span>
                        <span className="ml-2 text-xs text-ink-muted">{entryText(pl)}</span>
                        {pl.formerName && (
                          <span className="ml-2 text-xs text-ink-faint">（当時の校名：{pl.formerName}）</span>
                        )}
                        <br />
                        <PlayerCareer player={pl} school={shortSchool(s.officialName)} />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
