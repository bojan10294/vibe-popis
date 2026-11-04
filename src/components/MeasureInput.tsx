import { useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import type { Article, CountInput } from '../data/types'
import { formatNum, formatSize, quantityOf, round, sizeKey } from '../lib/measure'
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
          className="w-full rounded-xl border-2 border-slate-300 bg-surface px-4 py-3 text-right text-2xl font-semibold outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
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
  const [note, setNote] = useState(initial?.note ?? '')
  const noteRef = useRef<HTMLInputElement>(null)
  const submitRef = useRef<(() => void) | null>(null)

  // Attach the "what is missing" note (only for articles that ask for it).
  const submit = (input: CountInput) =>
    onSubmit({ ...input, note: article.ask_note && note.trim() ? note.trim() : undefined })

  const slot: Slot = article.ask_note
    ? {
        extra: (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-600">Treba da se poruči:</span>
            <input
              ref={noteRef}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitRef.current?.()}
              placeholder="npr. zeleni, kamilica — prazno ako ništa ne fali"
              className="w-full rounded-xl border-2 border-slate-300 bg-surface px-4 py-3 text-base text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            />
          </label>
        ),
        // Enter in the number moves on to the note instead of skipping it.
        onEnter: () => noteRef.current?.focus(),
        submitRef,
      }
    : {}

  switch (article.kind) {
    case 'yes_no':
      return <YesNoInput initial={initial} onSubmit={submit} {...slot} />
    case 'bottle':
      return <BottleInput article={article} initial={initial} submitLabel={submitLabel} onSubmit={submit} {...slot} />
    case 'espresso':
      return <EspressoInput initial={initial} submitLabel={submitLabel} onSubmit={submit} {...slot} />
    default:
      return <SimpleInput article={article} initial={initial} submitLabel={submitLabel} onSubmit={submit} {...slot} />
  }
}

/** Optional extras the wrapper passes to every input. */
interface Slot {
  /** Rendered just above the submit button (the "what is missing" field). */
  extra?: ReactNode
  /** Enter in the number fields; defaults to submitting. */
  onEnter?: () => void
  /** Filled with the input's submit, so the note field can submit on Enter. */
  submitRef?: MutableRefObject<(() => void) | null>
}

function SimpleInput({
  article,
  initial,
  submitLabel,
  onSubmit,
  extra,
  onEnter,
  submitRef,
}: {
  article: Article
  initial: CountInput | null
  submitLabel: string
  onSubmit: (input: CountInput) => void
} & Slot) {
  const start = initial && (initial.kind === 'count' || initial.kind === 'weight') ? String(initial.value) : ''
  const [raw, setRaw] = useState(start)
  const decimal = article.kind === 'weight' || article.allow_decimal || article.unit === 'l'
  const value = parse(raw)
  const step = article.allow_decimal ? 0.5 : 1

  // 1070 kg / 750 l is almost certainly grams / ml: ask before saving.
  const smallUnit = article.unit === 'kg' ? 'g' : article.unit === 'l' ? 'ml' : null
  const suspicious = smallUnit != null && value != null && value >= 100
  const [asking, setAsking] = useState(false)

  const save = (v: number) =>
    onSubmit(article.kind === 'weight' ? { kind: 'weight', value: v } : { kind: 'count', value: v })

  const submit = () => {
    if (value == null) return
    if (suspicious && !asking) {
      setAsking(true)
      return
    }
    if (!asking) save(value)
  }
  if (submitRef) submitRef.current = submit

  const changeRaw = (v: string) => {
    setAsking(false)
    setRaw(v)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        {article.kind === 'count' && (
          <button
            type="button"
            onClick={() => changeRaw(String(Math.max(0, (value ?? 0) - step)))}
            className="h-[60px] w-14 shrink-0 rounded-xl border-2 border-slate-200 bg-surface text-2xl text-slate-600"
          >
            −
          </button>
        )}
        <div className="flex-1">
          <NumberField
            label="Količina"
            value={raw}
            onChange={changeRaw}
            decimal={decimal}
            suffix={article.unit}
            autoFocus
            onEnter={onEnter ?? submit}
          />
        </div>
        {article.kind === 'count' && (
          <button
            type="button"
            onClick={() => changeRaw(String((value ?? 0) + step))}
            className="h-[60px] w-14 shrink-0 rounded-xl border-2 border-slate-200 bg-surface text-2xl text-slate-600"
          >
            +
          </button>
        )}
      </div>
      {extra}
      {asking && value != null && smallUnit ? (
        <div className="space-y-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
          <p className="font-semibold text-amber-900">
            {formatNum(value)} {article.unit} je mnogo. Da li ste mislili{' '}
            <strong>{formatNum(value / 1000)} {article.unit}</strong> ({formatNum(value)} {smallUnit})?
          </p>
          <Button
            onClick={() => {
              setRaw(String(round(value / 1000)))
              save(round(value / 1000))
            }}
            className="w-full py-4 text-lg"
          >
            Da, {formatNum(value / 1000)} {article.unit}
          </Button>
          <Button variant="ghost" onClick={() => save(value)} className="w-full">
            Ne, baš {formatNum(value)} {article.unit}
          </Button>
        </div>
      ) : (
        <Button onClick={submit} disabled={value == null} className="w-full py-4 text-lg">
          {submitLabel}
        </Button>
      )}
    </div>
  )
}

function YesNoInput({
  initial,
  onSubmit,
  extra,
}: {
  initial: CountInput | null
  onSubmit: (input: CountInput) => void
} & Slot) {
  const current = initial?.kind === 'yes_no' ? initial.has : null
  const base = 'flex-1 rounded-2xl py-8 text-2xl font-bold transition-colors'
  return (
    <div className="space-y-4">
    {extra}
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
    </div>
  )
}

function BottleInput({
  article,
  initial,
  submitLabel,
  onSubmit,
  extra,
  onEnter,
  submitRef,
}: {
  article: Article
  initial: CountInput | null
  submitLabel: string
  onSubmit: (input: CountInput) => void
} & Slot) {
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
  if (submitRef) submitRef.current = submit

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
              onEnter={onEnter ?? submit}
            />
            <NumberField
              label={`Načeta ${formatSize(s.size_l)} (g)`}
              value={opened[k] ?? ''}
              onChange={(v) => setOpened((p) => ({ ...p, [k]: v }))}
              decimal={false}
              onEnter={onEnter ?? submit}
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
      {extra}
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
  extra,
  onEnter,
  submitRef,
}: {
  initial: CountInput | null
  submitLabel: string
  onSubmit: (input: CountInput) => void
} & Slot) {
  const init = initial?.kind === 'espresso' ? initial : null
  const [counter, setCounter] = useState(init ? String(init.machine_counter) : '')
  const [bags, setBags] = useState(init ? String(init.bags) : '')
  const c = parse(counter)
  const b = parse(bags)
  const submit = () => {
    if (c == null || b == null) return
    onSubmit({ kind: 'espresso', machine_counter: c, bags: b })
  }
  if (submitRef) submitRef.current = submit
  return (
    <div className="space-y-4">
      <NumberField label="Broj na aparatu" value={counter} onChange={setCounter} decimal={false} autoFocus onEnter={onEnter ?? submit} />
      <NumberField label="Pune kese (kg)" value={bags} onChange={setBags} decimal suffix="kesa" onEnter={onEnter ?? submit} />
      {extra}
      <Button onClick={submit} disabled={c == null || b == null} className="w-full py-4 text-lg">
        {submitLabel}
      </Button>
    </div>
  )
}
