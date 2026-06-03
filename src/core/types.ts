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
  /** Lifetime commits on the default branch, from the contributor graph. */
  allTimeCommits: number
}

export type RecognitionCandidate = {
  actor: string
  /** Display under-credit index, 0-100, relative to the top candidate in this scan. */
  score: number
  confidence: ConfidenceLabel
  roles: ContributorRole[]
  headline: string
  rationale: string
  stats: ContributorStats
  /** 0 (invisible) to 1 (already highly recognized: owner / top committer). */
  recognitionFactor: number
  evidence: EvidenceItem[]
}

export type AnalysisResult = {
  repo: RepoRef
  generatedAt: string
  mode: 'demo' | 'live'
  /** Trailing window, in days, that the report covers. */
  windowDays: number
  candidates: RecognitionCandidate[]
  evidence: EvidenceItem[]
  warnings: string[]
  summary: {
    /** Evidence items inside the analysis window. */
    evidenceCount: number
    contributorCount: number
    highestDebtScore: number
  }
}

/** All-time contribution graph used to discount already-recognized people. */
export type RecognitionGraph = {
  ownerLogin: string
  totalContributions: number
  contributors: Record<string, { contributions: number; rank: number }>
}

export type GitHubFetchResult = {
  repo: RepoRef
  evidence: EvidenceItem[]
  warnings: string[]
  recognition: RecognitionGraph
}
