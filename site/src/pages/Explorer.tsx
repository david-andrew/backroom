import { useEffect } from 'preact/hooks'
import { signal, computed } from '@preact/signals'
import { index, indexError, loadIndex, cards, loadCards, ordinal, congressYears } from '../data'
import { href } from '../router'
import { CATEGORY_LABEL, DEAD, PENDING } from '../types'
import type { CoreBill } from '../types'
import { CategoryChips, DirectionBadge, IndustryChips, PartyBar, PartyLineBadge, StatusBadge } from '../components/ui'
import { GilensPageChart } from '../components/Chart'

const PAGE = 50

const q = signal('')
const cat = signal<string>('')
const fate = signal<'' | 'dead' | 'pending' | 'enacted'>('')
const dir = signal<'' | 'for_working_people' | 'for_concentrated_interests'>('')
const congress = signal<number | ''>('')
const sort = signal<'rank' | 'corruption' | 'newest' | 'oldest' | 'support'>('rank')
const showAll = signal(false)
const shown = signal(PAGE)

// Any filter change starts the list over at the top.
const resetPage = () => { shown.value = PAGE }

const filtered = computed<CoreBill[]>(() => {
  const idx = index.value
  if (!idx) return []
  const catIx = cat.value ? idx.categories.indexOf(cat.value) : -1
  const needle = q.value.trim().toLowerCase()
  let out = idx.bills.filter(b => {
    if (!showAll.value && b.p === 0) return false
    if (catIx >= 0 && !b.ct.includes(catIx)) return false
    if (fate.value === 'dead' && !DEAD.includes(b.st)) return false
    if (fate.value === 'pending' && !PENDING.includes(b.st)) return false
    if (fate.value === 'enacted' && b.st !== 'became_law') return false
    if (dir.value && b.d !== dir.value) return false
    if (congress.value !== '' && b.c !== congress.value) return false
    if (needle && !`${b.dp} ${b.t} ${b.sp}`.toLowerCase().includes(needle)) return false
    return true
  })
  switch (sort.value) {
    case 'corruption': out = [...out].sort((a, b) => b.cr - a.cr || b.r - a.r); break
    case 'newest': out = [...out].sort((a, b) => (b.dt ?? '').localeCompare(a.dt ?? '')); break
    case 'oldest': out = [...out].sort((a, b) => (a.dt ?? '').localeCompare(b.dt ?? '')); break
    case 'support': out = [...out].sort((a, b) => b.cc - a.cc); break
    default: break   // the index already arrives in rank order
  }
  return out
})

const visible = computed<CoreBill[]>(() => filtered.value.slice(0, shown.value))

export function Explorer() {
  useEffect(() => { loadIndex() }, [])
  const idx = index.value
  // Fetch card text for the rows on screen: one file for the top of the ranking, otherwise per bill.
  useEffect(() => {
    const top = idx?.top ?? 500
    const rows = visible.value
    if (!rows.length) return
    const inTop = rows.some(b => (b._i ?? 0) < top)
    loadCards(rows.filter(b => (b._i ?? 0) >= top).map(b => b.id), inTop)
  }, [idx, visible.value])

  if (indexError.value) return <p class="error">Could not load data: {indexError.value}. Run <code>backroom build</code> first.</p>
  if (!idx) return <p class="muted">Loading…</p>

  const congresses = [...new Set(idx.bills.map(b => b.c))].sort((a, b) => b - a)
  const dead = idx.bills.filter(b => DEAD.includes(b.st)).length
  const law = idx.bills.filter(b => b.st === 'became_law').length
  const sel = (e: Event) => (e.target as HTMLSelectElement).value
  const total = filtered.value.length

  return (
    <>
      <section class="intro">
        <h1>Whose interests is Congress looking out for?</h1>
        <GilensPageChart />
        <p>
          Each entry below is one case: what a bill does, who gains, who pays, what Congress did with it, and who came out ahead. Every claim links to the record.
          <a href={href.about}> How the ranking works.</a>
        </p>
        <p class="stats">
          <b>{idx.bills.length}</b> bills · <b>{dead}</b> died · <b>{law}</b> became law · <b>{idx.bills.length - dead - law}</b> pending
        </p>
      </section>

      <section class="filters" aria-label="Filters">
        <input type="search" placeholder="Search title, number, sponsor…" value={q.value} onInput={e => { q.value = (e.target as HTMLInputElement).value; resetPage() }} />
        <select value={dir.value} onChange={e => { dir.value = sel(e) as typeof dir.value; resetPage() }}>
          <option value="">Serves anyone</option>
          <option value="for_working_people">Serves working people</option>
          <option value="for_concentrated_interests">Serves concentrated interests</option>
        </select>
        <select value={cat.value} onChange={e => { cat.value = sel(e); resetPage() }}>
          <option value="">All categories</option>
          {idx.categories.map(c => <option value={c} key={c}>{CATEGORY_LABEL[c] ?? c}</option>)}
        </select>
        <select value={fate.value} onChange={e => { fate.value = sel(e) as typeof fate.value; resetPage() }}>
          <option value="">Any outcome</option>
          <option value="dead">Died</option>
          <option value="pending">Still pending</option>
          <option value="enacted">Became law</option>
        </select>
        <select value={String(congress.value)} onChange={e => { const v = sel(e); congress.value = v ? Number(v) : ''; resetPage() }}>
          <option value="">Any Congress</option>
          {congresses.map(c => <option value={c} key={c}>{ordinal(c)} ({congressYears(c)})</option>)}
        </select>
        <select value={sort.value} onChange={e => { sort.value = sel(e) as typeof sort.value; resetPage() }}>
          <option value="rank">Sort: overall</option>
          <option value="corruption">Sort: corruption relevance</option>
          <option value="newest">Sort: newest</option>
          <option value="oldest">Sort: oldest</option>
          <option value="support">Sort: most cosponsors</option>
        </select>
        <label class="check"><input type="checkbox" checked={showAll.value} onChange={e => { showAll.value = (e.target as HTMLInputElement).checked; resetPage() }} /> show House and Senate versions separately</label>
      </section>

      <p class="muted small count">{total.toLocaleString()} bill{total === 1 ? '' : 's'} match{total === 1 ? 'es' : ''}.</p>

      <ol class="bill-list">
        {visible.value.map((b, i) => <BillCard b={b} n={i + 1} key={b.id} />)}
      </ol>
      {total === 0 && <p class="muted">Nothing matches those filters.</p>}
      {shown.value < total && (
        <p class="more"><button class="btn" onClick={() => (shown.value += PAGE)}>Show {Math.min(PAGE, total - shown.value)} more</button></p>
      )}
      <p class="muted small">Data generated {new Date(idx.generated_at).toLocaleString()}.</p>
    </>
  )
}

function BillCard({ b, n }: { b: CoreBill; n: number }) {
  const c = cards.value.get(b.id)
  const cats = (index.value?.categories ?? [])
  return (
    <li class={`bill-card dir-${b.d}`}>
      <a href={href.bill(b.id)} class="bill-card-link">
        <div class="bill-card-head">
          <span class="rank">#{n}</span>
          <span class="bill-number">{b.dp} · {ordinal(b.c)} Congress</span>
          <DirectionBadge direction={b.d} />
        </div>
        <h2>{b.t}</h2>
        {c ? (
          <>
            <p class="one-liner">{c.ol}</p>
            <p class="headline"><StatusBadge status={b.st} /> {c.hl}</p>
            {c.comp.length > 0 && <p class="companions muted small">Also introduced as {c.comp.join(', ')}</p>}
            <dl class="card-facts">
              <div><dt>{b.d === 'for_concentrated_interests' ? 'Serves' : 'Would help'}</dt><dd>{c.wb}</dd></div>
              <div><dt>Would cost</dt><dd>{c.wp}</dd></div>
              <div><dt>Came out ahead</dt><dd>{c.wa}</dd></div>
            </dl>
            <IndustryChips items={c.ind.map(([industry, effect, stance]) => ({ industry, effect, stance }))} />
          </>
        ) : (
          <p class="headline"><StatusBadge status={b.st} /> <span class="skeleton" aria-hidden="true" /></p>
        )}
        <div class="bill-card-foot">
          <PartyLineBadge value={b.pl} />
          <CategoryChips categories={b.ct.map(i => cats[i]).filter(Boolean)} />
          <span class="muted">{b.sp} · {b.cc} cosponsors {c && <PartyBar counts={c.cpc} />}</span>
        </div>
      </a>
    </li>
  )
}
