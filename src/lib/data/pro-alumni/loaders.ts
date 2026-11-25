// このファイルは scripts/build-pro-alumni.mjs が生成する。直接編集しない。
// 学校ページが自分の地区だけ読み込むための表。**静的 import にしないこと**（全地区が1ページに入る）。
// 型は src/lib/pro-alumni.ts で1回だけ与える（JSON をリテラル型にすると重い）。

import type { ProPrefFile } from "@/lib/pro-alumni";
import index from "./index.json";
import draft from "./draft.json";

export const PRO_ALUMNI_INDEX = index;
/** ドラフトで指名された高校生（入団前）。小さいファイルなので静的 import */
export const PRO_DRAFT = draft;

export const PRO_ALUMNI_LOADERS: Record<string, () => Promise<ProPrefFile>> = {
  "aichi": () => import("./aichi.json").then((m) => m.default as ProPrefFile),
  "akita": () => import("./akita.json").then((m) => m.default as ProPrefFile),
  "aomori": () => import("./aomori.json").then((m) => m.default as ProPrefFile),
  "chiba": () => import("./chiba.json").then((m) => m.default as ProPrefFile),
  "ehime": () => import("./ehime.json").then((m) => m.default as ProPrefFile),
  "fukui": () => import("./fukui.json").then((m) => m.default as ProPrefFile),
  "fukuoka": () => import("./fukuoka.json").then((m) => m.default as ProPrefFile),
  "fukushima": () => import("./fukushima.json").then((m) => m.default as ProPrefFile),
  "gifu": () => import("./gifu.json").then((m) => m.default as ProPrefFile),
  "gunma": () => import("./gunma.json").then((m) => m.default as ProPrefFile),
  "higashi-tokyo": () => import("./higashi-tokyo.json").then((m) => m.default as ProPrefFile),
  "hiroshima": () => import("./hiroshima.json").then((m) => m.default as ProPrefFile),
  "hyogo": () => import("./hyogo.json").then((m) => m.default as ProPrefFile),
  "ibaraki": () => import("./ibaraki.json").then((m) => m.default as ProPrefFile),
  "ishikawa": () => import("./ishikawa.json").then((m) => m.default as ProPrefFile),
  "iwate": () => import("./iwate.json").then((m) => m.default as ProPrefFile),
  "kagawa": () => import("./kagawa.json").then((m) => m.default as ProPrefFile),
  "kagoshima": () => import("./kagoshima.json").then((m) => m.default as ProPrefFile),
  "kanagawa": () => import("./kanagawa.json").then((m) => m.default as ProPrefFile),
  "kita-hokkaido": () => import("./kita-hokkaido.json").then((m) => m.default as ProPrefFile),
  "kochi": () => import("./kochi.json").then((m) => m.default as ProPrefFile),
  "kumamoto": () => import("./kumamoto.json").then((m) => m.default as ProPrefFile),
  "kyoto": () => import("./kyoto.json").then((m) => m.default as ProPrefFile),
  "mie": () => import("./mie.json").then((m) => m.default as ProPrefFile),
  "minami-hokkaido": () => import("./minami-hokkaido.json").then((m) => m.default as ProPrefFile),
  "miyagi": () => import("./miyagi.json").then((m) => m.default as ProPrefFile),
  "miyazaki": () => import("./miyazaki.json").then((m) => m.default as ProPrefFile),
  "nagano": () => import("./nagano.json").then((m) => m.default as ProPrefFile),
  "nagasaki": () => import("./nagasaki.json").then((m) => m.default as ProPrefFile),
  "nara": () => import("./nara.json").then((m) => m.default as ProPrefFile),
  "niigata": () => import("./niigata.json").then((m) => m.default as ProPrefFile),
  "nishi-tokyo": () => import("./nishi-tokyo.json").then((m) => m.default as ProPrefFile),
  "oita": () => import("./oita.json").then((m) => m.default as ProPrefFile),
  "okayama": () => import("./okayama.json").then((m) => m.default as ProPrefFile),
  "okinawa": () => import("./okinawa.json").then((m) => m.default as ProPrefFile),
  "osaka": () => import("./osaka.json").then((m) => m.default as ProPrefFile),
  "other": () => import("./other.json").then((m) => m.default as ProPrefFile),
  "saga": () => import("./saga.json").then((m) => m.default as ProPrefFile),
  "saitama": () => import("./saitama.json").then((m) => m.default as ProPrefFile),
  "shiga": () => import("./shiga.json").then((m) => m.default as ProPrefFile),
  "shimane": () => import("./shimane.json").then((m) => m.default as ProPrefFile),
  "shizuoka": () => import("./shizuoka.json").then((m) => m.default as ProPrefFile),
  "tochigi": () => import("./tochigi.json").then((m) => m.default as ProPrefFile),
  "tokushima": () => import("./tokushima.json").then((m) => m.default as ProPrefFile),
  "tottori": () => import("./tottori.json").then((m) => m.default as ProPrefFile),
  "toyama": () => import("./toyama.json").then((m) => m.default as ProPrefFile),
  "wakayama": () => import("./wakayama.json").then((m) => m.default as ProPrefFile),
  "yamagata": () => import("./yamagata.json").then((m) => m.default as ProPrefFile),
  "yamaguchi": () => import("./yamaguchi.json").then((m) => m.default as ProPrefFile),
  "yamanashi": () => import("./yamanashi.json").then((m) => m.default as ProPrefFile),
};
