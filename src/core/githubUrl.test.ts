import { describe, expect, it } from 'vitest'
import { parseGitHubRepoUrl } from './githubUrl'

describe('parseGitHubRepoUrl', () => {
  it('parses canonical GitHub URLs', () => {
    expect(parseGitHubRepoUrl('https://github.com/vitejs/vite')).toEqual({
      owner: 'vitejs',
      repo: 'vite',
      url: 'https://github.com/vitejs/vite',
    })
  })

  it('parses shorthand and strips .git suffixes', () => {
    expect(parseGitHubRepoUrl('openai/openai-node.git')).toEqual({
      owner: 'openai',
      repo: 'openai-node',
      url: 'https://github.com/openai/openai-node',
    })
  })

  it('rejects non-GitHub hosts', () => {
    expect(() => parseGitHubRepoUrl('https://gitlab.com/owner/repo')).toThrow(
      /github\.com/,
    )
  })

  it('rejects incomplete input', () => {
    expect(() => parseGitHubRepoUrl('https://github.com/owner')).toThrow(
      /owner and repo/,
    )
  })
})
