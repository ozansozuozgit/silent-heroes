import { describe, expect, it } from 'vitest'
import { demoRepo } from './sampleData'
import { analyzeRecognitionDebt, classifyRoles, scoreContributor } from './scoring'
import type { ContributorStats, EvidenceItem } from './types'

describe('scoreContributor', () => {
  it('rewards quiet review and triage work more than visible PR authorship alone', () => {
    const quietReviewer: ContributorStats = {
      actor: 'quiet-reviewer',
      commits: 1,
      mergedPullRequests: 0,
      reviews: 3,
      issues: 2,
      merges: 0,
      docsTouches: 0,
      testTouches: 1,
      totalEvidence: 7,
    }
    const visibleAuthor: ContributorStats = {
      actor: 'visible-author',
      commits: 0,
      mergedPullRequests: 3,
      reviews: 0,
      issues: 0,
      merges: 0,
      docsTouches: 0,
      testTouches: 0,
      totalEvidence: 3,
    }

    expect(scoreContributor(quietReviewer)).toBeGreaterThan(
      scoreContributor(visibleAuthor),
    )
  })
})

describe('classifyRoles', () => {
  it('classifies docs and test maintenance roles from file evidence', () => {
    const stats: ContributorStats = {
      actor: 'maintainer',
      commits: 2,
      mergedPullRequests: 0,
      reviews: 2,
      issues: 0,
      merges: 0,
      docsTouches: 1,
      testTouches: 1,
      totalEvidence: 4,
    }

    expect(classifyRoles(stats, [])).toEqual(
      expect.arrayContaining(['Review Signal', 'Documentation Ally', 'Test Guardian']),
    )
  })
})

describe('analyzeRecognitionDebt', () => {
  it('returns candidates with cautious rationale and evidence links', () => {
    const evidence: EvidenceItem[] = [
      {
        id: 'review-1',
        kind: 'review',
        actor: 'mira',
        title: 'Reviewed risky auth change',
        url: 'https://github.com/acme/repo/pull/1#review',
        createdAt: '2026-05-01T00:00:00Z',
        files: ['tests/auth.spec.ts'],
      },
      {
        id: 'issue-1',
        kind: 'issue',
        actor: 'mira',
        title: 'Reproduced a production bug',
        url: 'https://github.com/acme/repo/issues/2',
        createdAt: '2026-05-02T00:00:00Z',
      },
      {
        id: 'review-2',
        kind: 'review',
        actor: 'mira',
        title: 'Approved safer retry logic',
        url: 'https://github.com/acme/repo/pull/3#review',
        createdAt: '2026-05-03T00:00:00Z',
      },
    ]

    const result = analyzeRecognitionDebt(demoRepo, evidence, 'demo')

    expect(result.candidates[0]?.actor).toBe('mira')
    expect(result.candidates[0]?.rationale).toContain('Public evidence suggests')
    expect(result.candidates[0]?.confidence).toBe('Medium')
    expect(result.candidates[0]?.evidence.every((item) => item.url)).toBe(true)
  })
})
