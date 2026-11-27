import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CountLine } from '../data/types'

// Sending is mocked: `online` decides whether it works.
let online = true
const sent: CountLine[][] = []
vi.mock('../data/repository', () => ({
  putLines: async (lines: CountLine[]) => {
    if (!online) throw new Error('offline')
    sent.push(lines)
  },
  saveDoneCategories: async () => {
    if (!online) throw new Error('offline')
  },
}))

const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
})

const { flushOutbox, forgetCount, pendingCount, pendingLines, queueDone, queueLine } = await import('./outbox')

const line = (article_id: string, counted: number): CountLine => ({
  id: article_id,
  count_id: 'k1',
  article_id,
  article_name: article_id,
  category_id: null,
  unit: 'kom',
  input: { kind: 'count', value: counted },
  counted,
  book_stock: null,
  difference: null,
  unit_price: 0,
  difference_value: null,
})

describe('popis without internet', () => {
  beforeEach(() => {
    store.clear()
    sent.length = 0
    online = true
  })

  it('keeps everything on the phone while offline, newest entry per article', async () => {
    online = false
    queueLine(line('a', 3))
    queueLine(line('a', 4))
    queueLine(line('b', 1))
    queueDone('k1', ['cat-1'])
    expect(await flushOutbox('k1')).toBe(false)
    expect(pendingCount('k1')).toBe(3)
    expect(pendingLines('k1').find((l) => l.article_id === 'a')!.counted).toBe(4)
  })

  it('sends it all once back online and clears the phone', async () => {
    online = false
    queueLine(line('a', 3))
    await flushOutbox('k1')
    online = true
    expect(await flushOutbox('k1')).toBe(true)
    expect(sent.flat().map((l) => l.counted)).toEqual([3])
    expect(pendingCount('k1')).toBe(0)
  })

  it('forgets a finished count', () => {
    queueLine(line('a', 1))
    forgetCount('k1')
    expect(pendingCount('k1')).toBe(0)
  })
})
