import { useEffect, useState } from 'preact/hooks'
import { loadMembers, memberForVote, memberById } from '../members'
import { loadBill, ordinal, congressYears, fmtDate } from '../data'
import { loadGlossary, glossary } from '../glossary'
import { href } from '../router'
import type { BillPage, MemberVote, Person, Vote } from '../types'
import { Claims, IndustryTable, PartyBar, PartyDot, Prose, StatusBadge, CategoryChips, DirectionBadge, SidesBlock } from '../components/ui'

export function Bill({ id }: { id: string }) {
  const [bill, setBill] = useState<BillPage | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { loadGlossary(); loadMembers(); loadBill(id).then(setBill, e => setErr(String(e))) }, [id])
  void glossary.value  // re-render once terms arrive
  if (err) return <p class="error">{err}</p>
  if (!bill) return <p class="muted">Loading…</p>

  const a = bill.analysis
  const S = bill.sources
  const votes = bill.votes
  const helpful = a.direction !== 'for_concentrated_interests'

  return (
    <article class="bill">
      <p class="crumbs"><a href={href.home}>← All bills</a></p>
      <header class="bill-header">
        <p class="bill-number">{bill.display} · {ordinal(bill.congress)} Congress ({congressYears(bill.congress)}) · introduced {fmtDate(bill.introduced)}</p>
        <h1>{bill.title}</h1>
        <p class="one-liner"><Prose text={a.one_liner} sources={S} /></p>
        <p class="headline"><StatusBadge status={a.outcome.status} /> <Prose text={a.headline} sources={S} /></p>
        <p class="badges"><DirectionBadge direction={a.direction} /> <CategoryChips categories={a.categories} /></p>
      </header>

      {(bill.companions.length > 0 || bill.lineage.length > 0) && (
        <p class="related small">
          {bill.companions.length > 0 && <span><b>Companion bill{bill.companions.length > 1 ? 's' : ''}:</b> {bill.companions.map((c, i) => <span key={c}>{i > 0 ? ', ' : ''}<a href={href.bill(c)}>{c.replace(/^(\d+)-(hr|s|hjres|sjres)(\d+)$/, (_, cg, t, n) => `${t === 'hr' ? 'H.R.' : t === 's' ? 'S.' : t.toUpperCase()} ${n} (${ordinal(Number(cg))})`)}</a></span>)}</span>}
          {bill.companions.length > 0 && bill.lineage.length > 0 && ' · '}
          {bill.lineage.length > 0 && <span><b>Other Congresses:</b> {bill.lineage.map((c, i) => <span key={c}>{i > 0 ? ', ' : ''}<a href={href.bill(c)}>{c.replace(/^(\d+)-(hr|s|hjres|sjres)(\d+)$/, (_, cg, t, n) => `${t === 'hr' ? 'H.R.' : t === 's' ? 'S.' : t.toUpperCase()} ${n} (${ordinal(Number(cg))})`)}</a></span>)}</span>}
        </p>
      )}

      <SidesBlock sides={a.sides} sources={S} votes={votes} />

      <div class="bill-grid">
        <div class="bill-main">
          <section>
            <h2>What it would do</h2>
            <p><Prose text={a.plain_summary} sources={S} /></p>
          </section>

          <section>
            <h2>{helpful ? 'Who it would help' : 'Who it serves'}</h2>
            <p><Prose text={a.who_benefits} sources={S} /></p>
            <Claims claims={a.how_it_helps} sources={S} />
          </section>

          <section>
            <h2>Who would pay</h2>
            <p><Prose text={a.who_pays} sources={S} /></p>
          </section>

          {(a.industries?.length ?? 0) > 0 && (
            <section>
              <h2>Industries and interests affected</h2>
              <IndustryTable items={a.industries} sources={S} />
            </section>
          )}

          <section>
            <h2>Drawbacks and honest objections</h2>
            <Claims claims={a.drawbacks} sources={S} />
            <p class="weigh"><b>On balance:</b> <Prose text={a.benefit_vs_cost} sources={S} /></p>
          </section>

          <section>
            <h2>What happened</h2>
            <p class="mechanism"><b><Prose text={a.outcome.mechanism} sources={S} /></b></p>
            <Claims claims={a.outcome.narrative} sources={S} />
            <p class="weigh"><b>Who came out ahead:</b> <Prose text={a.outcome.who_came_out_ahead} sources={S} /></p>
            {a.trajectory && <p class="trajectory"><b>Where it is likely headed:</b> <Prose text={a.trajectory} sources={S} /></p>}
          </section>

          {votes.length > 0 && (
            <section>
              <h2>Recorded votes</h2>
              {votes.map(v => <VoteRow v={v} key={v.url} />)}
            </section>
          )}

          <section>
            <h2>Timeline</h2>
            <ol class="timeline">
              {bill.actions.map((act, i) => (
                <li key={i}>
                  <span class="tl-date">{fmtDate(act.date)}</span>
                  <span class="tl-chamber muted">{act.chamber ?? ''}</span>
                  <span class="tl-text">{act.text}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside class="bill-side">
          <section class="card">
            <h3>Sponsor{bill.sponsors.length > 1 ? 's' : ''}</h3>
            <ul class="plain">
              {bill.sponsors.map(p => <li key={p.bioguide_id}><a href={`https://bioguide.congress.gov/search/bio/${p.bioguide_id}`} target="_blank" rel="noreferrer">{p.name}</a> ({p.party}-{p.state})</li>)}
            </ul>
            <h3>{bill.cosponsor_count} cosponsors</h3>
            <PartyBar counts={bill.cosponsor_party_counts} width={120} />
            <p class="muted small">{cosponsorLine(bill) || 'none'}</p>
            {bill.cosponsors.length > 0 && (
              <details class="expand">
                <summary>Show all {bill.cosponsors.length}</summary>
                <ul class="plain small people">
                  {[...bill.cosponsors].sort((a, b) => (a.party ?? '').localeCompare(b.party ?? '') || a.name.localeCompare(b.name)).map(p => <li key={p.bioguide_id}><PersonLink p={p} /></li>)}
                </ul>
              </details>
            )}
            {bill.committees.length > 0 && <>
              <h3>Committees</h3>
              <ul class="plain small">{bill.committees.map(c => <li key={c.name}>{c.name} <span class="muted">— {c.activities.join(', ')}</span></li>)}</ul>
            </>}
          </section>


          <section class="card" id="sources">
            <h3>Sources</h3>
            <ol class="sources">
              {S.map(s => <li key={s.id} id={`src-${s.id}`} value={Number(s.id.slice(1))}><a href={s.url} target="_blank" rel="noreferrer">{s.label}</a>{s.date ? <span class="muted"> · {fmtDate(s.date)}</span> : null}</li>)}
            </ol>
            <p class="small"><a href={bill.congress_gov_url} target="_blank" rel="noreferrer">Congress.gov page</a>{bill.text_url && <> · <a href={bill.text_url} target="_blank" rel="noreferrer">Full text</a></>}</p>
          </section>

          <section class="card provenance">
            <h3>Provenance</h3>
            <p class="small">Facts fetched {fmtDate(bill.meta.record_fetched_at)}. Interpretation written {fmtDate(bill.meta.generated_at)} by <code>{bill.meta.model}</code>, prompt <a href={href.prompt(bill.meta.prompt_version)}><code>{bill.meta.prompt_version}</code></a>.</p>
            {bill.meta.unresolved_citations.length > 0 && <p class="small warn">Citations the model used that are not in the source list: {bill.meta.unresolved_citations.join(', ')}.</p>}
            {(bill.meta.lint?.length ?? 0) > 0 && (
              <details class="expand warn-details">
                <summary class="warn">{bill.meta.lint.length} automatic check{bill.meta.lint.length > 1 ? 's' : ''} flagged this page</summary>
                <ul class="small">{bill.meta.lint.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </details>
            )}
          </section>
        </aside>
      </div>
    </article>
  )
}

function VoteRow({ v }: { v: Vote }) {
  const parties = v.by_party ? Object.entries(v.by_party) : []
  return (
    <div class="vote">
      <div class="vote-head">
        <b>{v.chamber} roll call {v.roll_number}</b> · {fmtDate(v.date)} · <a href={v.url} target="_blank" rel="noreferrer">record</a>
      </div>
      {v.question && <div class="muted small">{v.question}</div>}
      {v.yea !== null && (
        <div class="vote-tally">
          <span class="yea">{v.yea} yea</span> <span class="nay">{v.nay} nay</span>
          {v.result && <span class="muted"> · {v.result}</span>}
        </div>
      )}
      {v.members.length > 0 && <MemberVotes v={v} />}
      {parties.length > 0 && (
        <table class="party-table">
          <thead><tr><th></th>{parties.map(([p]) => <th key={p}>{p}</th>)}</tr></thead>
          <tbody>
            <tr><td>Yea</td>{parties.map(([p, c]) => <td key={p}>{c.yea}</td>)}</tr>
            <tr><td>Nay</td>{parties.map(([p, c]) => <td key={p}>{c.nay}</td>)}</tr>
          </tbody>
        </table>
      )}
    </div>
  )
}

function PersonLink({ p }: { p: Person }) {
  const current = memberById(p.bioguide_id)
  const label = <><PartyDot party={p.party} /> {p.name} <span class="muted">({p.state})</span></>
  return current ? <a href={href.member(p.bioguide_id)}>{label}</a> : <a href={`https://bioguide.congress.gov/search/bio/${p.bioguide_id}`} target="_blank" rel="noreferrer" title="Former member">{label}</a>
}

function MemberVotes({ v }: { v: Vote }) {
  const [q, setQ] = useState('')
  const groups: [string, MemberVote[]][] = [['yea', []], ['nay', []], ['present', []], ['not_voting', []]]
  for (const m of v.members) groups.find(g => g[0] === m.cast)![1].push(m)
  const needle = q.trim().toLowerCase()
  const label: Record<string, string> = { yea: 'Voted yes', nay: 'Voted no', present: 'Present', not_voting: 'Did not vote' }
  return (
    <details class="expand">
      <summary>Show how each member voted ({v.members.length})</summary>
      <input type="search" class="mini-search" placeholder="Filter by name or state" value={q} onInput={e => setQ((e.target as HTMLInputElement).value)} />
      <div class="vote-groups">
        {groups.filter(g => g[1].length).map(([cast, list]) => (
          <div key={cast} class={`vote-group cast-${cast}`}>
            <h4>{label[cast]} <span class="muted">({list.length})</span></h4>
            <ul class="plain small people">
              {list.filter(m => !needle || `${m.name} ${m.state}`.toLowerCase().includes(needle))
                .sort((a, b) => a.party.localeCompare(b.party) || a.name.localeCompare(b.name))
                .map((m, i) => {
                  const cur = memberForVote(m)
                  const body = <><PartyDot party={m.party} /> {m.name} <span class="muted">({m.state})</span></>
                  return <li key={i}>{cur ? <a href={href.member(cur.id)}>{body}</a> : body}</li>
                })}
            </ul>
          </div>
        ))}
      </div>
    </details>
  )
}

/** "86 of 213 House Democrats · 3 of 220 House Republicans" using the caucus sizes derived from roll calls. */
function cosponsorLine(bill: BillPage): string {
  const chamber = bill.origin_chamber === 'Senate' ? 'Senate' : 'House'
  const sizes = bill.caucus?.[chamber] ?? {}
  const name: Record<string, string> = { D: 'Democrats', R: 'Republicans', I: 'Independents', ID: 'Independent Democrats', L: 'Libertarians' }
  return Object.entries(bill.cosponsor_party_counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([p, n]) => sizes[p] ? `${n} of ${sizes[p]} ${chamber} ${name[p] ?? p}` : `${p}: ${n}`)
    .join(' · ')
}
