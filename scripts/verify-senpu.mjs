/**
 * 公立旋風の新しい記事（`data/senpu/`）の**文章を検算する**。
 *
 *   node --env-file=.env.local scripts/verify-senpu.mjs [slug ...]
 *
 * 文章は人（Claude）が事実の一覧（`scripts/senpu/facts.mjs` の出力）を見て書く。
 * 生成AIに校名や戦績を書かせない（AGENTS.md）という方針の**歯止め**がここ。
 * 文章の中の数字・校名・年が、サイトが持っている生成物と合っているかを機械的に確かめる。
 *
 * 見ること:
 *   1. 題・要約・本文がそろっているか。題に年・季節の語が入っていないか
 *   2. 「N対M」が、その大会の実在の試合の点数であること。しかも同じ文（か前の文）に
 *      その試合の学校名が出ていること（点数だけ合って相手が違う、を止める）
 *   3. 「N年ぶりM回目」「初出場」が大会記事の表（appearanceText）と一致すること
 *   4. 「N試合のうちM試合が1点差」など、勝ち上がりから数えられる主張が数え直しと一致すること
 *   5. 「延長N回」がその大会の試合にあること（決勝は Linescore から）
 *   6. 「N年ぶりのベスト4」「◯年（春・夏）以来」がその学校の出場歴と一致すること
 *   7. 「公立校が…」の文に出てくる「◯年春の△△」が、公立のベスト4以上の年表と一致すること
 *   8. 成績の札（badge）が勝ち上がりから割り出した成績と一致すること
 *   9. 禁じた語（奇跡・下剋上・番狂わせ…）と、敗戦数の記述（N敗）が無いこと
 *
 * ★ これは「文章が事実と矛盾していない」ことを確かめるもの。**書いていないことは確かめられない。**
 *   読むのは人。ここを通ったから正しい、ではなく、ここを通らないものは必ず直す。
 */
import {
  koshienAppearances,
  koshienGames,
  koshienFinal,
  normalizeName,
  prefectureKey,
  finalInningsOf,
  loadAllSchools,
  makeResolve,
} from "./senpu/lib.mjs";
import {
  buildKoshienRun,
  buildTableFacts,
  buildTournamentFacts,
  buildPublicSemis,
  buildRegionalRun,
  fetchSchools,
  loadDefinitions,
  nameForms,
  timeKey,
} from "./senpu/model.mjs";

const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const allDefs = await loadDefinitions();
const defs = allDefs.filter((d) => only.length === 0 || only.includes(d.slug));
const schools = await fetchSchools(defs.map((d) => d.school));
const resolve = makeResolve(await loadAllSchools());
const publicSemis = buildPublicSemis(resolve);

const errors = [];
const warns = [];
const err = (d, m) => errors.push(`✗ ${d.slug}: ${m}`);
const warn = (d, m) => warns.push(`△ ${d.slug}: ${m}`);

/** 画面に出してはいけない語。事実の言い切りにならない・煽る・見下す語 */
const FORBIDDEN = [
  "奇跡", "下剋上", "下克上", "番狂わせ", "大金星", "大波乱", "波乱", "衝撃", "ジャイアントキリング",
  "無名", "弱小", "格下", "格上", "感動", "涙", "死闘", "激闘", "劇的", "神がかり", "歴史的", "快挙", "圧倒", "完敗", "惨敗", "惜敗",
];

const SEASON_WORD = { 春: "spring", 夏: "summer" };
const sq = (s) => s.normalize("NFKC").replace(/\s+/g, "");
const sentencesOf = (text) =>
  text
    .split(/\n+/)
    .flatMap((p) => p.split(/(?<=。)/))
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * 点数（「4対3」）の近くに、その試合の学校名があるか。
 *   - 題と要約は短く学校名を省くので、文章全体にあればよい
 *   - 本文は、点数の前 28字以内に学校名があること。
 *     文の先頭が点数だったり、主語が前の文にある（「…は日大三。甲子園で優勝したことのある学校ですが、5対3で…」）ときは、
 *     **点数の前に別の学校名が入っていなければ**前の文まで見る
 *   同じ文に2つの点数があるとき、片方の相手が別の点数の相手に取り違えられても通ってしまう、を止める。
 */
function scoreNamed(label, sentences, i, idx, len, whole, targets, others) {
  if (label !== "本文") return targets.some((f) => sq(whole).includes(sq(f)));
  const s = sentences[i];
  const win = sq(s.slice(Math.max(0, idx - 28), idx + len + 4));
  if (targets.some((f) => win.includes(sq(f)))) return true;
  const before = sq(s.slice(0, idx));
  // 主語が同じ文の少し前にあり（「習志野は2013年に5対6、2017年に3対4、…」）、そのあと別の学校名が出ていなければ同じ主語の続き
  const lastTarget = Math.max(-1, ...targets.map((f) => before.lastIndexOf(sq(f))));
  if (lastTarget >= 0 && !others.some((f) => before.lastIndexOf(sq(f)) > lastTarget)) return true;
  if (!others.some((f) => before.includes(sq(f)))) {
    const prev = sq(sentences[i - 1] ?? "");
    if (targets.some((f) => prev.includes(sq(f)))) return true;
  }
  return false;
}

/**
 * `run.kind === "table"`（Wikipedia の歴代代表校の表から決勝の記録だけを取る記事）の検算。
 *   - 文章に出てくる「◯年」は、その学校の決勝の年か、骨組みの extraYears に書いた年だけ
 *   - 「N対M」は、その学校の決勝の点数で、同じ文（か前の文）に両校のどちらかの名前があること
 *   - 「N回の優勝」「準優勝はN回」「決勝にN回」は表を数え直した値と一致すること
 *   - 「甲子園では1979年にベスト4、…」の成績は、サイトの甲子園データ（出場校の表）と一致すること
 */
function verifyTable(d, whole) {
  const t = buildTableFacts(d);
  const years = new Set([...t.mine.map((r) => r.year), d.year, t.firstYear, ...(d.run.extraYears ?? [])]);
  for (const m of whole.matchAll(/(\d{4})年/g)) {
    if (!years.has(Number(m[1]))) err(d, `「${m[0]}」はこの学校の決勝の年ではありません（別の年に触れるなら骨組みの run.extraYears に書く）`);
  }
  const blocks = [
    { label: "題", sentences: [d.title] },
    { label: "要約", sentences: [d.summary] },
    { label: "本文", sentences: sentencesOf(d.body) },
  ];
  const allNames = [...new Set(t.rows.flatMap((r) => [r.champion, r.runnerUp]))];
  for (const { label, sentences } of blocks) {
    sentences.forEach((s, i) => {
      for (const m of s.matchAll(/(\d+)対(\d+)/g)) {
        const x = Number(m[1]);
        const y = Number(m[2]);
        const hit = t.pairs.filter((p) => (p.a === x && p.b === y) || (p.a === y && p.b === x));
        if (!hit.length) {
          err(d, `${label}の「${m[0]}」はこの学校の決勝の点数にありません: ${s.slice(0, 50)}`);
        } else if (
          !hit.some((p) =>
            scoreNamed(label, sentences, i, m.index, m[0].length, whole, p.names, allNames.filter((n) => !p.names.includes(n))),
          )
        ) {
          err(d, `${label}の「${m[0]}」と同じ点数の決勝の学校名が、点数の近く（か前の文）に出てきません: ${s.slice(0, 60)}`);
        }
      }
    });
  }
  // 「N校が参加」は、その年の決勝の行の参加校数と一致すること
  for (const m of whole.matchAll(/(\d+)校が参加/g)) {
    if (!t.mine.some((r) => r.entrants === Number(m[1]))) err(d, `「${m[0]}」は表の参加校数（${t.mine.map((r) => r.entrants).join("・")}）にありません`);
  }
  // 数え直し（also を持つ記事は学校が複数なので数えない）
  if (!(d.run.also ?? []).length) {
    const nChamp = t.champ.length;
    const nRunner = t.runner.length;
    const since = t.firstYear;
    const claim = (re, value, what) => {
      for (const m of whole.matchAll(re)) if (Number(m[1]) !== value) err(d, `「${m[0]}」ですが表（${since}年〜）では${what}は${value}回です`);
    };
    claim(/(?<!準)優勝(?:は|が)?(\d+)回/g, nChamp, "優勝");
    claim(/(\d+)(?:回|度)(?:の)?優勝/g, nChamp, "優勝");
    claim(/準優勝(?:は|が)?(\d+)回/g, nRunner, "準優勝");
    claim(/(\d+)(?:回|度)(?:の)?準優勝/g, nRunner, "準優勝");
    claim(/決勝(?:に|は)(\d+)(?:回|度)/g, nChamp + nRunner, "決勝");
    if (d.badge === "優勝" && !nChamp) err(d, "badge は優勝ですが、表に優勝がありません");
    if (d.badge === "準優勝" && nChamp) err(d, "badge は準優勝ですが、表に優勝があります");
  }
  // 甲子園の成績
  const k = d.run.koshien;
  for (const s of sentencesOf(d.body)) {
    if (!/^甲子園(?:では|には|に)/.test(s)) continue;
    for (const m of s.matchAll(/(\d{4})年(?:には|に|は)?(ベスト\d+|初戦敗退|準優勝|優勝)/g)) {
      const year = Number(m[1]);
      let result = d.run.koshienOverride?.[year] ?? null;
      if (!result && k) {
        const names = [k.display, ...(k.alt ?? [])].map(normalizeName);
        const tour = koshienAppearances().find((x) => x.year === year && x.season === "summer");
        const hit = tour?.schools.find(
          (x) => names.includes(normalizeName(x.short)) && (x.prefs ?? []).some((q) => prefectureKey(q) === prefectureKey(k.pref)),
        );
        result = hit?.result ?? null;
      }
      if (!result) err(d, `「${m[0]}」の甲子園の成績をデータで確かめられません（run.koshienOverride に書くか、書き方を変える）`);
      else if (result !== m[2]) err(d, `「${m[0]}」ですが甲子園のデータでは${year}年は「${result}」です`);
    }
  }
}

const PREF_OF_DISTRICT = {
  kanagawa: "神奈川", aichi: "愛知", chiba: "千葉", saitama: "埼玉", hyogo: "兵庫", osaka: "大阪", fukuoka: "福岡",
  "higashi-tokyo": "東東京", "nishi-tokyo": "西東京",
};
/** 「同じ公立の大和に9対3」の「大和」が、その県の学校マスタで公立か（私立を公立と書かない） */
function verifyPublicClaims(d, whole) {
  const pref = PREF_OF_DISTRICT[d.run?.district];
  if (!pref) return;
  // Markdown のリンク「[刈谷](/phenomenon/…)」は校名だけにして見る
  const plain = whole.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  for (const m of plain.matchAll(/公立の([^、。（）]+?)(?:に|と|を|は|が|も)(?=[0-9０-９、。あ-んァ-ヶ一-龠])/g)) {
    const name = m[1];
    if (!resolve(name, pref)) err(d, `「公立の${name}」ですが、${pref}の学校マスタで公立と引けません（私立かもしれない。引けないだけなら外す）`);
  }
}

for (const d of defs) {
  // ---- 1. 体裁 -----------------------------------------------------
  if (!d.__hasText || !d.title || !d.summary || !d.body) {
    err(d, "文章がそろっていません");
    continue;
  }
  if (/(?:19|20)\d{2}/.test(d.title)) err(d, `題に年が入っています: ${d.title}`);
  {
    // 学校名に「春」「夏」「秋」が入っていることがある（春日丘・秋田商・夏…）ので、校名を外してから見る
    const own = [schools.get(d.school)?.name?.replace(/高校$/, ""), d.run?.display, d.run?.school].filter(Boolean);
    const stripped = own.reduce((t, n) => t.split(n).join(""), d.title);
    if (/[春夏秋]/.test(stripped)) err(d, `題に季節の語が入っています: ${d.title}`);
  }
  if (d.title.length > 36) warn(d, `題が長い（${d.title.length}字）: ${d.title}`);
  if (d.summary.length < 40 || d.summary.length > 130) warn(d, `要約の長さが${d.summary.length}字`);
  if (d.body.length < 200 || d.body.length > 900) warn(d, `本文の長さが${d.body.length}字`);
  const whole = `${d.title}\n${d.summary}\n${d.body}`;

  // ---- 9. 禁じた語・敗戦数 ----------------------------------------
  for (const w of FORBIDDEN) if (whole.includes(w)) err(d, `使わない語が入っています: ${w}`);
  const lossCount = whole.match(/\d+敗(?!退)|\d+勝\d+敗/);
  if (lossCount) err(d, `敗戦数を書いています: ${lossCount[0]}`);
  if (/[゠-ヿ]{2,}\s*[（(]\d年生[）)]/.test(whole) || /\d年生/.test(whole)) err(d, "選手の学年が入っています（選手個人は扱わない）");

  verifyPublicClaims(d, whole);
  const school = schools.get(d.school);
  const built =
    d.run?.kind === "koshien"
      ? buildKoshienRun(d, school)
      : d.run?.kind === "regional"
        ? buildRegionalRun(d, school)
        : d.run?.kind === "tournament"
          ? buildTournamentFacts(d)
          : null;
  if (d.run?.kind === "table") {
    verifyTable(d, whole);
    continue;
  }
  if (!built) continue;
  const { run, all } = built;

  // 地方大会: 「N校が参加」は、生成物の学校数（シード表記を外して数えたもの）と一致すること
  if (d.run.kind === "regional" && built.bracket) {
    for (const m of whole.matchAll(/(\d+)校が参加/g)) {
      if (Number(m[1]) !== built.bracket.nTeams) err(d, `「${m[0]}」ですが、この大会の学校数は${built.bracket.nTeams}校です`);
    }
  }

  // ---- 8. 成績の札 ---------------------------------------------------
  if (built.computed && built.computed !== d.badge) err(d, `badge「${d.badge}」が勝ち上がりから割り出した「${built.computed}」と違います`);

  // ---- 2. 点数 -----------------------------------------------------
  // 本文で「同じ年の夏」など別の大会の点数に触れるときは、骨組みの refTournaments に書く
  const refGames = (d.refTournaments ?? []).flatMap(([y, s]) => koshienGames().filter((g) => g.year === y && g.season === s));
  const pairs = [...all, ...refGames].map((g) => ({ g, a: g.teams[0].score, b: g.teams[1].score }));
  const blocks = [
    { label: "題", sentences: [d.title] },
    { label: "要約", sentences: [d.summary] },
    { label: "本文", sentences: sentencesOf(d.body) },
  ];
  const extraPairs = built.extraPairs ?? []; // 地方大会: Wikipedia の表の決勝など
  const allForms = [...new Set([...all, ...refGames].flatMap((g) => g.teams.flatMap((t) => nameForms(t.display))))];
  for (const { label, sentences } of blocks) {
    sentences.forEach((s, i) => {
      for (const m of s.matchAll(/(\d+)対(\d+)/g)) {
        const x = Number(m[1]);
        const y = Number(m[2]);
        const hit = pairs.filter((p) => (p.a === x && p.b === y) || (p.a === y && p.b === x));
        const extra = extraPairs.filter((p) => (p.a === x && p.b === y) || (p.a === y && p.b === x));
        if (!hit.length && !extra.length) {
          err(d, `${label}の「${m[0]}」はこの大会の試合にありません: ${s.slice(0, 50)}`);
          continue;
        }
        const ok =
          hit.some((p) => {
            const targets = p.g.teams.flatMap((t) => nameForms(t.display));
            return scoreNamed(label, sentences, i, m.index, m[0].length, whole, targets, allForms.filter((f) => !targets.includes(f)));
          }) || extra.some((p) => scoreNamed(label, sentences, i, m.index, m[0].length, whole, p.names, []));
        if (!ok) err(d, `${label}の「${m[0]}」と同じ点数の試合の学校名が、点数の近く（か前の文）に出てきません: ${s.slice(0, 60)}`);
      }
    });
  }

  // ---- 2b. 勝ち負けの向き ---------------------------------------------
  // 「N対Mで敗れ」は N<M、「N対Mで勝ち／下し／破り…」は N>M（点数は主役校 or 主語のほうが先）
  for (const s of sentencesOf(whole)) {
    for (const m of s.matchAll(/(\d+)対(\d+)(?:の[^。、]{0,8})?で(敗れ|負け)/g)) {
      if (Number(m[1]) >= Number(m[2])) err(d, `「${m[0]}」は敗れた試合なのに点数の向きが逆です: ${s.slice(0, 50)}`);
    }
    for (const m of s.matchAll(/(\d+)対(\d+)(?:の[^。、]{0,8})?(?:で(?:勝|下し|破|制し|競り勝|振り切|完封)|のサヨナラ)/g)) {
      if (Number(m[1]) <= Number(m[2])) err(d, `「${m[0]}」は勝った試合なのに点数の向きが逆です: ${s.slice(0, 50)}`);
    }
    // 「X は決勝で Y を a対b で破り」: 決勝の勝者・敗者・点数
    for (const m of s.matchAll(/([^、。（\s]+?)(?:（[^）]*）)?は(?:、)?決勝で([^、。（\s]+?)(?:（[^）]*）)?を(\d+)対(\d+)で破り/g)) {
      const fin = all.find((g) => g.round === "決勝" && g.teams.some((t) => t.won));
      if (!fin) continue;
      const w = fin.teams.find((t) => t.won);
      const l = fin.teams.find((t) => !t.won);
      const ok =
        nameForms(w.display).some((f) => sq(f) === sq(m[1])) &&
        nameForms(l.display).some((f) => sq(f) === sq(m[2])) &&
        w.score === Number(m[3]) &&
        l.score === Number(m[4]);
      if (!ok) err(d, `「${m[0]}」は決勝（${w.display} ${w.score}-${l.score} ${l.display}）と合いません`);
    }
  }

  // ---- 2c. 「優勝したことのある」「この春の選抜で…」 ----------------------
  const champs = [];
  for (const k of new Set(koshienGames().map((g) => `${g.year}:${g.season}`))) {
    const [y, se] = k.split(":");
    const f = koshienFinal(Number(y), se);
    if (f) champs.push({ time: timeKey(Number(y), se), key: `${normalizeName(f.champion.display)}|${f.champion.pref ? prefectureKey(f.champion.pref) : ""}`, name: f.champion.display, season: se, year: Number(y) });
  }
  const nowTime = timeKey(d.year, d.season);
  const sents = sentencesOf(whole);
  for (const [si, s] of sents.entries()) {
    if (/優勝したことのある/.test(s)) {
      const teamsIn = (text) => {
        const t0 = sq(text);
        const at = t0.indexOf("優勝したことのある");
        return all
          .flatMap((g) => g.teams)
          .filter((t, i, a) => a.findIndex((u) => u.display === t.display) === i)
          .map((t) => ({ t, pos: Math.min(...nameForms(t.display).map((f) => (t0.includes(sq(f)) ? t0.indexOf(sq(f)) : Infinity))) }))
          .filter((x) => x.pos !== Infinity && (at < 0 || x.pos < at))
          .sort((a, b) => a.pos - b.pos)
          .map((x) => x.t);
      };
      // 主語は同じ文の中。無ければ、前の文でいちばん最後に出てきた学校
      let subject = teamsIn(s);
      if (!subject.length) subject = teamsIn(sents[si - 1] ?? "").slice(-1);
      if (!subject.length) err(d, `「優勝したことのある」の主語になる学校が見つかりません: ${s.slice(0, 50)}`);
      for (const t of subject) {
        const key = `${normalizeName(t.display)}|${t.pref ? prefectureKey(t.pref) : ""}`;
        if (!champs.some((c) => c.key === key && c.time < nowTime)) err(d, `「${t.display}」はこの大会より前に優勝していません: ${s.slice(0, 50)}`);
      }
    }
    for (const m of s.matchAll(/この春の選抜で優勝した([^（、。]+)/g)) {
      const c = champs.find((x) => x.year === d.year && x.season === "spring");
      if (d.season !== "summer" || !c || sq(c.name) !== sq(m[1])) err(d, `「${m[0]}」はこの年の春の優勝校（${c?.name ?? "なし"}）と合いません`);
    }
    for (const m of s.matchAll(/この春の選抜でベスト4に入った(?:同じ公立の)?([^（、。]+)/g)) {
      const at = publicSemis.filter((e) => e.time === timeKey(d.year, "spring"));
      if (d.season !== "summer" || !at.some((e) => nameForms(e.display).some((f) => sq(f) === sq(m[1])))) err(d, `「${m[0]}」はこの年の春のベスト4以上（${at.map((e) => e.display).join("・")}）と合いません`);
    }
  }

  // ---- 3. 出場回数 ---------------------------------------------------
  const appearances = koshienAppearances();
  const hist = [];
  if (d.run.kind === "koshien") {
    const names = [d.run.display, ...(d.run.alt ?? [])].map(normalizeName);
    for (const t of appearances) {
      const sc = t.schools.find(
        (x) =>
          names.includes(normalizeName(x.short)) &&
          (!d.run.pref || (x.prefs ?? []).some((q) => prefectureKey(q) === prefectureKey(d.run.pref))),
      );
      if (sc) hist.push({ t, sc, time: timeKey(t.year, t.season) });
    }
    hist.sort((a, b) => a.time - b.time);
    const now = hist.find((h) => h.t.year === d.year && h.t.season === d.season);
    if (!now) warn(d, "出場歴の表に当たりません（回数の検算ができない）");
    else {
      for (const m of whole.matchAll(/(\d+)年(ぶり|連続)(\d+)回目/g)) {
        if (m[0] !== now.sc.appearanceText) err(d, `「${m[0]}」が表の「${now.sc.appearanceText}」と違います`);
      }
      if (/甲子園初出場/.test(whole) && hist.some((h) => h.time < now.time)) err(d, "「甲子園初出場」ですが、それ以前の出場があります");
      if (/選抜初出場/.test(whole) && hist.some((h) => h.time < now.time && h.t.season === "spring")) err(d, "「選抜初出場」ですが、それ以前の選抜出場があります");
      if (/(?:^|[^抜])初出場/.test(whole.replace(/甲子園初出場|選抜初出場/g, "")) && now.sc.appearanceText !== "初出場") err(d, "「初出場」ですが表は初出場ではありません");
      // ---- 6. 前回のベスト4以上 --------------------------------------
      const deep = hist.filter((h) => h.time < now.time && ["優勝", "準優勝", "ベスト4"].includes(h.sc.result));
      const prev = deep.at(-1);
      for (const s of sentencesOf(whole)) {
        if (/公立/.test(s)) continue;
        for (const m of s.matchAll(/(\d+)年ぶりの?(?:に)?(?:ベスト4|準決勝)/g)) {
          const gap = prev ? d.year - prev.t.year : null;
          if (gap !== Number(m[1])) err(d, `「${m[0]}」ですが前回のベスト4以上は${prev ? `${prev.t.year}${prev.t.season === "spring" ? "春" : "夏"}（${gap}年前）` : "なし"}`);
        }
        const since = s.match(/ベスト4(?:以上)?に入るのは、?(\d{4})年(春|夏)(?:の[^、。]*)?以来/);
        if (since) {
          if (!prev || prev.t.year !== Number(since[1]) || prev.t.season !== SEASON_WORD[since[2]]) {
            err(d, `「${since[0]}」ですが前回のベスト4以上は${prev ? `${prev.t.year}${prev.t.season === "spring" ? "春" : "夏"}` : "なし"}`);
          }
        }
        if (/初のベスト4|ベスト4は初めて|ベスト4に進んだのは初めて/.test(s) && prev) err(d, `「初のベスト4」ですが、${prev.t.year}年に${prev.sc.result}があります`);
        const best = s.match(/最高成績は(\d{4})年(春|夏)の(ベスト\d+|準優勝|優勝)/);
        if (best) {
          const rank = { 優勝: 0, 準優勝: 1, ベスト4: 2, ベスト8: 3, ベスト16: 4, ベスト32: 5, 初戦敗退: 6 };
          const earlier = hist.filter((h) => h.time < now.time);
          const top = earlier.reduce((a, h) => (a === null || (rank[h.sc.result] ?? 9) < (rank[a.sc.result] ?? 9) ? h : a), null);
          if (!top || top.sc.result !== best[3] || top.t.year !== Number(best[1])) err(d, `「${best[0]}」ですが最高成績は${top ? `${top.t.year}年の${top.sc.result}` : "なし"}`);
        }
      }
    }
  }

  // ---- 4. 勝ち上がりから数えられる主張 -------------------------------
  const games = run.games;
  const wins = games.filter((g) => g.outcome === "win");
  const oneRunWins = wins.filter((g) => g.scoreFor - g.scoreAgainst === 1);
  const claim = (re, check, what) => {
    for (const m of whole.matchAll(re)) if (!check(m)) err(d, `「${m[0]}」は勝ち上がりと合いません（${what}）`);
  };
  claim(/勝った(\d+)試合のうち、?(\d+)試合が1点差/g, (m) => wins.length === Number(m[1]) && oneRunWins.length === Number(m[2]), `勝${wins.length}・1点差勝ち${oneRunWins.length}`);
  claim(/(\d+)勝のうち(\d+)勝が1点差/g, (m) => wins.length === Number(m[1]) && oneRunWins.length === Number(m[2]), `勝${wins.length}・1点差勝ち${oneRunWins.length}`);
  claim(/(?:勝った|ここまでの)(\d+)(?:試合|勝)は、?(?:すべて|全て)1点差/g, (m) => wins.length === Number(m[1]) && oneRunWins.length === wins.length, `勝${wins.length}・1点差勝ち${oneRunWins.length}`);
  claim(/(\d+)つの勝利は(?:すべて|全て)1点差/g, (m) => wins.length === Number(m[1]) && oneRunWins.length === wins.length, `勝${wins.length}・1点差勝ち${oneRunWins.length}`);
  claim(/(\d+)試合(?:すべて|全て)が1点差/g, (m) => games.length === Number(m[1]) && games.every((g) => Math.abs(g.scoreFor - g.scoreAgainst) === 1), `${games.length}試合`);
  claim(/(\d+)戦全勝/g, (m) => games.length === Number(m[1]) && wins.length === games.length, `${games.length}試合・${wins.length}勝`);
  claim(/(\d+)試合続けて1点差/g, (m) => oneRunWins.length >= Number(m[1]), `1点差勝ち${oneRunWins.length}`);
  claim(/完封勝ちは(\d+)試合/g, (m) => wins.filter((g) => g.scoreAgainst === 0).length === Number(m[1]), `完封勝ち${wins.filter((g) => g.scoreAgainst === 0).length}`);
  claim(/1点差の勝ちが(\d+)試合/g, (m) => oneRunWins.length === Number(m[1]), `1点差勝ち${oneRunWins.length}`);
  claim(/5試合(?:で|の)?(?:うち)?許した点は合計(\d+)/g, (m) => games.reduce((s, g) => s + g.scoreAgainst, 0) === Number(m[1]), `失点${games.reduce((s, g) => s + g.scoreAgainst, 0)}`);
  claim(/(\d+)試合のうち、?延長(?:に)?もつれたのは(\d+)試合/g, (m) => games.length === Number(m[1]) && games.filter((g) => /延長/.test(g.note ?? "")).length === Number(m[2]), `延長${games.filter((g) => /延長/.test(g.note ?? "")).length}`);
  claim(/決勝の前までの(\d+)試合で許した点は、?合計(\d+)/g, (m) => {
    const before = games.filter((g) => g.round !== "決勝");
    return before.length === Number(m[1]) && before.reduce((s, g) => s + g.scoreAgainst, 0) === Number(m[2]);
  }, "決勝の前の失点");
  // 「Nで勝った/N対Mのサヨナラ」: サヨナラと書いた試合が本当にサヨナラか
  for (const s of sentencesOf(whole)) {
    for (const m of s.matchAll(/(\d+)対(\d+)の?サヨナラ|(\d+)対(\d+)で?(?:の)?サヨナラ/g)) {
      const x = Number(m[1] ?? m[3]);
      const y = Number(m[2] ?? m[4]);
      if (!all.some((g) => g.teams.some((t) => t.walkOff) && ((g.teams[0].score === x && g.teams[1].score === y) || (g.teams[0].score === y && g.teams[1].score === x)))) {
        err(d, `「${m[0]}」はサヨナラの試合にありません`);
      }
    }
  }

  // ---- 5. 延長の回数 ------------------------------------------------
  const extraSet = new Set();
  for (const g of all) {
    const n = (g.note ?? "").match(/延長(\d+)回/)?.[1];
    if (n) extraSet.add(Number(n));
    if (g.round === "決勝" && !n) {
      const inn = finalInningsOf(g);
      if (inn && inn > 9) extraSet.add(inn);
    }
  }
  for (const m of whole.matchAll(/延長(\d+)回/g)) {
    if (!extraSet.has(Number(m[1]))) err(d, `「${m[0]}」はこの大会の試合にありません`);
  }

  // ---- 7. 公立のベスト4以上の年表 --------------------------------
  for (const s of sentencesOf(d.body)) {
    // 甲子園の公立のベスト4以上の年表は、甲子園の記事だけに効かせる（地方大会の「◯年夏」は別の大会）
    if (!/公立/.test(s) || !["koshien", "tournament"].includes(d.run.kind)) continue;
    for (const m of s.matchAll(/(\d{4})年(春|夏)(?:に|の)?([^。]*?)(?=[、。]|$)/g)) {
      const t = timeKey(Number(m[1]), SEASON_WORD[m[2]]);
      const at = publicSemis.filter((e) => e.time === t);
      if (!at.length) {
        err(d, `「${m[1]}年${m[2]}」に公立のベスト4以上はありません: ${s.slice(0, 60)}`);
        continue;
      }
      // 学校名は「◯年春の△△」の後ろにも「△△（◯年春・準優勝）」の前にも出るので、文全体で探す
      const hasName = at.some((e) => nameForms(e.display).some((f) => sq(s).includes(sq(f))));
      const slots = s.match(new RegExp(`${m[1]}年${m[2]}に(\\d)枠`));
      if (slots && Number(slots[1]) !== at.length) err(d, `「${slots[0]}」ですが、その大会の公立のベスト4以上は${at.length}校です`);
      if (!slots && m[3] && !hasName) warn(d, `「${m[0]}」の学校名が公立のベスト4以上の一覧（${at.map((e) => e.display).join("・")}）に見当たりません`);
    }
  }
}

console.log(`検算: ${defs.length}件`);
for (const w of warns) console.log(w);
for (const e of errors) console.log(e);
console.log(errors.length ? `\n誤り ${errors.length}件 / 注意 ${warns.length}件` : `\n誤りなし（注意 ${warns.length}件）`);
process.exit(errors.length ? 1 : 0);
