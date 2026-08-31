/**
 * Excel（.xlsx）から行を取り出す。**新潟のように結果をExcelで出す県のため。**
 *
 * ------------------------------------------------------------------
 * ★ なぜ `exceljs` を使うのか
 *
 *   SheetJS（`xlsx`）は npm 上の最新が 0.18.5 で止まっており、
 *   既知の脆弱性の修正が npm には来ていない。**取ってくるファイルを
 *   解析する道具**なので、手入れの続いているほうを選ぶ。
 *
 * ------------------------------------------------------------------
 * ★ **これは開発用の依存**（`devDependency`）。PDFと同じく、
 *   生成物を作るスクリプトだけが使う。**サイト側から import しないこと。**
 */
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";

/**
 * 1つのセルを文字列にする。
 *
 * ★**日付が「数値」で入っていることがある。** Excelの日付はシリアル値で、
 * exceljs は設定によって Date か数値のどちらかで返す。Date のときは
 * **UTCとして解釈されるとずれる**ので、日付の部分だけを取り出す。
 */
function cellText(value) {
  if (value == null) return "";
  if (value instanceof Date) {
    // 表示上の日付だけが要る。時差でずらさないよう UTC の年月日を使う
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "object") {
    // 数式のセルは { formula, result }、リッチテキストは { richText: [...] }
    if (Array.isArray(value.richText)) return value.richText.map((t) => t.text).join("");
    if ("result" in value) return String(value.result ?? "");
    if ("text" in value) return String(value.text ?? "");
    return "";
  }
  return String(value);
}

/**
 * xlsx のバイト列 → シートごとの行（セルは文字列）。
 *
 * 戻り値は `[{ name, rows: [[cell, cell, …], …] }]`。
 * **空の行も残す**（行番号がずれると、上の行から引き継ぐ日付が狂う）。
 */
export async function xlsxSheets(data) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(data);
  const sheets = [];
  book.eachSheet((sheet) => {
    const rows = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const cells = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        cells.push(cellText(cell.value).trim());
      });
      rows.push(cells);
    });
    sheets.push({ name: sheet.name, rows });
  });
  return sheets;
}

/**
 * ★★★**旧形式（.xls）のバイト列 → シートごとの行**（2026-08-31 その5。運営者の承認）。
 *
 * ★**`exceljs` は `.xlsx` 専用**で `.xls`（BIFF）は読めない。
 *   ★**新潟の「全試合データ」48件のうち25件（2010〜2019年）**と、
 *   **兵庫の県大会のスコアシートのほとんど**が旧形式で、これが無いと届かない。
 *
 * ★★**SheetJS は「作者の配布元（cdn.sheetjs.com）」から入れてある。**
 *   **npm に出ている版は 0.18.5 で止まっていて既知の脆弱性の告知が残る**ので、
 *   `package.json` の依存はCDNのtgzを指している。**npm の `xlsx` に戻さないこと。**
 *
 * ★**新形式は今までどおり `exceljs` で読む。** SheetJS に一本化しない ——
 *   **既に読めている県の生成物が変わるおそれ**があり、確かめる手間に見合わない。
 *
 * ★**セルは文字列にする。** `raw: false` で表示どおりの文字列を受け取り、
 *   **日付のシリアル値が数値になって出るのを避ける**（`cellText` と同じ考え方）。
 * ★**空の行も残す**（行番号がずれると上の行から引き継ぐ日付が狂う）。
 */
export function xlsSheets(data) {
  const book = XLSX.read(new Uint8Array(data), { type: "array", cellDates: true, raw: false });
  const sheets = [];
  for (const name of book.SheetNames) {
    const sheet = book.Sheets[name];
    const rows = XLSX.utils
      .sheet_to_json(sheet, { header: 1, blankrows: true, defval: "", raw: false })
      .map((row) => row.map((c) => (c == null ? "" : String(c).trim())));
    sheets.push({ name, rows });
  }
  return sheets;
}

/**
 * URL から取ってシートにする。**取れなければ null。例外は投げない。**
 * 理由は `pdf-text.mjs` と同じで、1つのファイルの失敗で1県を落とさないため。
 */
export async function fetchXlsxSheets(url, { headers, timeoutMs = 45000 } = {}) {
  let res = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 3000 * attempt));
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      break;
    } catch {
      res = null;
    }
  }
  if (!res?.ok) return null;
  try {
    const data = await res.arrayBuffer();
    /*
      ★★★**拡張子で新旧を判断しないこと**（2026-08-31 その5）。
      **先頭4バイトで見る** —— `50 4B`（`PK`）なら新形式（zip）、
      `D0 CF 11 E0` なら旧形式（OLE2 複合ファイル）。
      ★**兵庫は拡張子 `.xls` のまま中身も旧形式**だったが、
      **新潟には `.xlsx` も混ざる**ので1件ずつ見る必要がある。
      ★**どちらでもなければ Excel ではない**（404のHTMLが返ることがある）。
    */
    const head = new Uint8Array(data.slice(0, 4));
    if (head[0] === 0x50 && head[1] === 0x4b) return await xlsxSheets(data);
    if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return xlsSheets(data);
    return null;
  } catch {
    return null;
  }
}
