// Domain model. Kept framework-agnostic so the same types work over
// IndexedDB now and over Supabase later.

export type Role = 'admin' | 'staff'
export type CountStatus = 'in_progress' | 'finished'
export type OrderStatus = 'pending' | 'ordered'

/**
 * How an article is counted:
 *  - count:    whole pieces (optionally with decimals, e.g. 6.5)
 *  - weight:   weighed, in kg or g
 *  - bottle:   full bottles per size + weight of the opened bottle per size
 *  - yes_no:   just "ima" / "nema"; "nema" goes on the order list
 *  - espresso: machine counter (just recorded) + full bags
 */
export type MeasureKind = 'count' | 'weight' | 'bottle' | 'yes_no' | 'espresso'

export const UNITS = ['kom', 'kg', 'g', 'l', 'kesica', 'kesa', 'kutija', 'bure'] as const
export type Unit = (typeof UNITS)[number]

export interface Category {
  id: string
  name: string
  sort_order: number
}

export interface BottleSize {
  /** Bottle volume in liters, e.g. 0.7 or 1. */
  size_l: number
  /** Weight of the empty bottle in grams; subtracted from the opened bottle. */
  empty_weight_g: number | null
}

export interface Article {
  id: string
  name: string
  category_id: string | null
  kind: MeasureKind
  /** Display unit for count/weight; bottle is always liters, espresso bags. */
  unit: Unit
  /** count only: allow halves etc. (e.g. 6.5). */
  allow_decimal: boolean
  /** bottle only. */
  bottle_sizes: BottleSize[]
  /** Order when below this (in the article's unit; liters for bottles). */
  minimum: number
  /** Optional higher minimum for counts done Fri–Sun. */
  minimum_weekend: number | null
  active: boolean
  sort_order: number
  // --- Lager lista (book stock) — kept for the later accounting import ---
  /** Accountant / POS code, only used to match lager-lista imports. */
  code?: string
  last_unit_price: number
  book_stock: number | null
}

export interface User {
  id: string
  name: string
  role: Role
}

export interface Count {
  id: string
  /** ISO datetime the session was started. */
  datetime: string
  finished_at: string | null
  user_id: string
  /** Snapshot so history keeps the name even if the user is deleted. */
  user_name: string
  status: CountStatus
  note: string
  /** Category ids the worker marked as done. */
  done_categories: string[]
  /** ISO date the book stock was imported "as of". */
  book_stock_as_of_date: string | null
}

export type CountInput =
  | { kind: 'count'; value: number }
  | { kind: 'weight'; value: number }
  | { kind: 'yes_no'; has: boolean }
  | {
      kind: 'bottle'
      /** Keyed by String(size_l). */
      full: Record<string, number>
      opened_g: Record<string, number>
    }
  | { kind: 'espresso'; machine_counter: number; bags: number }

export interface CountLine {
  id: string
  count_id: string
  article_id: string
  /** Snapshots so history survives article edits / deletes. */
  article_name: string
  category_id: string | null
  unit: Unit
  input: CountInput
  /** Normalized quantity (pieces / kg / g / liters / bags; yes_no = 1 or 0). */
  counted: number
  /** Book (expected) stock from the import; null if not imported. */
  book_stock: number | null
  /** book_stock - counted (computed); null if book stock missing. */
  difference: number | null
  unit_price: number
  /** difference * unit_price (computed). */
  difference_value: number | null
}

export interface BookStockImport {
  id: string
  date: string
  source: string
  raw_ref: string
}

export interface OrderLine {
  id: string
  count_id: string
  article_id: string
  article_name: string
  category_id: string | null
  unit: Unit
  kind: MeasureKind
  counted: number | null
  minimum: number
  suggested_order_qty: number
  for_date: string
  order_status: OrderStatus
}
