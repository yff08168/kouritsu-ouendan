/**
 * 選手記事の「経歴」の読み方（scripts/build-pro-alumni.mjs と scripts/verify-pro-alumni.mjs が共有する）。
 *
 * ★**検算が別の規則で読むと、検算にならない。** 変えるときは両方に効くのでここだけ直す。
 */

/**
 * 記事名に設置者が入っているか。マスタに無い閉校校を「公立だった」と判断する材料。
 * ★**「高等専門学校」を入れない**（match-koshien.mjs とは違う）。近畿大学工業高専のように
 *   私立の高専があり、**公立・国立の高専は学校マスタに全部ある**ので、マスタに無い高専は私立。
 */
export const PUBLIC_MARKERS = /(県立|府立|都立|道立|市立|町立|村立|区立|組合立)/;

export const HS_RE = /(高等学校|高校|高等専門学校|中等教育学校)/;
export const JUNIOR_RE = /(中学校|中学$)/;
export const UNIV_RE = /(大学|短期大学)/;

/**
 * NPB の球団の記事名（**完全一致の名簿**）。
 *
 * ★★**語尾（ライオンズ・パイレーツ・スターズ…）で判定しない**（2026-11-25）。独立リーグの
 *   「石川ミリオンスターズ」「愛媛マンダリンパイレーツ」「栃木ゴールデンブレーブス」、海外の
 *   「起亜タイガース」「統一ライオンズ」を NPB と取り違え、**経由先が消えて球団に独立リーグが並んだ。**
 * ★経歴欄は**現在の球団名の記事**にリンクしていることが多い（読売ジャイアンツ・オリックス・バファローズ…）が、
 *   旧名のままの記事（近鉄バファローズ・ヤクルトスワローズ…）もあるので、旧名も名簿に入れてある。
 * ★**名簿に無い球団は NPB として数えない**（落とす方向）。増やすときは、記事名を見て NPB と確かめてから。
 */
const NPB_TEAMS = new Set([
  // 現在の12球団
  "読売ジャイアンツ", "阪神タイガース", "中日ドラゴンズ", "広島東洋カープ", "横浜DeNAベイスターズ", "東京ヤクルトスワローズ",
  "福岡ソフトバンクホークス", "北海道日本ハムファイターズ", "千葉ロッテマリーンズ", "埼玉西武ライオンズ",
  "オリックス・バファローズ", "東北楽天ゴールデンイーグルス",
  // 前身・消えた球団（経歴欄が旧名のままリンクしているもの）
  "大阪近鉄バファローズ", "近鉄バファローズ", "オリックス・ブルーウェーブ", "阪急ブレーブス", "南海ホークス", "福岡ダイエーホークス",
  "ヤクルトスワローズ", "国鉄スワローズ", "サンケイアトムズ", "ヤクルトアトムズ", "横浜ベイスターズ", "横浜大洋ホエールズ",
  "大洋ホエールズ", "広島カープ", "東京巨人軍", "西武ライオンズ", "太平洋クラブライオンズ", "クラウンライターライオンズ",
  "西鉄ライオンズ", "日本ハムファイターズ", "東映フライヤーズ", "日拓ホームフライヤーズ", "ロッテオリオンズ", "東京オリオンズ",
  "毎日大映オリオンズ", "松竹ロビンス", "大映ユニオンズ", "高橋ユニオンズ", "西日本パイレーツ", "大洋漁業",
]);
export function isNpbTeam(title) {
  return !!title && NPB_TEAMS.has(title);
}

/** 球団名の表示用の短い形 */
const TEAM_PREFIX = [
  ["読売", "巨人"], ["東京巨人軍", "巨人"], ["福岡ソフトバンク", "ソフトバンク"], ["北海道日本ハム", "日本ハム"],
  ["東北楽天", "楽天"], ["千葉ロッテ", "ロッテ"], ["埼玉西武", "西武"], ["横浜DeNA", "DeNA"],
  ["東京ヤクルト", "ヤクルト"], ["広島東洋", "広島"], ["大阪近鉄", "近鉄"], ["福岡ダイエー", "ダイエー"],
  ["横浜大洋", "大洋"],
];
export function shortTeam(title) {
  let t = title
    .replace(/(タイガース|ジャイアンツ|ドラゴンズ|スワローズ|カープ|ベイスターズ|ホエールズ|ライオンズ|ホークス|ファイターズ|マリーンズ|バファローズ|ブルーウェーブ|ブレーブス|ゴールデンイーグルス|オリオンズ|フライヤーズ|アトムズ|ユニオンズ|ロビンス|パイレーツ|スターズ|パールス)$/, "")
    .trim();
  for (const [from, to] of TEAM_PREFIX) if (t === from) return to;
  t = t.replace(/^オリックス・$/, "オリックス");
  return t || title;
}

/** 経歴の項目の種類。hs=高校 / junior=中学 / npb=NPBの球団 / univ=大学 / other=社会人・クラブ・海外など */
export function classify(it) {
  const probe = `${it.link ?? ""} ${it.label}`;
  if (HS_RE.test(probe)) return "hs";
  if (JUNIOR_RE.test(probe) && !UNIV_RE.test(probe)) return "junior";
  if (isNpbTeam(it.link)) return "npb";
  if (UNIV_RE.test(probe)) return "univ";
  return "other";
}

/** 「(2019 - )」「(2011 - 2014, 2018 - 2020)」→「2019–」「2011–2014, 2018–2020」 */
export function yearsOf(text) {
  const m = text.match(/\(([^()]*\d{4}[^()]*)\)\s*$/);
  if (!m) return null;
  return m[1].replace(/\s*-\s*/g, "–").replace(/年/g, "").trim();
}

/** 「馬場拓海 (野球)」→「馬場拓海」 */
export const displayName = (title) => title.replace(/\s*[（(][^）)]*[）)]\s*$/, "");

/** 校名・チーム名の中身だけにする（高校・大学・野球部・付属などを落とす）。突き合わせ用 */
export const core = (s) =>
  (s ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/(硬式)?野球(部|団|クラブ)$/, "")
    .replace(/(体育会|中学校・高等学校|高等学校|高校|高)$/, "")
    .replace(/(大学|短期大学)$/, "")
    .replace(/[ヶケ]/g, "ケ");

/**
 * 経歴の項目 `career`（{link,label,text}）と、ドラフトの表の行 `row`（row.affil）が同じものを指しているか。
 * **記事名が同じ**か、**中身（高校・大学・野球部を落とした形）が一方に含まれる**とき。
 */
export function sameAffiliation(career, row) {
  if (career.link && row.affil.link && career.link === row.affil.link) return true;
  const a = [core(career.label), core(career.link), core(career.text)].filter((x) => x.length >= 2);
  const b = [core(row.affil.label), core(row.affil.link), core(row.affil.text)].filter((x) => x.length >= 2);
  return a.some((x) => b.some((y) => x === y || x.includes(y) || y.includes(x)));
}
