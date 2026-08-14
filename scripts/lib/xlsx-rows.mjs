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
      **xlsx は ZIP。** 先頭が `PK` でなければ Excel ではない
      （404のHTMLが返ることがある）。古い .xls は別形式なので読めない。
    */
    const head = new Uint8Array(data.slice(0, 2));
    if (head[0] !== 0x50 || head[1] !== 0x4b) return null;
    return await xlsxSheets(data);
  } catch {
    return null;
  }
}
