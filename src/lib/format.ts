export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('sr-RS', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Lowercase without Serbian diacritics, so "cokolada" finds "Čokolada". */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** Every word of the query appears somewhere in the text (any order, no diacritics). */
export function matchesQuery(text: string, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean)
  const hay = fold(text)
  return words.every((w) => hay.includes(w))
}
