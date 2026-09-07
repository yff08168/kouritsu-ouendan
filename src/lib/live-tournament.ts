import { getRegionalDistrict, type RegionalSeason } from "@/lib/regional-results";
import { listTournaments, yearOfTournament } from "@/lib/regional-tournaments";

/**
 * ★★★**速報の盤が出している大会 → このサイトの大会ページ**（2026-09-08。運営者の指示
 * 「各都道府県の速報ページに、その大会のページに飛ぶリンクを設置したほうがよい」）。
 *
 * ------------------------------------------------------------------
 * ★★★**大会名で突き合わせないこと。**
 *
 * **速報の出典（HSB flash）と、蓄積している結果の出典（連盟）は、
 * 同じ大会を別の名前で呼ぶ:**
 *
 *     速報 「令和8年秋季関東地区高校野球 神奈川県大会」
 *     結果 「令和8年度神奈川県高校野球秋季県大会」
 *
 * **名前で引こうとすると、この県はリンクが出ない。**
 * ★**季節と年で引く** —— 同じ規則を `build-regional-results.mjs` の
 * 「終わった試合を組み合わせから落とす」でも使っている。
 *
 * ------------------------------------------------------------------
 * ★★**当たりが1つに決まらなければリンクを出さない。**
 *
 * **1つの季節に大会が複数ある県がある**（岡山は地区予選と本大会、徳島の秋は5大会）。
 * **どれか分からないまま貼ると、別の大会のページへ連れて行く。**
 * ★**県のページへのリンクは別に出してある**ので、出せないときはそちらに任せる。
 */
export async function findLiveTournamentHref(
  slug: string,
  boardTournament: string | null,
): Promise<string | null> {
  /*
    ★★★**空白を落としてから年を読む**（2026-09-08。**これが無いと1県も当たらない**）。

    **速報の出典は元号を `令和 8年` と割って刷る**（索引が「年」と「大会名」を
    別の欄に持っており、つないだところに空白が残る）。
    ★**`yearOfTournament` の元号の規則は `(令和|平成)(元|\d+)年` で空白を許さない**ので、
    **年が出せず、神奈川でリンクが出なかった。**
    ★★**あちらの正規表現を緩めないこと** —— **同じ規則が
    `scripts/build-regional-results.mjs` にもあり**、変えると
    **生成物の大会名の年の付き方が動いて、引き継ぎの鍵とURLが入れ替わる。**
    ★**ここで整えてから渡す。**
  */
  const title = (boardTournament ?? "").replace(/[\s　]+/g, "");
  const season = liveSeasonOf(title);
  if (!season) return null;
  /*
    ★**年は大会名から出す**（`yearOfTournament` の規則。第N回＋1918／令和N年＋2018／西暦）。
    ★**試合を渡さない**（盤の試合は、まだ生成物に入っていない今日のもの）。
  */
  const year = yearOfTournament(title, []);
  if (!year) return null;

  const district = await getRegionalDistrict(slug).catch(() => null);
  if (!district) return null;

  const hits = listTournaments(district).filter((t) => t.season === season && t.year === year);
  // ★**1つに決まるときだけ。** 2つ以上あるなら、どれのことか分からない
  if (hits.length !== 1) return null;
  return `/prefectures/${slug}/${hits[0].slug}`;
}

/**
 * 盤の大会名から季節を決める。★**当てはまらなければ null**（月からは決めない）。
 *
 * ★★**`scripts/build-regional-results.mjs` の `seasonOf`（HSB_BASE）と同じ規則。**
 * **あちらは .mjs なので import できない。変えるときは両方直すこと**
 * （`yearOfTournament` が2か所にあるのと同じ）。
 */
function liveSeasonOf(title: string | null): RegionalSeason | null {
  const t = (title ?? "").normalize("NFKC");
  if (!t) return null;
  if (/選手権/.test(t)) return "summer";
  // ★**「春季」ではなく「春期」と書く県がある**（秋田）
  if (/春季|春期/.test(t)) return "spring";
  if (/秋季/.test(t)) return "autumn";
  /*
    ★★**大会名に季節の字が無い県がある**（山口）。
    `令和8年 山口県スポーツ大会高校野球競技予選` が**秋季中国地区大会へ続く県の大会**で、
    連盟の側も同じ名前の大会を秋として収めている。
    ★**広く寄せないこと** —— 名指しで拾う（新人大会・1年生大会は取らない、という決めごと）。
  */
  if (/山口県(スポーツ|体育)大会高校野球競技/.test(t)) return "autumn";
  return null;
}
