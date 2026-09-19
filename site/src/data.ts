import { signal } from '@preact/signals'
import type { BillPage, Index } from './types'

const base = import.meta.env.BASE_URL.replace(/\/$/, '')

export const index = signal<Index | null>(null)
export const indexError = signal<string | null>(null)
const pages = new Map<string, Promise<BillPage>>()

export async function loadIndex(): Promise<void> {
  if (index.value) return
  try {
    const r = await fetch(`${base}/data/index.json`)
    if (!r.ok) throw new Error(`${r.status} loading index.json`)
    index.value = await r.json()
  } catch (e) {
    indexError.value = String(e)
  }
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
