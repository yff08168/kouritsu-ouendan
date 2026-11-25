import type { ProPlayer } from "@/lib/pro-alumni";

/**
 * 選手の経歴の1行。**少年野球・中学（あれば）→ 高校 → 大学・社会人 → 球団（年）**。
 *
 * ★**事実だけ**（Wikipedia の経歴欄に書かれているものを、書かれた順に並べる）。
 * ★**高校より前は書かれている選手だけ**（0.2%）。**無い選手に「不明」と書かない**
 *   （書かれていないだけで、無いとは限らない）。
 * ★独立リーグ・海外の球団も在籍した球団として並べる（運営者の了承。2026-11-25）。
 * ★高校は太字（その選手がどの学校の卒業生か、一目で分かるように）。
 */
export function PlayerCareer({ player, school }: { player: ProPlayer; school: string }) {
  const segments: { label: string; className: string }[] = [
    ...(player.early ?? []).map((e) => ({ label: e.label, className: "text-ink-faint" })),
    { label: school, className: "font-bold text-navy-800" },
    ...player.route.map((r) => ({ label: r.label, className: "text-ink-muted" })),
    ...player.teams.map((t) => ({
      label: t.years ? `${t.team}（${t.years}）` : t.team,
      className: "text-ink",
    })),
  ];
  return (
    <span className="text-sm leading-relaxed">
      {segments.map((s, i) => (
        <span key={`${i}-${s.label}`}>
          {i > 0 && (
            <span aria-hidden="true" className="mx-1 text-ink-faint">
              →
            </span>
          )}
          <span className={s.className}>{s.label}</span>
        </span>
      ))}
    </span>
  );
}
