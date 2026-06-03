import type {
  AnalysisResult,
  ConfidenceLabel,
  ContributorRole,
  ContributorStats,
  EvidenceItem,
  RecognitionCandidate,
  RecognitionGraph,
  RepoRef,
} from './types'

/** Trailing window the report covers. Stated to the user so the population is unambiguous. */
export const WINDOW_DAYS = 120

const DAY_MS = 86_400_000

/** Below this recognition factor a person counts as "not already credited". */
const RECOGNITION_GATE = 0.45
/** Minimum raw under-credit value to surface at all. */
const SCORE_GATE = 8

const rolePriority: ContributorRole[] = [
  'Review Signal',
  'Test Guardian',
  'Documentation Ally',
  'Quiet Maintainer',
  'Release Unblocker',
  'Bug Cartographer',
  'Code Steward',
]

const emptyRecognition: RecognitionGraph = {
  ownerLogin: '',
  totalContributions: 1,
  contributors: {},
}

export function analyzeRecognitionDebt(
  repo: RepoRef,
  evidence: EvidenceItem[],
  mode: 'demo' | 'live',
  recognition: RecognitionGraph = emptyRecognition,
  warnings: string[] = [],
  now: number = Date.now(),
): AnalysisResult {
  // 1. Pin a stable, stated window. Filter by event date, not "recently updated".
  const inWindow = evidence.filter((item) => {
    const t = new Date(item.createdAt).getTime()
    return !Number.isNaN(t) && now - t <= WINDOW_DAYS * DAY_MS
  })

  // 2. Group in-window evidence per contributor (excluding bots/ghosts).
  const grouped = new Map<string, EvidenceItem[]>()
  inWindow.forEach((item) => {
    if (isIgnoredActor(item.actor)) return
    const actorEvidence = grouped.get(item.actor) ?? []
    actorEvidence.push(item)
    grouped.set(item.actor, actorEvidence)
  })

  // 3. Build + gate candidates, then rank by raw under-credit.
  const ranked = [...grouped.entries()]
    .map(([actor, actorEvidence]) => buildCandidate(actor, actorEvidence, recognition))
    .filter((candidate) => candidate.eligible)
    .sort((a, b) => b.rawScore - a.rawScore)
    .slice(0, 6)

  // 4. Normalize the display score relative to the strongest signal in this scan.
  const topRaw = ranked[0]?.rawScore ?? 1
  const candidates: RecognitionCandidate[] = ranked.map((candidate) => ({
    actor: candidate.actor,
    score: Math.max(1, Math.round((candidate.rawScore / topRaw) * 100)),
    confidence: candidate.confidence,
    roles: candidate.roles,
    headline: candidate.headline,
    rationale: candidate.rationale,
    stats: candidate.stats,
    recognitionFactor: candidate.recognitionFactor,
    evidence: candidate.evidence,
  }))

  return {
    repo,
    generatedAt: new Date(now).toISOString(),
    mode,
    windowDays: WINDOW_DAYS,
    candidates,
    evidence: inWindow
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    warnings,
    summary: {
      evidenceCount: inWindow.length,
      contributorCount: grouped.size,
      highestDebtScore: candidates[0]?.score ?? 0,
    },
  }
}

/** Gentle scaling so one heavy dimension (e.g. a maintainer's review volume) can't dominate. */
function damped(value: number, weight: number): number {
  return value > 0 ? weight * Math.sqrt(value) : 0
}

/**
 * 0 = invisible (never authored a commit on the default branch),
 * 1 = the face of the project (owner, or a top-3 all-time committer).
 */
export function recognitionFactor(actor: string, recognition: RecognitionGraph): number {
  const login = actor.toLowerCase()
  if (recognition.ownerLogin && login === recognition.ownerLogin.toLowerCase()) return 1

  const entry = recognition.contributors[login]
  if (!entry) return 0

  const share = entry.contributions / (recognition.totalContributions || 1)
  const rankFactor = entry.rank <= 3 ? 0.85 : entry.rank <= 10 ? 0.5 : 0.2
  return Math.min(1, Math.max(rankFactor, share * 4))
}

/** Raw under-credit signal: collaborative contribution, discounted by how recognized they already are. */
export function underCreditScore(stats: ContributorStats, recognition: number): number {
  const contribution =
    damped(stats.reviews, 6) +
    damped(stats.issues, 4) +
    damped(stats.docsTouches, 4) +
    damped(stats.testTouches, 4) +
    damped(stats.commits, 3) +
    damped(stats.merges, 2)

  const breadth = [
    stats.reviews,
    stats.issues,
    stats.commits,
    stats.docsTouches,
    stats.testTouches,
  ].filter((value) => value > 0).length

  return contribution * (1 - recognition) * (1 + 0.12 * Math.max(0, breadth - 1))
}

export function classifyRoles(
  stats: ContributorStats,
  evidence: EvidenceItem[],
): ContributorRole[] {
  const roles = new Set<ContributorRole>()

  if (stats.reviews >= 2) roles.add('Review Signal')
  if (stats.issues >= 3) roles.add('Bug Cartographer')
  if (stats.merges > 0) roles.add('Release Unblocker')
  if (stats.docsTouches > 0) roles.add('Documentation Ally')
  if (stats.testTouches > 0) roles.add('Test Guardian')
  if (stats.commits >= 2 || stats.mergedPullRequests >= 2) roles.add('Code Steward')
  if (
    stats.totalEvidence >= 4 &&
    stats.mergedPullRequests <= Math.max(1, stats.reviews + stats.issues)
  ) {
    roles.add('Quiet Maintainer')
  }

  if (roles.size === 0 && evidence.length > 0) roles.add('Quiet Maintainer')

  return rolePriority.filter((role) => roles.has(role)).slice(0, 4)
}

type ScoredCandidate = RecognitionCandidate & { rawScore: number; eligible: boolean }

function buildCandidate(
  actor: string,
  evidence: EvidenceItem[],
  recognition: RecognitionGraph,
): ScoredCandidate {
  const allTimeCommits = recognition.contributors[actor.toLowerCase()]?.contributions ?? 0
  const stats = getContributorStats(actor, evidence, allTimeCommits)
  const rf = recognitionFactor(actor, recognition)
  const rawScore = underCreditScore(stats, rf)
  const roles = classifyRoles(stats, evidence)
  const confidence = getConfidence(stats, evidence)

  const breadth = [
    stats.reviews,
    stats.issues,
    stats.commits,
    stats.docsTouches,
    stats.testTouches,
  ].filter((value) => value > 0).length

  // Gates: real, repeated, multi-faceted work from someone not already in the spotlight.
  const eligible =
    stats.totalEvidence >= 2 && breadth >= 2 && rf < RECOGNITION_GATE && rawScore >= SCORE_GATE

  return {
    actor,
    score: 0,
    rawScore,
    eligible,
    confidence,
    roles,
    headline: getHeadline(roles),
    rationale: getRationale(stats, roles),
    stats,
    recognitionFactor: rf,
    evidence: evidence
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5),
  }
}

function getContributorStats(
  actor: string,
  evidence: EvidenceItem[],
  allTimeCommits: number,
): ContributorStats {
  const stats: ContributorStats = {
    actor,
    commits: 0,
    mergedPullRequests: 0,
    reviews: 0,
    issues: 0,
    merges: 0,
    docsTouches: 0,
    testTouches: 0,
    totalEvidence: evidence.length,
    allTimeCommits,
  }

  evidence.forEach((item) => {
    if (item.kind === 'commit') stats.commits += 1
    if (item.kind === 'pull_request') stats.mergedPullRequests += 1
    if (item.kind === 'review') stats.reviews += 1
    if (item.kind === 'issue') stats.issues += 1
    if (item.kind === 'merge') stats.merges += 1

    const files = item.files ?? []
    if (files.some((file) => /(^|\/)(docs?|readme|guides?)/i.test(file))) {
      stats.docsTouches += 1
    }
    if (files.some((file) => /(^|\/)(__tests__|tests?|spec|e2e)/i.test(file))) {
      stats.testTouches += 1
    }
  })

  return stats
}

function getConfidence(
  stats: ContributorStats,
  evidence: EvidenceItem[],
): ConfidenceLabel {
  const linkedEvidence = evidence.filter((item) => item.url).length
  const breadth = [stats.reviews, stats.issues, stats.commits, stats.merges].filter(
    (value) => value > 0,
  ).length

  if (linkedEvidence >= 4 && breadth >= 2) return 'High'
  if (linkedEvidence >= 2 || stats.totalEvidence >= 3) return 'Medium'
  return 'Low'
}

function getHeadline(roles: ContributorRole[]): string {
  const primaryRole = roles[0] ?? 'Quiet Maintainer'

  const headlines: Record<ContributorRole, string> = {
    'Code Steward': 'keeps the code path moving',
    'Review Signal': 'raises the quality bar before merge',
    'Bug Cartographer': 'opens issue trails that later deserve human review',
    'Release Unblocker': 'quietly moves changes over the line',
    'Documentation Ally': 'makes the project easier to understand',
    'Test Guardian': 'protects confidence around risky changes',
    'Quiet Maintainer': 'shows up repeatedly outside the spotlight',
  }

  return headlines[primaryRole]
}

function getRationale(
  stats: ContributorStats,
  roles: ContributorRole[],
): string {
  const signals = [
    stats.reviews ? `${stats.reviews} review signal${plural(stats.reviews)}` : '',
    stats.issues ? `${stats.issues} issue-origin signal${plural(stats.issues)}` : '',
    stats.testTouches ? `${stats.testTouches} test touch${stats.testTouches === 1 ? '' : 'es'}` : '',
    stats.docsTouches ? `${stats.docsTouches} docs touch${stats.docsTouches === 1 ? '' : 'es'}` : '',
    stats.commits ? `${stats.commits} commit signal${plural(stats.commits)}` : '',
  ].filter(Boolean)

  const footprint =
    stats.allTimeCommits > 0
      ? `holds only ${stats.allTimeCommits} all-time commit${plural(stats.allTimeCommits)} on the default branch`
      : 'has authored no commits on the default branch'

  return `Active in the last ${WINDOW_DAYS} days as a ${roles.join(
    ' / ',
  )} — ${signals.join(', ') || 'repeated maintenance work'} — yet ${footprint}, so this work is easy to overlook.`
}

function plural(value: number): string {
  return value === 1 ? '' : 's'
}

export function isIgnoredActor(actor: string): boolean {
  const normalized = actor.trim().toLowerCase()
  return (
    !normalized ||
    normalized === 'ghost' ||
    normalized === 'unknown' ||
    normalized.endsWith('[bot]') ||
    normalized.includes('github-actions') ||
    normalized.includes('dependabot') ||
    normalized.includes('renovate')
  )
}
