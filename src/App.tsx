import { useMemo, useState } from 'react'
import './App.css'
import { parseGitHubRepoUrl } from './core/githubUrl'
import { demoEvidence, demoRecognition, demoRepo } from './core/sampleData'
import { WINDOW_DAYS, analyzeRecognitionDebt } from './core/scoring'
import type { AnalysisResult, EvidenceItem, RecognitionCandidate } from './core/types'
import { fetchGitHubEvidence } from './lib/githubClient'

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

function App() {
  const [repoInput, setRepoInput] = useState('vitejs/vite')
  const [token, setToken] = useState('')
  const [status, setStatus] = useState<LoadState>('ready')
  const [statusText, setStatusText] = useState('Demo analysis loaded')
  const [analysis, setAnalysis] = useState<AnalysisResult>(initialAnalysis)
  const [selectedActor, setSelectedActor] = useState(initialAnalysis.candidates[0]?.actor)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aiProvider, setAiProvider] = useState<AiProvider>('none')
  const [aiCredential, setAiCredential] = useState('')
  const [commandAdapter, setCommandAdapter] = useState('claude -p "summarize this evidence as JSON"')

  const selectedCandidate =
    analysis.candidates.find((candidate) => candidate.actor === selectedActor) ??
    analysis.candidates[0]
  const isLoading = status === 'loading'
  const repoLabel = `${analysis.repo.owner}/${analysis.repo.repo}`

  async function runLiveAnalysis() {
    setStatus('loading')
    setStatusText('Parsing repository and collecting public GitHub evidence…')

    try {
      const repo = parseGitHubRepoUrl(repoInput)
      const result = await fetchGitHubEvidence(repo, token.trim() || undefined)
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
      setStatusText(
        nextAnalysis.candidates.length
          ? `Found ${nextAnalysis.candidates.length} under-credited contributor${
              nextAnalysis.candidates.length === 1 ? '' : 's'
            } from ${nextAnalysis.summary.evidenceCount} events in the last ${WINDOW_DAYS} days.`
          : `Scanned ${repo.owner}/${repo.repo}: ${nextAnalysis.summary.evidenceCount} events in the last ${WINDOW_DAYS} days, but only well-known maintainers were active. Nothing under-credited to surface.`,
      )
    } catch (error) {
      setStatus('error')
      setStatusText(error instanceof Error ? error.message : 'Analysis failed.')
    }
  }

  function runDemoAnalysis() {
    const nextAnalysis = runDemo()
    setAnalysis(nextAnalysis)
    setSelectedActor(nextAnalysis.candidates[0]?.actor)
    setStatus('ready')
    setStatusText('Demo analysis loaded')
    setSettingsOpen(false)
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!isLoading) void runLiveAnalysis()
  }

  return (
    <div className="page">
      <a className="skip-link" href="#report">Skip to report</a>

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
        <SummaryBar analysis={analysis} status={status} statusText={statusText} repoLabel={repoLabel} />

        <section id="report" className="workspace" aria-label="Recognition report">
          <aside className="people" aria-label="People to review">
            <div className="people-head">
              <h2>People to review</h2>
              <span className="count">{analysis.candidates.length}</span>
            </div>
            <p className="people-sub">Ranked by under-credit signal. Highest first.</p>
            <div className="people-list">
              {analysis.candidates.length ? (
                analysis.candidates.map((candidate, index) => (
                  <PersonRow
                    key={candidate.actor}
                    candidate={candidate}
                    index={index + 1}
                    isSelected={candidate.actor === selectedCandidate?.actor}
                    onSelect={() => setSelectedActor(candidate.actor)}
                  />
                ))
              ) : (
                <p className="empty">
                  No under-credited contributor cleared the bar in the last {analysis.windowDays} days.
                  That’s expected when only well-known maintainers were recently active.
                </p>
              )}
            </div>
          </aside>

          <section className="detail" aria-label="Selected person report">
            {selectedCandidate ? (
              <PersonDetail candidate={selectedCandidate} analysis={analysis} />
            ) : (
              <div className="detail-empty">
                <h2>No under-credited contributors surfaced</h2>
                <p>
                  Across the last {analysis.windowDays} days, {repoLabel} showed{' '}
                  {analysis.summary.evidenceCount} public events from{' '}
                  {analysis.summary.contributorCount} people — but everyone active is either the owner
                  or an established top committer. The model stays quiet rather than invent a hero.
                </p>
                <p className="detail-empty-hint">
                  Try a larger or more community-driven repo, or explore the model with the demo.
                </p>
                <button type="button" className="btn-accent" onClick={runDemoAnalysis}>
                  Load demo
                </button>
              </div>
            )}
          </section>
        </section>

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
          <small>public recognition report</small>
        </div>
      </div>

      <form className="repo-form" onSubmit={onSubmit}>
        <span className="repo-prefix">github.com/</span>
        <input
          id="repo-url"
          aria-label="GitHub repository URL"
          value={repoInput}
          onChange={(event) => onRepoChange(event.target.value)}
          placeholder="owner/repo"
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

function SummaryBar({
  analysis,
  status,
  statusText,
  repoLabel,
}: {
  analysis: AnalysisResult
  status: LoadState
  statusText: string
  repoLabel: string
}) {
  const stats = [
    { label: 'under-credited', value: analysis.candidates.length },
    { label: `events · ${analysis.windowDays}d`, value: analysis.summary.evidenceCount },
    { label: 'people active', value: analysis.summary.contributorCount },
  ]
  const state = status === 'error' ? 'error' : status === 'loading' ? 'loading' : 'ready'

  return (
    <section className={`summary ${state}`} aria-label="Scan summary">
      <div className="summary-lede">
        <div className="summary-tags">
          <span className={`mode-tag ${analysis.mode}`}>{analysis.mode === 'live' ? 'Live scan' : 'Demo scan'}</span>
          <span className="window-tag">last {analysis.windowDays} days · recognition-adjusted</span>
        </div>
        <h1>{repoLabel}</h1>
      </div>
      <div className="summary-stats">
        {stats.map((stat) => (
          <div key={stat.label} className="summary-stat">
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </div>
        ))}
      </div>
      <p className="summary-status" role="status">
        <span className={`dot ${state}`} aria-hidden="true" />
        {statusText}
      </p>
      {status !== 'error' && analysis.warnings.length > 0 && (
        <ul className="summary-warnings">
          {analysis.warnings.slice(0, 2).map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

function PersonRow({
  candidate,
  index,
  isSelected,
  onSelect,
}: {
  candidate: RecognitionCandidate
  index: number
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`person-row ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
      aria-pressed={isSelected}
    >
      <span className="row-rank">{String(index).padStart(2, '0')}</span>
      <span className="row-body">
        <strong>@{candidate.actor}</strong>
        <small>{candidate.roles[0]}</small>
      </span>
      <span className="row-meta">
        <b>{candidate.score}</b>
        <small>{candidate.evidence.length} links</small>
      </span>
    </button>
  )
}

function PersonDetail({
  candidate,
  analysis,
}: {
  candidate: RecognitionCandidate
  analysis: AnalysisResult
}) {
  return (
    <article className="person" key={candidate.actor}>
      <header className="person-top">
        <div className="person-id">
          <span className="avatar">{initials(candidate.actor)}</span>
          <div>
            <h2>@{candidate.actor}</h2>
            <p>{candidate.headline}</p>
            <span className="footprint">
              {candidate.stats.allTimeCommits === 0
                ? 'No commits on the default branch'
                : `${candidate.stats.allTimeCommits} all-time commit${candidate.stats.allTimeCommits === 1 ? '' : 's'}`}{' '}
              · low public footprint
            </span>
          </div>
        </div>
        <div className="person-score">
          <strong>{candidate.score}</strong>
          <span>under-credit index</span>
          <ConfidenceChip confidence={candidate.confidence} />
        </div>
      </header>

      <div className="role-tags">
        {candidate.roles.map((role) => (
          <span key={role}>{role}</span>
        ))}
      </div>

      <div className="person-actions">
        <button type="button" className="btn-soft" onClick={() => copyAwardMarkdown(candidate, analysis)}>
          Copy credit note
        </button>
        <button type="button" className="btn-soft" onClick={() => downloadAwardSvg(candidate, analysis)}>
          Download card (SVG)
        </button>
      </div>

      <div className="cards">
        <section className="card reasons-card">
          <div className="card-head">
            <h3>Why review them</h3>
          </div>
          <p className="card-lede">{candidate.rationale}</p>
          <div className="reasons">
            <div className="reason note">
              <strong>{candidate.confidence} confidence, not certainty</strong>
              <p>Treat this as a prompt to review public contribution traces — not an automated award.</p>
            </div>
            {candidate.evidence.slice(0, 3).map((item) => (
              <a className="reason" href={item.url} key={item.id} target="_blank" rel="noopener noreferrer">
                <span className="reason-kind">{item.kind.replace('_', ' ')}</span>
                <p>{item.title}</p>
              </a>
            ))}
          </div>
        </section>

        <section className="card facts-card">
          <div className="card-head">
            <h3>Activity mix</h3>
          </div>
          <CandidateFacts candidate={candidate} />
        </section>
      </div>

      <section className="card evidence-card">
        <div className="card-head">
          <h3>Source links</h3>
          <span className="card-meta">{candidate.evidence.length} linked items</span>
        </div>
        <p className="card-lede">Open the proof before sharing credit.</p>
        <EvidenceList evidence={analysis.evidence} selectedActor={candidate.actor} />
      </section>
    </article>
  )
}

function CandidateFacts({ candidate }: { candidate: RecognitionCandidate }) {
  const facts: Array<[string, number]> = [
    ['Evidence', candidate.stats.totalEvidence],
    ['Reviews', candidate.stats.reviews],
    ['Issues', candidate.stats.issues],
    ['Commits', candidate.stats.commits],
    ['Merged PRs', candidate.stats.mergedPullRequests],
    ['Docs touches', candidate.stats.docsTouches],
    ['Test touches', candidate.stats.testTouches],
    ['Merges', candidate.stats.merges],
  ]
  const visible = facts.filter(([, value]) => value > 0)

  return (
    <dl className="facts">
      {visible.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
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
            style={{ '--delay': `${Math.min(index, 10) * 26}ms` } as React.CSSProperties}
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

function ConfidenceChip({ confidence }: { confidence: string }) {
  return <span className={`chip ${confidence.toLowerCase()}`}>{confidence} confidence</span>
}

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
  <rect width="1200" height="630" fill="#ffffff"/>
  <rect x="40" y="40" width="1120" height="550" rx="24" fill="#fbfbfa" stroke="#e7e7e6" stroke-width="2"/>
  <rect x="40" y="40" width="8" height="550" rx="4" fill="#059669"/>
  <text x="88" y="118" fill="#059669" font-size="22" font-family="'JetBrains Mono', monospace" font-weight="600" letter-spacing="3">SILENT HERO</text>
  <text x="88" y="232" fill="#18181b" font-size="76" font-family="'Bricolage Grotesque', Georgia, serif" font-weight="600">@${escapeXml(candidate.actor)}</text>
  <text x="90" y="292" fill="#5b5b60" font-size="28" font-family="'Hanken Grotesk', Arial, sans-serif">${escapeXml(candidate.roles.join(' · '))}</text>
  <text x="88" y="430" fill="#059669" font-size="112" font-family="'Bricolage Grotesque', Georgia, serif" font-weight="700">${candidate.score}</text>
  <text x="290" y="416" fill="#8a8a90" font-size="24" font-family="'JetBrains Mono', monospace">under-credit index</text>
  <text x="88" y="512" fill="#5b5b60" font-size="26" font-family="'Hanken Grotesk', Arial, sans-serif">Public evidence suggests this person helped shape ${escapeXml(analysis.repo.owner)}/${escapeXml(analysis.repo.repo)}.</text>
  <text x="88" y="552" fill="#8a8a90" font-size="20" font-family="'JetBrains Mono', monospace">${candidate.confidence} confidence · evidence-backed attribution candidate</text>
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
