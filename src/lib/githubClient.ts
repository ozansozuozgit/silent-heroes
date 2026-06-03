import type { EvidenceItem, GitHubFetchResult, RecognitionGraph, RepoRef } from '../core/types'

type GitHubUser = {
  login?: string
}

type GitHubContributor = {
  login?: string
  contributions?: number
}

type GitHubPullRequest = {
  number: number
  title: string
  html_url: string
  user: GitHubUser | null
  merged_at: string | null
  created_at: string
  merged_by?: GitHubUser | null
}

type GitHubIssue = {
  number: number
  title: string
  html_url: string
  user: GitHubUser | null
  created_at: string
  pull_request?: unknown
  state: 'open' | 'closed'
}

type GitHubReview = {
  id: number
  user: GitHubUser | null
  body?: string
  state: string
  html_url: string
  submitted_at: string | null
}

type GitHubCommit = {
  sha: string
  html_url: string
  author?: GitHubUser | null
  commit: {
    message: string
    author?: {
      name?: string
      date?: string
    } | null
  }
  files?: Array<{
    filename: string
    additions: number
    deletions: number
  }>
}

type GitHubFile = {
  filename: string
  additions: number
  deletions: number
}

type GitHubRepo = {
  full_name: string
}

const apiBase = 'https://api.github.com'

export async function fetchGitHubEvidence(
  repo: RepoRef,
  token?: string,
): Promise<GitHubFetchResult> {
  const client = createClient(token)
  const warnings: string[] = []
  const evidence: EvidenceItem[] = []

  await client<GitHubRepo>(`/repos/${repo.owner}/${repo.repo}`)

  // The all-time contributor graph lets scoring discount people who are already
  // recognized (the owner, top committers) instead of crowning them.
  const contributors = await safeRequest<GitHubContributor[]>(
    client,
    `/repos/${repo.owner}/${repo.repo}/contributors?per_page=100&anon=false`,
    warnings,
    'contributor graph',
  )
  const recognition = buildRecognition(repo.owner, contributors)
  if (!contributors || contributors.length === 0) {
    warnings.push(
      'Contributor graph was unavailable, so already-credited maintainers are filtered less strictly.',
    )
  }

  const [pulls, issues, commits] = await Promise.all([
    safeRequest<GitHubPullRequest[]>(
      client,
      `/repos/${repo.owner}/${repo.repo}/pulls?state=closed&sort=updated&direction=desc&per_page=18`,
      warnings,
      'merged pull requests',
    ),
    safeRequest<GitHubIssue[]>(
      client,
      `/repos/${repo.owner}/${repo.repo}/issues?state=all&sort=updated&direction=desc&per_page=24`,
      warnings,
      'recent issues',
    ),
    safeRequest<GitHubCommit[]>(
      client,
      `/repos/${repo.owner}/${repo.repo}/commits?per_page=24`,
      warnings,
      'recent commits',
    ),
  ])

  const mergedPulls = (pulls ?? []).filter((pull) => pull.merged_at)

  const detailedCommits = await Promise.all(
    (commits ?? []).slice(0, 12).map(async (commit) => {
      const detail = await safeRequest<GitHubCommit>(
        client,
        `/repos/${repo.owner}/${repo.repo}/commits/${commit.sha}`,
        warnings,
        `file details for commit ${commit.sha.slice(0, 7)}`,
      )
      return detail ?? commit
    }),
  )

  evidence.push(
    ...mergedPulls.map((pull) => pullToEvidence(pull)),
    ...(issues ?? [])
      .filter((issue) => !issue.pull_request)
      .map((issue) => issueToEvidence(issue)),
    ...detailedCommits.map((commit) => commitToEvidence(commit)),
  )

  const reviewResults = await Promise.all(
    mergedPulls.slice(0, 10).map(async (pull) => {
      const [reviews, files] = await Promise.all([
        safeRequest<GitHubReview[]>(
          client,
          `/repos/${repo.owner}/${repo.repo}/pulls/${pull.number}/reviews?per_page=20`,
          warnings,
          `reviews for PR #${pull.number}`,
        ),
        safeRequest<GitHubFile[]>(
          client,
          `/repos/${repo.owner}/${repo.repo}/pulls/${pull.number}/files?per_page=40`,
          warnings,
          `files for PR #${pull.number}`,
        ),
      ])

      return (reviews ?? [])
        .filter((review) => Boolean(review.user?.login && review.submitted_at))
        .map((review) => reviewToEvidence(review, pull, files ?? []))
    }),
  )

  evidence.push(...reviewResults.flat())

  const mergedByEvidence = mergedPulls
    .filter((pull) => pull.merged_by?.login && pull.merged_by.login !== pull.user?.login)
    .map((pull) => mergeToEvidence(pull))

  evidence.push(...mergedByEvidence)

  return { repo, evidence, warnings: [...new Set(warnings)], recognition }
}

function buildRecognition(
  owner: string,
  contributors: GitHubContributor[] | null,
): RecognitionGraph {
  const map: RecognitionGraph['contributors'] = {}
  let total = 0

  // The contributors endpoint returns logins already sorted by contribution count.
  ;(contributors ?? []).forEach((contributor, index) => {
    if (!contributor.login) return
    const contributions = contributor.contributions ?? 0
    map[contributor.login.toLowerCase()] = { contributions, rank: index + 1 }
    total += contributions
  })

  return {
    ownerLogin: owner,
    totalContributions: total || 1,
    contributors: map,
  }
}

function createClient(token?: string) {
  return async function request<T>(path: string): Promise<T> {
    const response = await fetch(`${apiBase}${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })

    if (!response.ok) {
      const remaining = response.headers.get('x-ratelimit-remaining')
      if (response.status === 404) {
        throw new Error(
          'GitHub could not find that public repository. Check the URL, or use a token for private repos in a local-only scan.',
        )
      }
      if (response.status === 403 && remaining === '0') {
        throw new Error(
          'GitHub API rate limit is exhausted. Add a read-only token or wait for the limit to reset.',
        )
      }
      throw new Error(`${response.status} ${response.statusText}.`)
    }

    return response.json() as Promise<T>
  }
}

async function safeRequest<T>(
  client: <Response>(path: string) => Promise<Response>,
  path: string,
  warnings: string[],
  label: string,
): Promise<T | null> {
  try {
    return await client<T>(path)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown API error'
    warnings.push(`Could not fetch ${label}: ${message}`)
    return null
  }
}

function pullToEvidence(pull: GitHubPullRequest): EvidenceItem {
  return {
    id: `pr-${pull.number}`,
    kind: 'pull_request',
    actor: pull.user?.login ?? 'unknown',
    title: pull.title,
    url: pull.html_url,
    createdAt: pull.merged_at ?? pull.created_at,
    state: 'merged',
    targetNumber: pull.number,
  }
}

function issueToEvidence(issue: GitHubIssue): EvidenceItem {
  return {
    id: `issue-${issue.number}`,
    kind: 'issue',
    actor: issue.user?.login ?? 'unknown',
    title: issue.title,
    url: issue.html_url,
    createdAt: issue.created_at,
    state: issue.state,
    targetNumber: issue.number,
  }
}

function commitToEvidence(commit: GitHubCommit): EvidenceItem {
  const files = commit.files ?? []

  return {
    id: `commit-${commit.sha}`,
    kind: 'commit',
    actor: commit.author?.login ?? 'unknown',
    title: commit.commit.message.split('\n')[0] ?? 'Commit',
    url: commit.html_url,
    createdAt: commit.commit.author?.date ?? new Date().toISOString(),
    files: files.map((file) => file.filename),
    additions: files.reduce((total, file) => total + file.additions, 0),
    deletions: files.reduce((total, file) => total + file.deletions, 0),
  }
}

function reviewToEvidence(
  review: GitHubReview,
  pull: GitHubPullRequest,
  files: GitHubFile[],
): EvidenceItem {
  return {
    id: `review-${pull.number}-${review.id}`,
    kind: 'review',
    actor: review.user?.login ?? 'unknown',
    title: `${review.state.toLowerCase()} review on #${pull.number}: ${pull.title}`,
    url: review.html_url,
    createdAt: review.submitted_at ?? pull.created_at,
    body: review.body,
    reviewState: review.state,
    files: files.map((file) => file.filename),
    additions: files.reduce((total, file) => total + file.additions, 0),
    deletions: files.reduce((total, file) => total + file.deletions, 0),
    targetNumber: pull.number,
  }
}

function mergeToEvidence(pull: GitHubPullRequest): EvidenceItem {
  return {
    id: `merge-${pull.number}-${pull.merged_by?.login}`,
    kind: 'merge',
    actor: pull.merged_by?.login ?? 'unknown',
    title: `Merged #${pull.number}: ${pull.title}`,
    url: pull.html_url,
    createdAt: pull.merged_at ?? pull.created_at,
    targetNumber: pull.number,
  }
}
