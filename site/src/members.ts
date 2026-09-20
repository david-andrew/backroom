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

export interface Suggestion { label: string; lon: number; lat: number }

/** Address suggestions as you type, from Photon (OpenStreetMap data, CORS-enabled, no key). US only. */
export async function suggestAddresses(q: string, signal?: AbortSignal): Promise<Suggestion[]> {
  const u = new URL('https://photon.komoot.io/api/')
  u.search = new URLSearchParams({ q, limit: '6', lang: 'en', bbox: '-179.9,17.5,-64.5,71.5' }).toString()
  const r = await fetch(u, { signal })
  if (!r.ok) return []
  const d = await r.json()
  const out: Suggestion[] = []
  for (const f of d.features ?? []) {
    const p = f.properties ?? {}
    if (p.country !== 'United States') continue
    const line1 = [p.housenumber, p.street].filter(Boolean).join(' ') || p.name
    const label = [line1, p.city ?? p.county, p.state, p.postcode].filter(Boolean).join(', ')
    if (!label || out.some(o => o.label === label)) continue
    out.push({ label, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] })
  }
  return out
}

/** Street address -> state + congressional district via the Census geocoder (JSONP: it does not send CORS headers). */
export function districtForAddress(address: string): Promise<{ state: string; district: number | null; matched: string } | null> {
  const cb = `__censusGeo${Date.now()}${Math.floor(Math.random() * 1e6)}`
  const u = new URL('https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress')
  u.search = new URLSearchParams({ address, benchmark: 'Public_AR_Current', vintage: 'Current_Current', layers: '54', format: 'jsonp', callback: cb }).toString()
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const done = () => { delete (window as any)[cb]; script.remove(); clearTimeout(timer) }
    const timer = setTimeout(() => { done(); reject(new Error('Census geocoder timed out')) }, 15000)
    ;(window as any)[cb] = (d: any) => {
      done()
      const m = d?.result?.addressMatches?.[0]
      if (!m) return resolve(null)
      const layer = Object.values(m.geographies as Record<string, any[]>)[0]?.[0]
      const state = FIPS[layer?.STATE] ?? m.addressComponents?.state
      const cd = layer?.BASENAME
      resolve({ state, district: cd && /^\d+$/.test(cd) ? Number(cd) : null, matched: m.matchedAddress })
    }
    script.onerror = () => { done(); reject(new Error('Census geocoder unreachable')) }
    script.src = u.toString()
    document.head.appendChild(script)
  })
}

/** Coordinates -> congressional district via Census TIGERweb (CORS-enabled). Fallback when the address itself will not geocode. */
export async function districtForPoint(lon: number, lat: number): Promise<{ state: string; district: number | null } | null> {
  const u = new URL('https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer/4/query')
  u.search = new URLSearchParams({ geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'STATE,BASENAME', returnGeometry: 'false', f: 'json' }).toString()
  const r = await fetch(u)
  if (!r.ok) return null
  const a = (await r.json())?.features?.[0]?.attributes
  if (!a) return null
  return { state: FIPS[a.STATE] ?? a.STATE, district: /^\d+$/.test(a.BASENAME) ? Number(a.BASENAME) : null }
}

const FIPS: Record<string, string> = { '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE','11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA','20':'KS','21':'KY','22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI','45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV','55':'WI','56':'WY','72':'PR','66':'GU','60':'AS','78':'VI','69':'MP' }
