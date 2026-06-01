export type EvidenceKind =
  | 'commit'
  | 'pull_request'
  | 'review'
  | 'issue'
  | 'merge'

export type ContributorRole =
  | 'Code Steward'
  | 'Review Signal'
  | 'Bug Cartographer'
  | 'Release Unblocker'
  | 'Documentation Ally'
  | 'Test Guardian'
  | 'Quiet Maintainer'

export type ConfidenceLabel = 'High' | 'Medium' | 'Low'

export type RepoRef = {
  owner: string
  repo: string
  url: string
}

export type EvidenceItem = {
  id: string
  kind: EvidenceKind
  actor: string
  title: string
  url: string
  createdAt: string
  body?: string
  files?: string[]
  additions?: number
  deletions?: number
  state?: 'open' | 'closed' | 'merged'
  reviewState?: string
  targetNumber?: number
}

export type ContributorStats = {
  actor: string
  commits: number
  mergedPullRequests: number
  reviews: number
  issues: number
  merges: number
  docsTouches: number
  testTouches: number
  totalEvidence: number
}

export type RecognitionCandidate = {
  actor: string
  score: number
  confidence: ConfidenceLabel
  roles: ContributorRole[]
  headline: string
  rationale: string
  stats: ContributorStats
  evidence: EvidenceItem[]
}

export type AnalysisResult = {
  repo: RepoRef
  generatedAt: string
  mode: 'demo' | 'live'
  candidates: RecognitionCandidate[]
  evidence: EvidenceItem[]
  warnings: string[]
  summary: {
    evidenceCount: number
    contributorCount: number
    highestDebtScore: number
  }
}

export type GitHubFetchResult = {
  repo: RepoRef
  evidence: EvidenceItem[]
  warnings: string[]
}
