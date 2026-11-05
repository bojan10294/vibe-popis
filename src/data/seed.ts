import { run, sb } from './supabase'
import { uuid } from '../lib/crypto'
import type { Article, BottleSize, Category, MeasureKind, OrderUnit, Unit } from './types'

// Starting article list, taken from the paper count sheet. Inserted once into
// an empty database; after that it is maintained in the admin panel.

type Seed = {
  name: string
  kind: MeasureKind
  unit: Unit
  minimum: number
  allow_decimal?: boolean
  bottle_sizes?: BottleSize[]
  weekend_target?: number
  ask_note?: boolean
}

// Small builders so the list below reads like the paper sheet.
const kom = (name: string, minimum = 0, unit: Unit = 'kom', allow_decimal = false): Seed => ({
  name, kind: 'count', unit, minimum, allow_decimal,
})
const kg = (name: string, minimum = 0): Seed => ({ name, kind: 'weight', unit: 'kg', minimum })
const gr = (name: string, minimum = 0): Seed => ({ name, kind: 'weight', unit: 'g', minimum })
const lit = (name: string, minimum = 0): Seed => ({ name, kind: 'count', unit: 'l', minimum })
const yn = (name: string): Seed => ({ name, kind: 'yes_no', unit: 'kom', minimum: 0 })
const fl = (name: string, sizes: number[], minimum = 0): Seed => ({
  name,
  kind: 'bottle',
  unit: 'l',
  minimum,
  bottle_sizes: sizes.map((size_l) => ({ size_l, empty_weight_g: null })),
})

const LIST: { id: string; name: string; items: Seed[] }[] = [
  {
    id: 'cat-flasice',
    name: 'Flašice',
    items: [
      kom('Coca cola', 40),
      kom('Coca cola Zero', 40),
      kom('Fanta', 25),
      kom('Sprite', 25),
      kom('Bitter lemon', 25),
      kom('Tonic water', 25),
      kom('Švepsi pink'),
      kom('Ginger beer'),
      kom('Orangina', 15),
      kom('Orangina Red Orange', 15),
      kom('Jabuka', 15),
      kom('Jagoda', 15),
      kom('Breskva', 15),
      kom('Pomorandza', 15),
      kom('Sumsko voce', 15),
      kom('Fuze tea breskva', 15),
      kom('Cedevita narandza', 20),
      kom('Cedevita limun', 20),
      kom('Cedevita zova', 20),
      kom('Kvas', 15),
      kom('Red bull', 15),
      kom('Ultra', 15),
      kom('Guarana'),
      kom('Rosa', 40),
      kom('Rosa gazirana', 40),
      kom('Romerquelle', 10),
      kom('Cocta', 10),
    ],
  },
  {
    id: 'cat-pivo-vino',
    name: 'Pivo, cider i vino',
    items: [
      { ...kom('Točeno pivo – Birra Moretti (puna burad)', 1, 'bure'), weekend_target: 3 },
      kom('Heineken', 100),
      kom('Zajecarsko', 40),
      kom('Corona', 20),
      kom('Somersby jabuka', 20),
      kom('Somersby Kruska', 20),
      kom('Somersby borovnica', 20),
      kom('Somersby mango', 20),
      kom('Somersby kupina'),
      kom('Stota suza belo', 10),
      kom('Stota suza tamjanika'),
      kom('Chardonay belo', 10),
      kom('Vranac crno', 10),
      kom('Rose', 10),
      kom('Plantaze Chardonnay'),
      kom('Plantaze Rose'),
      kom('Vino crveno Plantaze'),
    ],
  },
  {
    id: 'cat-alkohol',
    name: 'Alkohol',
    items: [
      fl('Kablarska kraljica', [0.7], 2),
      fl('Dragacevka zlatna', [0.7], 2),
      fl('Dragacevka zlatna viljamovka', [0.7]),
      fl('Takovo viljamovka', [0.7]),
      fl('Meduska', [0.7], 1),
      fl('Viljamovka', [0.7], 1),
      fl('Dunja', [0.7], 1),
      fl('Kajsija', [0.7], 1),
      fl('Gorda', [0.7]),
      fl('Jack Daniels', [1], 2),
      fl('Johnie black', [0.7], 2),
      fl('Jameson', [0.7], 2),
      fl('Jim Beam', [0.7], 2),
      fl('Smirnoff', [1], 4),
      fl('Absolut vodka', [0.7]),
      fl('Grey Goose', [0.7], 0.5),
      fl('Bols vodka', [0.7]),
      fl('Bombay Sapphire', [0.7], 2),
      fl("Hendrick's", [0.7], 1),
      fl('Henkes gin', [0.7]),
      fl('Whitley Neill', [0.7]),
      fl('Beefiter', [1], 5),
      fl('Malfy rosa', [0.7], 3),
      fl('Old Pascas', [1], 5),
      fl('Olmeca', [0.7], 4),
      fl('Tekila Don Angel', [0.7]),
      fl('Bootz rum', [1]),
      fl('Jeger', [0.7], 1),
      fl('Gorki list', [1], 0.5),
      fl('Baileyes', [0.7], 0.5),
      fl('Kahlua', [1], 0.4),
      fl('Amareto', [0.7], 2),
      fl('Triple Sec', [0.7], 1),
      fl('Liker visnja', [0.7]),
      fl('Creme de cassis', [0.7]),
      fl('Absint', [0.7], 1),
      fl('Campari', [0.7], 1),
      fl('Aperol', [1], 2),
      fl('Vermut', [1], 0.5),
      fl('Cinzano roso vermut', [0.7], 1),
      fl('Angostura', [0.2]),
      fl('Prosecco', [0.75], 4),
    ],
  },
  {
    id: 'cat-topli',
    name: 'Topli napici i mleko',
    items: [
      { name: 'Espreso', kind: 'espresso', unit: 'kesa', minimum: 3 },
      kom('Domaca kafa (kesice 8g)', 0, 'kesica'),
      { ...kom('Caj'), ask_note: true },
      kom('Topla cokolada crna', 10, 'kesica'),
      kom('Topla cokolada bela', 10, 'kesica'),
      kom('Ness', 0, 'kesica'),
      gr('Matcha latte'),
      lit('Mleko', 10),
      lit('Bademovo mleko', 1),
      lit('Ovseno mleko', 1),
      kom('Slatka pavlaka', 3),
    ],
  },
  {
    id: 'cat-voce',
    name: 'Voće i povrće',
    items: [
      kg('Limun', 15),
      kg('Pomorandza', 5),
      kg('Grejp', 5),
      kg('Banana'),
      kg('Kivi'),
      kg('Belo Grozdje', 2),
      kg('Jabuka', 2),
      kg('Sargarepa', 1),
      kg('Cvekla', 1),
      kg('Djumbir', 0.2),
      kg('Ananas', 0.5),
      kom('Nana', 3),
      kom('Cvetici', 3),
    ],
  },
  {
    id: 'cat-sirupi',
    name: 'Sirupi, pirei i mikseri',
    items: [
      fl('Sirup malina', [0.7], 1),
      fl('Sirup jagoda', [0.7], 1),
      fl('Sirup breskva', [0.7], 1),
      fl('Sirup borovnica', [0.7], 1),
      fl('Sirup lubenica', [0.7], 1),
      fl('Sirup jabuka', [0.7], 1),
      fl('Sirup tropical', [0.7], 1),
      fl('Sirup mango', [0.7], 1),
      fl('Sirup zova', [0.7], 3),
      fl('Sirup lavanda', [0.7]),
      fl('Lemon tea', [0.7]),
      fl('Pire kivi', [1]),
      fl('Pire mango', [1], 2),
      fl('Pire malina', [1], 2),
      fl('Pire marakuja', [1], 2),
      fl('Pire jagoda', [1], 0.5),
      fl('Pire breskva', [1]),
      fl('Kisela voda 1.5l', [1.5], 6),
      fl('Koka kola 1.5l', [1.5], 4),
      fl('Ananas sok 1l', [1], 4),
      fl('Secerni sirup beli', [1], 1),
      fl('Secerni sirup zuti', [1], 1),
    ],
  },
  {
    id: 'cat-ovsene',
    name: 'Ovsene',
    items: [
      kg('Ovsene pahuljice'),
      kom('Grcki jogurt'),
      kg('Med'),
      kg('Cia semenke'),
      kg('Borovnice'),
      kg('Zamrznuto sumsko voce'),
      kg('Zamrznuta visnja'),
      kg('Badem'),
      kg('Orah'),
      kg('Kikiriki'),
      kg('Bela cokolada'),
      kg('Crna cokolada'),
      kom('Kinder bueno cokoladice', 0, 'kom', true),
      kg('Kikiriki puter'),
    ],
  },
  {
    id: 'cat-ostalo',
    name: 'Ostalo (whey, kremovi, dodaci)',
    items: [
      kg('Whey cokolada', 0.5),
      kg('Whey vanila', 0.5),
      kg('Whey jagoda', 0.5),
      gr('Krem pistac', 500),
      gr('Krem ferrero', 500),
      gr('Krem Kinder', 500),
      gr('Nutella', 1000),
      gr('Lesnik', 200),
      gr('Pistac', 200),
      gr('Toping', 500),
      kom('Boja', 10, 'kesica'),
      kom('Led kocke', 40),
      lit('Homemade (L)', 1),
      gr('Homemade (g)', 100),
    ],
  },
  {
    id: 'cat-kolaci',
    name: 'Kolači, sladoled i hrana',
    items: [
      kom('Pistac kolac'),
      kom('Madagaskar'),
      kom('Zlatni lesnik'),
      kom('Sumska tajna'),
      kom('Sladoled vanila'),
      kom('Sladoled cokolada'),
      kom('Sladoled jagoda'),
      kom('Sladoled pistac'),
      kom('Sladoled plazma'),
      kom('Sladoled stracetela'),
      kom('Kroasani slani'),
      kom('Kroasani slatki'),
      kom('Ovsena kasa'),
      kom('Proteinska ovsena kasa'),
    ],
  },
  {
    id: 'cat-hemija',
    name: 'Hemija i higijena',
    items: [
      yn('Ubrusi wc'),
      yn('WC papir'),
      yn('Tecni sapun'),
      yn('Ulosci'),
      yn('Dezodorans'),
      yn('Vlazne maramice'),
      yn('Krpe truleks'),
      yn('Krpe magicne'),
      yn('Ubrusi'),
      yn('Sundjeri'),
      yn('Sudomil'),
    ],
  },
  {
    id: 'cat-inventar',
    name: 'Inventar i potrošni materijal',
    items: [
      yn('Slamcice'),
      yn('Male salvete'),
      yn('Velike salvete'),
      yn('Secerici beli'),
      yn('Secerici zuti'),
      yn('Cokoladice'),
      kom('Plazma', 1, 'kesa'),
      kom('Porukice', 100),
      kom('Stipaljkice', 100),
      kom('Kasicice sve', 100),
      kom('Case kec', 50),
      kom('Case dvojka', 50),
      kom('Trake za kasu', 2),
      kom('Pena za koktele', 2),
      kom('Patroni za slag', 5),
    ],
  },
]

/**
 * Fills an empty database with the starting list (categories + articles).
 * Runs only for an admin and only when there are no categories yet, so the
 * list is never overwritten once the admin starts editing it.
 */
export async function seedIfEmpty(): Promise<boolean> {
  const existing = await run<{ id: string }[]>(sb().from('categories').select('id').limit(1))
  if (existing.length > 0) return false

  const categories: Category[] = LIST.map((cat, ci) => ({ id: cat.id, name: cat.name, sort_order: ci + 1 }))
  let order = 0
  const articles: Article[] = LIST.flatMap((cat) =>
    cat.items.map((s) => ({
      id: uuid(),
      name: s.name,
      category_id: cat.id,
      supplier_id: null,
      regular_target: null,
      kind: s.kind,
      unit: s.unit,
      allow_decimal: s.allow_decimal ?? false,
      bottle_sizes: s.bottle_sizes ?? [],
      minimum: s.minimum,
      order_qty: 1,
      pack_size: s.kind === 'bottle' ? (s.bottle_sizes?.[0]?.size_l ?? 1) : 1,
      weekend_target: s.weekend_target ?? null,
      ask_note: s.ask_note ?? false,
      count_weekday: null,
      order_unit: defaultOrderUnit(s, cat.id),
      active: true,
      sort_order: ++order,
      last_unit_price: 0,
      book_stock: null,
    })),
  )
  await run(sb().from('categories').insert(categories))
  await run(sb().from('articles').insert(articles))
  return true
}

/** Starting order unit; same rules as supabase/migrations/002_order_qty.sql. */
function defaultOrderUnit(s: Seed, categoryId: string): OrderUnit {
  if (s.kind === 'bottle') return 'flaša'
  if (s.unit === 'bure') return 'bure'
  if (s.kind === 'espresso') return 'kesa'
  if (s.kind === 'weight' && s.unit === 'kg') return 'kg'
  if (s.kind === 'count' && s.unit === 'kom' && (categoryId === 'cat-flasice' || categoryId === 'cat-pivo-vino')) return 'gajba'
  if (s.kind === 'count' && (s.unit === 'kesica' || s.unit === 'l')) return 'paket'
  return 'kom'
}
