import { describe, expect, it } from 'vitest'
import { needsOrder, orderQuantity, quantityOf } from './measure'
import { article } from './testing'

const monday = new Date('2026-11-23T22:00')
const thursday = new Date('2026-11-26T22:00')

describe('quantityOf', () => {
  it('adds full bottles and the opened one minus the empty bottle', () => {
    const a = article({ kind: 'bottle', bottle_sizes: [{ size_l: 0.7, empty_weight_g: 500 }] })
    // 2 full × 0,7 l + opened 850 g − 500 g = 0,35 l
    expect(quantityOf(a, { kind: 'bottle', full: { '0.7': 2 }, opened_g: { '0.7': 850 } })).toBe(1.75)
  })

  it('never counts an opened bottle below empty', () => {
    const a = article({ kind: 'bottle', bottle_sizes: [{ size_l: 1, empty_weight_g: 600 }] })
    expect(quantityOf(a, { kind: 'bottle', full: {}, opened_g: { '1': 400 } })).toBe(0)
  })

  it('counts espresso in bags and yes/no as 1/0', () => {
    expect(quantityOf(article(), { kind: 'espresso', machine_counter: 12345, bags: 3.5 })).toBe(3.5)
    expect(quantityOf(article(), { kind: 'yes_no', has: false })).toBe(0)
  })
})

describe('orderQuantity', () => {
  it('orders the fixed quantity only below the minimum', () => {
    const a = article({ minimum: 10, order_qty: 2 })
    expect(orderQuantity(a, { kind: 'count', value: 9 }, monday)).toBe(2)
    expect(orderQuantity(a, { kind: 'count', value: 10 }, monday)).toBe(0)
  })

  it('"dopuni do" orders whole packs up to the target', () => {
    // target 50 kom, have 20 → 30 missing → 2 gajbe of 24
    const a = article({ regular_target: 50, order_unit: 'gajba', pack_size: 24 })
    expect(orderQuantity(a, { kind: 'count', value: 20 }, monday)).toBe(2)
  })

  it('uses the weekend target on Thursday', () => {
    const a = article({ minimum: 10, order_qty: 1, weekend_target: 60, order_unit: 'gajba', pack_size: 24 })
    expect(orderQuantity(a, { kind: 'count', value: 20 }, thursday)).toBe(2)
    expect(orderQuantity(a, { kind: 'count', value: 20 }, monday)).toBe(0)
  })

  it('orders "nema" for yes/no articles', () => {
    const a = article({ kind: 'yes_no', order_qty: 1 })
    expect(orderQuantity(a, { kind: 'yes_no', has: false }, monday)).toBe(1)
    expect(orderQuantity(a, { kind: 'yes_no', has: true }, monday)).toBe(0)
  })

  it('puts a written "fali" note on the list even with enough stock', () => {
    const a = article({ ask_note: true, minimum: 1 })
    expect(needsOrder(a, { kind: 'count', value: 5, note: 'zeleni' }, monday)).toBe(true)
    expect(needsOrder(a, { kind: 'count', value: 5 }, monday)).toBe(false)
  })
})
