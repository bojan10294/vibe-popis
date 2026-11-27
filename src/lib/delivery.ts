import type { Article } from '../data/types'
import { round, unitLabel } from './measure'

/** A unit the worker can type the arrived amount in; factor converts it to the counting unit. */
export interface UnitOption {
  unit: string
  factor: number
}

/**
 * The counting unit, plus the supplier's unit when it differs (gajba = 24 kom,
 * bure = 20 l, flaša = 0.7 l). Bottles start with the supplier's unit because
 * invoices list bottles, not liters.
 */
export function unitOptions(article: Article): UnitOption[] {
  const base: UnitOption = { unit: unitLabel(article), factor: 1 }
  const pack = article.pack_size
  if (article.order_unit === base.unit || !(pack > 0)) return [base]
  const order: UnitOption = { unit: article.order_unit, factor: pack }
  return article.kind === 'bottle' ? [order, base] : [base, order]
}

/** "2,5" or "2.5" → 2.5; null when not a positive number. */
export function parseQty(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

export function toBase(qty: number, option: UnitOption): number {
  return round(qty * option.factor)
}
