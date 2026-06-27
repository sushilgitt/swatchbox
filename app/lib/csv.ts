/**
 * Minimal, dependency-free CSV parser + a column mapper tailored to the color
 * library import (name -> hex / image). Handles quoted fields, escaped quotes,
 * and CRLF/LF line endings.
 */

/** Parse CSV text into an array of string-cell rows. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // ignore; handled by following \n (or end)
    } else {
      field += c;
    }
  }
  // last field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export interface ParsedLibraryRow {
  line: number;
  name: string;
  hex?: string;
  imageUrl?: string;
  error?: string;
}

const HEX_RE = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function normalizeHex(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (!HEX_RE.test(v)) return null;
  return v.startsWith("#") ? v.toLowerCase() : "#" + v.toLowerCase();
}

function findColumn(header: string[], candidates: string[]): number {
  const lower = header.map((h) => h.trim().toLowerCase());
  for (const cand of candidates) {
    const idx = lower.indexOf(cand);
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Map parsed CSV rows to library entries. Detects columns by header name; if no
 * recognizable header is present, assumes positional `name,hex,image`.
 * Returns rows tagged with per-row validation errors (for the dry-run preview).
 */
export function mapLibraryRows(rows: string[][]): {
  valid: ParsedLibraryRow[];
  invalid: ParsedLibraryRow[];
} {
  const valid: ParsedLibraryRow[] = [];
  const invalid: ParsedLibraryRow[] = [];
  if (rows.length === 0) return { valid, invalid };

  const header = rows[0];
  let nameIdx = findColumn(header, ["name", "color", "colour", "value", "title"]);
  let hexIdx = findColumn(header, ["hex", "hex color", "color hex", "code"]);
  let imageIdx = findColumn(header, ["image", "image url", "imageurl", "img", "url"]);

  let dataRows = rows;
  if (nameIdx !== -1 || hexIdx !== -1 || imageIdx !== -1) {
    // has a header row
    dataRows = rows.slice(1);
    if (nameIdx === -1) nameIdx = 0;
    if (hexIdx === -1) hexIdx = 1;
  } else {
    // positional fallback
    nameIdx = 0;
    hexIdx = 1;
    imageIdx = 2;
  }

  dataRows.forEach((cells, i) => {
    const line = i + 1;
    const name = (cells[nameIdx] ?? "").trim();
    const rawHex = (cells[hexIdx] ?? "").trim();
    const rawImg = imageIdx !== -1 ? (cells[imageIdx] ?? "").trim() : "";

    if (!name) {
      invalid.push({ line, name, error: "Missing color name" });
      return;
    }
    const hex = normalizeHex(rawHex);
    const imageUrl = rawImg && /^https?:\/\//i.test(rawImg) ? rawImg : undefined;

    if (!hex && !imageUrl) {
      invalid.push({
        line,
        name,
        error: rawHex
          ? `Invalid hex "${rawHex}"`
          : "Provide a hex color or image URL",
      });
      return;
    }
    valid.push({ line, name, hex: hex ?? undefined, imageUrl });
  });

  return { valid, invalid };
}
