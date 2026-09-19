import { route, href } from './router'
import { Explorer } from './pages/Explorer'
import { Bill } from './pages/Bill'
import { About } from './pages/About'

export function App() {
  const r = route.value
  return (
    <>
      <header class="site-header">
        <a class="brand" href={href.home}>
          <span class="brand-mark">Tabled</span>
          <span class="brand-tag">Bills that would have helped. What Congress did with them.</span>
        </a>
        <nav>
          <a href={href.home} class={r.page === 'home' ? 'active' : ''}>Bills</a>
          <a href={href.about} class={r.page === 'about' ? 'active' : ''}>How this works</a>
        </nav>
      </header>
      <main>
        {r.page === 'home' && <Explorer />}
        {r.page === 'bill' && <Bill id={r.id} key={r.id} />}
        {r.page === 'about' && <About />}
      </main>
      <footer class="site-footer">
        Facts come from Congress.gov, the Senate, and the House Clerk. Interpretation is model-written from those sources and every claim links back to them.
      </footer>
    </>
  )
}
