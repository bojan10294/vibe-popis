// Accountant's "Lager lista" PDF: reading it in the browser and matching its
// articles to ours. Kept free of React / Supabase so it can be tested alone.

import type { Article } from '../data/types'

export interface LagerRow {
  code: string
  name: string
  /** As printed: KG, LIT, KOM or '' when the PDF has none. */
  unit: string
  ulaz: number
  izlaz: number
  stanje: number
  cena: number
  iznos: number
}

export interface LagerReport {
  /** ISO date from "Na dan: dd.mm.yyyy"; null if not found. */
  date: string | null
  rows: LagerRow[]
  /** The PDF's own UKUPNO line. */
  totals: { ulaz: number; izlaz: number; stanje: number; iznos: number } | null
  /** Sum of parsed rows; equal to `totals` when everything was read. */
  sums: { ulaz: number; izlaz: number; stanje: number; iznos: number }
  /** Rows with a code that could not be read (shown so nothing is lost silently). */
  unreadable: string[]
}

/** One piece of text with its position (pdf.js: x left→right, y bottom→top). */
export interface TextItem {
  str: string
  x: number
  y: number
}

const CODE = /^(\d{6})$/
const NUM = /^-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d+\.\d+$/
const UNITS = ['KG', 'LIT', 'KOM']

const toNum = (s: string) => Number(s.replace(/,/g, ''))
const round3 = (n: number) => Math.round(n * 1000) / 1000

/** Groups items into visual lines (top to bottom), each sorted left to right. */
function toLines(items: TextItem[]): TextItem[][] {
  const sorted = items
    .map((i) => ({ ...i, str: i.str.trim() }))
    .filter((i) => i.str)
    .sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: TextItem[][] = []
  let cur: TextItem[] = []
  let y = Infinity
  for (const it of sorted) {
    if (cur.length && Math.abs(it.y - y) > 2.5) {
      lines.push(cur)
      cur = []
    }
    if (!cur.length) y = it.y
    cur.push(it)
  }
  if (cur.length) lines.push(cur)
  return lines.map((l) => l.sort((a, b) => a.x - b.x))
}

/** Parses the text of all pages. Each page is a list of positioned text items. */
export function parseLagerItems(pages: TextItem[][]): LagerReport {
  const rows: LagerRow[] = []
  const unreadable: string[] = []
  let date: string | null = null
  let totals: LagerReport['totals'] = null

  for (const items of pages) {
    // Where the previous row's name column was, to glue wrapped names onto it.
    let last: { row: LagerRow; y: number; nameX: number; unitX: number } | null = null

    // Lone characters are the vertical "Na dan: ... Magacin" text down the left
    // margin; they would otherwise split or join real lines.
    for (const line of toLines(items.filter((i) => i.str.trim().length > 1))) {
      const text = line.map((i) => i.str).join(' ')
      const d = text.match(/Na dan:\s*(\d{2})\.(\d{2})\.(\d{4})/)
      if (d && !date) date = `${d[3]}-${d[2]}-${d[1]}`

      if (/^UKUPNO/i.test(text) || line.some((i) => /^UKUPNO/i.test(i.str))) {
        const n = line.filter((i) => NUM.test(i.str)).map((i) => toNum(i.str))
        if (n.length >= 4) {
          const [ulaz, izlaz, stanje, iznos] = n.slice(-4)
          totals = { ulaz, izlaz, stanje, iznos }
        }
        last = null
        continue
      }

      const codeAt = line.findIndex((i) => CODE.test(i.str))
      if (codeAt < 0) {
        // A wrapped article name: sits right under the row, inside its name column.
        if (
          last &&
          last.y - line[0].y < 14 &&
          line.every((i) => i.x >= last!.nameX - 5 && i.x < last!.unitX - 5)
        ) {
          last.row.name = `${last.row.name} ${text}`.trim()
          last.y = line[0].y
        } else if (line.some((i) => i.str.length > 1)) {
          last = null
        }
        continue
      }

      const code = line[codeAt].str
      // Everything right of the code; the vertical "Na dan..." letters and the
      // row number are left of it.
      const rest = line.slice(codeAt + 1)
      const nums: TextItem[] = []
      for (let k = rest.length - 1; k >= 0 && NUM.test(rest[k].str); k--) nums.unshift(rest[k])
      if (nums.length < 5) {
        unreadable.push(`${code} ${rest.map((i) => i.str).join(' ')}`)
        last = null
        continue
      }
      const nameItems = rest.slice(0, rest.length - 5)
      let unit = ''
      let unitX = nums[nums.length - 5].x
      const tail = nameItems[nameItems.length - 1]
      if (tail && UNITS.includes(tail.str.toUpperCase())) {
        unit = tail.str.toUpperCase()
        unitX = tail.x
        nameItems.pop()
      }
      let name = nameItems.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim()
      // "Somersbi mango kom": unit typed into the name.
      const glued = name.match(/^(.*\S)\s+(kg|lit|kom)$/i)
      if (!unit && glued) {
        name = glued[1]
        unit = glued[2].toUpperCase()
      }
      const [ulaz, izlaz, stanje, cena, iznos] = nums.slice(-5).map((i) => toNum(i.str))
      const row: LagerRow = { code, name, unit, ulaz, izlaz, stanje, cena, iznos }
      rows.push(row)
      last = { row, y: line[0].y, nameX: nameItems[0]?.x ?? line[codeAt].x + 30, unitX }
    }
  }

  const sum = (k: 'ulaz' | 'izlaz' | 'stanje' | 'iznos') => round3(rows.reduce((s, r) => s + r[k], 0))
  return {
    date,
    rows,
    totals,
    sums: { ulaz: sum('ulaz'), izlaz: sum('izlaz'), stanje: sum('stanje'), iznos: Math.round(sum('iznos') * 100) / 100 },
    unreadable,
  }
}

/** True when every row was read: sums equal the PDF's UKUPNO line. */
export function totalsMatch(r: LagerReport): boolean {
  if (!r.totals) return false
  const eq = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol
  return (
    eq(r.sums.stanje, r.totals.stanje, 0.0015) &&
    eq(r.sums.ulaz, r.totals.ulaz, 0.0015) &&
    eq(r.sums.izlaz, r.totals.izlaz, 0.0015) &&
    eq(r.sums.iznos, r.totals.iznos, 0.015)
  )
}

/** Reads the PDF file with pdf.js (loaded only when needed). */
export async function readLagerPdf(file: File): Promise<LagerReport> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages: TextItem[][] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent()
    const items: TextItem[] = []
    for (const it of content.items) {
      if ('str' in it && it.str.trim()) items.push({ str: it.str, x: it.transform[4], y: it.transform[5] })
    }
    pages.push(items)
  }
  return parseLagerItems(pages)
}

// ---------------------------------------------------------------------------
// Matching our articles to the accountant's
// ---------------------------------------------------------------------------

/** Spellings that differ between our sheet and the accountant's list. */
const ALIASES: Record<string, string> = {
  svepsi: 'schweppes',
  koka: 'coca',
  kola: 'cola',
  whey: 'protein',
  ness: 'nes',
  cia: 'chia',
  johnie: 'johnnie',
  matcha: 'macha',
  espreso: 'espresso',
  grejp: 'grejpfrut',
  absint: 'absinthe',
  jeger: 'jegermaister',
}

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/đ/g, 'dj')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9.,]+/g, ' ')
    .split(' ')
    .map((t) => t.replace(/^[.,]+|[.,]+$/g, ''))
    // Sizes ("0.25", "1.5l", "0.187l") say nothing about which article it is.
    .filter((t) => t && !/^\d+([.,]\d+)?(l|ml|g|kg)?$/.test(t) && t !== 'l')
    .map((t) => ALIASES[t] ?? t)
}

function lev1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1)
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1)
}

function sameWord(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return true
  return a.length >= 5 && b.length >= 5 && lev1(a, b)
}

/** The accountant's unit our article is naturally counted in. */
function bookUnitOf(a: Pick<Article, 'kind' | 'unit'>): string {
  if (a.kind === 'bottle') return 'LIT'
  if (a.kind === 'espresso' || a.kind === 'weight') return 'KG'
  if (a.unit === 'l' || a.unit === 'ml' || a.unit === 'bure') return 'LIT'
  if (a.unit === 'kg' || a.unit === 'g') return 'KG'
  return 'KOM'
}

export interface Suggestion {
  code: string
  /** 0..1, how sure the name match is. */
  score: number
}

/** Rows the accountant marked as not in use are never suggested. */
export const isRetired = (r: Pick<LagerRow, 'name'>) => /NE KORIST/i.test(r.name)

/** Best accountant article for one of ours, by name (Dice on fuzzy words) and unit. */
export function suggestLager(
  article: Pick<Article, 'name' | 'kind' | 'unit'>,
  rows: Pick<LagerRow, 'code' | 'name' | 'unit'>[],
): Suggestion | null {
  const ours = tokens(article.name)
  if (!ours.length) return null
  const unit = bookUnitOf(article)
  let best: Suggestion | null = null
  for (const r of rows) {
    if (isRetired(r)) continue
    const theirs = tokens(r.name)
    if (!theirs.length) continue
    const used = new Set<number>()
    let hits = 0
    for (const t of ours) {
      const j = theirs.findIndex((u, k) => !used.has(k) && sameWord(t, u))
      if (j >= 0) {
        used.add(j)
        hits++
      }
    }
    if (!hits) continue
    const dice = (2 * hits) / (ours.length + theirs.length)
    // Same unit breaks ties: "Jabuka" in Flašice is JABUKA 0.2 (KOM), not JABUKA (KG).
    const score = dice + (r.unit === unit ? 0.2 : 0)
    if (dice >= 0.4 && (!best || score > best.score)) best = { code: r.code, score }
  }
  return best && { code: best.code, score: Math.round(Math.min(1, best.score) * 100) / 100 }
}

/** Below this a suggestion is shown as "proveri". */
export const SURE_SCORE = 0.8

/**
 * How much of the accountant's unit one of our counting units is:
 * 1 bure = 20 l, 1 kesa espresa = 1 kg, grams → kg 0.001. Otherwise 1.
 */
export function suggestFactor(article: Pick<Article, 'kind' | 'unit'>, bookUnit: string): number {
  const u = bookUnit.toUpperCase()
  if (u === 'LIT' && article.unit === 'bure') return 20
  if (u === 'KG' && article.unit === 'g') return 0.001
  if (u === 'LIT' && article.unit === 'ml') return 0.001
  return 1
}

/** Unit label for the accountant's unit, in our spelling. */
export function bookUnitLabel(unit: string): string {
  const u = unit.toUpperCase()
  return u === 'LIT' ? 'l' : u === 'KG' ? 'kg' : u === 'KOM' ? 'kom' : unit.toLowerCase() || '?'
}
