import { useEffect, useState } from 'preact/hooks'
import { signal, computed } from '@preact/signals'
import { members, membersError, loadMembers, districtForAddress } from '../members'
import type { Member } from '../members'
import { href } from '../router'
import { PartyDot } from '../components/ui'

const state = signal('')
const district = signal<number | ''>('')
const query = signal('')

const STATES: [string, string][] = [['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['DC','District of Columbia'],['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],['PR','Puerto Rico'],['GU','Guam'],['AS','American Samoa'],['VI','Virgin Islands'],['MP','Northern Mariana Islands']]

const shown = computed<Member[]>(() => {
  const r = members.value?.roster ?? []
  const q = query.value.trim().toLowerCase()
  if (q) return r.filter(m => m.name.toLowerCase().includes(q)).slice(0, 30)
  if (!state.value) return []
  return r.filter(m => m.state === state.value && (m.chamber === 'Senate' || district.value === '' || m.district === district.value))
    .sort((a, b) => (a.chamber === b.chamber ? (a.district ?? 0) - (b.district ?? 0) : a.chamber === 'Senate' ? -1 : 1))
})

export function Members() {
  useEffect(() => { loadMembers() }, [])
  const [addr, setAddr] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const data = members.value
  if (membersError.value) return <p class="error">{membersError.value}</p>
  if (!data) return <p class="muted">Loading…</p>

  const districts = [...new Set(data.roster.filter(m => m.state === state.value && m.district != null).map(m => m.district as number))].sort((a, b) => a - b)

  async function lookup(e: Event) {
    e.preventDefault()
    setBusy(true); setNote(null)
    try {
      const r = await districtForAddress(addr)
      if (!r) { setNote('The Census geocoder could not match that address. Try adding city and state, or pick them below.'); return }
      state.value = r.state; district.value = r.district ?? ''; query.value = ''
      setNote(`Matched to ${r.state}${r.district ? `, district ${r.district}` : ''}.`)
    } catch (err) { setNote(`Lookup failed: ${String(err)}. Pick your state and district below.`) }
    finally { setBusy(false) }
  }

  return (
    <>
      <section class="intro">
        <h1>Your representatives</h1>
        <p>Find your two senators and your House member, then see what each one did on the bills tracked here: sponsored, cosponsored, voted, or named as someone who pushed or blocked it.</p>
      </section>

      <form class="filters" onSubmit={lookup}>
        <input type="text" placeholder="Street address, city, state (sent to the U.S. Census geocoder)" value={addr} onInput={e => setAddr((e.target as HTMLInputElement).value)} style={{ flex: '1 1 320px' }} />
        <button type="submit" class="btn" disabled={busy || !addr.trim()}>{busy ? 'Looking up…' : 'Find my district'}</button>
      </form>
      {note && <p class="muted small">{note}</p>}

      <div class="filters">
        <select value={state.value} onChange={e => { state.value = (e.target as HTMLSelectElement).value; district.value = ''; query.value = '' }}>
          <option value="">Choose a state</option>
          {STATES.map(([a, n]) => <option value={a} key={a}>{n}</option>)}
        </select>
        <select value={String(district.value)} onChange={e => { const v = (e.target as HTMLSelectElement).value; district.value = v ? Number(v) : '' }} disabled={!state.value}>
          <option value="">All districts</option>
          {districts.map(d => <option value={d} key={d}>District {d}</option>)}
        </select>
        <input type="search" placeholder="…or search by name" value={query.value} onInput={e => (query.value = (e.target as HTMLInputElement).value)} />
      </div>

      <ul class="member-list">
        {shown.value.map(m => <MemberCard m={m} key={m.id} n={data.involvement[m.id]?.length ?? 0} />)}
      </ul>
      {!shown.value.length && (state.value || query.value) && <p class="muted">No current members match.</p>}
      <p class="muted small">Roster from Congress.gov, {new Date(data.generated_at).toLocaleDateString()}. Address lookup uses the U.S. Census Bureau geocoder; the address is sent to census.gov and not stored here.</p>
    </>
  )
}

function MemberCard({ m, n }: { m: Member; n: number }) {
  return (
    <li class="member-card">
      <a href={href.member(m.id)}>
        {m.image ? <img src={m.image} alt="" loading="lazy" /> : <span class="member-photo-empty" />}
        <span class="member-body">
          <span class="member-name"><PartyDot party={m.party} /> {m.name}</span>
          <span class="muted small">{m.chamber === 'Senate' ? `Senator, ${m.state_name}` : `${m.state_name}${m.district ? `, district ${m.district}` : ', at large'}`}</span>
          <span class="small">{n ? `${n} action${n === 1 ? '' : 's'} on tracked bills` : 'No actions on tracked bills yet'}</span>
        </span>
      </a>
    </li>
  )
}
