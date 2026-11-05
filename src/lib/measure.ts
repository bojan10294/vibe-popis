import type { Article, CountInput, MeasureKind, Unit } from '../data/types'

export const KIND_LABELS: Record<MeasureKind, string> = {
  count: 'Komadi',
  weight: 'Težina',
  bottle: 'Flaše (alkohol)',
  yes_no: 'Ima / nema',
  espresso: 'Espreso (aparat + kese)',
}

/** The worker's "what is missing" text, trimmed; empty string when none. */
export function noteOf(input: CountInput | null | undefined): string {
  return input?.note?.trim() ?? ''
}

export function round(n: number, dp = 3): number {
  const f = 10 ** dp
  return Math.round((n + Number.EPSILON) * f) / f
}

export function sizeKey(size_l: number): string {
  return String(size_l)
}

export function formatSize(size_l: number): string {
  return `${String(size_l).replace('.', ',')} l`
}

export function formatNum(n: number | null | undefined): string {
  if (n == null) return '—'
  return String(round(n)).replace('.', ',')
}

/** Liters left in an opened bottle: (measured − empty) grams, 1 kg ≈ 1 l. */
export function openedLiters(measured_g: number, empty_weight_g: number | null): number {
  if (!measured_g) return 0
  return Math.max(0, (measured_g - (empty_weight_g ?? 0)) / 1000)
}

/** Normalized quantity in the article's unit (liters for bottles, bags for espresso). */
export function quantityOf(article: Pick<Article, 'bottle_sizes'>, input: CountInput): number {
  switch (input.kind) {
    case 'count':
    case 'weight':
      return round(input.value)
    case 'yes_no':
      return input.has ? 1 : 0
    case 'espresso':
      return round(input.bags)
    case 'bottle': {
      let total = 0
      for (const s of article.bottle_sizes) {
        const k = sizeKey(s.size_l)
        total += (input.full[k] ?? 0) * s.size_l
        total += openedLiters(input.opened_g[k] ?? 0, s.empty_weight_g)
      }
      return round(total)
    }
  }
}

export function unitLabel(article: Pick<Article, 'kind' | 'unit'>): Unit {
  if (article.kind === 'bottle') return 'l'
  if (article.kind === 'espresso') return 'kesa'
  return article.unit
}

/** Index = getDay(); used as "Samo {WEEKDAYS_ON[d]}". */
export const WEEKDAYS_ON = ['nedeljom', 'ponedeljkom', 'utorkom', 'sredom', 'četvrtkom', 'petkom', 'subotom']

/** Whether the article is in a count started on `date` (weekly articles only on their day). */
export function countedOn(article: Pick<Article, 'count_weekday'>, date: Date): boolean {
  return article.count_weekday == null || article.count_weekday === date.getDay()
}

/**
 * There are no deliveries on Saturday and Sunday, so the Thursday count orders
 * for the whole weekend.
 */
export function isWeekendOrderDay(date: Date): boolean {
  return date.getDay() === 4
}

/** True when this count orders up to the weekend target instead of the regular rule. */
export function usesWeekendTarget(article: Article, date: Date): boolean {
  return article.kind !== 'yes_no' && article.weekend_target != null && isWeekendOrderDay(date)
}

/** The stock level the order is based on: weekend target on Thursday, else the regular target or minimum. */
export function orderThreshold(article: Article, date: Date): number {
  if (usesWeekendTarget(article, date)) return article.weekend_target!
  return article.regular_target ?? article.minimum
}

/** Whole packs needed to get from `counted` up to `target` (0 if already there). */
function packsToReach(article: Article, target: number, counted: number): number {
  const missing = round(target - counted)
  if (missing <= 0) return 0
  const pack = article.pack_size > 0 ? article.pack_size : 1
  const packs = Math.ceil(round(missing / pack))
  // Ordered in the counting unit itself (kg → kg): round up to the step, e.g. 0,5 kg.
  return article.order_unit === unitLabel(article) ? round(packs * pack) : packs
}

/**
 * How many order units (paket, gajba, flaša...) to order, or 0.
 *  - Thursday with a weekend target: enough whole packs to reach the target.
 *  - Regular target ("dopuni do"): enough whole packs to reach it.
 *  - Otherwise: the fixed regular quantity once stock is below the minimum.
 *  - Ima/nema: the regular quantity when marked "nema".
 * A written "what is missing" note puts the article on the list regardless
 * (see needsOrder); the quantity can then be 0 and is adjusted by hand.
 */
export function orderQuantity(article: Article, input: CountInput | null, date: Date): number {
  // "Pitaj šta fali" articles have no ordering rules: only the written note counts.
  if (article.ask_note) return 0
  if (article.kind === 'yes_no') {
    return input?.kind === 'yes_no' && input.has ? 0 : article.order_qty
  }
  const counted = input ? quantityOf(article, input) : 0
  if (usesWeekendTarget(article, date)) return packsToReach(article, article.weekend_target!, counted)
  if (article.regular_target != null) {
    // "Dopuni do": order the difference; with a minimum, only once below it.
    if (article.minimum > 0 && counted >= article.minimum) return 0
    return packsToReach(article, article.regular_target, counted)
  }
  if (!article.minimum || counted >= article.minimum) return 0
  return article.order_qty
}

/** Goes on the order list: below the rule, or the worker wrote what is missing. */
export function needsOrder(article: Article, input: CountInput | null, date: Date): boolean {
  return orderQuantity(article, input, date) > 0 || noteOf(input) !== ''
}

/** Suggested amount on the order list (0 for note-only lines, which show just the note). */
export function suggestedQuantity(article: Article, input: CountInput | null, date: Date): number {
  return orderQuantity(article, input, date)
}

/**
 * Human-readable summary of what was entered. Pass `total` (the saved quantity)
 * so bottle totals don't change when the empty-bottle weight is edited later.
 */
export function describeInput(
  article: Pick<Article, 'bottle_sizes' | 'kind' | 'unit'>,
  input: CountInput,
  total?: number,
): string {
  const note = noteOf(input)
  const base = describeMeasured(article, input, total)
  return note ? `${base} · fali: ${note}` : base
}

function describeMeasured(
  article: Pick<Article, 'bottle_sizes' | 'kind' | 'unit'>,
  input: CountInput,
  total?: number,
): string {
  switch (input.kind) {
    case 'count':
    case 'weight':
      return `${formatNum(input.value)} ${article.unit}`
    case 'yes_no':
      return input.has ? 'Ima' : 'Nema'
    case 'espresso':
      return `Aparat: ${input.machine_counter} · ${formatNum(input.bags)} kesa`
    case 'bottle': {
      const parts: string[] = []
      for (const s of article.bottle_sizes) {
        const k = sizeKey(s.size_l)
        const full = input.full[k] ?? 0
        const opened = input.opened_g[k] ?? 0
        if (full) parts.push(`${full}× ${formatSize(s.size_l)}`)
        if (opened) parts.push(`načeta ${formatSize(s.size_l)}: ${opened} g`)
      }
      const sum = total ?? quantityOf(article, input)
      return parts.length ? `${parts.join(' + ')} = ${formatNum(sum)} l` : '0 l'
    }
  }
}
