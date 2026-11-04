import type { Article, CountInput, MeasureKind, Unit } from '../data/types'

export const KIND_LABELS: Record<MeasureKind, string> = {
  count: 'Komadi',
  weight: 'Težina',
  bottle: 'Flaše (alkohol)',
  yes_no: 'Ima / nema',
  espresso: 'Espreso (aparat + kese)',
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

/** Fri, Sat, Sun use the weekend minimum (when set). */
export function isWeekend(date: Date): boolean {
  const d = date.getDay()
  return d === 5 || d === 6 || d === 0
}

export function effectiveMinimum(article: Article, date: Date): number {
  if (article.minimum_weekend != null && isWeekend(date)) return article.minimum_weekend
  return article.minimum
}

/** How much to order, or 0 if nothing is needed. */
export function orderNeed(article: Article, input: CountInput | null, date: Date): number {
  if (article.kind === 'yes_no') {
    return input?.kind === 'yes_no' && input.has ? 0 : 1
  }
  const min = effectiveMinimum(article, date)
  if (!min) return 0
  const counted = input ? quantityOf(article, input) : 0
  if (counted >= min) return 0
  const need = min - counted
  // Pieces/bags/kegs are ordered whole; weights and liters keep one decimal.
  const whole = article.kind === 'count' || article.kind === 'espresso' || article.unit === 'g'
  return whole ? Math.ceil(round(need)) : Math.ceil(round(need) * 10) / 10
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
