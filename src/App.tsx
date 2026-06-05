import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import './App.css'
import { parseGitHubRepoUrl } from './core/githubUrl'
import { demoEvidence, demoRecognition, demoRepo } from './core/sampleData'
import { WINDOW_DAYS, analyzeRecognitionDebt } from './core/scoring'
import type { AnalysisResult, EvidenceItem, GitHubFetchResult, RecognitionCandidate } from './core/types'
import { RateLimitError, fetchGitHubEvidence } from './lib/githubClient'

type LoadState = 'idle' | 'loading' | 'ready' | 'error'
type AiProvider = 'none' | 'openai' | 'anthropic' | 'command'

// Demo data is fixed in time, so anchor its window to the data instead of the wall clock.
const demoNow =
  Math.max(...demoEvidence.map((item) => new Date(item.createdAt).getTime())) + 86_400_000

function runDemo(): AnalysisResult {
  return analyzeRecognitionDebt(
    demoRepo,
    demoEvidence,
    'demo',
    demoRecognition,
    [
      'Demo mode uses synthetic public-style evidence so you can inspect the recognition model without spending GitHub API quota.',
    ],
    demoNow,
  )
}

const initialAnalysis = runDemo()

// Where the project lives. Update if you fork it under a different owner.
const REPO_URL = 'https://github.com/ozansozuozgit/silent-heroes'

// Cohesive chart palette: emerald lead, champagne gold for the celebration, warm supports.
const MIX_COLORS = ['#059669', '#c79a3b', '#14b8a6', '#84a98c', '#b08968']

// Session cache: re-scanning a repo (or reloading the tab) costs zero GitHub API calls.
function scanCacheKey(owner: string, repo: string) {
  return `sh:scan:${owner.toLowerCase()}/${repo.toLowerCase()}`
}
function readScanCache(owner: string, repo: string): GitHubFetchResult | null {
  try {
    const raw = sessionStorage.getItem(scanCacheKey(owner, repo))
    return raw ? (JSON.parse(raw) as GitHubFetchResult) : null
  } catch {
    return null
  }
}
function writeScanCache(result: GitHubFetchResult) {
  try {
    sessionStorage.setItem(
      scanCacheKey(result.repo.owner, result.repo.repo),
      JSON.stringify(result),
    )
  } catch {
    // sessionStorage may be unavailable (private mode / quota) — caching is best-effort.
  }
}

function App() {
  const [repoInput, setRepoInput] = useState('nexu-io/open-design')
  const [token, setToken] = useState('')
  const [status, setStatus] = useState<LoadState>('ready')
  const [statusText, setStatusText] = useState('Demo analysis loaded')
  const [analysis, setAnalysis] = useState<AnalysisResult>(initialAnalysis)
  const [selectedActor, setSelectedActor] = useState(initialAnalysis.candidates[0]?.actor)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [cached, setCached] = useState(false)
  const [rateLimitResetAt, setRateLimitResetAt] = useState<number | null>(null)
  const [aiProvider, setAiProvider] = useState<AiProvider>('none')
  const [aiCredential, setAiCredential] = useState('')
  const [commandAdapter, setCommandAdapter] = useState('claude -p "summarize this evidence as JSON"')

  const selectedCandidate =
    analysis.candidates.find((candidate) => candidate.actor === selectedActor) ??
    analysis.candidates[0]
  const isLoading = status === 'loading'
  const repoLabel = `${analysis.repo.owner}/${analysis.repo.repo}`

  function applyFetchResult(result: GitHubFetchResult, fromCache: boolean) {
    const nextAnalysis = analyzeRecognitionDebt(
      result.repo,
      result.evidence,
      'live',
      result.recognition,
      result.warnings,
    )
    setAnalysis(nextAnalysis)
    setSelectedActor(nextAnalysis.candidates[0]?.actor)
    setStatus('ready')
    setCached(fromCache)
    setRateLimitResetAt(null)

    const label = `${result.repo.owner}/${result.repo.repo}`
    const found = nextAnalysis.candidates.length
    const base = found
      ? `Found ${found} under-credited contributor${found === 1 ? '' : 's'} from ${nextAnalysis.summary.evidenceCount} events in the last ${WINDOW_DAYS} days.`
      : `Scanned ${label}: ${nextAnalysis.summary.evidenceCount} events in the last ${WINDOW_DAYS} days, but only well-known maintainers were active. Nothing under-credited to surface.`
    setStatusText(fromCache ? `Loaded ${label} from cache — no GitHub API used. ${base}` : base)
  }

  async function runLiveAnalysis(force = false) {
    let repo
    try {
      repo = parseGitHubRepoUrl(repoInput)
    } catch (error) {
      setStatus('error')
      setRateLimitResetAt(null)
      setStatusText(error instanceof Error ? error.message : 'Enter a valid GitHub repository.')
      return
    }

    if (!force) {
      const cachedResult = readScanCache(repo.owner, repo.repo)
      if (cachedResult) {
        applyFetchResult(cachedResult, true)
        return
      }
    }

    setStatus('loading')
    setStatusText('Collecting public GitHub evidence…')

    try {
      const result = await fetchGitHubEvidence(repo, token.trim() || undefined)
      writeScanCache(result)
      applyFetchResult(result, false)
    } catch (error) {
      setStatus('error')
      setRateLimitResetAt(error instanceof RateLimitError ? error.resetAt : null)
      setStatusText(error instanceof Error ? error.message : 'Analysis failed.')
    }
  }

  function runDemoAnalysis() {
    const nextAnalysis = runDemo()
    setAnalysis(nextAnalysis)
    setSelectedActor(nextAnalysis.candidates[0]?.actor)
    setStatus('ready')
    setCached(false)
    setRateLimitResetAt(null)
    setStatusText('Demo analysis loaded')
    setSettingsOpen(false)
  }

  function focusToken() {
    window.setTimeout(() => document.getElementById('gh-token-input')?.focus(), 60)
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!isLoading) void runLiveAnalysis()
  }

  return (
    <div className="page">
      <a className="skip-link" href="#stage">Skip to the hero</a>

      <Header
        repoInput={repoInput}
        token={token}
        isLoading={isLoading}
        settingsOpen={settingsOpen}
        onRepoChange={setRepoInput}
        onSubmit={onSubmit}
        onDemo={runDemoAnalysis}
        onToggleSettings={() => setSettingsOpen((open) => !open)}
      />

      {settingsOpen && (
        <SettingsPanel
          token={token}
          aiProvider={aiProvider}
          aiCredential={aiCredential}
          commandAdapter={commandAdapter}
          onTokenChange={setToken}
          onProviderChange={setAiProvider}
          onCredentialChange={setAiCredential}
          onCommandChange={setCommandAdapter}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <main className="shell">
        {rateLimitResetAt !== null && (
          <RateLimitBanner
            resetAt={rateLimitResetAt}
            onAddToken={() => {
              setSettingsOpen(true)
              focusToken()
            }}
            onDismiss={() => setRateLimitResetAt(null)}
          />
        )}

        <ScanLine
          analysis={analysis}
          status={status}
          statusText={statusText}
          repoLabel={repoLabel}
          cached={cached}
          onRefresh={() => void runLiveAnalysis(true)}
        />

        {analysis.candidates.length > 0 ? (
          <Nominees
            candidates={analysis.candidates}
            selectedActor={selectedCandidate?.actor}
            onSelect={setSelectedActor}
          />
        ) : null}

        {selectedCandidate ? (
          <>
            <Stage candidate={selectedCandidate} analysis={analysis} />
            <Charts candidate={selectedCandidate} />
            <DossierRow candidate={selectedCandidate} analysis={analysis} />
          </>
        ) : (
          <EmptyStage analysis={analysis} repoLabel={repoLabel} onDemo={runDemoAnalysis} />
        )}

        <CloneStrip />

        <footer className="footer">
          <span>{repoLabel}</span>
          <span>Generated {formatDate(analysis.generatedAt)}</span>
          <span>
            {analysis.mode === 'live'
              ? `Last ${analysis.windowDays} days · recognition-adjusted · owners & top committers excluded`
              : 'Demo evidence: synthetic public-style events'}
          </span>
          <span className="footer-note">Local-first · no telemetry · evidence opens on github.com</span>
        </footer>
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------ header */

function Header({
  repoInput,
  token,
  isLoading,
  settingsOpen,
  onRepoChange,
  onSubmit,
  onDemo,
  onToggleSettings,
}: {
  repoInput: string
  token: string
  isLoading: boolean
  settingsOpen: boolean
  onRepoChange: (value: string) => void
  onSubmit: (event: React.FormEvent) => void
  onDemo: () => void
  onToggleSettings: () => void
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l2.4 5 5.6.6-4.1 3.8 1.2 5.6L12 20l-5.1 2 1.2-5.6L4 12.6l5.6-.6z" />
          </svg>
        </span>
        <div className="brand-text">
          <strong>Silent Heroes</strong>
          <small>give quiet work its moment</small>
        </div>
      </div>

      <form className="repo-form" onSubmit={onSubmit}>
        <span className="repo-icon" aria-hidden="true"><GitHubMark /></span>
        <input
          id="repo-url"
          aria-label="GitHub repository (owner/repo or URL)"
          value={repoInput}
          onChange={(event) => onRepoChange(event.target.value)}
          placeholder="owner/repo  —  or paste a GitHub URL"
          spellCheck={false}
        />
        <button type="submit" className="btn-accent" disabled={isLoading}>
          {isLoading ? 'Scanning…' : 'Scan repo'}
        </button>
      </form>

      <div className="topbar-actions">
        <button type="button" className="btn-ghost" onClick={onDemo} disabled={isLoading}>
          Demo
        </button>
        <a className="btn-ghost icon star" href={REPO_URL} target="_blank" rel="noopener noreferrer" aria-label="Star Silent Heroes on GitHub">
          <GitHubMark />
          <span>Star</span>
        </a>
        <button
          type="button"
          className={`btn-ghost icon ${settingsOpen ? 'active' : ''} ${token ? 'has-dot' : ''}`}
          onClick={onToggleSettings}
          aria-expanded={settingsOpen}
          aria-label="Settings and connectors"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>Settings</span>
        </button>
      </div>
    </header>
  )
}

function CloneStrip() {
  const cloneCmd = `git clone ${REPO_URL}.git && cd silent-heroes && npm install && npm run dev`
  return (
    <section className="oss-strip" aria-label="Open source">
      <div className="oss-copy">
        <span className="oss-kicker"><GitHubMark /> Open source · MIT</span>
        <h3>Run it on your own machine</h3>
        <p>No backend, no tracking — clone it, scan any public repo, fork it, send a PR.</p>
      </div>
      <div className="oss-actions">
        <div className="clone">
          <code>{cloneCmd}</code>
          <button type="button" onClick={() => void safeCopy(cloneCmd)} aria-label="Copy clone command">
            Copy
          </button>
        </div>
        <div className="oss-links">
          <a className="btn-ghost" href={REPO_URL} target="_blank" rel="noopener noreferrer">
            <GitHubMark /> View on GitHub
          </a>
          <a className="btn-ghost" href={`${REPO_URL}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noopener noreferrer">
            Contribute
          </a>
        </div>
      </div>
    </section>
  )
}

function RateLimitBanner({
  resetAt,
  onAddToken,
  onDismiss,
}: {
  resetAt: number
  onAddToken: () => void
  onDismiss: () => void
}) {
  const secondsLeft = useCountdown(resetAt)
  const mm = Math.floor(secondsLeft / 60)
  const ss = String(secondsLeft % 60).padStart(2, '0')
  const tokenUrl = 'https://github.com/settings/tokens/new?description=Silent%20Heroes'

  return (
    <section className="ratelimit" role="alert">
      <div className="ratelimit-body">
        <span className="ratelimit-clock" aria-hidden="true">{secondsLeft > 0 ? `${mm}:${ss}` : '0:00'}</span>
        <div className="ratelimit-copy">
          <strong>GitHub rate limit reached</strong>
          <p>
            {secondsLeft > 0 ? (
              <>Anonymous scans are capped at ~60 requests/hour per visitor — yours resets in <b>{mm}:{ss}</b>. </>
            ) : (
              <>The limit just reset — you can scan again now. </>
            )}
            A free read-only token lifts this to <b>5,000/hour</b> and stays in this tab only.
          </p>
        </div>
      </div>
      <div className="ratelimit-actions">
        <a className="ratelimit-cta" href={tokenUrl} target="_blank" rel="noopener noreferrer">
          <GitHubMark /> Create a token
        </a>
        <button type="button" className="btn-ghost" onClick={onAddToken}>
          Paste token
        </button>
        <button type="button" className="ratelimit-dismiss" onClick={onDismiss} aria-label="Dismiss">
          ✕
        </button>
      </div>
    </section>
  )
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

/* ----------------------------------------------------------- scan line + nominees */

function ScanLine({
  analysis,
  status,
  statusText,
  repoLabel,
  cached,
  onRefresh,
}: {
  analysis: AnalysisResult
  status: LoadState
  statusText: string
  repoLabel: string
  cached: boolean
  onRefresh: () => void
}) {
  const state = status === 'error' ? 'error' : status === 'loading' ? 'loading' : 'ready'
  return (
    <section className={`scanline ${state}`} aria-label="Scan summary">
      <div className="scanline-main">
        <span className={`mode-tag ${analysis.mode}`}>{analysis.mode === 'live' ? 'Live scan' : 'Demo scan'}</span>
        <strong>{repoLabel}</strong>
        <span className="window-tag">last {analysis.windowDays} days · recognition-adjusted</span>
        {cached && <span className="cached-tag">cached · 0 API calls</span>}
        {analysis.mode === 'live' && (
          <button
            type="button"
            className="refresh-btn"
            onClick={onRefresh}
            disabled={status === 'loading'}
            title="Re-scan with a fresh GitHub request"
          >
            ↻ Refresh
          </button>
        )}
      </div>
      <div className="scanline-stats">
        <span><b>{analysis.candidates.length}</b> under-credited</span>
        <span><b>{analysis.summary.evidenceCount}</b> events</span>
        <span><b>{analysis.summary.contributorCount}</b> people active</span>
      </div>
      <p className="scanline-status" role="status">
        <span className={`dot ${state}`} aria-hidden="true" />
        {statusText}
      </p>
      {status !== 'error' && analysis.warnings.length > 0 && (
        <p className="scanline-warn">{analysis.warnings[0]}</p>
      )}
    </section>
  )
}

const MEDALS = ['gold', 'silver', 'bronze']

function Nominees({
  candidates,
  selectedActor,
  onSelect,
}: {
  candidates: RecognitionCandidate[]
  selectedActor?: string
  onSelect: (actor: string) => void
}) {
  return (
    <section className="nominees" aria-label="Nominees">
      <span className="nominees-label">Nominees</span>
      <div className="nominees-strip">
        {candidates.map((candidate, index) => (
          <button
            key={candidate.actor}
            type="button"
            className={`nominee ${candidate.actor === selectedActor ? 'active' : ''}`}
            onClick={() => onSelect(candidate.actor)}
            aria-pressed={candidate.actor === selectedActor}
          >
            <span className={`nominee-medal ${MEDALS[index] ?? 'plain'}`}>{index + 1}</span>
            <span className="nominee-id">
              <strong>@{candidate.actor}</strong>
              <small>{candidate.roles[0]}</small>
            </span>
            <span className="nominee-score">{candidate.score}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------- the stage */

function Stage({ candidate, analysis }: { candidate: RecognitionCandidate; analysis: AnalysisResult }) {
  const reduceMotion = usePrefersReducedMotion()

  return (
    <section id="stage" className="stage" data-mode={analysis.mode} aria-label="Recognition spotlight">
      <div className="stage-glow" aria-hidden="true" />
      {!reduceMotion && <Confetti seed={candidate.actor} />}

      <article className="hero-card" key={candidate.actor}>
        <header className="hero-card-top">
          <span className="hero-kicker">
            <Sparkle /> Silent Hero
          </span>
          <span className="hero-repo">{analysis.repo.owner}/{analysis.repo.repo}</span>
        </header>

        <div className="medallion" aria-hidden="true">
          <span>{initials(candidate.actor)}</span>
          <i className="ribbon left" />
          <i className="ribbon right" />
        </div>

        <h1 className="hero-name">@{candidate.actor}</h1>
        <p className="hero-headline">{candidate.headline}</p>

        <div className="hero-roles">
          {candidate.roles.map((role) => (
            <span key={role}>{role}</span>
          ))}
        </div>

        <div className="hero-score-block">
          <ScoreRing value={candidate.score} resetKey={candidate.actor} />
          <div className="hero-score-meta">
            <ConfidenceRibbon confidence={candidate.confidence} />
            <p className="hero-footprint">
              {candidate.stats.allTimeCommits === 0
                ? 'No commits on the default branch'
                : `Only ${candidate.stats.allTimeCommits} all-time commit${candidate.stats.allTimeCommits === 1 ? '' : 's'}`}
            </p>
            <p className="hero-footprint sub">yet shaped this project from the shadows</p>
          </div>
        </div>
      </article>

      <div className="stage-actions">
        <button type="button" className="btn-celebrate" onClick={() => copyAwardMarkdown(candidate, analysis)}>
          Copy credit note
        </button>
        <button type="button" className="btn-card" onClick={() => downloadAwardSvg(candidate, analysis)}>
          Download card
        </button>
        <span className="stage-hint">This card is the shareable artifact — give @{candidate.actor} their moment.</span>
      </div>
    </section>
  )
}

function Sparkle() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
      <path d="M12 2l1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6z" />
    </svg>
  )
}

function Confetti({ seed }: { seed: string }) {
  // Deterministic spread derived from the actor name, so it replays on each selection.
  const pieces = useMemo(() => {
    const base = [...seed].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
    return Array.from({ length: 16 }, (_, i) => {
      const n = (base * (i + 3)) % 100
      return {
        left: (n * 1.03) % 100,
        delay: (n % 9) * 70,
        duration: 1700 + ((n * 13) % 1400),
        color: MIX_COLORS[i % MIX_COLORS.length],
        rotate: (n % 2 === 0 ? 1 : -1) * (120 + (n % 220)),
        size: 6 + (n % 6),
      }
    })
  }, [seed])

  return (
    <div className="confetti" key={seed} aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            left: `${p.left}%`,
            background: p.color,
            width: `${p.size}px`,
            height: `${p.size * 1.6}px`,
            ['--delay' as string]: `${p.delay}ms`,
            ['--dur' as string]: `${p.duration}ms`,
            ['--rot' as string]: `${p.rotate}deg`,
          }}
        />
      ))}
    </div>
  )
}

function ScoreRing({ value, resetKey }: { value: number; resetKey: string }) {
  const display = useCountUp(value, resetKey)
  const r = 56
  const c = 2 * Math.PI * r
  const offset = c * (1 - value / 100)

  return (
    <div className="score-ring">
      <svg viewBox="0 0 132 132">
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#34d399" />
            <stop offset="0.55" stopColor="#059669" />
            <stop offset="1" stopColor="#c79a3b" />
          </linearGradient>
        </defs>
        <circle className="ring-track" cx="66" cy="66" r={r} />
        <circle
          className="ring-value"
          cx="66"
          cy="66"
          r={r}
          style={{ strokeDasharray: c, strokeDashoffset: offset }}
        />
      </svg>
      <div className="ring-center">
        <strong>{display}</strong>
        <span>under-credit</span>
      </div>
    </div>
  )
}

function ConfidenceRibbon({ confidence }: { confidence: string }) {
  return <span className={`ribbon-badge ${confidence.toLowerCase()}`}>{confidence} confidence</span>
}

/* --------------------------------------------------------------------- charts */

function Charts({ candidate }: { candidate: RecognitionCandidate }) {
  const s = candidate.stats
  const mix = [
    { key: 'Reviews', value: s.reviews, color: MIX_COLORS[0] },
    { key: 'Issues', value: s.issues, color: MIX_COLORS[1] },
    { key: 'Tests', value: s.testTouches, color: MIX_COLORS[2] },
    { key: 'Docs', value: s.docsTouches, color: MIX_COLORS[3] },
    { key: 'Commits', value: s.commits, color: MIX_COLORS[4] },
  ].filter((m) => m.value > 0)
  const total = mix.reduce((sum, m) => sum + m.value, 0) || 1

  const recognition = Math.round(candidate.recognitionFactor * 100)
  const gap = Math.max(0, candidate.score - recognition)

  return (
    <section className="charts" aria-label="Contribution charts">
      <ContributionDonut mix={mix} total={total} />
      <ActivityBars mix={mix} total={total} />
      <GapMeter impact={candidate.score} recognition={recognition} gap={gap} actor={candidate.actor} />
    </section>
  )
}

function ContributionDonut({
  mix,
  total,
}: {
  mix: Array<{ key: string; value: number; color: string }>
  total: number
}) {
  const stops = mix
    .reduce<{ offset: number; stops: string[] }>(
      (state, m) => {
        const start = (state.offset / total) * 100
        const nextOffset = state.offset + m.value
        const end = (nextOffset / total) * 100
        return {
          offset: nextOffset,
          stops: [...state.stops, `${m.color} ${start}% ${end}%`],
        }
      },
      { offset: 0, stops: [] },
    )
    .stops.join(', ')

  return (
    <div className="chart-card">
      <h3>Where the work went</h3>
      <div className="donut-wrap">
        <div className="donut" style={{ background: `conic-gradient(${stops})` }}>
          <div className="donut-hole">
            <strong>{total}</strong>
            <span>signals</span>
          </div>
        </div>
        <ul className="donut-legend">
          {mix.map((m) => (
            <li key={m.key}>
              <i style={{ background: m.color }} />
              {m.key}
              <b>{m.value}</b>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function ActivityBars({
  mix,
  total,
}: {
  mix: Array<{ key: string; value: number; color: string }>
  total: number
}) {
  const max = Math.max(...mix.map((m) => m.value), 1)
  return (
    <div className="chart-card">
      <h3>Shape of the contribution</h3>
      <div className="bars">
        {mix.map((m) => (
          <div className="bar-row" key={m.key}>
            <span className="bar-label">{m.key}</span>
            <span className="bar-track">
              <span
                className="bar-fill"
                style={{ width: `${(m.value / max) * 100}%`, background: m.color }}
              />
            </span>
            <span className="bar-value">{m.value}</span>
          </div>
        ))}
      </div>
      <p className="chart-foot">{total} public signals across {mix.length} kinds of work.</p>
    </div>
  )
}

function GapMeter({
  impact,
  recognition,
  gap,
  actor,
}: {
  impact: number
  recognition: number
  gap: number
  actor: string
}) {
  return (
    <div className="chart-card gap-card">
      <h3>The credit gap</h3>
      <div className="gap-rows">
        <div className="gap-row">
          <span className="gap-key">Behind-the-scenes impact</span>
          <span className="gap-track">
            <span className="gap-fill impact" style={{ width: `${impact}%` }} />
          </span>
          <span className="gap-num">{impact}</span>
        </div>
        <div className="gap-row">
          <span className="gap-key">Public recognition</span>
          <span className="gap-track">
            <span className="gap-fill rec" style={{ width: `${Math.max(recognition, 2)}%` }} />
          </span>
          <span className="gap-num">{recognition}</span>
        </div>
      </div>
      <p className="gap-callout">
        <strong>@{actor}</strong> is under-credited by roughly <b>{gap}</b> points. That gap is exactly
        what this report exists to close.
      </p>
    </div>
  )
}

/* ------------------------------------------------------------- dossier (why + evidence) */

function DossierRow({
  candidate,
  analysis,
}: {
  candidate: RecognitionCandidate
  analysis: AnalysisResult
}) {
  return (
    <section className="dossier" aria-label="Evidence dossier">
      <div className="dossier-card why-card">
        <h3>Why they deserve the spotlight</h3>
        <p className="why-lede">{candidate.rationale}</p>
        <div className="why-note">
          <strong>{candidate.confidence} confidence, not certainty.</strong> Treat this as a prompt to
          recognize real public work — never an automated award.
        </div>
        <div className="why-reasons">
          {candidate.evidence.slice(0, 3).map((item) => (
            <a key={item.id} className="why-reason" href={item.url} target="_blank" rel="noopener noreferrer">
              <span>{item.kind.replace('_', ' ')}</span>
              <p>{item.title}</p>
            </a>
          ))}
        </div>
      </div>

      <div className="dossier-card evidence-card">
        <div className="evidence-head">
          <h3>The receipts</h3>
          <span>{candidate.evidence.length} linked</span>
        </div>
        <EvidenceList evidence={analysis.evidence} selectedActor={candidate.actor} />
      </div>
    </section>
  )
}

function EvidenceList({ evidence, selectedActor }: { evidence: EvidenceItem[]; selectedActor?: string }) {
  const visibleEvidence = useMemo(() => {
    const sorted = evidence.slice().sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    const selected = sorted.filter((item) => item.actor === selectedActor)
    const rest = sorted.filter((item) => item.actor !== selectedActor)
    return [...selected, ...rest].slice(0, 12)
  }, [evidence, selectedActor])

  if (!visibleEvidence.length) {
    return <p className="empty">No evidence links are available for this scan.</p>
  }

  return (
    <ul className="evidence">
      {visibleEvidence.map((item, index) => (
        <li key={item.id}>
          <a
            className={`evidence-item ${item.actor === selectedActor ? 'highlighted' : ''}`}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ['--delay' as string]: `${Math.min(index, 10) * 26}ms` }}
          >
            <span className="evidence-kind">{item.kind.replace('_', ' ')}</span>
            <span className="evidence-title">{item.title}</span>
            <span className="evidence-meta">
              {formatDate(item.createdAt)} · @{item.actor}
            </span>
            <span className="evidence-arrow" aria-hidden="true">↗</span>
          </a>
        </li>
      ))}
    </ul>
  )
}

function EmptyStage({
  analysis,
  repoLabel,
  onDemo,
}: {
  analysis: AnalysisResult
  repoLabel: string
  onDemo: () => void
}) {
  return (
    <section className="empty-stage" aria-label="No hero surfaced">
      <div className="empty-stage-glow" aria-hidden="true" />
      <span className="hero-kicker"><Sparkle /> Silent Hero</span>
      <h2>The stage stayed empty</h2>
      <p>
        Across the last {analysis.windowDays} days, {repoLabel} showed{' '}
        {analysis.summary.evidenceCount} public events from {analysis.summary.contributorCount} people —
        but everyone active is already the owner or an established top committer. The model stays quiet
        rather than crown someone who’s already in the spotlight.
      </p>
      <button type="button" className="btn-celebrate" onClick={onDemo}>
        See a hero in the demo
      </button>
    </section>
  )
}

/* ------------------------------------------------------------------- settings */

function SettingsPanel({
  token,
  aiProvider,
  aiCredential,
  commandAdapter,
  onTokenChange,
  onProviderChange,
  onCredentialChange,
  onCommandChange,
  onClose,
}: {
  token: string
  aiProvider: AiProvider
  aiCredential: string
  commandAdapter: string
  onTokenChange: (value: string) => void
  onProviderChange: (value: AiProvider) => void
  onCredentialChange: (value: string) => void
  onCommandChange: (value: string) => void
  onClose: () => void
}) {
  return (
    <div className="settings" role="region" aria-label="Settings and connectors">
      <div className="settings-inner">
        <div className="settings-head">
          <div>
            <h2>Connectors</h2>
            <p>Local-first. Keys live in this tab's memory only — a refresh clears them.</p>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Done
          </button>
        </div>

        <div className="settings-grid">
          <label className="field">
            <span className="field-label">GitHub access token</span>
            <input
              id="gh-token-input"
              value={token}
              onChange={(event) => onTokenChange(event.target.value)}
              placeholder="ghp_… read-only, optional"
              type="password"
              spellCheck={false}
            />
            <small>{token ? 'Token set — higher rate limits.' : 'Anonymous scans use GitHub’s low rate limit.'}</small>
          </label>

          <label className="field">
            <span className="field-label">AI provider</span>
            <select value={aiProvider} onChange={(event) => onProviderChange(event.target.value as AiProvider)}>
              <option value="none">None — deterministic scoring</option>
              <option value="openai">OpenAI-compatible / local endpoint</option>
              <option value="anthropic">Anthropic API key</option>
              <option value="command">Command adapter</option>
            </select>
            <input
              value={aiCredential}
              onChange={(event) => onCredentialChange(event.target.value)}
              placeholder="API key or base URL"
              type="password"
              disabled={aiProvider === 'none' || aiProvider === 'command'}
            />
            <small>Summarization-only: cite evidence, preserve confidence, invent nothing.</small>
          </label>

          <label className="field">
            <span className="field-label">CLI command adapter</span>
            <div className="terminal">
              <code>{commandAdapter}</code>
              <button type="button" onClick={() => void safeCopy(commandAdapter)}>
                Copy
              </button>
            </div>
            <input
              value={commandAdapter}
              onChange={(event) => onCommandChange(event.target.value)}
              placeholder="claude -p … / codex exec … / ollama run …"
              spellCheck={false}
            />
            <small>Browsers can’t spawn processes — copy this for the local/CLI build.</small>
          </label>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------- hooks */

function useCountUp(target: number, resetKey: string): number {
  const [value, setValue] = useState(target)
  const frame = useRef(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      frame.current = requestAnimationFrame(() => setValue(target))
      return () => cancelAnimationFrame(frame.current)
    }
    const start = performance.now()
    const duration = 950
    frame.current = requestAnimationFrame(() => setValue(0))
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(target * eased))
      if (p < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [target, resetKey])

  return value
}

function useCountdown(target: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [target])
  return Math.max(0, Math.round((target - now) / 1000))
}

function subscribeReducedMotion(listener: () => void) {
  const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  if (!mq) return () => undefined
  mq.addEventListener?.('change', listener)
  return () => mq.removeEventListener?.('change', listener)
}

function getReducedMotionSnapshot(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function getReducedMotionServerSnapshot(): boolean {
  return false
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  )
}

/* --------------------------------------------------------------------- utils */

function initials(actor: string): string {
  return actor
    .split(/[-_\s]/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function copyAwardMarkdown(candidate: RecognitionCandidate, analysis: AnalysisResult) {
  const note = `Silent Hero: @${candidate.actor}\nRepo: ${analysis.repo.owner}/${analysis.repo.repo}\nRole: ${candidate.roles.join(' / ')}\nConfidence: ${candidate.confidence}\n\n${candidate.rationale}\n\nEvidence:\n${candidate.evidence
    .map((item) => `- ${item.title}: ${item.url}`)
    .join('\n')}`

  void safeCopy(note)
}

async function safeCopy(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return
    }
  } catch {
    // Some browsers block clipboard access outside trusted gestures.
  }

  const textArea = document.createElement('textarea')
  textArea.value = value
  textArea.setAttribute('readonly', 'true')
  textArea.style.position = 'fixed'
  textArea.style.left = '-9999px'
  document.body.appendChild(textArea)
  textArea.select()
  try {
    document.execCommand('copy')
  } catch {
    // Copy is best-effort; never let permission failures break the app.
  } finally {
    document.body.removeChild(textArea)
  }
}

function downloadAwardSvg(candidate: RecognitionCandidate, analysis: AnalysisResult) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="bg" cx="32%" cy="0%" r="90%">
      <stop offset="0" stop-color="#10302326"/>
      <stop offset="1" stop-color="#07140e"/>
    </radialGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#34d399"/>
      <stop offset="0.6" stop-color="#059669"/>
      <stop offset="1" stop-color="#c79a3b"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#07140e"/>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="980" cy="150" r="320" fill="#0f3a2a" opacity="0.5"/>
  <text x="90" y="120" fill="#e6c160" font-size="22" font-family="'JetBrains Mono', monospace" font-weight="600" letter-spacing="4">★ SILENT HERO</text>
  <text x="88" y="250" fill="#f4f7f4" font-size="92" font-family="'Bricolage Grotesque', Georgia, serif" font-weight="700">@${escapeXml(candidate.actor)}</text>
  <text x="92" y="312" fill="#a7c2b3" font-size="30" font-family="'Hanken Grotesk', Arial, sans-serif">${escapeXml(candidate.roles.join('  ·  '))}</text>
  <text x="92" y="372" fill="#cfe0d6" font-size="25" font-family="'Hanken Grotesk', Arial, sans-serif">${escapeXml(candidate.headline)}</text>
  <circle cx="1010" cy="400" r="118" fill="none" stroke="#143a2b" stroke-width="18"/>
  <circle cx="1010" cy="400" r="118" fill="none" stroke="url(#ring)" stroke-width="18" stroke-linecap="round"
    stroke-dasharray="${(2 * Math.PI * 118).toFixed(1)}" stroke-dashoffset="${(2 * Math.PI * 118 * (1 - candidate.score / 100)).toFixed(1)}" transform="rotate(-90 1010 400)"/>
  <text x="1010" y="412" fill="#f4f7f4" font-size="78" font-family="'Bricolage Grotesque', Georgia, serif" font-weight="700" text-anchor="middle">${candidate.score}</text>
  <text x="1010" y="452" fill="#8fa99b" font-size="19" font-family="'JetBrains Mono', monospace" text-anchor="middle">under-credit</text>
  <text x="92" y="492" fill="#8fa99b" font-size="22" font-family="'JetBrains Mono', monospace">${candidate.stats.allTimeCommits === 0 ? 'no commits on default branch' : `only ${candidate.stats.allTimeCommits} all-time commits`} · ${candidate.confidence.toLowerCase()} confidence</text>
  <text x="92" y="556" fill="#cfe0d6" font-size="24" font-family="'Hanken Grotesk', Arial, sans-serif">Public evidence suggests this person quietly shaped ${escapeXml(analysis.repo.owner)}/${escapeXml(analysis.repo.repo)}.</text>
</svg>`
  const blob = new Blob([svg], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `silent-hero-${candidate.actor}.svg`
  link.click()
  URL.revokeObjectURL(url)
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"]/g, (char) => {
    const map: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      '"': '&quot;',
    }
    return map[char] ?? char
  })
}

export default App
