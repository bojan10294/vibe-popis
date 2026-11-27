// Naručeno vs stiglo: the ordering list of a Popis against what the fakture
// entered after it brought in. Pure calculation (tested); loading is in
// data/orders.ts.

import type { Article, DeliveryLine, OrderLine } from '../data/types'
import { round, unitLabel } from './measure'

export type ArrivalStatus = 'ok' | 'short' | 'missing' | 'extra'

export interface ArrivalLine {
  article_id: string
  name: string
  /** Ordered, in the order unit (0 for 'extra'). */
  ordered: number
  orderUnit: string
  /** Ordered and arrived in the counting unit, so different units compare. */
  orderedBase: number
  arrivedBase: number
  baseUnit: string
  status: ArrivalStatus
}

/** How much of the counting unit one order unit holds (1 when ordered in the counting unit itself). */
export function orderFactor(article: Pick<Article, 'kind' | 'unit' | 'order_unit' | 'pack_size'>): number {
  if (article.order_unit === unitLabel(article)) return 1
  return article.pack_size > 0 ? article.pack_size : 1
}

/** Arrived amount per article in the counting unit (only "stiglo", returns don't count). */
export function arrivedByArticle(lines: Pick<DeliveryLine, 'article_id' | 'base_qty' | 'direction'>[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const l of lines) {
    if (l.direction === 'return') continue
    out.set(l.article_id, round((out.get(l.article_id) ?? 0) + l.base_qty))
  }
  return out
}

/**
 * Each ordered line with what arrived for it. `orders` should be only what was
 * ordered on invoice with a quantity (keš purchases never come with a faktura).
 * With `includeExtra`, articles that arrived without being ordered are listed too.
 */
export function compareArrivals(
  orders: Pick<OrderLine, 'article_id' | 'article_name' | 'suggested_order_qty' | 'order_unit'>[],
  articles: Article[],
  arrived: Map<string, number>,
  includeExtra = false,
  extraNames: Map<string, string> = new Map(),
): ArrivalLine[] {
  const artById = new Map(articles.map((a) => [a.id, a]))
  const out: ArrivalLine[] = []
  const ordered = new Set<string>()
  for (const o of orders) {
    if (!(o.suggested_order_qty > 0)) continue
    const a = artById.get(o.article_id)
    if (!a) continue
    ordered.add(o.article_id)
    const orderedBase = round(o.suggested_order_qty * orderFactor({ ...a, order_unit: o.order_unit }))
    const arrivedBase = arrived.get(o.article_id) ?? 0
    // Tiny rounding (0,7 l bottles) counts as complete.
    const status: ArrivalStatus = arrivedBase <= 0 ? 'missing' : arrivedBase + 0.001 < orderedBase ? 'short' : 'ok'
    out.push({
      article_id: o.article_id,
      name: o.article_name,
      ordered: o.suggested_order_qty,
      orderUnit: o.order_unit,
      orderedBase,
      arrivedBase,
      baseUnit: unitLabel(a),
      status,
    })
  }
  if (includeExtra) {
    for (const [articleId, qty] of arrived) {
      if (ordered.has(articleId) || qty <= 0) continue
      const a = artById.get(articleId)
      out.push({
        article_id: articleId,
        name: a?.name ?? extraNames.get(articleId) ?? 'Artikal',
        ordered: 0,
        orderUnit: a?.order_unit ?? '',
        orderedBase: 0,
        arrivedBase: qty,
        baseUnit: a ? unitLabel(a) : '',
        status: 'extra',
      })
    }
  }
  const rank: Record<ArrivalStatus, number> = { missing: 0, short: 1, extra: 2, ok: 3 }
  return out.sort((x, y) => rank[x.status] - rank[y.status] || x.name.localeCompare(y.name))
}

/** "Moretti (0 od 2 bure), Coca Cola (20 od 24 kom)" — for the notification. */
export function missingSummary(lines: ArrivalLine[]): string {
  return lines
    .filter((l) => l.status === 'missing' || l.status === 'short')
    .map((l) => `${l.name} (${fmt(l.arrivedBase)} od ${fmt(l.orderedBase)} ${l.baseUnit})`)
    .join(', ')
}

function fmt(n: number): string {
  return String(round(n)).replace('.', ',')
}
