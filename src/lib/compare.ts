// Accountant's Stanje for one day vs. what was counted in one Popis, per
// accountant article. Several of our articles may point to one accountant
// article (Cedevita flavours → CEDEVITA); their counts are summed.

import type { Article, CountLine, LagerStock } from '../data/types'
import { round } from './measure'

export interface CompareMember {
  articleId: string
  name: string
  /** Our counting unit (l for bottles, kesa for espresso). */
  unit: string
  /** In our unit; null = not entered in this Popis. */
  counted: number | null
  factor: number
}

export interface CompareRow {
  code: string
  name: string
  /** Accountant's unit as printed (KG, LIT, KOM). */
  unit: string
  book: number
  cena: number
  /** Sum of our counts converted to the accountant's unit; null = nothing counted. */
  counted: number | null
  /** counted − book: negative = manjak, positive = višak. */
  diff: number | null
  /** diff × cena (din); null when not counted. */
  value: number | null
  members: CompareMember[]
  /** Some linked articles were not entered in this Popis (e.g. weekly ones). */
  partial: boolean
  /** Book shows 0 at price 0 although it moved: the accountant writes it all off. */
  untracked: boolean
  /** |diff| within tolerance. */
  ok: boolean
}

/** Differences smaller than this are counted as "slaže se". */
export function tolerance(unit: string): number {
  return unit.toUpperCase() === 'KOM' ? 0.5 : 0.05
}

export function compareStock(stock: LagerStock[], articles: Article[], lines: CountLine[]): CompareRow[] {
  const lineOf = new Map(lines.map((l) => [l.article_id, l]))
  const byCode = new Map<string, Article[]>()
  for (const a of articles) {
    if (!a.code || a.kind === 'yes_no') continue
    // Inactive articles only count if they were still entered in this Popis.
    if (!a.active && !lineOf.has(a.id)) continue
    if (!byCode.has(a.code)) byCode.set(a.code, [])
    byCode.get(a.code)!.push(a)
  }

  const rows: CompareRow[] = []
  for (const s of stock) {
    const linked = byCode.get(s.code)
    if (!linked) continue
    const members: CompareMember[] = linked.map((a) => {
      const l = lineOf.get(a.id)
      return { articleId: a.id, name: a.name, unit: l?.unit ?? a.unit, counted: l ? l.counted : null, factor: a.book_factor || 1 }
    })
    const entered = members.filter((m) => m.counted != null)
    const counted = entered.length ? round(entered.reduce((sum, m) => sum + m.counted! * m.factor, 0)) : null
    const diff = counted == null ? null : round(counted - s.stanje)
    rows.push({
      code: s.code,
      name: s.name,
      unit: s.unit,
      book: s.stanje,
      cena: s.cena,
      counted,
      diff,
      value: diff == null ? null : round(diff * s.cena, 2),
      members,
      partial: entered.length > 0 && entered.length < members.length,
      untracked: s.stanje === 0 && s.cena === 0 && s.ulaz > 0,
      ok: diff != null && Math.abs(diff) < tolerance(s.unit),
    })
  }
  return rows.sort(
    (a, b) => Math.abs(b.value ?? 0) - Math.abs(a.value ?? 0) || Math.abs(b.diff ?? 0) - Math.abs(a.diff ?? 0),
  )
}

/**
 * The Popis to compare a PDF dated `date` with: the last finished one from the
 * night before (started before noon of that day, so one after midnight counts).
 */
export function defaultCountFor<T extends { datetime: string; status: string }>(counts: T[], date: string): T | undefined {
  const finished = counts.filter((c) => c.status === 'finished').sort((a, b) => b.datetime.localeCompare(a.datetime))
  const noon = new Date(`${date}T12:00:00`).getTime()
  return finished.find((c) => new Date(c.datetime).getTime() < noon) ?? finished[0]
}
