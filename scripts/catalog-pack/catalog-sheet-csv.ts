/**
 * RFC 4180 CSV, written for spreadsheets that hold Vietnamese text.
 *
 * Two details matter more than the grammar. Output carries a UTF-8 byte order mark, because Excel
 * opening a BOM-less UTF-8 file decodes it as the system code page and turns every diacritic into
 * mojibake — and a corrupted `nameVi` is not something a validator can catch. Input tolerates a BOM
 * and both line endings, because Sheets, Excel and LibreOffice do not agree on either.
 */

const BYTE_ORDER_MARK = "﻿"

/** Fields needing quotes: the separators, the quote itself, and edge whitespace a reader would trim. */
const NEEDS_QUOTING = /[",\r\n]|^\s|\s$/u

function serializeField(value: string): string {
  if (!NEEDS_QUOTING.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}

export function serializeCsv(rows: readonly (readonly string[])[]): string {
  const body = rows.map((row) => row.map(serializeField).join(",")).join("\r\n")
  return `${BYTE_ORDER_MARK}${body}\r\n`
}

/**
 * Returns one array of fields per record. A quoted field may span lines, so records are not lines.
 * A trailing newline does not produce an empty final record, but a blank line in the middle does —
 * that is a real row of empty cells, and dropping it would silently renumber everything after it.
 */
export function parseCsv(text: string): string[][] {
  const source = text.startsWith(BYTE_ORDER_MARK) ? text.slice(BYTE_ORDER_MARK.length) : text
  if (source === "") return []

  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  let index = 0

  function endField(): void {
    row.push(field)
    field = ""
  }

  function endRow(): void {
    endField()
    rows.push(row)
    row = []
  }

  while (index < source.length) {
    const character = source[index]

    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index += 2
          continue
        }
        quoted = false
        index += 1
        continue
      }
      field += character
      index += 1
      continue
    }

    if (character === '"' && field === "") {
      quoted = true
      index += 1
      continue
    }
    if (character === ",") {
      endField()
      index += 1
      continue
    }
    if (character === "\r" || character === "\n") {
      endRow()
      index += character === "\r" && source[index + 1] === "\n" ? 2 : 1
      continue
    }

    field += character
    index += 1
  }

  if (quoted) throw new Error("CSV ends inside a quoted field")
  if (field !== "" || row.length > 0) endRow()

  return rows
}
