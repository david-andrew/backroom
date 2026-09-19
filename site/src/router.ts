import { signal } from '@preact/signals'

export type Route = { page: 'home' } | { page: 'bill'; id: string } | { page: 'about' }

function parse(): Route {
  const h = location.hash.replace(/^#\/?/, '')
  if (h.startsWith('bill/')) return { page: 'bill', id: h.slice(5) }
  if (h === 'about') return { page: 'about' }
  return { page: 'home' }
}

export const route = signal<Route>(parse())
addEventListener('hashchange', () => {
  route.value = parse()
  scrollTo(0, 0)
})

export const href = {
  home: '#/',
  about: '#/about',
  bill: (id: string) => `#/bill/${id}`,
}
