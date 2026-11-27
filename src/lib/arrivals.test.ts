import { describe, expect, it } from 'vitest'
import { arrivedByArticle, compareArrivals, missingSummary, orderFactor } from './arrivals'
import { parseQty, toBase, unitOptions } from './delivery'
import { article } from './testing'
import type { OrderUnit } from '../data/types'

const cola = article({ id: 'c', name: 'Cola', order_unit: 'gajba', pack_size: 24 })
const moretti = article({ id: 'm', name: 'Moretti', unit: 'l', order_unit: 'bure', pack_size: 20 })
const order = (article_id: string, name: string, qty: number, unit: OrderUnit) => ({
  article_id,
  article_name: name,
  suggested_order_qty: qty,
  order_unit: unit,
})

describe('naručeno vs stiglo', () => {
  it('compares in the counting unit (gajba vs kom, bure vs l)', () => {
    expect(orderFactor(cola)).toBe(24)
    const arrived = arrivedByArticle([
      { article_id: 'c', base_qty: 20, direction: 'in' },
      { article_id: 'm', base_qty: 40, direction: 'in' },
    ])
    const res = compareArrivals([order('c', 'Cola', 1, 'gajba'), order('m', 'Moretti', 2, 'bure')], [cola, moretti], arrived)
    expect(res.find((r) => r.article_id === 'c')).toMatchObject({ status: 'short', orderedBase: 24, arrivedBase: 20 })
    expect(res.find((r) => r.article_id === 'm')!.status).toBe('ok')
  })

  it('marks what never came, ignores returns and lists extras on request', () => {
    const arrived = arrivedByArticle([
      { article_id: 'c', base_qty: 24, direction: 'return' },
      { article_id: 'x', base_qty: 3, direction: 'in' },
    ])
    const res = compareArrivals([order('c', 'Cola', 1, 'gajba')], [cola], arrived, true, new Map([['x', 'Novo']]))
    expect(res[0]).toMatchObject({ article_id: 'c', status: 'missing' })
    expect(res[1]).toMatchObject({ article_id: 'x', name: 'Novo', status: 'extra' })
    expect(missingSummary(res)).toBe('Cola (0 od 24 kom)')
  })

  it('skips note-only lines without a quantity', () => {
    expect(compareArrivals([order('c', 'Cola', 0, 'gajba')], [cola], new Map())).toEqual([])
  })
})

describe('unos fakture', () => {
  it('offers the order unit and converts to the counting unit', () => {
    expect(unitOptions(cola).map((o) => o.unit)).toEqual(['kom', 'gajba'])
    const bottle = article({ kind: 'bottle', order_unit: 'flaša', pack_size: 0.7 })
    expect(unitOptions(bottle)[0].unit).toBe('flaša') // invoices list bottles
    expect(toBase(3, unitOptions(bottle)[0])).toBe(2.1)
  })

  it('reads "2,5" and rejects zero or text', () => {
    expect(parseQty('2,5')).toBe(2.5)
    expect(parseQty('0')).toBeNull()
    expect(parseQty('abc')).toBeNull()
  })
})
