import type {
  AnalysisResult,
  ConfidenceLabel,
  ContributorRole,
  ContributorStats,
  EvidenceItem,
  RecognitionCandidate,
  RepoRef,
} from './types'

const rolePriority: ContributorRole[] = [
  'Review Signal',
  'Test Guardian',
  'Documentation Ally',
  'Quiet Maintainer',
  'Release Unblocker',
  'Bug Cartographer',
  'Code Steward',
]

export function analyzeRecognitionDebt(
  repo: RepoRef,
  evidence: EvidenceItem[],
  mode: 'demo' | 'live',
  warnings: string[] = [],
): AnalysisResult {
  const grouped = new Map<string, EvidenceItem[]>()

  evidence.forEach((item) => {
    if (isIgnoredActor(item.actor)) return
    const actorEvidence = grouped.get(item.actor) ?? []
    actorEvidence.push(item)
    grouped.set(item.actor, actorEvidence)
  })

  const candidates = [...grouped.entries()]
    .map(([actor, actorEvidence]) => buildCandidate(actor, actorEvidence))
    .filter((candidate) => candidate.score >= 22)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)

  return {
    repo,
    generatedAt: new Date().toISOString(),
    mode,
    candidates,
    evidence: evidence
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    warnings,
    summary: {
      evidenceCount: evidence.length,
      contributorCount: grouped.size,
      highestDebtScore: candidates[0]?.score ?? 0,
    },
  }
}

export function scoreContributor(stats: ContributorStats): number {
  const influence =
    stats.reviews * 18 +
    stats.issues * 6 +
    stats.merges * 12 +
    stats.commits * 8 +
    stats.docsTouches * 5 +
    stats.testTouches * 5

  const spotlight = stats.mergedPullRequests * 14
  const quietWorkBonus =
    stats.reviews >= 2 || stats.issues >= 3 || stats.merges >= 1 ? 14 : 0
  const breadthBonus =
    [stats.reviews, stats.issues, stats.commits, stats.docsTouches, stats.testTouches]
      .filter((value) => value > 0).length * 4
  const underCreditAdjustment = Math.max(0, influence - spotlight) * 0.42

  return Math.min(
    100,
    Math.round(influence * 0.45 + underCreditAdjustment + quietWorkBonus + breadthBonus),
  )
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

function buildCandidate(
  actor: string,
  evidence: EvidenceItem[],
): RecognitionCandidate {
  const stats = getContributorStats(actor, evidence)
  const score = scoreContributor(stats)
  const roles = classifyRoles(stats, evidence)
  const confidence = getConfidence(stats, evidence)

  return {
    actor,
    score,
    confidence,
    roles,
    headline: getHeadline(roles),
    rationale: getRationale(stats, roles),
    stats,
    evidence: evidence
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 5),
  }
}

function getContributorStats(
  actor: string,
  evidence: EvidenceItem[],
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
    stats.commits ? `${stats.commits} commit signal${plural(stats.commits)}` : '',
    stats.merges ? `${stats.merges} merge signal${plural(stats.merges)}` : '',
  ].filter(Boolean)

  return `Public evidence suggests ${stats.actor} may be under-credited as a ${roles.join(
    ' / ',
  )}: ${signals.join(', ') || 'repeated maintenance work'} with ${stats.mergedPullRequests} authored merged PR${plural(
    stats.mergedPullRequests,
  )}.`
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
