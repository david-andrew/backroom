import { signal } from '@preact/signals'

export interface Member {
  id: string; name: string; party: string; state: string; state_name: string
  district: number | null; chamber: 'Senate' | 'House'; image: string | null
}
export interface Involvement {
  bill: string; display: string; title: string; direction: string; status: string
  role: 'sponsor' | 'cosponsor' | 'vote' | 'named_for' | 'named_against'
  cast?: 'yea' | 'nay' | 'present' | 'not_voting'; chamber?: string; roll?: number; date?: string; question?: string | null; url?: string
  what?: string; evidence?: string
}
export interface MembersData { generated_at: string; roster: Member[]; involvement: Record<string, Involvement[]> }

const base = import.meta.env.BASE_URL.replace(/\/$/, '')
export const members = signal<MembersData | null>(null)
export const membersError = signal<string | null>(null)

export async function loadMembers(): Promise<void> {
  if (members.value) return
  try {
    const r = await fetch(`${base}/data/members.json`)
    if (!r.ok) throw new Error(`${r.status} loading members.json`)
    members.value = await r.json()
  } catch (e) { membersError.value = String(e) }
}

export function memberById(id: string): Member | undefined {
  return members.value?.roster.find(m => m.id === id)
}

/** Current member matching a recorded vote (House votes carry bioguide ids; Senate votes are matched by last name + state). */
export function memberForVote(v: { name: string; state: string; party: string; bioguide_id?: string | null }): Member | undefined {
  const r = members.value?.roster
  if (!r) return undefined
  if (v.bioguide_id) return r.find(m => m.id === v.bioguide_id)
  const last = v.name.trim().split(/\s+/).pop()!.toLowerCase().replace(/[^a-z]/g, '')
  const c = r.filter(m => m.chamber === 'Senate' && m.state === v.state && m.name.split(/\s+/).pop()!.toLowerCase().replace(/[^a-z]/g, '') === last)
  return c.length === 1 ? c[0] : c.find(m => m.party === v.party)
}

/** Census geocoder: street address -> state + congressional district. Public, no key. */
export async function districtForAddress(address: string): Promise<{ state: string; district: number | null } | null> {
  const u = new URL('https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress')
  u.search = new URLSearchParams({ address, benchmark: 'Public_AR_Current', vintage: 'Current_Current', layers: '54', format: 'json' }).toString()
  const r = await fetch(u)
  if (!r.ok) throw new Error(`geocoder ${r.status}`)
  const d = await r.json()
  const m = d?.result?.addressMatches?.[0]
  if (!m) return null
  const layer = Object.values(m.geographies as Record<string, any[]>)[0]?.[0]
  const fips = layer?.STATE ?? m.addressComponents?.state
  const cd = layer?.CD ?? layer?.CD119 ?? layer?.CD120
  const state = FIPS[fips] ?? m.addressComponents?.state
  return { state, district: cd ? Number(cd) : null }
}

const FIPS: Record<string, string> = { '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE','11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA','20':'KS','21':'KY','22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI','45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV','55':'WI','56':'WY','72':'PR','66':'GU','60':'AS','78':'VI','69':'MP' }
