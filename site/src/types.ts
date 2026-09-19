export type Status =
  | 'introduced' | 'in_committee' | 'reported_by_committee' | 'passed_one_chamber'
  | 'passed_both_chambers' | 'enacted' | 'died_in_committee' | 'died_after_passing_one_chamber'
  | 'failed_floor_vote' | 'failed_cloture' | 'vetoed' | 'gutted'

export interface Scores {
  public_benefit: number
  concentrated_cost: number
  burial: number
  support_mismatch: number
  confidence: number
}

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
  headline: string
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
export interface Actor { name: string; role: string; party: string | null; what_they_did: string; sources: string[] }
export interface Vote {
  chamber: string; date: string; roll_number: number; url: string
  question: string | null; result: string | null; yea: number | null; nay: number | null
  by_party: Record<string, { yea: number; nay: number }> | null
}
export interface Action { date: string; text: string; chamber: string | null; votes: Vote[] }
export interface Source { id: string; kind: string; label: string; url: string; date: string | null }
export interface Person { bioguide_id: string; name: string; party: string | null; state: string | null }

export interface Analysis {
  headline: string
  plain_summary: string
  who_benefits: string
  how_it_helps: Claim[]
  who_pays: string
  drawbacks: Claim[]
  benefit_vs_cost: string
  outcome: { status: Status; mechanism: string; narrative: Claim[] }
  key_actors: Actor[]
  trajectory: string | null
  categories: string[]
  scores: Scores
}

export interface BillPage {
  id: string; display: string; congress: number; title: string
  introduced: string | null; origin_chamber: string | null
  policy_area: string | null; subjects: string[]
  sponsors: Person[]; cosponsor_count: number; cosponsor_party_counts: Record<string, number>
  committees: { name: string; chamber: string; activities: string[] }[]
  actions: Action[]; votes: Vote[]
  congress_gov_url: string; text_url: string | null; congress_ended: boolean
  sources: Source[]
  analysis: Analysis
  rank_score: number
  meta: { model: string; prompt_version: string; generated_at: string; record_fetched_at: string; unresolved_citations: string[] }
}

export const STATUS_LABEL: Record<Status, string> = {
  introduced: 'Introduced',
  in_committee: 'In committee',
  reported_by_committee: 'Reported by committee',
  passed_one_chamber: 'Passed one chamber',
  passed_both_chambers: 'Passed both chambers',
  enacted: 'Enacted',
  died_in_committee: 'Died in committee',
  died_after_passing_one_chamber: 'Passed one chamber, died in the other',
  failed_floor_vote: 'Failed floor vote',
  failed_cloture: 'Failed cloture',
  vetoed: 'Vetoed',
  gutted: 'Gutted',
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

export const DEAD: Status[] = ['died_in_committee', 'died_after_passing_one_chamber', 'failed_floor_vote', 'failed_cloture', 'vetoed', 'gutted']
export const PENDING: Status[] = ['introduced', 'in_committee', 'reported_by_committee', 'passed_one_chamber', 'passed_both_chambers']
