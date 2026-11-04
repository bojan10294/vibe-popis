import { useState } from 'react'
import { applyBookStockImport, listArticles, type ImportRecord } from '../../data/repository'
import { Button, Card, Input, Spinner } from '../../components/ui'
import type { Unit } from '../../data/types'

interface ParsedRow {
  code: string
  name: string
  unit: string
  stanje: number
  cena: number
}

export function ImportPage() {
  const [text, setText] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [parsed, setParsed] = useState(false)
  const [existing, setExisting] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const parse = async () => {
    const parsedRows = parseLagerText(text)
    setRows(parsedRows)
    setParsed(true)
    setResult(null)
    const arts = await listArticles()
    setExisting(new Set(arts.flatMap((a) => [a.code ?? '', a.name.trim().toLowerCase()])))
  }

  const apply = async () => {
    setApplying(true)
    const records: ImportRecord[] = rows.map((r) => ({
      code: r.code,
      name: r.name,
      unit: r.unit as Unit,
      stanje: r.stanje,
      cena: r.cena,
    }))
    const res = await applyBookStockImport(date, 'paste:lager-lista', records)
    setApplying(false)
    setResult(
      `Uvezeno: ${res.matched} postojećih ažurirano, ${res.created} novih artikala. Suma stanje: ${res.totalChecks.stanje.toFixed(3)}.`,
    )
    setParsed(false)
    setRows([])
    setText('')
  }

  const isKnown = (r: ParsedRow) => existing.has(r.code) || existing.has(r.name.trim().toLowerCase())
  const sumStanje = rows.reduce((s, r) => s + r.stanje, 0)

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Knjigovodstveno stanje (lager lista)</h1>

      <Card className="space-y-3 border-amber-200 bg-amber-50/50">
        <p className="text-sm text-amber-800">
          <strong>PDF uvoz (pdf.js)</strong> — parser je validiran na stvarnom izveštaju i radi u
          browseru; integracija je u pripremi (sledeća faza). Za sada nalepite podatke izvežene kao
          tekst/CSV (kolone: Šifra, Naziv, Jm, Ulaz, Izlaz, Stanje, Cena, Iznos).
        </p>
      </Card>

      <Card className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-600">Stanje na dan</span>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="max-w-xs" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-600">Podaci (paste)</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={'560001\tCoca cola\tKOM\t24\t6\t18\t130\t2340\n560002\t...'}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          />
        </label>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={parse} disabled={!text.trim()}>Pregledaj</Button>
          {parsed && (
            <Button onClick={apply} disabled={applying || rows.length === 0}>
              {applying ? 'Uvozim...' : `Primeni (${rows.length})`}
            </Button>
          )}
        </div>
      </Card>

      {result && <Card className="bg-green-50 text-green-800">{result}</Card>}

      {parsed && (
        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-600">Pregled: {rows.length} redova</p>
            <p className="text-sm text-slate-500">Σ Stanje: {sumStanje.toFixed(3)}</p>
          </div>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-1">Šifra</th>
                  <th className="px-2 py-1">Naziv</th>
                  <th className="px-2 py-1">Jm</th>
                  <th className="px-2 py-1 text-right">Stanje</th>
                  <th className="px-2 py-1 text-right">Cena</th>
                  <th className="px-2 py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.code} className="border-t border-slate-100">
                    <td className="px-2 py-1 font-mono">{r.code}</td>
                    <td className="px-2 py-1">{r.name}</td>
                    <td className="px-2 py-1">{r.unit}</td>
                    <td className="px-2 py-1 text-right">{r.stanje.toFixed(3)}</td>
                    <td className="px-2 py-1 text-right">{r.cena.toFixed(2)}</td>
                    <td className="px-2 py-1">
                      <span className={isKnown(r) ? 'text-green-600' : 'text-amber-600'}>
                        {isKnown(r) ? 'postoji' : 'nov'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {applying && <Spinner />}
    </div>
  )
}

/** Parse pasted lager-lista text. Accepts tab or comma delimited.
 *  Columns (full): Šifra, Naziv, Jm, Ulaz, Izlaz, Stanje, Cena, Iznos (8)
 *  or short: Šifra, Naziv, Jm, Stanje, Cena (5). */
export function parseLagerText(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const out: ParsedRow[] = []
  for (const line of lines) {
    const delim = line.includes('\t') ? '\t' : ','
    const cells = line.split(delim).map((c) => c.trim())
    if (cells.length < 5) continue
    // skip header
    const first = cells[0].toLowerCase()
    if (first === 'sifra' || first === 'šifra' || first === 'code') continue
    const code = cells[0]
    if (!/^\d{4,6}$/.test(code)) continue
    if (cells.length >= 8) {
      out.push({
        code,
        name: cells[1],
        unit: cells[2],
        stanje: num(cells[5]),
        cena: num(cells[6]),
      })
    } else {
      out.push({
        code,
        name: cells[1],
        unit: cells[2],
        stanje: num(cells[3]),
        cena: num(cells[4]),
      })
    }
  }
  return out
}

function num(s: string): number {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'))
  return Number.isNaN(n) ? 0 : n
}
