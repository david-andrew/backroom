import { signal } from '@preact/signals'

export type Route = { page: 'home' } | { page: 'bill'; id: string } | { page: 'about' } | { page: 'members'; q: string } | { page: 'member'; id: string } | { page: 'prompt'; hash: string }

function parse(): Route {
  const h = location.hash.replace(/^#\/?/, '')
  if (h.startsWith('bill/')) return { page: 'bill', id: h.slice(5) }
  if (h === 'about') return { page: 'about' }
  if (h.startsWith('member/')) return { page: 'member', id: h.slice(7) }
  if (h.startsWith('prompt/')) return { page: 'prompt', hash: h.slice(7) }
  if (h.startsWith('members')) return { page: 'members', q: h.slice(7).replace(/^\?/, '') }
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
  members: '#/members',
  member: (id: string) => `#/member/${id}`,
  prompt: (hash: string) => `#/prompt/${hash}`,
}
