/**
 * 导出红字 —— 单元测试
 *
 * 对应旧版 main_window.py 的 openpyxl 逻辑: 尺寸不匹配时把
 * 「对应尺寸」单元格字体设为 FF0000。社区版 xlsx 不支持样式,
 * 这里验证 xlsx-js-style 产出的文件里确实带上了颜色。
 *
 * 验证方式: 直接解析 xlsx 内部 XML (styles.xml + sheet)。
 * 不能靠 xlsx 读回 —— xlsx-js-style 读文件时不还原 font.color,
 * 会把有样式的单元格误报为无样式。
 */

import { describe, it, expect } from 'vitest'
import { inflateRawSync } from 'node:zlib'
import { writeExcel } from '../core/excel'
import type { Row } from '../core/table'

/** 极简 zip 读取: 只需拿到 xl/worksheets/sheet1.xml 与 xl/styles.xml */
function unzip(buf: ArrayBuffer): Map<string, string> {
  const bytes = new Uint8Array(buf)
  const view = new DataView(bytes.buffer)
  const out = new Map<string, string>()

  // 找 End of Central Directory
  let eocd = -1
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('不是有效的 zip')

  const count = view.getUint16(eocd + 10, true)
  let off = view.getUint32(eocd + 16, true)

  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(off, true) !== 0x02014b50) break
    const method = view.getUint16(off + 10, true)
    const compSize = view.getUint32(off + 20, true)
    const nameLen = view.getUint16(off + 28, true)
    const extraLen = view.getUint16(off + 30, true)
    const commentLen = view.getUint16(off + 32, true)
    const localOff = view.getUint32(off + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(off + 46, off + 46 + nameLen))

    // 本地文件头的数据起点
    const dataStart = localOff + 30 + view.getUint16(localOff + 26, true) + view.getUint16(localOff + 28, true)
    const raw = bytes.subarray(dataStart, dataStart + compSize)

    let content: Uint8Array
    if (method === 0) content = raw
    else if (method === 8) content = new Uint8Array(inflateRawSync(raw))
    else throw new Error(`不支持的压缩方式 ${method}`)

    out.set(name, new TextDecoder().decode(content))
    off += 46 + nameLen + extraLen + commentLen
  }
  return out
}

/** 解析 styles.xml 里所有 xf 的字体色, 索引即 cellXfs 的下标 */
function fontColorsOf(files: Map<string, string>): string[] {
  const xml = files.get('xl/styles.xml')
  if (!xml) return []

  const fontsBlock = xml.match(/<fonts[^>]*>([\s\S]*?)<\/fonts>/)?.[1] ?? ''
  const fontColors: string[] = []
  for (const font of fontsBlock.match(/<font[\s\S]*?<\/font>|<font[^>]*\/>/g) ?? []) {
    fontColors.push(font.match(/rgb="([0-9A-Fa-f]{8})"/)?.[1] ?? '')
  }

  const cellXfs = xml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? ''
  const xfs = cellXfs.match(/<xf[^>]*\/?>/g) ?? []
  return xfs.map((xf) => {
    const fontId = Number(xf.match(/fontId="(\d+)"/)?.[1] ?? 0)
    return fontColors[fontId] ?? ''
  })
}

/** 取某单元格引用的样式索引, 如 "C3" -> 样式在 cellXfs 中的下标 */
function styleIndexAt(files: Map<string, string>, ref: string): number {
  const xml = files.get('xl/worksheets/sheet1.xml') ?? ''
  const re = new RegExp(`<c[^>]*r="${ref}"[^>]*s="(\\d+)"`)
  const m = xml.match(re)
  return m ? Number(m[1]) : -1
}

function colorAt(buf: ArrayBuffer, ref: string): string | null {
  const files = unzip(buf)
  const idx = styleIndexAt(files, ref)
  if (idx < 0) return null
  return fontColorsOf(files)[idx] || null
}

/** 列名 -> Excel 列字母 (只处理本测试用到的 A..Z) */
function colLetter(name: string, columns: string[]): string {
  const i = columns.indexOf(name)
  let letter = ''
  let n = i
  do {
    letter = String.fromCharCode(65 + (n % 26)) + letter
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return letter
}

const columns = ['P/N', 'Jig ID', '对应尺寸']
const rows: Row[] = [
  { 'P/N': 'AA7748BB', 'Jig ID': 'J1', '对应尺寸': '77/48' },
  { 'P/N': 'CC1234DD', 'Jig ID': 'J2', '对应尺寸': '65' },
  { 'P/N': 'EE7748FF', 'Jig ID': 'J3', '对应尺寸': '65/55' },
]

describe('导出红字', () => {
  const C = colLetter('对应尺寸', columns)

  it('不传 red 时不带任何颜色', async () => {
    const buf = await writeExcel({ columns, rows })
    expect(colorAt(buf, `${C}2`)).toBeNull()
    expect(colorAt(buf, `${C}3`)).toBeNull()
  })

  it('标记为不匹配的行, 对应尺寸单元格为红色', async () => {
    const buf = await writeExcel(
      { columns, rows },
      { rows: [false, true, false], column: '对应尺寸' },
    )
    // Excel 坐标: 第 1 行表头, 数据从第 2 行起
    expect(colorAt(buf, `${C}3`)).toBe('FFFF0000')
  })

  it('未标记的行不带颜色', async () => {
    const buf = await writeExcel(
      { columns, rows },
      { rows: [false, true, false], column: '对应尺寸' },
    )
    expect(colorAt(buf, `${C}2`)).toBeNull()
    expect(colorAt(buf, `${C}4`)).toBeNull()
  })

  it('红字只落在指定列, 不影响同行其他列', async () => {
    const buf = await writeExcel(
      { columns, rows },
      { rows: [false, true, false], column: '对应尺寸' },
    )
    expect(colorAt(buf, `${colLetter('P/N', columns)}3`)).toBeNull()
  })

  it('列名不存在时安全跳过, 不抛错', async () => {
    await expect(
      writeExcel({ columns, rows }, { rows: [true], column: '不存在的列' }),
    ).resolves.toBeInstanceOf(ArrayBuffer)
  })

  it('值与颜色对齐不错位', async () => {
    const buf = await writeExcel(
      { columns, rows },
      { rows: [false, true, false], column: '对应尺寸' },
    )
    expect(colorAt(buf, `${C}2`)).toBeNull() // 77/48 未标记
    expect(colorAt(buf, `${C}3`)).toBe('FFFF0000') // 65 标记
  })

  it('空表格也能正常导出', async () => {
    await expect(writeExcel({ columns: [], rows: [] })).resolves.toBeInstanceOf(ArrayBuffer)
  })
})