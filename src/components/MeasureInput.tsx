import { useState } from 'react'
import type { Article, CountInput } from '../data/types'
import { formatNum, formatSize, quantityOf, sizeKey } from '../lib/measure'
import { Button } from './ui'

function parse(raw: string): number | null {
  const v = raw.trim().replace(',', '.')
  if (v === '') return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

function clean(raw: string, decimal: boolean): string {
  const v = raw.replace(',', '.')
  return decimal ? v.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1') : v.replace(/[^\d]/g, '')
}

function NumberField({
  label,
  value,
  onChange,
  decimal,
  suffix,
  autoFocus,
  onEnter,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  decimal: boolean
  suffix?: string
  autoFocus?: boolean
  onEnter?: () => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => onChange(clean(e.target.value, decimal))}
          onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
          inputMode={decimal ? 'decimal' : 'numeric'}
          autoFocus={autoFocus}
          placeholder="0"
          className="w-full rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-right text-2xl font-semibold outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
        />
        {suffix && <span className="w-16 shrink-0 text-base text-slate-500">{suffix}</span>}
      </div>
    </label>
  )
}

/**
 * Entry form for one article, shaped by its measure kind.
 * Calls onSubmit with a complete input; the parent saves and moves on.
 */
export function MeasureInput({
  article,
  initial,
  submitLabel,
  onSubmit,
}: {
  article: Article
  initial: CountInput | null
  submitLabel: string
  onSubmit: (input: CountInput) => void
}) {
  switch (article.kind) {
    case 'yes_no':
      return <YesNoInput initial={initial} onSubmit={onSubmit} />
    case 'bottle':
      return <BottleInput article={article} initial={initial} submitLabel={submitLabel} onSubmit={onSubmit} />
    case 'espresso':
      return <EspressoInput initial={initial} submitLabel={submitLabel} onSubmit={onSubmit} />
    default:
      return <SimpleInput article={article} initial={initial} submitLabel={submitLabel} onSubmit={onSubmit} />
  }
}

function SimpleInput({
  article,
  initial,
  submitLabel,
  onSubmit,
}: {
  article: Article
  initial: CountInput | null
  submitLabel: string
  onSubmit: (input: CountInput) => void
}) {
  const start = initial && (initial.kind === 'count' || initial.kind === 'weight') ? String(initial.value) : ''
  const [raw, setRaw] = useState(start)
  const decimal = article.kind === 'weight' || article.allow_decimal || article.unit === 'l'
  const value = parse(raw)
  const step = article.allow_decimal ? 0.5 : 1

  const submit = () => {
    if (value == null) return
    onSubmit(article.kind === 'weight' ? { kind: 'weight', value } : { kind: 'count', value })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        {article.kind === 'count' && (
          <button
            type="button"
            onClick={() => setRaw(String(Math.max(0, (value ?? 0) - step)))}
            className="h-[60px] w-14 shrink-0 rounded-xl border-2 border-slate-200 bg-white text-2xl text-slate-600"
          >
            −
          </button>
        )}
        <div className="flex-1">
          <NumberField
            label="Količina"
            value={raw}
            onChange={setRaw}
            decimal={decimal}
            suffix={article.unit}
            autoFocus
            onEnter={submit}
          />
        </div>
        {article.kind === 'count' && (
          <button
            type="button"
            onClick={() => setRaw(String((value ?? 0) + step))}
            className="h-[60px] w-14 shrink-0 rounded-xl border-2 border-slate-200 bg-white text-2xl text-slate-600"
          >
            +
          </button>
        )}
      </div>
      <Button onClick={submit} disabled={value == null} className="w-full py-4 text-lg">
        {submitLabel}
      </Button>
    </div>
  )
}

function YesNoInput({
  initial,
  onSubmit,
}: {
  initial: CountInput | null
  onSubmit: (input: CountInput) => void
}) {
  const current = initial?.kind === 'yes_no' ? initial.has : null
  const base = 'flex-1 rounded-2xl py-8 text-2xl font-bold transition-colors'
  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={() => onSubmit({ kind: 'yes_no', has: true })}
        className={`${base} ${current === true ? 'bg-green-600 text-white' : 'bg-green-100 text-green-800 hover:bg-green-200'}`}
      >
        Ima
      </button>
      <button
        type="button"
        onClick={() => onSubmit({ kind: 'yes_no', has: false })}
        className={`${base} ${current === false ? 'bg-red-600 text-white' : 'bg-red-100 text-red-800 hover:bg-red-200'}`}
      >
        Nema
      </button>
    </div>
  )
}

function BottleInput({
  article,
  initial,
  submitLabel,
  onSubmit,
}: {
  article: Article
  initial: CountInput | null
  submitLabel: string
  onSubmit: (input: CountInput) => void
}) {
  const init = initial?.kind === 'bottle' ? initial : null
  const toStr = (rec: Record<string, number> | undefined) =>
    Object.fromEntries(article.bottle_sizes.map((s) => {
      const v = rec?.[sizeKey(s.size_l)]
      return [sizeKey(s.size_l), v == null ? '' : String(v)]
    }))
  const [full, setFull] = useState<Record<string, string>>(toStr(init?.full))
  const [opened, setOpened] = useState<Record<string, string>>(toStr(init?.opened_g))

  if (article.bottle_sizes.length === 0) {
    return (
      <p className="rounded-xl bg-amber-50 p-4 text-amber-800">
        Za ovaj artikal nisu podešene veličine flaša. Admin treba da ih doda u Artiklima.
      </p>
    )
  }

  const anyFilled = [...Object.values(full), ...Object.values(opened)].some((v) => v.trim() !== '')
  const toNum = (rec: Record<string, string>) =>
    Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, parse(v) ?? 0]))
  const input: CountInput = { kind: 'bottle', full: toNum(full), opened_g: toNum(opened) }
  const total = quantityOf(article, input)
  const missingTare = article.bottle_sizes.some(
    (s) => s.empty_weight_g == null && (parse(opened[sizeKey(s.size_l)] ?? '') ?? 0) > 0,
  )
  const submit = () => anyFilled && onSubmit(input)

  return (
    <div className="space-y-4">
      {article.bottle_sizes.map((s, i) => {
        const k = sizeKey(s.size_l)
        return (
          <div key={k} className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <NumberField
              label={`Pune ${formatSize(s.size_l)}`}
              value={full[k] ?? ''}
              onChange={(v) => setFull((p) => ({ ...p, [k]: v }))}
              decimal={false}
              autoFocus={i === 0}
            />
            <NumberField
              label={`Načeta ${formatSize(s.size_l)} (g)`}
              value={opened[k] ?? ''}
              onChange={(v) => setOpened((p) => ({ ...p, [k]: v }))}
              decimal={false}
              onEnter={i === article.bottle_sizes.length - 1 ? submit : undefined}
            />
          </div>
        )
      })}
      <p className="text-center text-slate-600">
        Ukupno: <strong className="text-xl text-slate-800">{formatNum(total)} l</strong>
      </p>
      {missingTare && (
        <p className="text-center text-xs text-amber-700">
          Težina prazne flaše nije uneta u adminu — računa se bez oduzimanja.
        </p>
      )}
      <p className="text-center text-xs text-slate-400">Prazno polje se računa kao 0.</p>
      <Button onClick={submit} disabled={!anyFilled} className="w-full py-4 text-lg">
        {submitLabel}
      </Button>
    </div>
  )
}

function EspressoInput({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial: CountInput | null
  submitLabel: string
  onSubmit: (input: CountInput) => void
}) {
  const init = initial?.kind === 'espresso' ? initial : null
  const [counter, setCounter] = useState(init ? String(init.machine_counter) : '')
  const [bags, setBags] = useState(init ? String(init.bags) : '')
  const c = parse(counter)
  const b = parse(bags)
  const submit = () => {
    if (c == null || b == null) return
    onSubmit({ kind: 'espresso', machine_counter: c, bags: b })
  }
  return (
    <div className="space-y-4">
      <NumberField label="Broj na aparatu" value={counter} onChange={setCounter} decimal={false} autoFocus />
      <NumberField label="Pune kese (kg)" value={bags} onChange={setBags} decimal suffix="kesa" onEnter={submit} />
      <Button onClick={submit} disabled={c == null || b == null} className="w-full py-4 text-lg">
        {submitLabel}
      </Button>
    </div>
  )
}
