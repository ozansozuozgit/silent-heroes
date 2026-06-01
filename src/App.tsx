import { useMemo, useState } from 'react'
import './App.css'
import { parseGitHubRepoUrl } from './core/githubUrl'
import { demoEvidence, demoRepo } from './core/sampleData'
import { analyzeRecognitionDebt } from './core/scoring'
import type { AnalysisResult, EvidenceItem, RecognitionCandidate } from './core/types'
import { fetchGitHubEvidence } from './lib/githubClient'

type LoadState = 'idle' | 'loading' | 'ready' | 'error'
type AiProvider = 'none' | 'openai' | 'anthropic' | 'command'

const initialAnalysis = analyzeRecognitionDebt(demoRepo, demoEvidence, 'demo', [
  'Demo mode uses synthetic public-style evidence so you can inspect the recognition model without spending GitHub API quota.',
])

const providerLabels: Record<AiProvider, string> = {
  none: 'Deterministic only',
  openai: 'OpenAI-compatible',
  anthropic: 'Anthropic BYOK',
  command: 'Local CLI adapter',
}

function App() {
  const [repoInput, setRepoInput] = useState('https://github.com/vitejs/vite')
  const [token, setToken] = useState('')
  const [status, setStatus] = useState<LoadState>('ready')
  const [statusText, setStatusText] = useState('Demo analysis loaded')
  const [analysis, setAnalysis] = useState<AnalysisResult>(initialAnalysis)
  const [selectedActor, setSelectedActor] = useState(initialAnalysis.candidates[0]?.actor)
  const [connectionsOpen, setConnectionsOpen] = useState(true)
  const [aiProvider, setAiProvider] = useState<AiProvider>('none')
  const [aiCredential, setAiCredential] = useState('')
  const [commandAdapter, setCommandAdapter] = useState('claude -p "summarize this evidence as JSON"')

  const selectedCandidate =
    analysis.candidates.find((candidate) => candidate.actor === selectedActor) ??
    analysis.candidates[0]
  const isLoading = status === 'loading'
  const repoLabel = `${analysis.repo.owner}/${analysis.repo.repo}`
  const adapterState = getAdapterState(token, aiProvider, aiCredential, commandAdapter)

  async function runLiveAnalysis() {
    setStatus('loading')
    setStatusText('Parsing repository and collecting public GitHub evidence...')

    try {
      const repo = parseGitHubRepoUrl(repoInput)
      const result = await fetchGitHubEvidence(repo, token.trim() || undefined)
      const nextAnalysis = analyzeRecognitionDebt(
        result.repo,
        result.evidence,
        'live',
        result.warnings,
      )

      setAnalysis(nextAnalysis)
      setSelectedActor(nextAnalysis.candidates[0]?.actor)
      setStatus('ready')
      setStatusText(
        nextAnalysis.evidence.length
          ? `Analyzed ${nextAnalysis.evidence.length} public evidence items from ${repo.owner}/${repo.repo}.`
          : `Connected to ${repo.owner}/${repo.repo}, but GitHub returned no usable recent evidence.`,
      )
    } catch (error) {
      setStatus('error')
      setStatusText(error instanceof Error ? error.message : 'Analysis failed.')
    }
  }

  function runDemoAnalysis() {
    const nextAnalysis = analyzeRecognitionDebt(demoRepo, demoEvidence, 'demo', [
      'Demo mode uses synthetic public-style evidence so you can inspect the recognition model without spending GitHub API quota.',
    ])
    setAnalysis(nextAnalysis)
    setSelectedActor(nextAnalysis.candidates[0]?.actor)
    setStatus('ready')
    setStatusText('Demo analysis loaded')
  }

  return (
    <main className="app-shell">
      <a className="skip-link" href="#dossier">Skip to dossier</a>
      <CommandBar
        repoInput={repoInput}
        token={token}
        status={status}
        providerLabel={providerLabels[aiProvider]}
        connectionsOpen={connectionsOpen}
        isLoading={isLoading}
        onRepoChange={setRepoInput}
        onTokenChange={setToken}
        onAnalyze={runLiveAnalysis}
        onDemo={runDemoAnalysis}
        onToggleConnections={() => setConnectionsOpen((open) => !open)}
      />

      <section className="intro-strip" aria-label="Product summary">
        <div>
          <p className="eyebrow">Recognition intelligence</p>
          <h1>Trace the public evidence behind quiet contribution.</h1>
        </div>
        <p>
          Silent Heroes reads GitHub activity like a case file: candidates, roles,
          confidence, and the links that justify every claim. No repo install. No
          hidden surveillance.
        </p>
      </section>

      <section className="console-layout">
        <aside className="candidate-rail" aria-label="Recognition candidates">
          <div className="rail-heading">
            <span>ranked candidates</span>
            <strong>{analysis.candidates.length}</strong>
          </div>
          <div className="candidate-list">
            {analysis.candidates.length ? (
              analysis.candidates.map((candidate, index) => (
                <CandidateCard
                  key={candidate.actor}
                  candidate={candidate}
                  index={index + 1}
                  isSelected={candidate.actor === selectedCandidate?.actor}
                  onSelect={() => setSelectedActor(candidate.actor)}
                />
              ))
            ) : (
              <div className="empty-state compact">
                No candidates crossed the evidence threshold. Try demo mode, add a
                token, or scan a repo with recent public activity.
              </div>
            )}
          </div>
        </aside>

        <section id="dossier" className="dossier-panel" aria-label="Selected candidate dossier">
          <div className="dossier-header">
            <div>
              <p className="eyebrow">current dossier</p>
              <h2>{selectedCandidate ? `@${selectedCandidate.actor}` : 'No candidate selected'}</h2>
              <p>{selectedCandidate?.rationale ?? 'Scan a repository to create a recognition dossier.'}</p>
            </div>
            {selectedCandidate && (
              <ConfidenceChip confidence={selectedCandidate.confidence} />
            )}
          </div>

          <MetricDeck analysis={analysis} />

          <div className="dossier-grid">
            <div className="evidence-map panel-card">
              <div className="section-heading slim">
                <p className="eyebrow">influence trace</p>
                <h3>Evidence → person → role</h3>
              </div>
              <EvidenceBeams candidate={selectedCandidate} />
            </div>
            <ScanPipeline status={status} text={statusText} warnings={analysis.warnings} mode={analysis.mode} />
          </div>

          <section className="timeline-section panel-card">
            <div className="section-heading">
              <p className="eyebrow">evidence timeline</p>
              <h3>Every claim remains attached to public links</h3>
            </div>
            <EvidenceTimeline evidence={analysis.evidence} selectedActor={selectedCandidate?.actor} />
          </section>
        </section>

        <aside className="inspector-panel" aria-label="Share and connections inspector">
          <AwardPreview candidate={selectedCandidate} analysis={analysis} />
          <ConnectionPanel
            open={connectionsOpen}
            token={token}
            aiProvider={aiProvider}
            aiCredential={aiCredential}
            commandAdapter={commandAdapter}
            adapterState={adapterState}
            onTokenChange={setToken}
            onProviderChange={setAiProvider}
            onCredentialChange={setAiCredential}
            onCommandChange={setCommandAdapter}
          />
          <section className="method-card">
            <p className="eyebrow">method</p>
            <h3>Scores stay deterministic.</h3>
            <p>
              AI adapters are designed for evidence-cited summarization only. The
              recognition score, confidence label, and source links stay grounded in
              the local TypeScript attribution core.
            </p>
          </section>
        </aside>
      </section>

      <footer className="footer-strip">
        <span>{repoLabel}</span>
        <span>{formatDate(analysis.generatedAt)}</span>
        <span>
          {analysis.mode === 'live'
            ? 'Live MVP window: latest PRs, issues, commits, review/file details.'
            : 'Demo evidence: synthetic public-style events.'}
        </span>
      </footer>
    </main>
  )
}

function CommandBar({
  repoInput,
  token,
  status,
  providerLabel,
  connectionsOpen,
  isLoading,
  onRepoChange,
  onTokenChange,
  onAnalyze,
  onDemo,
  onToggleConnections,
}: {
  repoInput: string
  token: string
  status: LoadState
  providerLabel: string
  connectionsOpen: boolean
  isLoading: boolean
  onRepoChange: (value: string) => void
  onTokenChange: (value: string) => void
  onAnalyze: () => void
  onDemo: () => void
  onToggleConnections: () => void
}) {
  return (
    <header className="command-bar">
      <div className="brand-lockup">
        <span className="brand-mark">SH</span>
        <div>
          <strong>Silent Heroes</strong>
          <small>public attribution console</small>
        </div>
      </div>
      <label className="repo-field" htmlFor="repo-url">
        <span>repository</span>
        <input
          id="repo-url"
          value={repoInput}
          onChange={(event) => onRepoChange(event.target.value)}
          placeholder="https://github.com/owner/repo"
        />
      </label>
      <label className="token-field" htmlFor="github-token">
        <span>github token</span>
        <input
          id="github-token"
          aria-label="Optional GitHub token"
          value={token}
          onChange={(event) => onTokenChange(event.target.value)}
          placeholder="optional"
          type="password"
        />
      </label>
      <div className="command-status">
        <StatusPill label={token ? 'GitHub token' : 'Anonymous'} state={token ? 'ok' : 'muted'} />
        <StatusPill label={providerLabel} state="muted" />
        <StatusPill label={status === 'loading' ? 'Scanning' : status} state={status === 'error' ? 'warn' : status === 'ready' ? 'ok' : 'muted'} />
      </div>
      <div className="command-actions">
        <button type="button" className="secondary-action" onClick={onToggleConnections}>
          {connectionsOpen ? 'Hide connectors' : 'Connect'}
        </button>
        <button type="button" className="secondary-action" onClick={onDemo} disabled={isLoading}>
          Demo
        </button>
        <button type="button" className="primary-action" onClick={onAnalyze} disabled={isLoading}>
          {isLoading ? 'Scanning…' : 'Scan repo'}
        </button>
      </div>
    </header>
  )
}

function StatusPill({ label, state }: { label: string; state: 'ok' | 'warn' | 'muted' }) {
  return <span className={`status-pill ${state}`}>{label}</span>
}

function CandidateCard({
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
      className={`candidate-card ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
    >
      <span className="candidate-rank">{String(index).padStart(2, '0')}</span>
      <span className="candidate-avatar">{initials(candidate.actor)}</span>
      <span className="candidate-main">
        <strong>@{candidate.actor}</strong>
        <small>{candidate.headline}</small>
        <span className="role-row">
          {candidate.roles.slice(0, 3).map((role) => (
            <em key={role}>{role}</em>
          ))}
        </span>
      </span>
      <span className="candidate-score">
        <strong>{candidate.score}</strong>
        <ConfidenceChip confidence={candidate.confidence} compact />
      </span>
    </button>
  )
}

function ConfidenceChip({ confidence, compact = false }: { confidence: string; compact?: boolean }) {
  return <span className={`confidence-chip ${confidence.toLowerCase()} ${compact ? 'compact' : ''}`}>{confidence}</span>
}

function MetricDeck({ analysis }: { analysis: AnalysisResult }) {
  const metrics = [
    ['evidence', analysis.summary.evidenceCount.toString()],
    ['contributors', analysis.summary.contributorCount.toString()],
    ['debt high', analysis.summary.highestDebtScore.toString()],
    ['snapshot', formatDate(analysis.generatedAt)],
  ]

  return (
    <section className="metric-deck" aria-label="Analysis summary">
      {metrics.map(([label, value]) => (
        <article className="metric-card" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </article>
      ))}
    </section>
  )
}

function ScanPipeline({
  status,
  text,
  warnings,
  mode,
}: {
  status: LoadState
  text: string
  warnings: string[]
  mode: 'demo' | 'live'
}) {
  const steps = [
    'Parse repo URL',
    'Fetch pull requests',
    'Collect reviews and files',
    'Score recognition debt',
    'Build evidence dossier',
  ]
  const activeIndex = status === 'loading' ? 2 : status === 'error' ? 1 : 4

  return (
    <section className={`scan-pipeline panel-card ${status}`}>
      <div className="section-heading slim">
        <p className="eyebrow">scan pipeline</p>
        <h3>{mode === 'live' ? 'Live GitHub evidence' : 'Demo evidence'}</h3>
      </div>
      <ol>
        {steps.map((step, index) => (
          <li key={step} className={index < activeIndex ? 'done' : index === activeIndex ? status : ''}>
            <span />
            <p>{step}</p>
          </li>
        ))}
      </ol>
      <div className="pipeline-status">
        <strong>{text}</strong>
        {warnings.length > 0 && (
          <ul>
            {warnings.slice(0, 3).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function EvidenceBeams({ candidate }: { candidate?: RecognitionCandidate }) {
  if (!candidate) {
    return <div className="empty-state compact">Select a candidate to see evidence relationships.</div>
  }

  const evidence = candidate.evidence.slice(0, 5)
  return (
    <div className="beam-map">
      <svg viewBox="0 0 520 260" role="img" aria-label="Evidence beams map">
        <defs>
          <linearGradient id="beam" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#6f7780" stopOpacity="0.2" />
            <stop offset="1" stopColor="#e8b45a" stopOpacity="0.9" />
          </linearGradient>
        </defs>
        {evidence.map((item, index) => {
          const y = 34 + index * 45
          return (
            <g key={item.id}>
              <path className="beam-line" d={`M 88 ${y} C 190 ${y}, 248 130, 342 130`} />
              <circle cx="82" cy={y} r="8" />
            </g>
          )
        })}
        <circle className="beam-person" cx="382" cy="130" r="44" />
        <text x="382" y="124" textAnchor="middle">@</text>
        <text x="382" y="146" textAnchor="middle">{initials(candidate.actor)}</text>
      </svg>
      <div className="beam-labels">
        {evidence.map((item) => (
          <span key={item.id}>{item.kind.replace('_', ' ')}</span>
        ))}
      </div>
    </div>
  )
}

function EvidenceTimeline({ evidence, selectedActor }: { evidence: EvidenceItem[]; selectedActor?: string }) {
  const visibleEvidence = useMemo(() => {
    const sorted = evidence.slice().sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    const selected = sorted.filter((item) => item.actor === selectedActor)
    const rest = sorted.filter((item) => item.actor !== selectedActor)
    return [...selected, ...rest].slice(0, 14)
  }, [evidence, selectedActor])

  if (!visibleEvidence.length) {
    return <div className="empty-state">No evidence links are available for this scan.</div>
  }

  return (
    <div className="timeline">
      {visibleEvidence.map((item, index) => (
        <a
          key={item.id}
          className={`timeline-item ${item.actor === selectedActor ? 'highlighted' : ''}`}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ '--delay': `${index * 28}ms` } as React.CSSProperties}
        >
          <span className="timeline-kind">{item.kind.replace('_', ' ')}</span>
          <strong>{item.title}</strong>
          <small>
            {formatDate(item.createdAt)} · by @{item.actor}
          </small>
        </a>
      ))}
    </div>
  )
}

function AwardPreview({
  candidate,
  analysis,
}: {
  candidate?: RecognitionCandidate
  analysis: AnalysisResult
}) {
  if (!candidate) {
    return (
      <section className="award-card panel-card">
        <p className="eyebrow">share artifact</p>
        <div className="empty-state compact">Run a scan to generate a shareable recognition card.</div>
      </section>
    )
  }

  return (
    <section className="award-card panel-card" aria-label="Shareable award preview">
      <div className="award-frame">
        <span className="award-kicker">Silent Hero dossier</span>
        <h2>@{candidate.actor}</h2>
        <p>{candidate.headline}</p>
        <div className="award-score">
          <strong>{candidate.score}</strong>
          <span>recognition debt</span>
        </div>
        <div className="award-actions">
          <button type="button" onClick={() => copyAwardMarkdown(candidate, analysis)}>
            Copy credit note
          </button>
          <button type="button" onClick={() => downloadAwardSvg(candidate, analysis)}>
            Download SVG
          </button>
        </div>
        <div className="award-footer">
          <span>{candidate.confidence} confidence</span>
          <span>{analysis.repo.owner}/{analysis.repo.repo}</span>
        </div>
      </div>
    </section>
  )
}

function ConnectionPanel({
  open,
  token,
  aiProvider,
  aiCredential,
  commandAdapter,
  adapterState,
  onTokenChange,
  onProviderChange,
  onCredentialChange,
  onCommandChange,
}: {
  open: boolean
  token: string
  aiProvider: AiProvider
  aiCredential: string
  commandAdapter: string
  adapterState: string
  onTokenChange: (value: string) => void
  onProviderChange: (value: AiProvider) => void
  onCredentialChange: (value: string) => void
  onCommandChange: (value: string) => void
}) {
  if (!open) {
    return (
      <section className="connection-panel collapsed panel-card">
        <p className="eyebrow">connections</p>
        <strong>{adapterState}</strong>
        <small>Open the command bar connector to configure GitHub, BYOK, or CLI adapters.</small>
      </section>
    )
  }

  return (
    <section className="connection-panel panel-card">
      <div className="section-heading slim">
        <p className="eyebrow">connections</p>
        <h3>Local-first adapters</h3>
      </div>

      <ConnectorRow
        step="01"
        title="GitHub access"
        state={token ? 'configured' : 'anonymous'}
        copy={token ? 'Token lives only in browser memory. Refresh clears it.' : 'Anonymous public scans use GitHub’s low rate limit.'}
      >
        <input
          value={token}
          onChange={(event) => onTokenChange(event.target.value)}
          placeholder="ghp_… read-only token, optional"
          type="password"
        />
      </ConnectorRow>

      <ConnectorRow
        step="02"
        title="AI provider"
        state={providerLabels[aiProvider]}
        copy="AI is summarization-only: cite evidence, preserve confidence, invent nothing."
      >
        <select value={aiProvider} onChange={(event) => onProviderChange(event.target.value as AiProvider)}>
          <option value="none">None — deterministic evidence scoring</option>
          <option value="openai">OpenAI-compatible / local endpoint</option>
          <option value="anthropic">Anthropic API key</option>
          <option value="command">Command adapter</option>
        </select>
        <input
          value={aiCredential}
          onChange={(event) => onCredentialChange(event.target.value)}
          placeholder="API key or base URL, kept local to this tab"
          type="password"
          disabled={aiProvider === 'none' || aiProvider === 'command'}
        />
      </ConnectorRow>

      <ConnectorRow
        step="03"
        title="CLI command adapter"
        state={aiProvider === 'command' ? 'selected' : 'optional'}
        copy="Browsers cannot spawn local processes. Copy this for the future CLI/local build."
      >
        <div className="terminal-card">
          <code>{commandAdapter}</code>
          <button type="button" onClick={() => safeCopy(commandAdapter)}>
            Copy command
          </button>
        </div>
        <input
          value={commandAdapter}
          onChange={(event) => onCommandChange(event.target.value)}
          placeholder="claude -p … / codex exec … / ollama run …"
        />
      </ConnectorRow>

      <div className="privacy-strip">🔒 Local-first · no telemetry · no storage · evidence opens on github.com</div>
    </section>
  )
}

function ConnectorRow({
  step,
  title,
  state,
  copy,
  children,
}: {
  step: string
  title: string
  state: string
  copy: string
  children: React.ReactNode
}) {
  return (
    <article className="connector-row">
      <div className="connector-meta">
        <span>{step}</span>
        <div>
          <strong>{title}</strong>
          <small>{copy}</small>
        </div>
        <em>{state}</em>
      </div>
      <div className="connector-controls">{children}</div>
    </article>
  )
}

function getAdapterState(token: string, aiProvider: AiProvider, aiCredential: string, commandAdapter: string) {
  const gitHub = token ? 'GitHub token configured' : 'Anonymous GitHub'
  const ai = aiProvider === 'none' ? 'no AI' : aiProvider === 'command' ? `CLI: ${commandAdapter.split(' ')[0]}` : aiCredential ? `${providerLabels[aiProvider]} configured` : `${providerLabels[aiProvider]} missing key`
  return `${gitHub} · ${ai}`
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
  <rect width="1200" height="630" fill="#0b0d0e"/>
  <rect x="48" y="48" width="1104" height="534" rx="28" fill="#111519" stroke="#2a3036" stroke-width="2"/>
  <path d="M72 94 H1128" stroke="#e8b45a" stroke-opacity="0.8" stroke-width="3"/>
  <text x="86" y="126" fill="#e8b45a" font-size="24" font-family="Menlo, monospace" font-weight="700" letter-spacing="5">SILENT HERO DOSSIER</text>
  <text x="86" y="242" fill="#eef0f2" font-size="74" font-family="Georgia, serif">@${escapeXml(candidate.actor)}</text>
  <text x="88" y="306" fill="#a8afb7" font-size="30" font-family="Arial, sans-serif">${escapeXml(candidate.roles.join(' / '))}</text>
  <text x="88" y="420" fill="#e8b45a" font-size="104" font-family="Arial, sans-serif" font-weight="900">${candidate.score}</text>
  <text x="250" y="406" fill="#a8afb7" font-size="25" font-family="Menlo, monospace">recognition debt score</text>
  <text x="88" y="512" fill="#d8dcdf" font-size="26" font-family="Arial, sans-serif">Public evidence suggests this person helped shape ${escapeXml(analysis.repo.owner)}/${escapeXml(analysis.repo.repo)}.</text>
  <text x="88" y="552" fill="#7f8790" font-size="21" font-family="Menlo, monospace">${candidate.confidence} confidence · evidence-backed attribution candidate</text>
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
