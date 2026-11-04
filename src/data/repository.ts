import { run, sb } from './supabase'
import { uuid } from '../lib/crypto'
import { needsOrder, noteOf, orderThreshold, quantityOf, round, suggestedQuantity } from '../lib/measure'
import type {
  Article,
  BookStockImport,
  Category,
  Count,
  CountInput,
  CountLine,
  OrderLine,
  OrderStatus,
  Role,
  Unit,
  User,
} from './types'

const bySortOrder = <T extends { sort_order: number; name: string }>(a: T, b: T) =>
  a.sort_order - b.sort_order || a.name.localeCompare(b.name)

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function listCategories(): Promise<Category[]> {
  const rows = await run<Category[]>(sb().from('categories').select('*'))
  return rows.sort(bySortOrder)
}

export async function upsertCategory(cat: Category): Promise<void> {
  await run(sb().from('categories').upsert(cat))
}

/** Deletes the category; its articles stay, without a category (FK on delete set null). */
export async function deleteCategory(id: string): Promise<void> {
  await run(sb().from('categories').delete().eq('id', id))
}

export async function saveCategories(cats: Category[]): Promise<void> {
  if (cats.length) await run(sb().from('categories').upsert(cats))
}

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

export async function listArticles(opts: { activeOnly?: boolean } = {}): Promise<Article[]> {
  let q = sb().from('articles').select('*')
  if (opts.activeOnly) q = q.eq('active', true)
  const rows = await run<Article[]>(q)
  return rows.sort(bySortOrder)
}

export async function upsertArticle(article: Article): Promise<void> {
  await run(sb().from('articles').upsert(article))
}

export async function saveArticles(articles: Article[]): Promise<void> {
  if (articles.length) await run(sb().from('articles').upsert(articles))
}

/** Old counts keep their lines (name/unit are snapshotted on each line). */
export async function deleteArticle(id: string): Promise<void> {
  await run(sb().from('articles').delete().eq('id', id))
}

// ---------------------------------------------------------------------------
// Users — PINs are hashed and checked inside the database (see schema.sql).
// ---------------------------------------------------------------------------

export async function listUsers(): Promise<User[]> {
  return run<User[]>(sb().rpc('app_list_users'))
}

export async function createUser(name: string, role: Role, pin: string): Promise<void> {
  await run(sb().rpc('app_save_user', { p_id: null, p_name: name, p_role: role, p_pin: pin }))
}

export async function setUserPin(id: string, pin: string): Promise<void> {
  await run(sb().rpc('app_save_user', { p_id: id, p_name: null, p_role: null, p_pin: pin }))
}

export async function setUserRole(id: string, role: Role): Promise<void> {
  await run(sb().rpc('app_save_user', { p_id: id, p_name: null, p_role: role, p_pin: null }))
}

export async function deleteUser(id: string): Promise<void> {
  await run(sb().rpc('app_delete_user', { p_id: id }))
}

// ---------------------------------------------------------------------------
// Counts
// ---------------------------------------------------------------------------

export async function listCounts(): Promise<Count[]> {
  return run<Count[]>(sb().from('counts').select('*').order('datetime', { ascending: false }))
}

export async function getCount(id: string): Promise<Count | undefined> {
  const row = await run<Count | null>(sb().from('counts').select('*').eq('id', id).maybeSingle())
  return row ?? undefined
}

export async function getLatestFinishedCount(): Promise<Count | undefined> {
  const row = await run<Count | null>(
    sb().from('counts').select('*').eq('status', 'finished')
      .order('datetime', { ascending: false }).limit(1).maybeSingle(),
  )
  return row ?? undefined
}

export async function getActiveCountForUser(userId: string): Promise<Count | undefined> {
  const row = await run<Count | null>(
    sb().from('counts').select('*').eq('status', 'in_progress').eq('user_id', userId)
      .order('datetime', { ascending: false }).limit(1).maybeSingle(),
  )
  return row ?? undefined
}

export async function createCount(user: User): Promise<Count> {
  const count: Count = {
    id: uuid(),
    datetime: new Date().toISOString(),
    finished_at: null,
    user_id: user.id,
    user_name: user.name,
    status: 'in_progress',
    note: '',
    done_categories: [],
    book_stock_as_of_date: null,
  }
  await run(sb().from('counts').insert(count))
  return count
}

export async function setCategoryDone(countId: string, categoryId: string, done: boolean): Promise<Count | undefined> {
  const count = await getCount(countId)
  if (!count) return
  const set = new Set(count.done_categories)
  if (done) set.add(categoryId)
  else set.delete(categoryId)
  const done_categories = Array.from(set)
  await run(sb().from('counts').update({ done_categories }).eq('id', countId))
  return { ...count, done_categories }
}

/** Marks the count finished and builds its order list. */
export async function finishCount(id: string): Promise<void> {
  await run(sb().from('counts').update({ status: 'finished', finished_at: new Date().toISOString() }).eq('id', id))
  await buildOrderList(id)
}

/** Lines and order lines go with it (FK on delete cascade). */
export async function deleteCount(id: string): Promise<void> {
  await run(sb().from('counts').delete().eq('id', id))
}

// ---------------------------------------------------------------------------
// Count lines
// ---------------------------------------------------------------------------

export async function listLinesForCount(countId: string): Promise<CountLine[]> {
  return run<CountLine[]>(sb().from('count_lines').select('*').eq('count_id', countId))
}

/** Create or update the entered value for an article in a count session. */
export async function saveLine(countId: string, article: Article, input: CountInput): Promise<CountLine> {
  const existing = await run<{ id: string } | null>(
    sb().from('count_lines').select('id').eq('count_id', countId).eq('article_id', article.id).maybeSingle(),
  )
  const counted = quantityOf(article, input)
  const book = article.book_stock ?? null
  const difference = book == null ? null : round(book - counted)
  const line: CountLine = {
    id: existing?.id ?? uuid(),
    count_id: countId,
    article_id: article.id,
    article_name: article.name,
    category_id: article.category_id,
    unit: article.kind === 'bottle' ? 'l' : article.kind === 'espresso' ? 'kesa' : article.unit,
    input,
    counted,
    book_stock: book,
    difference,
    unit_price: article.last_unit_price,
    difference_value: difference == null ? null : round(difference * article.last_unit_price, 2),
  }
  await run(sb().from('count_lines').upsert(line))
  return line
}

// ---------------------------------------------------------------------------
// Book-stock imports (lager lista) — will be reworked later
// ---------------------------------------------------------------------------

export async function listImports(): Promise<BookStockImport[]> {
  return run<BookStockImport[]>(sb().from('book_stock_imports').select('*').order('date', { ascending: false }))
}

export interface ImportRecord {
  code: string
  name?: string
  unit?: Unit | string
  stanje: number
  cena: number
}

export interface ApplyResult {
  matched: number
  created: number
  unmatched: ImportRecord[]
  totalChecks: { stanje: number; iznos?: number }
}

const norm = (s: string) => s.trim().toLowerCase()

/**
 * Apply a parsed lager-lista import: matches articles by code (or by name),
 * updating book_stock + last_unit_price; unknown rows become new, inactive
 * articles without a category.
 */
export async function applyBookStockImport(
  date: string,
  source: string,
  records: ImportRecord[],
  totals?: { stanje?: number; iznos?: number },
): Promise<ApplyResult> {
  const all = await listArticles()
  const byCode = new Map(all.filter((a) => a.code).map((a) => [a.code!, a]))
  const byName = new Map(all.map((a) => [norm(a.name), a]))
  let maxSort = all.reduce((m, a) => Math.max(m, a.sort_order), 0)

  const toUpsert: Article[] = []
  const unmatched: ImportRecord[] = []
  let matched = 0

  for (const r of records) {
    const existing = byCode.get(r.code) ?? (r.name ? byName.get(norm(r.name)) : undefined)
    if (existing) {
      matched++
      toUpsert.push({
        ...existing,
        code: existing.code ?? r.code,
        book_stock: round(r.stanje),
        last_unit_price: round(r.cena, 2),
      })
    } else {
      unmatched.push(r)
      toUpsert.push({
        id: uuid(),
        code: r.code,
        name: r.name?.trim() || `(nepoznato) ${r.code}`,
        category_id: null,
        kind: 'count',
        unit: normalizeUnit(r.unit),
        allow_decimal: false,
        bottle_sizes: [],
        minimum: 0,
        order_qty: 1,
        pack_size: 1,
        weekend_target: null,
        ask_note: false,
        count_weekday: null,
        order_unit: 'kom',
        active: false,
        sort_order: ++maxSort,
        last_unit_price: round(r.cena, 2),
        book_stock: round(r.stanje),
      })
    }
  }

  await saveArticles(toUpsert)
  await run(sb().from('book_stock_imports').insert({ id: uuid(), date, source, raw_ref: `records:${records.length}` }))

  return {
    matched,
    created: unmatched.length,
    unmatched,
    totalChecks: { stanje: round(records.reduce((s, r) => s + r.stanje, 0)), iznos: totals?.iznos },
  }
}

function normalizeUnit(u?: string): Unit {
  const v = (u ?? '').toLowerCase()
  if (v === 'kg') return 'kg'
  if (v === 'lit' || v === 'l') return 'l'
  return 'kom'
}

// ---------------------------------------------------------------------------
// Ordering list
// ---------------------------------------------------------------------------

export async function listOrdersForCount(countId: string): Promise<OrderLine[]> {
  return run<OrderLine[]>(sb().from('order_lines').select('*').eq('count_id', countId))
}

/** Build the ordering list: every counted article below its minimum (or "nema"). */
export async function buildOrderList(countId: string): Promise<OrderLine[]> {
  const [count, articles, lines, existing] = await Promise.all([
    getCount(countId),
    listArticles(),
    listLinesForCount(countId),
    listOrdersForCount(countId),
  ])
  if (!count) return []
  const date = new Date(count.datetime)
  const articleById = new Map(articles.map((a) => [a.id, a]))
  const prevByArticle = new Map(existing.map((o) => [o.article_id, o]))

  const toPut: OrderLine[] = []
  for (const line of lines) {
    const article = articleById.get(line.article_id)
    if (!article) continue
    if (!needsOrder(article, line.input, date)) continue
    const qty = suggestedQuantity(article, line.input, date)
    const prev = prevByArticle.get(article.id)
    toPut.push({
      id: prev?.id ?? uuid(),
      count_id: countId,
      article_id: article.id,
      article_name: line.article_name,
      category_id: line.category_id,
      unit: line.unit,
      kind: article.kind,
      counted: line.counted,
      minimum: article.kind === 'yes_no' ? 0 : orderThreshold(article, date),
      suggested_order_qty: prev?.suggested_order_qty ?? qty,
      order_unit: prev?.order_unit ?? article.order_unit,
      for_date: prev?.for_date ?? new Date().toISOString().slice(0, 10),
      order_status: prev?.order_status ?? 'pending',
      note: noteOf(line.input) || null,
    })
  }

  if (toPut.length) await run(sb().from('order_lines').upsert(toPut))
  return listOrdersForCount(countId)
}

export async function updateOrderLine(line: OrderLine): Promise<void> {
  await run(sb().from('order_lines').update({ suggested_order_qty: line.suggested_order_qty }).eq('id', line.id))
}

export async function setOrderStatus(id: string, status: OrderStatus): Promise<void> {
  await run(sb().from('order_lines').update({ order_status: status }).eq('id', id))
}
