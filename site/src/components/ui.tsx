import type { Claim, Scores, Source, Status } from '../types'
import { CATEGORY_LABEL, DEAD, STATUS_LABEL } from '../types'

export function StatusBadge({ status }: { status: Status }) {
  const tone = DEAD.includes(status) ? 'dead' : status === 'became_law' ? 'enacted' : 'pending'
  return <span class={`badge badge-${tone}`}>{STATUS_LABEL[status]}</span>
}

export function CategoryChips({ categories }: { categories: string[] }) {
  return (
    <span class="chips">
      {categories.map(c => <span class="chip" key={c}>{CATEGORY_LABEL[c] ?? c}</span>)}
    </span>
  )
}

export function PartyBar({ counts }: { counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  if (!total) return null
  const order = ['D', 'R', 'I', 'ID', 'L', '?']
  const keys = [...new Set([...order.filter(k => counts[k]), ...Object.keys(counts)])]
  return (
    <span class="partybar" title={keys.map(k => `${k}: ${counts[k]}`).join(', ')}>
      {keys.map(k => (
        <span key={k} class={`party party-${k.toLowerCase()}`} style={{ width: `${(100 * counts[k]) / total}%` }} />
      ))}
    </span>
  )
}

export function ScoreMeter({ label, value, max = 10, hint }: { label: string; value: number; max?: number; hint?: string }) {
  return (
    <div class="meter" title={hint}>
      <span class="meter-label">{label}</span>
      <span class="meter-track"><span class="meter-fill" style={{ width: `${(100 * value) / max}%` }} /></span>
      <span class="meter-value">{value}</span>
    </div>
  )
}

export function ScoreGrid({ scores }: { scores: Scores }) {
  return (
    <div class="score-grid">
      <ScoreMeter label="Public benefit" value={scores.public_benefit} hint="How much, and how directly, ordinary people would gain" />
      <ScoreMeter label="Cost to concentrated interests" value={scores.concentrated_cost} hint="How much a specific industry, the wealthiest households, or officeholders would lose" />
      <ScoreMeter label="Buried" value={scores.burial} hint="10 = never allowed a vote despite real support; 0 = got a fair up-or-down vote" />
      <ScoreMeter label="Support vs. result" value={scores.support_mismatch} hint="Gap between apparent support and what happened" />
    </div>
  )
}

export function Cite({ ids, sources }: { ids: string[]; sources: Source[] }) {
  if (!ids.length) return null
  return (
    <sup class="cite">
      {ids.map((id, i) => {
        const s = sources.find(x => x.id === id)
        return (
          <a key={id} href={s?.url ?? `#src-${id}`} target={s ? '_blank' : undefined} rel="noreferrer" title={s?.label ?? 'source not found'} class={s ? '' : 'cite-missing'}>
            {i > 0 ? ', ' : ''}{id.replace('S', '')}
          </a>
        )
      })}
    </sup>
  )
}

export function Claims({ claims, sources }: { claims: Claim[]; sources: Source[] }) {
  return (
    <ul class="claims">
      {claims.map((c, i) => (
        <li key={i}>{c.text}<Cite ids={c.sources} sources={sources} /></li>
      ))}
    </ul>
  )
}
