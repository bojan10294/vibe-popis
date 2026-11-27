// Loading for the ordering list (keš/račun) and naručeno vs stiglo. Shared by
// the Lista nabavke page, the faktura page and confirming a faktura, so all
// three use the same numbers.

import {
  listArticles,
  listCounts,
  listDeliveries,
  listDeliveryLinesFor,
  listLagerDates,
  listLagerStock,
  listLinesForCount,
  listOrdersForCount,
  pendingForComparison,
} from './repository'
import type { Article, Count, Delivery, OrderLine, Payment } from './types'
import { compareStock, compareTotals, type CompareRow, type CompareTotals } from '../lib/compare'
import { lagerDateFor, paymentOf, rowFor } from '../lib/payment'
import { arrivedByArticle, compareArrivals, type ArrivalLine } from '../lib/arrivals'
import { isBefore } from '../lib/format'

export interface OrderView {
  count: Count
  orders: OrderLine[]
  articles: Article[]
  /** Lager lista used for keš/račun, null when none fits this Popis. */
  lagerDate: string | null
  rowByCode: Map<string, CompareRow>
}

export async function loadOrderView(count: Count, articles?: Article[]): Promise<OrderView> {
  const [orders, arts] = await Promise.all([listOrdersForCount(count.id), articles ?? listArticles()])
  const view: OrderView = { count, orders, articles: arts, lagerDate: null, rowByCode: new Map() }
  try {
    const [dates, counts, lines] = await Promise.all([listLagerDates(), listCounts(), listLinesForCount(count.id)])
    const date = lagerDateFor(dates, counts, count)
    if (date) {
      // Same numbers as Poređenje: fakture the accountant doesn't have yet count as in stock.
      const [stock, pending] = await Promise.all([listLagerStock(date), pendingForComparison(date, count, arts)])
      view.lagerDate = date
      view.rowByCode = new Map(compareStock(stock, arts, lines, pending).map((r) => [r.code, r]))
    }
  } catch {
    // No comparison: everything stays "na račun", the list still works.
  }
  return view
}

/** Manjak / višak of a finished Popis, exactly like Poređenje; null without a matching Lager lista. */
export async function comparisonFor(
  count: Count,
  articles?: Article[],
): Promise<{ date: string; totals: CompareTotals } | null> {
  const [dates, counts, arts, lines] = await Promise.all([
    listLagerDates(),
    listCounts(),
    articles ?? listArticles(),
    listLinesForCount(count.id),
  ])
  const date = lagerDateFor(dates, counts, count)
  if (!date) return null
  const [stock, pending] = await Promise.all([listLagerStock(date), pendingForComparison(date, count, arts)])
  return { date, totals: compareTotals(compareStock(stock, arts, lines, pending)) }
}

export function paymentIn(view: OrderView, line: OrderLine): Payment {
  const artById = new Map(view.articles.map((a) => [a.id, a]))
  return paymentOf(line, rowFor(line, artById, view.rowByCode))
}

/** Confirmed fakture entered after the Popis (plus `alsoId`, one being confirmed right now). */
async function deliveriesAfter(count: Count, alsoId?: string): Promise<Delivery[]> {
  const all = await listDeliveries()
  return all.filter(
    (d) => (d.status === 'confirmed' || d.id === alsoId) && !isBefore(d.created_at, count.datetime),
  )
}

/** Per article, how much arrived (counting unit) on fakture entered after the Popis. */
export async function arrivedSince(count: Count): Promise<Map<string, number>> {
  const dels = await deliveriesAfter(count)
  return arrivedByArticle(await listDeliveryLinesFor(dels.map((d) => d.id)))
}

export type { ArrivalLine }

export interface DeliveryCheck {
  count_id: string
  count_datetime: string
  lines: ArrivalLine[]
}

/**
 * Naručeno vs stiglo for one faktura's supplier: the order list of the last
 * Popis before it (na račun, that supplier) against every faktura from that
 * supplier since then, this one included. Null without a supplier or Popis.
 */
export async function checkDelivery(delivery: Delivery): Promise<DeliveryCheck | null> {
  if (!delivery.supplier_id) return null
  const counts = (await listCounts()).filter((c) => c.status === 'finished' && isBefore(c.datetime, delivery.created_at))
  const count = counts.sort((a, b) => Date.parse(b.datetime) - Date.parse(a.datetime))[0]
  if (!count) return null
  const view = await loadOrderView(count)
  const supplierOf = new Map(view.articles.map((a) => [a.id, a.supplier_id]))
  const ordered = view.orders.filter(
    (o) => supplierOf.get(o.article_id) === delivery.supplier_id && paymentIn(view, o) === 'invoice',
  )
  const dels = (await deliveriesAfter(count, delivery.id)).filter((d) => d.supplier_id === delivery.supplier_id)
  const lines = await listDeliveryLinesFor(dels.map((d) => d.id))
  const names = new Map(lines.map((l) => [l.article_id, l.article_name]))
  return {
    count_id: count.id,
    count_datetime: count.datetime,
    lines: compareArrivals(ordered, view.articles, arrivedByArticle(lines), true, names),
  }
}
