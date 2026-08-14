// このファイルは scripts/build-regional-results.mjs が生成する。直接編集しない。
// 県のページが自分の県だけ読み込むための表。**静的 import にしないこと**
// （全県が1つのページに入る）。

import type { RegionalDistrict } from "@/lib/regional-results";

export const REGIONAL_LOADERS: Record<string, () => Promise<RegionalDistrict>> = {
  nagano: () => import("./nagano").then((m) => m.REGIONAL_NAGANO),
  kanagawa: () => import("./kanagawa").then((m) => m.REGIONAL_KANAGAWA),
  saitama: () => import("./saitama").then((m) => m.REGIONAL_SAITAMA),
  yamanashi: () => import("./yamanashi").then((m) => m.REGIONAL_YAMANASHI),
  tokushima: () => import("./tokushima").then((m) => m.REGIONAL_TOKUSHIMA),
  kumamoto: () => import("./kumamoto").then((m) => m.REGIONAL_KUMAMOTO),
  gunma: () => import("./gunma").then((m) => m.REGIONAL_GUNMA),
  saga: () => import("./saga").then((m) => m.REGIONAL_SAGA),
  nara: () => import("./nara").then((m) => m.REGIONAL_NARA),
  ehime: () => import("./ehime").then((m) => m.REGIONAL_EHIME),
  niigata: () => import("./niigata").then((m) => m.REGIONAL_NIIGATA),
  aichi: () => import("./aichi").then((m) => m.REGIONAL_AICHI),
  kyoto: () => import("./kyoto").then((m) => m.REGIONAL_KYOTO),
  hiroshima: () => import("./hiroshima").then((m) => m.REGIONAL_HIROSHIMA),
  mie: () => import("./mie").then((m) => m.REGIONAL_MIE),
};
