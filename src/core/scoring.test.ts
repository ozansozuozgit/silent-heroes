import { describe, expect, it } from 'vitest'
import { demoRepo } from './sampleData'
import {
  WINDOW_DAYS,
  analyzeRecognitionDebt,
  classifyRoles,
  recognitionFactor,
  underCreditScore,
} from './scoring'
import type { ContributorStats, EvidenceItem, RecognitionGraph } from './types'

const T = Date.parse('2026-05-10T00:00:00Z')
const at = (daysAgo: number) => new Date(T - daysAgo * 86_400_000).toISOString()

function stats(partial: Partial<ContributorStats>): ContributorStats {
  return {
    actor: 'x',
    commits: 0,
    mergedPullRequests: 0,
    reviews: 0,
    issues: 0,
    merges: 0,
    docsTouches: 0,
    testTouches: 0,
    totalEvidence: 0,
    allTimeCommits: 0,
    ...partial,
  }
}

describe('recognitionFactor', () => {
  const graph: RecognitionGraph = {
    ownerLogin: 'acme-owner',
    totalContributions: 1000,
    contributors: {
      topdog: { contributions: 100, rank: 1 },
      midpack: { contributions: 20, rank: 7 },
    },
  }

  it('treats the repo owner as fully recognized', () => {
    expect(recognitionFactor('acme-owner', graph)).toBe(1)
  })

  it('treats a top-3 all-time committer as highly recognized', () => {
    expect(recognitionFactor('topdog', graph)).toBeGreaterThanOrEqual(0.45)
  })

  it('treats a contributor with no authored commits as invisible (the silent hero)', () => {
    expect(recognitionFactor('pure-reviewer', graph)).toBe(0)
  })
})

describe('underCreditScore', () => {
  it('discounts identical work the more recognized the contributor already is', () => {
    const work = stats({ reviews: 4, issues: 2, testTouches: 1, totalEvidence: 7 })
    expect(underCreditScore(work, 0)).toBeGreaterThan(underCreditScore(work, 0.85))
  })
})

describe('classifyRoles', () => {
  it('classifies docs and test maintenance roles from file evidence', () => {
    const maintainer = stats({ commits: 2, reviews: 2, docsTouches: 1, testTouches: 1, totalEvidence: 4 })
    expect(classifyRoles(maintainer, [])).toEqual(
      expect.arrayContaining(['Review Signal', 'Documentation Ally', 'Test Guardian']),
    )
  })
})

describe('analyzeRecognitionDebt', () => {
  const recognition: RecognitionGraph = {
    ownerLogin: 'acme-owner',
    totalContributions: 500,
    contributors: {
      bossmaintainer: { contributions: 500, rank: 1 },
    },
  }

  const evidence: EvidenceItem[] = [
    // mira: invisible reviewer/triager, recent — should surface
    { id: 'r1', kind: 'review', actor: 'mira', title: 'Reviewed risky auth change', url: 'https://x/pull/1#r', createdAt: at(1), files: ['tests/auth.spec.ts'] },
    { id: 'i1', kind: 'issue', actor: 'mira', title: 'Reproduced a production bug', url: 'https://x/issues/2', createdAt: at(2) },
    { id: 'r2', kind: 'review', actor: 'mira', title: 'Approved safer retry logic', url: 'https://x/pull/3#r', createdAt: at(3) },
    // bossmaintainer: same kind of activity but already the top committer — should be excluded
    { id: 'r3', kind: 'review', actor: 'bossmaintainer', title: 'Reviewed', url: 'https://x/pull/4#r', createdAt: at(1) },
    { id: 'r4', kind: 'review', actor: 'bossmaintainer', title: 'Reviewed', url: 'https://x/pull/5#r', createdAt: at(2) },
    { id: 'c1', kind: 'commit', actor: 'bossmaintainer', title: 'Fix', url: 'https://x/commit/abc', createdAt: at(3) },
    // old-timer: real work but outside the window — should be filtered out
    { id: 'r5', kind: 'review', actor: 'old-timer', title: 'Old review', url: 'https://x/pull/6#r', createdAt: at(WINDOW_DAYS + 30) },
    { id: 'i2', kind: 'issue', actor: 'old-timer', title: 'Old issue', url: 'https://x/issues/7', createdAt: at(WINDOW_DAYS + 31) },
  ]

  const result = analyzeRecognitionDebt(demoRepo, evidence, 'demo', recognition, [], T)

  it('surfaces the under-credited contributor first', () => {
    expect(result.candidates[0]?.actor).toBe('mira')
    expect(result.candidates[0]?.confidence).toBe('Medium')
    expect(result.candidates[0]?.evidence.every((item) => item.url)).toBe(true)
  })

  it('excludes already-recognized maintainers', () => {
    expect(result.candidates.find((c) => c.actor === 'bossmaintainer')).toBeUndefined()
  })

  it('respects the stated window and ignores stale evidence', () => {
    expect(result.windowDays).toBe(WINDOW_DAYS)
    expect(result.candidates.find((c) => c.actor === 'old-timer')).toBeUndefined()
    expect(result.evidence.find((item) => item.actor === 'old-timer')).toBeUndefined()
  })
})
