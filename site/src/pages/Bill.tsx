import { useEffect, useState } from 'preact/hooks'
import { loadBill, ordinal, congressYears, fmtDate } from '../data'
import { href } from '../router'
import type { BillPage, Vote } from '../types'
import { Cite, Claims, PartyBar, ScoreGrid, StatusBadge, CategoryChips } from '../components/ui'

export function Bill({ id }: { id: string }) {
  const [bill, setBill] = useState<BillPage | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { loadBill(id).then(setBill, e => setErr(String(e))) }, [id])
  if (err) return <p class="error">{err}</p>
  if (!bill) return <p class="muted">Loading…</p>

  const a = bill.analysis
  const S = bill.sources
  const votes = bill.votes

  return (
    <article class="bill">
      <p class="crumbs"><a href={href.home}>← All bills</a></p>
      <header class="bill-header">
        <p class="bill-number">{bill.display} · {ordinal(bill.congress)} Congress ({congressYears(bill.congress)}) · introduced {fmtDate(bill.introduced)}</p>
        <h1>{bill.title}</h1>
        <p class="headline"><StatusBadge status={a.outcome.status} /> {a.headline}</p>
        <CategoryChips categories={a.categories} />
      </header>

      <div class="bill-grid">
        <div class="bill-main">
          <section>
            <h2>What it would do</h2>
            <p>{a.plain_summary}</p>
          </section>

          <section>
            <h2>Who it would help</h2>
            <p>{a.who_benefits}</p>
            <Claims claims={a.how_it_helps} sources={S} />
          </section>

          <section>
            <h2>Who would pay</h2>
            <p>{a.who_pays}</p>
          </section>

          <section>
            <h2>Drawbacks and honest objections</h2>
            <Claims claims={a.drawbacks} sources={S} />
            <p class="weigh"><b>On balance:</b> {a.benefit_vs_cost}</p>
          </section>

          <section>
            <h2>What happened</h2>
            <p class="mechanism"><b>{a.outcome.mechanism}</b></p>
            <Claims claims={a.outcome.narrative} sources={S} />
            {a.trajectory && <p class="trajectory"><b>Where it is likely headed:</b> {a.trajectory}</p>}
          </section>

          <section>
            <h2>Who decided</h2>
            <ol class="actors">
              {a.key_actors.map((k, i) => (
                <li key={i}>
                  <div class="actor-name">{k.name} <span class="muted">— {k.role}{k.party ? ` (${k.party})` : ''}</span></div>
                  <div>{k.what_they_did}<Cite ids={k.sources} sources={S} /></div>
                </li>
              ))}
            </ol>
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
            <PartyBar counts={bill.cosponsor_party_counts} />
            <p class="muted small">{Object.entries(bill.cosponsor_party_counts).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
            {bill.committees.length > 0 && <>
              <h3>Committees</h3>
              <ul class="plain small">{bill.committees.map(c => <li key={c.name}>{c.name} <span class="muted">— {c.activities.join(', ')}</span></li>)}</ul>
            </>}
          </section>

          <section class="card">
            <h3>Scores</h3>
            <ScoreGrid scores={a.scores} />
            <p class="muted small">Rank score {bill.rank_score.toFixed(2)} / 10 · model confidence {(a.scores.confidence * 100).toFixed(0)}%. <a href={href.about}>How scoring works.</a></p>
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
            <p class="small">Facts fetched {fmtDate(bill.meta.record_fetched_at)}. Interpretation written {fmtDate(bill.meta.generated_at)} by <code>{bill.meta.model}</code>, prompt <code>{bill.meta.prompt_version}</code>.</p>
            {bill.meta.unresolved_citations.length > 0 && <p class="small warn">Citations the model used that are not in the source list: {bill.meta.unresolved_citations.join(', ')}.</p>}
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
