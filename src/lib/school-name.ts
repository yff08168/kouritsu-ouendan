/**
 * 一覧・タイル・ランキングで使う「短い校名」。
 *
 * 学校マスタの `name` は「佐賀商業高校」のように必ず種別まで入っている。
 * 学校の一覧として並べる場面では「高校」が全部の行に付いて読みにくく、
 * 高校野球の記事やスコアボードでも短い呼び名のほうが通りがよい。
 *
 * **見出し（学校ページのh1）や検索結果では使わないこと。** そこは
 * どの学校かを一意に伝える必要があるので、マスタの名前をそのまま出す。
 */

/**
 * 短くすると別の学校と見分けが付かなくなる学校。**slugで指定する。**
 *
 * 岐阜商業は県立と市立の2校があり、学校マスタではどちらも「岐阜商業高校」。
 * 「高校」を落としただけでは同じ名前になってしまう。和歌山も同様に、
 * 県立和歌山（ではなく市立和歌山）を「和歌山」とだけ書くと地区名と紛れる。
 *
 * いずれも高校野球で実際に使われている呼び方に合わせてある。
 * 増やすときは「短くした結果ぶつかるから」を理由にすること。
 * 好みで別名を付け始めると、検索して来た人が同じ学校だと気付けなくなる。
 */
const SHORT_NAME_OVERRIDES: Record<string, string> = {
  gifushogyo: "県立岐阜商業",
  "gifu-gifushogyo": "市立岐阜商業",
  "wakayama-wakayama": "市立和歌山",
};

/**
 * 末尾の「高校」だけを落とす。
 *
 * **「中等教育学校」「高専」「分校」は落とさない。**
 *   広島中等教育学校 → 広島   … 何の学校か分からなくなる
 *   米子工業高専     → 米子工業 … 高校の米子工業と区別が付かなくなる
 *   三刀屋高校掛合分校        … 分校名まで含めてひとつの名前
 */
export function shortSchoolName(name: string, slug?: string): string {
  if (slug && SHORT_NAME_OVERRIDES[slug]) return SHORT_NAME_OVERRIDES[slug];
  return name.replace(/高校$/, "");
}

/**
 * キャップの絵に載せる、さらに短い略称。`SchoolEmblem` 専用。
 *
 * **これは「その学校の実際の胸文字」ではない。** 機械的に縮めた表示用の
 * ラベルで、たまたま実際の胸文字と一致することが多いというだけ。
 * 本物を名乗ると、違う学校は誤りを載せることになる。
 */
const CAP_LABEL_OVERRIDES: Record<string, string> = {
  gifushogyo: "県岐阜商",
  "gifu-gifushogyo": "市岐阜商",
  "wakayama-wakayama": "市和歌山",
};

/**
 * 「佐賀商業高校」→「佐賀商」。
 *
 * 商業・工業・農業は1文字に縮める。甲子園出場校679校のうち94%が
 * これで4文字以内に収まる（実測）。残りは `SchoolEmblem` 側で2行に折る。
 */
export function capLabel(name: string, slug?: string): string {
  if (slug && CAP_LABEL_OVERRIDES[slug]) return CAP_LABEL_OVERRIDES[slug];
  return shortSchoolName(name, slug)
    .replace(/商業$/, "商")
    .replace(/工業$/, "工")
    .replace(/農業$/, "農");
}
