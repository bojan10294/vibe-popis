// Excel export as CSV made for Serbian Excel: ";" between columns, decimal
// comma, UTF-8 with BOM (so č/ć/š/ž/đ show right). Opens with a double click.

export type Cell = string | number | null | undefined

/** One cell: numbers with a decimal comma, text quoted when needed. */
export function csvCell(v: Cell): string {
  if (v == null) return ''
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 1000) / 1000).replace('.', ',') : ''
  return /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function toCsv(header: string[], rows: Cell[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n')
}

export function downloadCsv(filename: string, header: string[], rows: Cell[][]): void {
  const blob = new Blob(['﻿' + toCsv(header, rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** "popis-2026-11-27.csv" */
export function fileDate(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
