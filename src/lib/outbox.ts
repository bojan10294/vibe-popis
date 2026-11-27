// Popis without internet. Every entered value is kept on the phone first
// (localStorage) and sent in the background; whatever didn't go out yet stays
// here until the connection comes back. The count screen also keeps a copy of
// what it loaded (articles, categories, lines), so it can be reopened offline.

import { putLines, saveDoneCategories } from '../data/repository'
import type { Article, Category, Count, CountLine } from '../data/types'

interface Pending {
  /** Unsent lines by article id (the newest entry per article). */
  lines: Record<string, CountLine>
  /** Unsent done categories (the whole list), or null. */
  done: string[] | null
}

export interface SessionSnapshot {
  count: Count
  articles: Article[]
  categories: Category[]
  lines: CountLine[]
}

const outboxKey = (countId: string) => `popis:outbox:${countId}`
const snapshotKey = (countId: string) => `popis:session:${countId}`
const ACTIVE_KEY = 'popis:active-count'

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked: sending still works while online.
  }
}

function readPending(countId: string): Pending {
  return readJson<Pending>(outboxKey(countId)) ?? { lines: {}, done: null }
}

function writePending(countId: string, p: Pending): void {
  const empty = Object.keys(p.lines).length === 0 && p.done == null
  writeJson(outboxKey(countId), empty ? null : p)
}

export function queueLine(line: CountLine): void {
  const p = readPending(line.count_id)
  p.lines[line.article_id] = line
  writePending(line.count_id, p)
}

export function queueDone(countId: string, done: string[]): void {
  const p = readPending(countId)
  p.done = done
  writePending(countId, p)
}

export function pendingLines(countId: string): CountLine[] {
  return Object.values(readPending(countId).lines)
}

export function pendingDone(countId: string): string[] | null {
  return readPending(countId).done
}

/** How many entries are still only on this phone. */
export function pendingCount(countId: string): number {
  const p = readPending(countId)
  return Object.keys(p.lines).length + (p.done ? 1 : 0)
}

const flushing = new Map<string, Promise<boolean>>()

/** Sends what is waiting. True when nothing is left on the phone. */
export function flushOutbox(countId: string): Promise<boolean> {
  const running = flushing.get(countId)
  if (running) return running
  const job = (async () => {
    const sent = readPending(countId)
    try {
      await putLines(Object.values(sent.lines))
      if (sent.done) await saveDoneCategories(countId, sent.done)
    } catch {
      return false
    }
    // Drop only what was sent; an entry changed meanwhile stays for next time.
    const now = readPending(countId)
    for (const [articleId, line] of Object.entries(sent.lines)) {
      if (JSON.stringify(now.lines[articleId]) === JSON.stringify(line)) delete now.lines[articleId]
    }
    if (sent.done && JSON.stringify(now.done) === JSON.stringify(sent.done)) now.done = null
    writePending(countId, now)
    return pendingCount(countId) === 0
  })().finally(() => flushing.delete(countId))
  flushing.set(countId, job)
  return job
}

export function saveSnapshot(snapshot: SessionSnapshot): void {
  writeJson(snapshotKey(snapshot.count.id), snapshot)
  writeJson(ACTIVE_KEY, snapshot.count.id)
}

export function loadSnapshot(countId: string): SessionSnapshot | null {
  return readJson<SessionSnapshot>(snapshotKey(countId))
}

/** Unfinished count kept on this phone (to reopen it without internet). */
export function activeSnapshotId(): string | null {
  return readJson<string>(ACTIVE_KEY)
}

/** After the count is sent and finished: nothing of it is needed on the phone. */
export function forgetCount(countId: string): void {
  writeJson(outboxKey(countId), null)
  writeJson(snapshotKey(countId), null)
  if (activeSnapshotId() === countId) writeJson(ACTIVE_KEY, null)
}
