import { signal } from '@preact/signals'

export interface Term {
  term: string
  aliases: string[]
  definition: string
  source: { name: string; title: string; url: string; excerpt: string }
}

const base = import.meta.env.BASE_URL.replace(/\/$/, '')
export const glossary = signal<Term[]>([])
/** One regex over every term and alias, longest first so "stock buyback" wins over "buyback". */
export const termPattern = signal<RegExp | null>(null)
const lookup = new Map<string, Term>()

export async function loadGlossary(): Promise<void> {
  if (glossary.value.length) return
  try {
    const r = await fetch(`${base}/data/glossary.json`)
    if (!r.ok) return
    const data = await r.json()
    const terms: Term[] = data.terms
    const forms: string[] = []
    for (const t of terms) {
      for (const f of [t.term, ...t.aliases]) {
        lookup.set(f.toLowerCase(), t)
        forms.push(f)
      }
    }
    forms.sort((a, b) => b.length - a.length)
    const esc = forms.map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'))
    termPattern.value = new RegExp(`\\b(${esc.join('|')})(?=s?\\b)`, 'gi')
    glossary.value = terms
  } catch { /* glossary is optional */ }
}

export function findTerm(text: string): Term | undefined {
  return lookup.get(text.toLowerCase().replace(/\s+/g, ' '))
}
