export type Status =
  | 'pending' | 'never_got_a_vote' | 'passed_one_chamber_then_stalled' | 'blocked_from_a_vote'
  | 'voted_down' | 'weakened' | 'became_law' | 'vetoed'

export interface Scores {
  public_stakes: number
  concentrated_stakes: number
  outcome_against_public: number
  support_mismatch: number
  corruption_relevance: number
  confidence: number
}

export type Direction = 'for_working_people' | 'for_concentrated_interests' | 'mixed'
export type PartyLine = 'party_line' | 'mostly_party_line' | 'bipartisan' | 'unclear'

export interface IndexBill {
  id: string
  display: string
  congress: number
  title: string
  introduced: string | null
  origin_chamber: string | null
  sponsors: string[]
  cosponsor_count: number
  cosponsor_party_counts: Record<string, number>
  one_liner: string
  headline: string
  direction: Direction
  who_benefits_short: string
  who_pays_short: string
  who_came_out_ahead_short: string
  party_line: PartyLine
  industries: IndustryBrief[]
  status: Status
  categories: string[]
  scores: Scores
  rank_score: number
  congress_ended: boolean
}

export interface Index {
  generated_at: string
  weights: Record<string, number>
  bills: IndexBill[]
}

export interface Claim { text: string; sources: string[] }
export interface Actor {
  name: string; role: string; party: string | null; what_they_did: string
  direct: boolean; evidence: 'record' | 'widely_reported'; sources: string[]
}
export type IndustryEffectKind = 'gains' | 'loses' | 'entrenched' | 'mixed'
export type Stance = 'aligned' | 'opposed' | 'mixed'
export interface IndustryEffect { industry: string; effect: IndustryEffectKind; stance_toward_public: Stance; note: string; sources: string[] }
export interface IndustryBrief { industry: string; effect: IndustryEffectKind; stance: Stance }
export interface Sides { for: Actor[]; against: Actor[]; party_line: PartyLine; party_line_note: string }
export interface MemberVote { name: string; party: string; state: string; cast: 'yea' | 'nay' | 'present' | 'not_voting'; bioguide_id?: string | null }
export interface Vote {
  chamber: string; date: string; roll_number: number; url: string
  members: MemberVote[]
  question: string | null; result: string | null; yea: number | null; nay: number | null
  by_party: Record<string, { yea: number; nay: number }> | null
}
export interface Action { date: string; text: string; chamber: string | null; votes: Vote[] }
export interface Source { id: string; kind: string; label: string; url: string; date: string | null }
export interface Person { bioguide_id: string; name: string; party: string | null; state: string | null }

export interface Analysis {
  one_liner: string
  headline: string
  direction: Direction
  plain_summary: string
  who_benefits: string
  who_benefits_short: string
  how_it_helps: Claim[]
  who_pays: string
  who_pays_short: string
  drawbacks: Claim[]
  benefit_vs_cost: string
  outcome: { status: Status; mechanism: string; narrative: Claim[]; who_came_out_ahead: string }
  who_came_out_ahead_short: string
  sides: Sides
  industries: IndustryEffect[]
  trajectory: string | null
  categories: string[]
  scores: Scores
}

export interface BillPage {
  id: string; display: string; congress: number; title: string
  introduced: string | null; origin_chamber: string | null
  policy_area: string | null; subjects: string[]
  sponsors: Person[]; cosponsors: Person[]; cosponsor_count: number; cosponsor_party_counts: Record<string, number>
  committees: { name: string; chamber: string; activities: string[] }[]
  actions: Action[]; votes: Vote[]
  congress_gov_url: string; text_url: string | null; congress_ended: boolean
  sources: Source[]
  analysis: Analysis
  rank_score: number
  meta: { model: string; prompt_version: string; generated_at: string; record_fetched_at: string; unresolved_citations: string[] }
}

export const STATUS_LABEL: Record<Status, string> = {
  pending: 'Still pending',
  never_got_a_vote: 'Never got a vote',
  passed_one_chamber_then_stalled: 'Passed one chamber, then stalled',
  blocked_from_a_vote: 'Blocked from a vote',
  voted_down: 'Voted down',
  weakened: 'Weakened before passing',
  became_law: 'Became law',
  vetoed: 'Vetoed',
}

export const CATEGORY_LABEL: Record<string, string> = {
  wages_and_labor: 'Wages & labor',
  healthcare_and_drug_prices: 'Healthcare & drug prices',
  taxes_on_wealth_and_corporations: 'Taxes on wealth & corporations',
  consumer_protection_and_finance: 'Consumer protection & finance',
  housing: 'Housing',
  corruption_and_ethics: 'Corruption & ethics',
  voting_and_democracy: 'Voting & democracy',
  antitrust_and_competition: 'Antitrust & competition',
  environment_and_energy: 'Environment & energy',
  education_and_student_debt: 'Education & student debt',
  social_safety_net: 'Social safety net',
  other: 'Other',
}

export const DEAD: Status[] = ['never_got_a_vote', 'passed_one_chamber_then_stalled', 'blocked_from_a_vote', 'voted_down', 'weakened', 'vetoed']
export const PENDING: Status[] = ['pending']

export const DIRECTION_LABEL: Record<Direction, string> = {
  for_working_people: 'Serves working people',
  for_concentrated_interests: 'Serves concentrated interests',
  mixed: 'Mixed',
}
export const PARTY_LINE_LABEL: Record<PartyLine, string> = {
  party_line: 'Party-line',
  mostly_party_line: 'Mostly party-line',
  bipartisan: 'Bipartisan',
  unclear: 'No clear split',
}

export const EFFECT_LABEL: Record<IndustryEffectKind, string> = { gains: 'gains', loses: 'loses', entrenched: 'entrenched', mixed: 'mixed' }
export const STANCE_LABEL: Record<Stance, string> = { aligned: 'aligned with the public', opposed: 'against the public', mixed: 'mixed' }
