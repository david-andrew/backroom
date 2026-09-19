import { useEffect } from 'preact/hooks'
import { signal, computed } from '@preact/signals'
import { index, indexError, loadIndex, ordinal, congressYears } from '../data'
import { href } from '../router'
import { CATEGORY_LABEL, DEAD, PENDING, STATUS_LABEL } from '../types'
import type { IndexBill, Status } from '../types'
import { CategoryChips, PartyBar, StatusBadge } from '../components/ui'

const q = signal('')
const cat = signal<string>('')
const fate = signal<'' | 'dead' | 'pending' | 'enacted'>('')
const congress = signal<number | ''>('')
const sort = signal<'rank' | 'newest' | 'oldest' | 'support'>('rank')

const filtered = computed<IndexBill[]>(() => {
  const all = index.value?.bills ?? []
  const needle = q.value.trim().toLowerCase()
  let out = all.filter(b => {
    if (cat.value && !b.categories.includes(cat.value)) return false
    if (fate.value === 'dead' && !DEAD.includes(b.status)) return false
    if (fate.value === 'pending' && !PENDING.includes(b.status)) return false
    if (fate.value === 'enacted' && b.status !== 'became_law') return false
    if (congress.value !== '' && b.congress !== congress.value) return false
    if (needle) {
      const hay = `${b.display} ${b.title} ${b.headline} ${b.sponsors.join(' ')}`.toLowerCase()
      if (!hay.includes(needle)) return false
    }
    return true
  })
  switch (sort.value) {
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
  if (indexError.value) return <p class="error">Could not load data: {indexError.value}. Run <code>tabled build</code> first.</p>
  if (!idx) return <p class="muted">Loading…</p>

  const congresses = [...new Set(idx.bills.map(b => b.congress))].sort((a, b) => b - a)
  const cats = [...new Set(idx.bills.flatMap(b => b.categories))].sort()
  const statuses = [...new Set(idx.bills.map(b => b.status))] as Status[]
  const dead = idx.bills.filter(b => DEAD.includes(b.status)).length

  return (
    <>
      <section class="intro">
        <h1>Bills that would have helped ordinary people, and what happened to them.</h1>
        <p>
          Each entry shows who proposed the bill, who it would have helped, who would have paid, and the recorded decisions that determined its fate.
          Ranked highest are the bills with the broadest public benefit and the most concentrated cost that never got a fair vote.
          <a href={href.about}> How the ranking works.</a>
        </p>
        <p class="stats">
          <b>{idx.bills.length}</b> bills tracked · <b>{dead}</b> dead · <b>{idx.bills.length - dead}</b> pending or passed
        </p>
      </section>

      <section class="filters" aria-label="Filters">
        <input type="search" placeholder="Search title, number, sponsor…" value={q.value} onInput={e => (q.value = (e.target as HTMLInputElement).value)} />
        <select value={cat.value} onChange={e => (cat.value = (e.target as HTMLSelectElement).value)}>
          <option value="">All categories</option>
          {cats.map(c => <option value={c} key={c}>{CATEGORY_LABEL[c] ?? c}</option>)}
        </select>
        <select value={fate.value} onChange={e => (fate.value = (e.target as HTMLSelectElement).value as typeof fate.value)}>
          <option value="">Any outcome</option>
          <option value="dead">Dead</option>
          <option value="pending">Still pending</option>
          <option value="enacted">Became law</option>
        </select>
        <select value={String(congress.value)} onChange={e => { const v = (e.target as HTMLSelectElement).value; congress.value = v ? Number(v) : '' }}>
          <option value="">Any Congress</option>
          {congresses.map(c => <option value={c} key={c}>{ordinal(c)} ({congressYears(c)})</option>)}
        </select>
        <select value={sort.value} onChange={e => (sort.value = (e.target as HTMLSelectElement).value as typeof sort.value)}>
          <option value="rank">Sort: ranked</option>
          <option value="newest">Sort: newest</option>
          <option value="oldest">Sort: oldest</option>
          <option value="support">Sort: most cosponsors</option>
        </select>
      </section>

      {statuses.length > 1 && (
        <p class="legend muted">
          {statuses.map(s => <span key={s} class="legend-item"><StatusBadge status={s} /></span>)}
        </p>
      )}

      <ol class="bill-list">
        {filtered.value.map((b, i) => (
          <li key={b.id} class="bill-card">
            <a href={href.bill(b.id)} class="bill-card-link">
              <div class="bill-card-head">
                <span class="rank">#{i + 1}</span>
                <span class="bill-number">{b.display} · {ordinal(b.congress)} Congress</span>
                <StatusBadge status={b.status} />
              </div>
              <h2>{b.title}</h2>
              <p class="headline">{b.headline}</p>
              <div class="bill-card-foot">
                <CategoryChips categories={b.categories} />
                <span class="muted">{b.sponsors[0]}{b.sponsors.length > 1 ? ` +${b.sponsors.length - 1}` : ''} · {b.cosponsor_count} cosponsors <PartyBar counts={b.cosponsor_party_counts} /></span>
                <span class="score" title={`Rank score ${b.rank_score} / 10`}>{b.rank_score.toFixed(1)}</span>
              </div>
            </a>
          </li>
        ))}
      </ol>
      {filtered.value.length === 0 && <p class="muted">Nothing matches those filters.</p>}
      <p class="muted small">Data generated {new Date(idx.generated_at).toLocaleString()}. Status labels: {statuses.map(s => STATUS_LABEL[s]).join(', ')}.</p>
    </>
  )
}
