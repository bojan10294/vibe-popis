// Keš or račun for an ordering-list line.
//
// Na račun: the accountant books it, so book stock and shelf both go up — the
// gap between them stays. Za keš: only the shelf goes up, so buying for cash
// closes a manjak (book says more than is really there).
//
// Automatic rule: the article's accountant article is in manjak in the
// comparison with this Popis → keš; anything else (višak, slaže se, not
// linked, no PDF yet) → račun. A choice made by hand always wins.
//
// Flašice always go on račun: their manjak is usually a delivery the
// accountant hasn't booked yet, not a real gap to cover with cash.

import type { Article, OrderLine, Payment } from '../data/types'
import { defaultCountFor, type CompareRow } from './compare'
import { businessDay, businessDayIso } from './day'

/** Categories that are always "na račun" automatically (still switchable by hand). */
const ALWAYS_INVOICE_CATEGORIES = new Set(['cat-flasice'])

export function autoPayment(line: OrderLine, row: CompareRow | undefined): Payment {
  if (ALWAYS_INVOICE_CATEGORIES.has(line.category_id ?? '')) return 'invoice'
  if (!row || row.counted == null || row.ok || row.untracked) return 'invoice'
  return (row.diff ?? 0) < 0 ? 'cash' : 'invoice'
}

export function paymentOf(line: OrderLine, row: CompareRow | undefined): Payment {
  return line.payment ?? autoPayment(line, row)
}

/** The comparison row (accountant article) an ordering line belongs to. */
export function rowFor(line: OrderLine, artById: Map<string, Article>, rowByCode: Map<string, CompareRow>) {
  const code = artById.get(line.article_id)?.code
  return code ? rowByCode.get(code) : undefined
}

/**
 * Which day's Lager lista to use for a Popis: the one the Poređenje page pairs
 * with it (next morning's PDF); until that one is uploaded, the latest PDF
 * up to the day after the Popis.
 */
export function lagerDateFor<T extends { id: string; datetime: string; status: string }>(
  dates: string[],
  counts: T[],
  count: T,
): string | undefined {
  const sorted = [...dates].sort()
  const day = businessDayIso(new Date(count.datetime))
  const paired = sorted.find((d) => d >= day && defaultCountFor(counts, d)?.id === count.id)
  if (paired) return paired
  const limit = businessDay(new Date(count.datetime))
  limit.setDate(limit.getDate() + 1)
  const max = localIso(limit)
  return sorted.filter((d) => d <= max).pop()
}

function localIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
