import { route, href } from './router'
import { theme, toggleTheme } from './theme'
import { Explorer } from './pages/Explorer'
import { Bill } from './pages/Bill'
import { About } from './pages/About'
import { Members } from './pages/Members'
import { MemberPage } from './pages/Member'
import { PromptPage } from './pages/Prompt'

export function App() {
  const r = route.value
  const dark = theme.value === 'dark'
  return (
    <>
      <header class="site-header">
        <a class="brand" href={href.home}><span class="brand-mark">Backroom</span></a>
        <nav>
          <a href={href.home} class={r.page === 'home' ? 'active' : ''}>Bills</a>
          <a href={href.members} class={r.page === 'members' || r.page === 'member' ? 'active' : ''}>Your representatives</a>
          <a href={href.about} class={r.page === 'about' ? 'active' : ''}>How this works</a>
          <button class="theme-toggle" onClick={toggleTheme} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'}>
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
        </nav>
      </header>
      <main>
        {r.page === 'home' && <Explorer />}
        {r.page === 'bill' && <Bill id={r.id} key={r.id} />}
        {r.page === 'about' && <About />}
        {r.page === 'members' && <Members />}
        {r.page === 'member' && <MemberPage id={r.id} key={r.id} />}
        {r.page === 'prompt' && <PromptPage hash={r.hash} key={r.hash} />}
      </main>
      <footer class="site-footer">
        Facts come from Congress.gov, the Senate, and the House Clerk. Interpretation is model-written from those sources and every claim links back to them.
      </footer>
    </>
  )
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}
