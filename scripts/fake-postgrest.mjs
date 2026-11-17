/**
 * 偽の PostgREST。**本番の Supabase に触れずに、サイトのページを描かせて確かめるための道具。**
 *
 *   node scripts/fake-postgrest.mjs [ポート=54329]
 *
 * 学校マスタ（`schools`）だけを、一時フォルダの控え（`<一時フォルダ>/kouritsu-schools-cache.json`。
 * `scripts/check-public-index.mjs` などが24時間置く）から返す。**ほかの表は空配列。**
 * 控えが無いときは先に `node --env-file=.env.local scripts/check-public-index.mjs` で作る。
 *
 * ------------------------------------------------------------------
 * ★ 使い方（PowerShell。Node はポータブル版なので PATH を通す）
 *
 *   $env:Path = "C:\Users\81809\tools\node-v24.19.0-win-x64;" + $env:Path
 *   node scripts/fake-postgrest.mjs                       # 1つ目の端末（このまま置く）
 *
 *   $env:NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54329"   # 2つ目の端末
 *   $env:NEXT_PUBLIC_SUPABASE_ANON_KEY = "fake"
 *   node node_modules/next/dist/bin/next dev -p 3217           # 別セッションが3000を使っていることがある
 *
 *   → http://127.0.0.1:3217/koshien/public/champions などが開ける。
 *
 * ★ 何に使えるか（2026-11-04 に使った）
 *   **学校マスタだけで描けるページ**（`/koshien/*`・`/jingu/*`・`/koshien/public/*`・`/guide/kokutai` など）。
 *   学校マスタ以外の表（応援メッセージ・公立旋風…）を読むページは、空のデータで描かれる。
 * ★ **サーバーを止めるときは、自分が起動した PID だけを止めること**
 *   （別セッションの `next dev` を巻き込まない。`Get-CimInstance Win32_Process` で ParentProcessId を引く）。
 * ★ 入れ替えた直後など **`.next/dev/cache` に古い `school-name-rows` が残っていると、
 *   最初の数リクエストが「学校マスタが空の索引」になった**（2026-11-04 に1度。再現せず・原因は未特定）。
 *   学校リンクが1本も出ないときは、dev サーバーを入れ直してからもう一度開く。
 */
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const port = Number(process.argv[2] ?? 54329);
const cache = path.join(os.tmpdir(), "kouritsu-schools-cache.json");
if (!fs.existsSync(cache)) {
  console.error(`学校マスタの控えが無い: ${cache}\n先に node --env-file=.env.local scripts/check-public-index.mjs で作ってください`);
  process.exit(1);
}
const rows = JSON.parse(fs.readFileSync(cache, "utf8"));
rows.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

http
  .createServer((req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    const send = (status, body, extra = {}) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...extra });
      res.end(JSON.stringify(body));
    };
    if (u.pathname === "/rest/v1/schools") {
      // supabase-js の `.range()` は offset/limit のクエリで来る（Range ヘッダの形も受ける）
      let offset = Number(u.searchParams.get("offset") ?? 0);
      let limit = Number(u.searchParams.get("limit") ?? 1000);
      const range = req.headers.range;
      if (range && /^\d+-\d+$/.test(range)) {
        const [from, to] = range.split("-").map(Number);
        offset = from;
        limit = to - from + 1;
      }
      const page = rows.slice(offset, offset + limit).map((x) => ({
        slug: x.slug,
        name: x.name,
        official_name: x.official_name,
        prefecture: x.prefecture,
      }));
      return send(200, page, { "Content-Range": `${offset}-${offset + page.length - 1}/${rows.length}` });
    }
    return send(200, []);
  })
  .listen(port, "127.0.0.1", () => console.log(`偽の PostgREST: http://127.0.0.1:${port}（学校 ${rows.length}行）`));
