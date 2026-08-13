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
};
