import { signal } from '@preact/signals'
import type { BillPage, Card, Index } from './types'

const base = import.meta.env.BASE_URL.replace(/\/$/, '')

export const index = signal<Index | null>(null)
export const indexError = signal<string | null>(null)
const pages = new Map<string, Promise<BillPage>>()

export async function loadIndex(): Promise<void> {
  if (index.value || loadingIndex) return
  loadingIndex = true
  try {
    const r = await fetch(`${base}/data/index.json`)
    if (!r.ok) throw new Error(`${r.status} loading index.json`)
    const d: Index = await r.json()
    d.bills.forEach((b, i) => { b._i = i })   // rank order decides which chunk holds the card
    index.value = d
  } catch (e) {
    indexError.value = String(e)
  } finally {
    loadingIndex = false
  }
}
let loadingIndex = false

/** Card text: the top of the ranking arrives in one file, anything else one bill at a time. */
export const cards = signal<Map<string, Card>>(new Map())
const asked = new Set<string>()
let topLoaded: Promise<void> | null = null

function loadTop(): Promise<void> {
  if (!topLoaded) {
    topLoaded = fetch(`${base}/data/cards/top.json`)
      .then(r => (r.ok ? r.json() : {}), () => ({}))
      .then((part: Record<string, Card>) => {
        const next = new Map(cards.value)
        for (const [id, c] of Object.entries(part)) { next.set(id, c); asked.add(id) }
        cards.value = next
      })
  }
  return topLoaded
}

export async function loadCards(ids: string[], anyBelowTop: boolean): Promise<void> {
  if (anyBelowTop) await loadTop()
  const todo = ids.filter(id => !asked.has(id))
  if (!todo.length) return
  todo.forEach(id => asked.add(id))
  const got = await Promise.all(todo.map(async id => {
    try {
      const r = await fetch(`${base}/data/cards/${id}.json`)
      return r.ok ? [id, (await r.json()) as Card] as const : null
    } catch { asked.delete(id); return null }
  }))
  const next = new Map(cards.value)
  for (const g of got) if (g) next.set(g[0], g[1])
  cards.value = next
}

export function loadBill(id: string): Promise<BillPage> {
  let p = pages.get(id)
  if (!p) {
    p = fetch(`${base}/data/bills/${id}.json`).then(r => {
      if (!r.ok) throw new Error(`${r.status} loading bill ${id}`)
      return r.json()
    })
    pages.set(id, p)
  }
  return p
}

export function congressYears(n: number): string {
  const start = 1789 + 2 * (n - 1)
  return `${start}–${start + 2}`
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export function fmtDate(d: string | null | undefined): string {
  if (!d || !/^\d{4}-\d{2}-\d{2}/.test(d)) return d ?? ''
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
}
