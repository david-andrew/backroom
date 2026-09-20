import { useEffect } from 'preact/hooks'
import { signal, computed } from '@preact/signals'
import { index, indexError, loadIndex, ordinal, congressYears } from '../data'
import { href } from '../router'
import { CATEGORY_LABEL, DEAD, PENDING } from '../types'
import type { IndexBill } from '../types'
import { CategoryChips, DirectionBadge, IndustryChips, PartyBar, PartyLineBadge, StatusBadge } from '../components/ui'
import { GilensPageChart } from '../components/Chart'

const q = signal('')
const cat = signal<string>('')
const fate = signal<'' | 'dead' | 'pending' | 'enacted'>('')
const dir = signal<'' | 'for_working_people' | 'for_concentrated_interests'>('')
const congress = signal<number | ''>('')
const sort = signal<'rank' | 'corruption' | 'newest' | 'oldest' | 'support'>('rank')

const filtered = computed<IndexBill[]>(() => {
  const all = index.value?.bills ?? []
  const needle = q.value.trim().toLowerCase()
  let out = all.filter(b => {
    if (cat.value && !b.categories.includes(cat.value)) return false
    if (fate.value === 'dead' && !DEAD.includes(b.status)) return false
    if (fate.value === 'pending' && !PENDING.includes(b.status)) return false
    if (fate.value === 'enacted' && b.status !== 'became_law') return false
    if (dir.value && b.direction !== dir.value) return false
    if (congress.value !== '' && b.congress !== congress.value) return false
    if (needle) {
      const hay = `${b.display} ${b.title} ${b.one_liner} ${b.headline} ${b.sponsors.join(' ')}`.toLowerCase()
      if (!hay.includes(needle)) return false
    }
    return true
  })
  switch (sort.value) {
    case 'corruption': out = [...out].sort((a, b) => b.scores.corruption_relevance - a.scores.corruption_relevance || b.rank_score - a.rank_score); break
    case 'newest': out = [...out].sort((a, b) => (b.introduced ?? '').localeCompare(a.introduced ?? '')); break
    case 'oldest': out = [...out].sort((a, b) => (a.introduced ?? '').localeCompare(b.introduced ?? '')); break
    case 'support': out = [...out].sort((a, b) => b.cosponsor_count - a.cosponsor_count); break
    default: out = [...out].sort((a, b) => b.rank_score - a.rank_score)
  }
  return out
})

export function Explorer() {
  useEffect(() => { loadIndex() }, [])
  const idx = index.value
  if (indexError.value) return <p class="error">Could not load data: {indexError.value}. Run <code>backroom build</code> first.</p>
  if (!idx) return <p class="muted">Loading…</p>

  const congresses = [...new Set(idx.bills.map(b => b.congress))].sort((a, b) => b - a)
  const cats = [...new Set(idx.bills.flatMap(b => b.categories))].sort()
  const dead = idx.bills.filter(b => DEAD.includes(b.status)).length
  const law = idx.bills.filter(b => b.status === 'became_law').length
  const sel = (e: Event) => (e.target as HTMLSelectElement).value

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
        <input type="search" placeholder="Search title, number, sponsor…" value={q.value} onInput={e => (q.value = (e.target as HTMLInputElement).value)} />
        <select value={dir.value} onChange={e => (dir.value = sel(e) as typeof dir.value)}>
          <option value="">Serves anyone</option>
          <option value="for_working_people">Serves working people</option>
          <option value="for_concentrated_interests">Serves concentrated interests</option>
        </select>
        <select value={cat.value} onChange={e => (cat.value = sel(e))}>
          <option value="">All categories</option>
          {cats.map(c => <option value={c} key={c}>{CATEGORY_LABEL[c] ?? c}</option>)}
        </select>
        <select value={fate.value} onChange={e => (fate.value = sel(e) as typeof fate.value)}>
          <option value="">Any outcome</option>
          <option value="dead">Died</option>
          <option value="pending">Still pending</option>
          <option value="enacted">Became law</option>
        </select>
        <select value={String(congress.value)} onChange={e => { const v = sel(e); congress.value = v ? Number(v) : '' }}>
          <option value="">Any Congress</option>
          {congresses.map(c => <option value={c} key={c}>{ordinal(c)} ({congressYears(c)})</option>)}
        </select>
        <select value={sort.value} onChange={e => (sort.value = sel(e) as typeof sort.value)}>
          <option value="rank">Sort: overall</option>
          <option value="corruption">Sort: corruption relevance</option>
          <option value="newest">Sort: newest</option>
          <option value="oldest">Sort: oldest</option>
          <option value="support">Sort: most cosponsors</option>
        </select>
      </section>

      <ol class="bill-list">
        {filtered.value.map((b, i) => (
          <li key={b.id} class={`bill-card dir-${b.direction}`}>
            <a href={href.bill(b.id)} class="bill-card-link">
              <div class="bill-card-head">
                <span class="rank">#{i + 1}</span>
                <span class="bill-number">{b.display} · {ordinal(b.congress)} Congress</span>
                <DirectionBadge direction={b.direction} />
              </div>
              <h2>{b.title}</h2>
              <p class="one-liner">{b.one_liner}</p>
              <p class="headline"><StatusBadge status={b.status} /> {b.headline}</p>
              <dl class="card-facts">
                <div><dt>{b.direction === 'for_concentrated_interests' ? 'Serves' : 'Would help'}</dt><dd>{b.who_benefits_short}</dd></div>
                <div><dt>Would cost</dt><dd>{b.who_pays_short}</dd></div>
                <div><dt>Came out ahead</dt><dd>{b.who_came_out_ahead_short}</dd></div>
              </dl>
              <IndustryChips items={b.industries ?? []} />
              <div class="bill-card-foot">
                <PartyLineBadge value={b.party_line} />
                <CategoryChips categories={b.categories} />
                <span class="muted">{b.sponsors[0]}{b.sponsors.length > 1 ? ` +${b.sponsors.length - 1}` : ''} · {b.cosponsor_count} cosponsors <PartyBar counts={b.cosponsor_party_counts} /></span>
              </div>
            </a>
          </li>
        ))}
      </ol>
      {filtered.value.length === 0 && <p class="muted">Nothing matches those filters.</p>}
      <p class="muted small">Data generated {new Date(idx.generated_at).toLocaleString()}.</p>
    </>
  )
}
