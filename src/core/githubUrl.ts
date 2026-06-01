import type { RepoRef } from './types'

const GITHUB_HOSTS = new Set(['github.com', 'www.github.com'])

export function parseGitHubRepoUrl(input: string): RepoRef {
  const trimmed = input.trim()

  if (!trimmed) {
    throw new Error('Enter a public GitHub repository URL.')
  }

  const shorthandMatch = trimmed.match(
    /^(?:@?github:)?(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+?)(?:\.git)?$/,
  )

  if (shorthandMatch?.groups) {
    return normalizeRepoRef(
      shorthandMatch.groups.owner,
      shorthandMatch.groups.repo,
    )
  }

  const sshMatch = trimmed.match(
    /^git@github\.com:(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+?)(?:\.git)?$/,
  )

  if (sshMatch?.groups) {
    return normalizeRepoRef(sshMatch.groups.owner, sshMatch.groups.repo)
  }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error('Use a GitHub URL like https://github.com/owner/repo.')
  }

  if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error('Silent Heroes currently analyzes public github.com repos.')
  }

  const [owner, repo] = url.pathname
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)

  if (!owner || !repo) {
    throw new Error('GitHub URL must include both owner and repo.')
  }

  return normalizeRepoRef(owner, repo)
}

function normalizeRepoRef(owner: string, repo: string): RepoRef {
  const cleanRepo = repo.replace(/\.git$/i, '')

  if (!isValidSegment(owner) || !isValidSegment(cleanRepo)) {
    throw new Error('Repository owner and name contain unsupported characters.')
  }

  return {
    owner,
    repo: cleanRepo,
    url: `https://github.com/${owner}/${cleanRepo}`,
  }
}

function isValidSegment(value: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(value) && !value.startsWith('.')
}
