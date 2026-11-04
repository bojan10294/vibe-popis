import type { CountLine } from '../data/types'

export interface CountSummary {
  total: number
  counted: number
  skipped: number
  shortageQty: number
  surplusQty: number
  shortageValue: number
  surplusValue: number
}

export function summarizeLines(lines: CountLine[]): CountSummary {
  let counted = 0
  let skipped = 0
  let shortageQty = 0
  let surplusQty = 0
  let shortageValue = 0
  let surplusValue = 0
  for (const l of lines) {
    if (l.counted == null) {
      skipped++
      continue
    }
    counted++
    const diff = l.difference ?? 0
    const val = l.difference_value ?? 0
    if (diff > 0) {
      shortageQty += diff
      shortageValue += val
    } else if (diff < 0) {
      surplusQty += -diff
      surplusValue += -val
    }
  }
  return {
    total: lines.length,
    counted,
    skipped,
    shortageQty: round(shortageQty),
    surplusQty: round(surplusQty),
    shortageValue: round(shortageValue, 2),
    surplusValue: round(surplusValue, 2),
  }
}

function round(n: number, dp = 3): number {
  const f = 10 ** dp
  return Math.round((n + Number.EPSILON) * f) / f
}
