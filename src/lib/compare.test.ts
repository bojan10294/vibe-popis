import { describe, expect, it } from 'vitest'
import type { CountLine, DeliveryLine, LagerStock } from '../data/types'
import { compareStock, compareTotals, defaultCountFor, pendingByCode } from './compare'
import { autoPayment } from './payment'
import { article } from './testing'

const moretti = article({ id: 'm', name: 'Moretti', code: 'M1', unit: 'bure', book_factor: 20 })
const cola = article({ id: 'c', name: 'Cola', code: 'C1' })
const stock: LagerStock[] = [
  { date: '2026-11-27', code: 'M1', name: 'MORETTI', unit: 'LIT', ulaz: 0, izlaz: 0, stanje: 40, cena: 200 },
  { date: '2026-11-27', code: 'C1', name: 'COLA', unit: 'KOM', ulaz: 0, izlaz: 0, stanje: 10, cena: 80 },
]
const line = (article_id: string, counted: number): CountLine => ({
  id: article_id,
  count_id: 'k',
  article_id,
  article_name: article_id,
  category_id: null,
  unit: 'kom',
  input: { kind: 'count', value: counted },
  counted,
  book_stock: null,
  difference: null,
  unit_price: 0,
  difference_value: null,
})
const dl = (article_id: string, base_qty: number, direction: 'in' | 'return' = 'in'): DeliveryLine => ({
  id: `${article_id}-${direction}`,
  delivery_id: 'd',
  article_id,
  article_name: article_id,
  qty: base_qty,
  unit: 'kom',
  base_qty,
  base_unit: 'kom',
  direction,
})

describe('fakture van SEF-a', () => {
  it('adds stiglo and subtracts vraćeno, in the accountant unit', () => {
    const pending = pendingByCode([moretti, cola], [dl('m', 2), dl('m', 1, 'return'), dl('c', 24)])
    expect(pending.get('M1')).toBe(20) // (2 − 1) bure × 20 l
    expect(pending.get('C1')).toBe(24)
  })

  it('turns a false manjak into "slaže se" once the faktura is counted', () => {
    const lines = [line('m', 3), line('c', 34)]
    const without = compareStock(stock, [moretti, cola], lines)
    expect(without.find((r) => r.code === 'C1')!.diff).toBe(24) // looks like višak 24

    const pending = pendingByCode([moretti, cola], [dl('m', 1), dl('c', 24)])
    const rows = compareStock(stock, [moretti, cola], lines, pending)
    const m = rows.find((r) => r.code === 'M1')!
    expect(m.bookPdf).toBe(40)
    expect(m.pending).toBe(20)
    expect(m.book).toBe(60)
    expect(m.ok).toBe(true)
    expect(rows.find((r) => r.code === 'C1')!.ok).toBe(true)
  })
})

describe('compareTotals', () => {
  it('sums manjak and višak as positive dinars', () => {
    const rows = compareStock(stock, [moretti, cola], [line('m', 1), line('c', 12)]) // 20 l manjak, 2 kom višak
    const t = compareTotals(rows)
    expect(t.shortN).toBe(1)
    expect(t.shortage).toBe(4000)
    expect(t.surN).toBe(1)
    expect(t.surplus).toBe(160)
  })
})

describe('keš/račun', () => {
  const orderLine = { category_id: 'cat-pivo', payment: null } as never
  it('suggests keš for a real manjak and račun when it is covered by a faktura', () => {
    const short = compareStock(stock, [moretti], [line('m', 1)]).find((r) => r.code === 'M1')
    expect(autoPayment(orderLine, short)).toBe('cash')
    const covered = compareStock(stock, [moretti], [line('m', 3)], new Map([['M1', 20]])).find((r) => r.code === 'M1')
    expect(autoPayment(orderLine, covered)).toBe('invoice')
  })
})

describe('defaultCountFor', () => {
  it('pairs a morning PDF with the popis of the night before, also after midnight', () => {
    const counts = [
      { id: 'wed', datetime: '2026-11-25T22:00:00', status: 'finished' },
      { id: 'thu-late', datetime: '2026-11-27T01:00:00', status: 'finished' },
    ]
    expect(defaultCountFor(counts, '2026-11-27')!.id).toBe('thu-late')
    expect(defaultCountFor(counts, '2026-11-26')!.id).toBe('wed')
  })
})
