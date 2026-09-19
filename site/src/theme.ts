import { signal } from '@preact/signals'

export type Theme = 'light' | 'dark'
const KEY = 'tabled-theme'

function initial(): Theme {
  const stored = localStorage.getItem(KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export const theme = signal<Theme>(initial())
document.documentElement.dataset.theme = theme.value

export function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = theme.value
  localStorage.setItem(KEY, theme.value)
}
