// 公立旋風 第3弾・甲子園で「大会そのもの」を主題にした記事。
// 学校の勝ち上がりは持たない（kind: "tournament"）。県を付けず（prefecture: null）、
// ひもづける学校は1校だけ（カードに出る校名が、4校のうち何校目かで入れ替わらないように）。
const DEFINITIONS = [
  {
    // 準決勝の4校がすべて公立。優勝は松山商。
    slug: "public-semifinals-1996-summer",
    school: "matsuyamashogyo",
    year: 1996, season: "summer", level: "koshien",
    prefecture: null,
    badge: "4強独占",
    run: { kind: "tournament" },
  },
  {
    // 準決勝4校のうち3校が公立で、決勝も公立どうし。優勝の観音寺中央は閉校しているのでマスタに無い。
    slug: "public-semifinals-1995-spring",
    school: "choshishogyo",
    year: 1995, season: "spring", level: "koshien",
    prefecture: null,
    badge: "4強に3校",
    run: { kind: "tournament" },
  },
];

export default DEFINITIONS;
