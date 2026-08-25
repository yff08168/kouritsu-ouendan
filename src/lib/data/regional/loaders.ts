// このファイルは scripts/build-regional-results.mjs が生成する。直接編集しない。
// 県のページが自分の県だけ読み込むための表。**静的 import にしないこと**
// （全県が1つのページに入る）。
//
// ★★県ごとのデータは **JSON**（`<県>.json`）。**こちらも生成物で、直接編集しない。**
//    TypeScript のリテラルにすると、試合が数千件で TS2590
//    （"union type that is too complex to represent"）になり型検査が通らない。
//    甲子園・神宮と同じ扱いで、**型はここで1回だけ与える。**

import type { RegionalDistrict } from "@/lib/regional-results";

export const REGIONAL_LOADERS: Record<string, () => Promise<RegionalDistrict>> = {
  nagano: () => import("./nagano.json").then((m) => m.default as RegionalDistrict),
  kanagawa: () => import("./kanagawa.json").then((m) => m.default as RegionalDistrict),
  saitama: () => import("./saitama.json").then((m) => m.default as RegionalDistrict),
  yamanashi: () => import("./yamanashi.json").then((m) => m.default as RegionalDistrict),
  tokushima: () => import("./tokushima.json").then((m) => m.default as RegionalDistrict),
  kumamoto: () => import("./kumamoto.json").then((m) => m.default as RegionalDistrict),
  gunma: () => import("./gunma.json").then((m) => m.default as RegionalDistrict),
  saga: () => import("./saga.json").then((m) => m.default as RegionalDistrict),
  nara: () => import("./nara.json").then((m) => m.default as RegionalDistrict),
  ehime: () => import("./ehime.json").then((m) => m.default as RegionalDistrict),
  niigata: () => import("./niigata.json").then((m) => m.default as RegionalDistrict),
  aichi: () => import("./aichi.json").then((m) => m.default as RegionalDistrict),
  kyoto: () => import("./kyoto.json").then((m) => m.default as RegionalDistrict),
  hiroshima: () => import("./hiroshima.json").then((m) => m.default as RegionalDistrict),
  mie: () => import("./mie.json").then((m) => m.default as RegionalDistrict),
  kagoshima: () => import("./kagoshima.json").then((m) => m.default as RegionalDistrict),
  ishikawa: () => import("./ishikawa.json").then((m) => m.default as RegionalDistrict),
  gifu: () => import("./gifu.json").then((m) => m.default as RegionalDistrict),
  chiba: () => import("./chiba.json").then((m) => m.default as RegionalDistrict),
  yamagata: () => import("./yamagata.json").then((m) => m.default as RegionalDistrict),
  shizuoka: () => import("./shizuoka.json").then((m) => m.default as RegionalDistrict),
  yamaguchi: () => import("./yamaguchi.json").then((m) => m.default as RegionalDistrict),
  miyazaki: () => import("./miyazaki.json").then((m) => m.default as RegionalDistrict),
  fukui: () => import("./fukui.json").then((m) => m.default as RegionalDistrict),
  wakayama: () => import("./wakayama.json").then((m) => m.default as RegionalDistrict),
  shiga: () => import("./shiga.json").then((m) => m.default as RegionalDistrict),
  hyogo: () => import("./hyogo.json").then((m) => m.default as RegionalDistrict),
  ibaraki: () => import("./ibaraki.json").then((m) => m.default as RegionalDistrict),
  okayama: () => import("./okayama.json").then((m) => m.default as RegionalDistrict),
  kagawa: () => import("./kagawa.json").then((m) => m.default as RegionalDistrict),
  kochi: () => import("./kochi.json").then((m) => m.default as RegionalDistrict),
  nagasaki: () => import("./nagasaki.json").then((m) => m.default as RegionalDistrict),
  shimane: () => import("./shimane.json").then((m) => m.default as RegionalDistrict),
  iwate: () => import("./iwate.json").then((m) => m.default as RegionalDistrict),
  oita: () => import("./oita.json").then((m) => m.default as RegionalDistrict),
  tochigi: () => import("./tochigi.json").then((m) => m.default as RegionalDistrict),
  fukuoka: () => import("./fukuoka.json").then((m) => m.default as RegionalDistrict),
  okinawa: () => import("./okinawa.json").then((m) => m.default as RegionalDistrict),
  fukushima: () => import("./fukushima.json").then((m) => m.default as RegionalDistrict),
  toyama: () => import("./toyama.json").then((m) => m.default as RegionalDistrict),
  osaka: () => import("./osaka.json").then((m) => m.default as RegionalDistrict),
};
