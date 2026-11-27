// Test helpers: articles with sensible defaults (only used by *.test.ts).
import type { Article } from '../data/types'

export function article(over: Partial<Article> = {}): Article {
  return {
    id: 'a1',
    name: 'Artikal',
    category_id: null,
    supplier_id: null,
    kind: 'count',
    unit: 'kom',
    allow_decimal: false,
    bottle_sizes: [],
    minimum: 0,
    order_qty: 1,
    regular_target: null,
    order_unit: 'kom',
    pack_size: 1,
    weekend_target: null,
    ask_note: false,
    count_weekday: null,
    active: true,
    sort_order: 1,
    code: null,
    book_factor: 1,
    last_unit_price: 0,
    book_stock: null,
    ...over,
  }
}
