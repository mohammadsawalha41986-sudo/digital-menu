import ExcelJS from 'exceljs';
import { autoMapHeaders } from './columns';

/**
 * Spreadsheet reading (master spec §57, §58).
 *
 * `.xlsx` and `.csv` both land in the same shape — a header row plus string
 * cells — so everything downstream (mapping, validation, preview, import)
 * has one input format regardless of what staff uploaded.
 */

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

export interface ParsedSheet {
  headers: string[];
  /** Row values aligned to `headers` by index. */
  rows: string[][];
  /** Spreadsheet row number of each parsed row, for error reporting (§63). */
  rowNumbers: number[];
  /** Best-effort column mapping, presented to the operator for confirmation. */
  suggestedMapping: Record<number, string>;
}

const MAX_ROWS = 5000;

export async function parseSpreadsheet(
  bytes: Uint8Array,
  fileName: string,
): Promise<ParsedSheet> {
  const workbook = new ExcelJS.Workbook();
  const isCsv = fileName.toLowerCase().endsWith('.csv');

  try {
    if (isCsv) {
      // ExcelJS reads CSV from a stream; a Buffer-backed stream keeps it in
      // memory rather than requiring a temp file.
      const { Readable } = await import('node:stream');
      const stream = Readable.from(Buffer.from(bytes));
      await workbook.csv.read(stream);
    } else {
      await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
    }
  } catch {
    throw new ParseError('The file could not be read as a spreadsheet');
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new ParseError('The workbook has no sheets');

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];

  headerRow.eachCell({ includeEmpty: true }, (cell, column) => {
    headers[column - 1] = cellText(cell.value);
  });

  // Index of the last non-empty header: trailing blank columns are common in
  // hand-edited spreadsheets and must not widen every row.
  let trailing = -1;
  headers.forEach((header, index) => {
    if ((header ?? '').trim() !== '') trailing = index;
  });

  if (trailing < 0) throw new ParseError('The first row must contain column headers');

  const width = trailing + 1;
  const trimmedHeaders = Array.from({ length: width }, (_, index) => headers[index] ?? '');

  const rows: string[][] = [];
  const rowNumbers: number[] = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    if (rows.length >= MAX_ROWS) return;

    const values = Array.from({ length: width }, (_, index) =>
      cellText(row.getCell(index + 1).value),
    );

    // A row of only blanks is spreadsheet noise, not data.
    if (values.every((value) => value.trim() === '')) return;

    rows.push(values);
    rowNumbers.push(rowNumber);
  });

  if (rows.length === 0) throw new ParseError('The file contains no data rows');

  return {
    headers: trimmedHeaders,
    rows,
    rowNumbers,
    suggestedMapping: autoMapHeaders(trimmedHeaders),
  };
}

/**
 * Renders a cell as text.
 *
 * Everything becomes a string here and is parsed by the field's own validator
 * later, so that "42" typed as text and 42 stored as a number take exactly the
 * same path — a difference in cell type must never change what gets imported.
 */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';

  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return value.toISOString();

  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text.trim();
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('').trim();
    }
    // A formula cell carries its computed result; that is what staff see.
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
    if ('hyperlink' in value && typeof value.hyperlink === 'string') return value.hyperlink;
    if ('error' in value) return '';
  }

  return String(value).trim();
}
