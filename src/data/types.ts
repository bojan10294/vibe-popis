import type { ArrivalLine } from '../lib/arrivals'

// Domain model. Kept framework-agnostic so the same types work over
// IndexedDB now and over Supabase later.

export type Role = 'admin' | 'staff'
export type CountStatus = 'in_progress' | 'finished'

/**
 * How an article is counted:
 *  - count:    whole pieces (optionally with decimals, e.g. 6.5)
 *  - weight:   weighed, in kg or g
 *  - bottle:   full bottles per size + weight of the opened bottle per size
 *  - yes_no:   just "ima" / "nema"; "nema" goes on the order list
 *  - espresso: machine counter (just recorded) + full bags
 * Any kind can also ask the worker what is missing (Article.ask_note).
 */
export type MeasureKind = 'count' | 'weight' | 'bottle' | 'yes_no' | 'espresso'

export const UNITS = ['kom', 'kg', 'g', 'l', 'ml', 'kesica', 'kesa', 'kutija', 'bure'] as const
export type Unit = (typeof UNITS)[number]

export const ORDER_UNITS = ['kom', 'paket', 'gajba', 'kutija', 'kesa', 'flaša', 'bure', 'kg', 'l'] as const
export type OrderUnit = (typeof ORDER_UNITS)[number]

export interface Category {
  id: string
  name: string
  sort_order: number
}

export interface Supplier {
  id: string
  name: string
  /** For sending the order list later. */
  phone: string | null
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
  /** Who we order it from; the order list is grouped by this. */
  supplier_id: string | null
  kind: MeasureKind
  /** Display unit for count/weight; bottle is always liters, espresso bags. */
  unit: Unit
  /** count only: allow halves etc. (e.g. 6.5). */
  allow_decimal: boolean
  /** bottle only. */
  bottle_sizes: BottleSize[]
  /** Order when below this (in the article's unit; liters for bottles). */
  minimum: number
  /** Regular day: how many order units to order when below the minimum. */
  order_qty: number
  /**
   * Regular day "dopuni do": the desired stock in the counting unit. When set,
   * the order is target − counted (in whole packs) instead of the fixed order_qty.
   */
  regular_target: number | null
  /** Unit the supplier sells in: kom, paket, gajba... */
  order_unit: OrderUnit
  /** How much one order unit holds, in the counting unit (paket = 24 kom, flaša = 0.7 l). */
  pack_size: number
  /**
   * Thursday count (no deliveries Sat/Sun): how much to have for the weekend,
   * in the counting unit. Enough packs are ordered to reach it. null = regular rule.
   */
  weekend_target: number | null
  /** Show a "Treba da se poruči" text field next to the count (e.g. tea flavours). */
  ask_note: boolean
  /** null = every count; 0..6 = only counted on that weekday (0 = Sunday, like getDay()). */
  count_weekday: number | null
  active: boolean
  sort_order: number
  // --- Lager lista (book stock) ---
  /** "Artikal (knjigovodstvo)": the accountant's article code (LagerArticle.code). */
  code?: string | null
  /**
   * 1 of our counting unit = book_factor of the accountant's unit
   * (1 bure = 20 l, 1 kesa espresa = 1 kg). Missing = 1.
   */
  book_factor?: number
  last_unit_price: number
  /** Accountant's Stanje from the latest PDF, in our unit (stanje / book_factor). */
  book_stock: number | null
}

/** An article from the accountant's "Lager lista" PDF (latest values seen). */
export interface LagerArticle {
  code: string
  name: string
  /** KG, LIT, KOM or '' as printed. */
  unit: string
  stanje: number
  cena: number
  /** Date of the PDF these values come from. */
  as_of: string
}

/** Stanje of one accountant article on one day. */
export interface LagerStock {
  date: string
  code: string
  name: string
  unit: string
  ulaz: number
  izlaz: number
  stanje: number
  cena: number
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

/** What the worker entered; `note` is the optional "what is missing" text. */
export type CountInput = MeasuredInput & { note?: string }

type MeasuredInput =
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
  order_unit: OrderUnit
  for_date: string
  /** What the worker wrote is missing (articles with ask_note). */
  note: string | null
  /** Set by hand; null/missing = automatic (see lib/payment.ts). */
  payment?: Payment | null
}

export type DeliveryStatus = 'in_progress' | 'confirmed'

/** Unos fakture: one invoice / otpremnica entered by a worker. */
export interface Delivery {
  id: string
  created_at: string
  confirmed_at: string | null
  user_id: string
  user_name: string
  supplier_id: string | null
  /** Snapshot so history keeps the name. */
  supplier_name: string | null
  note: string
  status: DeliveryStatus
  /** Naručeno vs stiglo when it was confirmed (see data/orders.ts). */
  order_check?: DeliveryCheckSnapshot | null
}

export interface DeliveryCheckSnapshot {
  count_id: string
  count_datetime: string
  lines: ArrivalLine[]
}

export type ArticleRequestStatus = 'pending' | 'approved' | 'rejected'

/** "Nema ga na spisku": a worker asks for a new article; the admin approves or rejects. */
export interface ArticleRequest {
  id: string
  created_at: string
  user_id: string
  user_name: string
  /** The faktura it arrived on (its amount is added there once approved). */
  delivery_id: string | null
  supplier_id: string | null
  name: string
  unit: string
  qty: number | null
  status: ArticleRequestStatus
  /** The article it became (new or an existing one). */
  article_id: string | null
  decided_at: string | null
}

export interface DeliveryLine {
  id: string
  delivery_id: string
  article_id: string
  article_name: string
  /** As typed by the worker, in `unit` (e.g. 2 gajba). */
  qty: number
  unit: string
  /** The same amount in the article's counting unit (e.g. 48 kom). */
  base_qty: number
  base_unit: string
  /** 'in' = stiglo, 'return' = vraćamo dobavljaču. */
  direction: DeliveryDirection
  created_at?: string
}

export type DeliveryDirection = 'in' | 'return'

/** 'invoice' = na račun (book and shelf go up), 'cash' = za keš (only the shelf). */
export type Payment = 'cash' | 'invoice'
