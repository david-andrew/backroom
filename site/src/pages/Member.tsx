import { useEffect, useState } from 'preact/hooks'
import { members, membersError, loadMembers, memberById, loadInvolvement } from '../members'
import type { Involvement } from '../members'
import { href } from '../router'
import { fmtDate, index, loadIndex } from '../data'
import { DirectionBadge, PartyDot, StatusBadge } from '../components/ui'
import type { Direction, Status } from '../types'

const DECISIVE = /passage|cloture|concur|agree to the senate amendment|agreeing to the senate amendment|suspend the rules and pass|final/i

export function MemberPage({ id }: { id: string }) {
  const [inv, setInv] = useState<Involvement[] | null>(null)
  useEffect(() => { loadMembers(); loadIndex(); loadInvolvement(id).then(setInv) }, [id])
  if (membersError.value) return <p class="error">{membersError.value}</p>
  if (!members.value || !index.value || !inv) return <p class="muted">Loading…</p>
  const m = memberById(id)
  if (!m) return <p class="error">No current member with id {id}. <a href={href.members}>Back to lookup.</a></p>

  // Group by bill, one row per bill with everything they did on it.
  const byBill = new Map<string, Involvement[]>()
  for (const i of inv) byBill.set(i.bill, [...(byBill.get(i.bill) ?? []), i])
  // Bill title, status and direction live in the index, which every page already has.
  const meta = new Map(index.value.bills.map(b => [b.id, b]))
  const rows = [...byBill.entries()]
    .filter(([bill]) => meta.has(bill))
    .sort((a, b) => (meta.get(a[0])!.dp).localeCompare(meta.get(b[0])!.dp))

  const votes = inv.filter(i => i.role === 'vote')
  // Headline tally counts only the votes that decided the bill's fate, not the dozens of procedural motions around them.
  const decisive = votes.filter(v => DECISIVE.test(v.question ?? ''))
  const forPeople = decisive.filter(v => meta.get(v.bill)?.d === 'for_working_people')
  const forElite = decisive.filter(v => meta.get(v.bill)?.d === 'for_concentrated_interests')
  const tally = (vs: Involvement[]) => `${vs.filter(v => v.cast === 'yea').length} yea, ${vs.filter(v => v.cast === 'nay').length} nay`

  return (
    <article class="member">
      <p class="crumbs"><a href={href.members}>← Your representatives</a></p>
      <header class="member-header">
        {m.image && <img src={m.image} alt="" />}
        <div>
          <h1><PartyDot party={m.party} /> {m.name}</h1>
          <p class="muted">{m.chamber === 'Senate' ? `U.S. Senator from ${m.state_name}` : `U.S. Representative, ${m.state_name}${m.district ? ` district ${m.district}` : ''}`} · <a href={`https://bioguide.congress.gov/search/bio/${m.id}`} target="_blank" rel="noreferrer">official bio</a></p>
        </div>
      </header>

      {votes.length > 0 && (
        <section class="card member-tally">
          <h3>Recorded votes on tracked bills</h3>
          <p>On bills that serve working people: <b>{tally(forPeople)}</b>. On bills that serve concentrated interests: <b>{tally(forElite)}</b>.</p>
          <p class="muted small">Counts only the votes that decided each bill: passage, cloture, and agreeing to the other chamber's version. Every roll call is listed below.</p>
        </section>
      )}

      <h2>What they did, bill by bill</h2>
      {rows.length === 0 && <p class="muted">Nothing recorded on the bills tracked so far. Most bills here never reached a vote, so silence is common.</p>}
      <ul class="inv-list">
        {rows.map(([bill, items]) => {
          const b = meta.get(bill)!
          const cast = items.filter(i => i.role === 'vote')
          const roles = items.filter(i => i.role !== 'vote')
          return (
            <li key={bill} class={`inv dir-${b.d}`}>
              <div class="inv-head">
                <a href={href.bill(bill)}><b>{b.dp}</b> · {b.t}</a>
                <DirectionBadge direction={b.d as Direction} /> <StatusBadge status={b.st as Status} />
              </div>
              <ul class="inv-items">
                {roles.map((r, i) => (
                  <li key={i}>
                    {r.role === 'sponsor' && <span class="role role-sponsor">Sponsored it</span>}
                    {r.role === 'cosponsor' && <span class="role role-cosponsor">Cosponsored it</span>}
                    {r.role === 'named_for' && <><span class="role role-for">Pushed it forward</span> <span class="muted">{r.what}</span>{r.evidence === 'widely_reported' && <span class="tag reported-mark">reported</span>}</>}
                    {r.role === 'named_against' && <><span class="role role-against">Stopped or opposed it</span> <span class="muted">{r.what}</span>{r.evidence === 'widely_reported' && <span class="tag reported-mark">reported</span>}</>}
                  </li>
                ))}
                {cast.map((v, i) => (
                  <li key={`v${i}`} class={DECISIVE.test(v.question ?? '') ? '' : 'procedural'}>
                    <span class={`role cast-${v.cast}`}>{v.cast === 'yea' ? 'Voted yes' : v.cast === 'nay' ? 'Voted no' : v.cast === 'present' ? 'Voted present' : 'Did not vote'}</span>
                    <span class="muted"> · {v.question ?? 'recorded vote'} · {fmtDate(v.date)} · <a href={v.url} target="_blank" rel="noreferrer">roll {v.roll}</a></span>
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>
      <p class="muted small">"Pushed it forward" and "stopped or opposed it" come from the model-written account of each bill and are matched to this member by name and party; treat them as a pointer to the bill page, not a record.</p>
    </article>
  )
}
