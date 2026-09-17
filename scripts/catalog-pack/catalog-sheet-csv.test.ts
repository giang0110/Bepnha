// @vitest-environment node

import { describe, expect, it } from "vitest"

import { parseCsv, serializeCsv } from "./catalog-sheet-csv.ts"

describe("serializeCsv", () => {
  it("leads with a byte order mark so Excel decodes Vietnamese as UTF-8", () => {
    expect(serializeCsv([["thịt bò"]]).startsWith("\uFEFF")).toBe(true)
  })

  it.each([
    ["a comma", "Gà, luộc", '"Gà, luộc"'],
    ["a quote", 'nửa "bó"', '"nửa ""bó"""'],
    ["a newline", "dòng1\ndòng2", '"dòng1\ndòng2"'],
    ["leading space", " rau", '" rau"'],
    ["trailing space", "rau ", '"rau "']
  ])("quotes a field containing %s", (_name, value, expected) => {
    expect(serializeCsv([[value]])).toBe(`\uFEFF${expected}\r\n`)
  })

  it("leaves an ordinary field unquoted", () => {
    expect(serializeCsv([["ga_ta", "poultry"]])).toBe("\uFEFFga_ta,poultry\r\n")
  })
})

describe("parseCsv", () => {
  it("reads a file back without its byte order mark", () => {
    expect(parseCsv("\uFEFFcode,name\r\nga_ta,Gà ta\r\n")).toEqual([
      ["code", "name"],
      ["ga_ta", "Gà ta"]
    ])
  })

  it.each([
    ["CRLF", "a,b\r\nc,d\r\n"],
    ["LF", "a,b\nc,d\n"],
    ["no trailing newline", "a,b\nc,d"]
  ])("accepts %s", (_name, text) => {
    expect(parseCsv(text)).toEqual([
      ["a", "b"],
      ["c", "d"]
    ])
  })

  it("keeps a quoted field that spans lines as one field", () => {
    expect(parseCsv('a,"dòng1\ndòng2",c\n')).toEqual([["a", "dòng1\ndòng2", "c"]])
  })

  it("unescapes a doubled quote", () => {
    expect(parseCsv('"nửa ""bó"""\n')).toEqual([['nửa "bó"']])
  })

  it("keeps a blank middle row, because dropping it would renumber every row after it", () => {
    expect(parseCsv("a\n\nb\n")).toEqual([["a"], [""], ["b"]])
  })

  it("distinguishes an empty cell from a quoted empty string only by content, not by position", () => {
    expect(parseCsv('a,,""\n')).toEqual([["a", "", ""]])
  })

  it("refuses a file that ends inside a quoted field rather than guessing where it closed", () => {
    expect(() => parseCsv('a,"unterminated\n')).toThrow(/quoted field/iu)
  })

  it("returns nothing for an empty file", () => {
    expect(parseCsv("")).toEqual([])
    expect(parseCsv("\uFEFF")).toEqual([])
  })
})

describe("round trip", () => {
  it("survives every shape a spreadsheet can produce", () => {
    const rows = [
      ["code", "nameVi", "note"],
      ["ga_ta", "Gà ta", 'có dấu phẩy, có "ngoặc kép"'],
      ["rau_muong", "Rau muống", "hai\ndòng"],
      ["", " khoảng trắng đầu", "khoảng trắng cuối "]
    ]

    expect(parseCsv(serializeCsv(rows))).toEqual(rows)
  })
})
