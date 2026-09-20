import type { Actor, Claim, Direction, PartyLine, Scores, Sides, Source, Status, Vote } from '../types'
import { findTerm, termPattern } from '../glossary'
import { Term } from './Term'
import { CATEGORY_LABEL, DEAD, DIRECTION_LABEL, PARTY_LINE_LABEL, STATUS_LABEL } from '../types'

export function StatusBadge({ status }: { status: Status }) {
  const tone = DEAD.includes(status) ? 'dead' : status === 'became_law' ? 'enacted' : 'pending'
  return <span class={`badge badge-${tone}`}>{STATUS_LABEL[status]}</span>
}

export function DirectionBadge({ direction }: { direction: Direction }) {
  const tone = direction === 'for_working_people' ? 'people' : direction === 'for_concentrated_interests' ? 'elite' : 'mixed'
  return <span class={`badge badge-dir-${tone}`}>{DIRECTION_LABEL[direction]}</span>
}

export function PartyLineBadge({ value }: { value: PartyLine }) {
  return <span class={`badge badge-pl-${value}`}>{PARTY_LINE_LABEL[value]}</span>
}

export function CategoryChips({ categories }: { categories: string[] }) {
  return (
    <span class="chips">
      {categories.map(c => <span class="chip" key={c}>{CATEGORY_LABEL[c] ?? c}</span>)}
    </span>
  )
}

const PARTY_ORDER = ['D', 'R', 'I', 'ID', 'L', '?']
export function partyKeys(counts: Record<string, number>) {
  return [...new Set([...PARTY_ORDER.filter(k => counts[k]), ...Object.keys(counts)])]
}

export function PartyBar({ counts, width = 60 }: { counts: Record<string, number>; width?: number }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  if (!total) return null
  const keys = partyKeys(counts)
  return (
    <span class="partybar" style={{ width }} title={keys.map(k => `${k}: ${counts[k]}`).join(', ')}>
      {keys.map(k => <span key={k} class={`party party-${k.toLowerCase()}`} style={{ width: `${(100 * counts[k]) / total}%` }} />)}
    </span>
  )
}

export function PartyDot({ party }: { party: string | null }) {
  const k = (party ?? '?').toLowerCase()
  return <span class={`party-dot party-${k}`} title={party ?? ''}>{party ?? ''}</span>
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
      <ScoreMeter label="Stakes for the public" value={scores.public_stakes} hint="How much ordinary people stand to gain or lose" />
      <ScoreMeter label="Stakes for concentrated interests" value={scores.concentrated_stakes} hint="How much an industry, the wealthiest households, or officeholders stand to gain or lose" />
      <ScoreMeter label="Outcome went against the public" value={scores.outcome_against_public} hint="10 = a helpful bill buried without a vote, or a harmful bill that became law" />
      <ScoreMeter label="Support vs. result" value={scores.support_mismatch} hint="Gap between apparent support and what happened" />
      <ScoreMeter label="Corruption relevance" value={scores.corruption_relevance} hint="How directly the bill concerns self-dealing, money in politics, or ethics" />
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

/** Wrap glossary terms in a tooltip. */
export function withTerms(text: string) {
  const re = termPattern.value
  if (!re) return text
  const out: (string | preact.JSX.Element)[] = []
  const seen = new Set<string>()  // underline each term once per block, not every occurrence
  let last = 0
  for (const m of text.matchAll(re)) {
    const t = findTerm(m[1])
    if (!t || seen.has(t.term)) continue
    seen.add(t.term)
    out.push(text.slice(last, m.index))
    out.push(<Term key={m.index} text={m[0]} term={t} />)
    last = m.index! + m[0].length
  }
  out.push(text.slice(last))
  return out
}

/** Prose that may contain inline "[S3]" markers; renders them as citation links. */
export function Prose({ text, sources }: { text: string; sources: Source[] }) {
  const parts = text.split(/(\[S\d+\](?:\s*\[S\d+\])*)/g)
  return (
    <>
      {parts.map((part, i) => {
        const ids = [...part.matchAll(/S\d+/g)].map(m => m[0])
        return ids.length && /^\s*(\[S\d+\]\s*)+$/.test(part)
          ? <Cite key={i} ids={ids} sources={sources} />
          : <span key={i}>{withTerms(part.replace(/\s+([.,;:])/g, '$1'))}</span>
      })}
    </>
  )
}

export function Claims({ claims, sources }: { claims: Claim[]; sources: Source[] }) {
  return (
    <ul class="claims">
      {claims.map((c, i) => <li key={i}><Prose text={c.text} sources={sources} /><Cite ids={c.sources} sources={sources} /></li>)}
    </ul>
  )
}

/** Who was for it, who was against it: the block at the top of a bill page. */
export function SidesBlock({ sides, sources, votes }: { sides: Sides; sources: Source[]; votes: Vote[] }) {
  const tallied = votes.filter(v => v.by_party && v.yea !== null)
  const key = tallied.filter(v => /passage|cloture|agree to|concur|final|override|suspend the rules|discharge/i.test(`${v.question ?? ''} ${v.result ?? ''}`))
  const decisive = (key.length ? key : tallied).slice(0, 4)
  return (
    <section class="sides">
      <div class="sides-head">
        <PartyLineBadge value={sides.party_line} />
        <span class="sides-note"><Prose text={sides.party_line_note} sources={sources} /></span>
      </div>
      {decisive.length > 0 && (
        <div class="sides-votes">
          {decisive.map(v => <VoteSplit v={v} key={v.url} />)}
        </div>
      )}
      <div class="sides-cols">
        <SideList title="Pushed it forward" actors={sides.for} sources={sources} tone="for" />
        <SideList title="Stopped or opposed it" actors={sides.against} sources={sources} tone="against" />
      </div>
      {[...sides.for, ...sides.against].some(a => a.evidence === 'widely_reported') && (
        <p class="sides-legend muted small"><span class="reported-mark">reported</span> marks influence that is widely reported but does not appear in the congressional record.</p>
      )}
    </section>
  )
}

function SideList({ title, actors, sources, tone }: { title: string; actors: Actor[]; sources: Source[]; tone: 'for' | 'against' }) {
  return (
    <div class={`side side-${tone}`}>
      <h3>{title}</h3>
      {actors.length === 0 && <p class="muted small">None identified in the record.</p>}
      <ol class="actors">
        {actors.map((a, i) => (
          <li key={i} class={a.direct ? '' : 'indirect'}>
            <div class="actor-name">
              <PartyDot party={a.party} /> {a.name}
              <span class="muted"> — {a.role}</span>
              {!a.direct && <span class="tag">indirect</span>}
              {a.evidence === 'widely_reported' && <span class="tag reported-mark">reported</span>}
            </div>
            <div class="actor-did"><Prose text={a.what_they_did} sources={sources} /><Cite ids={a.sources} sources={sources} /></div>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** One recorded vote as a stacked bar: yea by party on the left, nay by party on the right. */
export function VoteSplit({ v }: { v: Vote }) {
  const parties = partyKeys(Object.fromEntries(Object.entries(v.by_party!).map(([k, c]) => [k, c.yea + c.nay])))
  const total = (v.yea ?? 0) + (v.nay ?? 0)
  if (!total) return null
  return (
    <div class="votesplit">
      <div class="votesplit-label">
        <b>{v.chamber}</b> · {v.question ?? 'Recorded vote'} · <span class="yea">{v.yea} yea</span> / <span class="nay">{v.nay} nay</span>
        {v.result && <span class="muted"> · {v.result}</span>}
      </div>
      <div class="votesplit-bar">
        {parties.map(p => <span key={`y${p}`} class={`seg yea-seg party-${p.toLowerCase()}`} style={{ width: `${(100 * v.by_party![p].yea) / total}%` }} title={`${p} yea: ${v.by_party![p].yea}`} />)}
        <span class="seg-gap" />
        {[...parties].reverse().map(p => <span key={`n${p}`} class={`seg nay-seg party-${p.toLowerCase()}`} style={{ width: `${(100 * v.by_party![p].nay) / total}%` }} title={`${p} nay: ${v.by_party![p].nay}`} />)}
      </div>
      <div class="votesplit-parties muted small">
        {parties.map(p => <span key={p}><PartyDot party={p} /> {v.by_party![p].yea} yea, {v.by_party![p].nay} nay&nbsp;&nbsp;</span>)}
      </div>
    </div>
  )
}
