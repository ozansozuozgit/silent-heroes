import { useState } from 'react'
import './App.css'
import { parseGitHubRepoUrl } from './core/githubUrl'
import { demoEvidence, demoRepo } from './core/sampleData'
import { analyzeRecognitionDebt } from './core/scoring'
import type { AnalysisResult, EvidenceItem, RecognitionCandidate } from './core/types'
import { fetchGitHubEvidence } from './lib/githubClient'

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

const initialAnalysis = analyzeRecognitionDebt(demoRepo, demoEvidence, 'demo', [
  'Demo mode uses synthetic public-style evidence so you can inspect the recognition model without spending GitHub API quota.',
])

function App() {
  const [repoInput, setRepoInput] = useState('https://github.com/vitejs/vite')
  const [token, setToken] = useState('')
  const [status, setStatus] = useState<LoadState>('ready')
  const [statusText, setStatusText] = useState('Demo analysis loaded')
  const [analysis, setAnalysis] = useState<AnalysisResult>(initialAnalysis)
  const [selectedActor, setSelectedActor] = useState(initialAnalysis.candidates[0]?.actor)

  const selectedCandidate =
    analysis.candidates.find((candidate) => candidate.actor === selectedActor) ??
    analysis.candidates[0]
  const isLoading = status === 'loading'

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
      <section className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow">Silent Heroes MVP</p>
          <h1>Find the contributors whose work made the release possible.</h1>
          <p className="hero-lede">
            Silent Heroes reads public GitHub evidence and surfaces recognition
            candidates for under-credited maintainers, reviewers, triagers, and
            documentation allies. It never claims certainty: every insight keeps a
            link back to the evidence.
          </p>

          <div className="repo-console" aria-label="Repository analyzer">
            <label htmlFor="repo-url">Public GitHub repo</label>
            <div className="input-row">
              <input
                id="repo-url"
                value={repoInput}
                onChange={(event) => setRepoInput(event.target.value)}
                placeholder="https://github.com/owner/repo"
              />
              <button
                type="button"
                className="primary-action"
                onClick={runLiveAnalysis}
                disabled={isLoading}
              >
                {isLoading ? 'Analyzing…' : 'Analyze repo'}
              </button>
            </div>
            <div className="token-row">
              <input
                aria-label="Optional GitHub token"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Optional GitHub token for higher rate limits"
                type="password"
              />
              <button
                type="button"
                className="ghost-action"
                onClick={runDemoAnalysis}
                disabled={isLoading}
              >
                Load demo
              </button>
            </div>
            <StatusLine status={status} text={statusText} warnings={analysis.warnings} />
          </div>
        </div>

        <AwardPreview candidate={selectedCandidate} analysis={analysis} />
      </section>

      <section className="metrics-strip" aria-label="Analysis summary">
        <Metric label="Evidence items" value={analysis.summary.evidenceCount.toString()} />
        <Metric label="Contributors seen" value={analysis.summary.contributorCount.toString()} />
        <Metric label="Highest debt score" value={analysis.summary.highestDebtScore.toString()} />
        <Metric label="Snapshot" value={formatDate(analysis.generatedAt)} />
      </section>
      <p className="scan-window">
        {analysis.mode === 'live'
          ? 'Live MVP window: latest 18 merged PRs, 24 issues, 24 commits, detailed reviews/files for the newest merged PRs.'
          : 'Demo window: synthetic public-style evidence for product evaluation.'}
      </p>

      <section className="analysis-grid">
        <div className="panel recognition-panel">
          <div className="section-heading">
            <p className="eyebrow">Recognition debt</p>
            <h2>Candidates public evidence suggests deserve a closer look</h2>
          </div>
          <div className="candidate-list">
            {analysis.candidates.length ? (
              analysis.candidates.map((candidate) => (
                <CandidateCard
                  key={candidate.actor}
                  candidate={candidate}
                  isSelected={candidate.actor === selectedCandidate?.actor}
                  onSelect={() => setSelectedActor(candidate.actor)}
                />
              ))
            ) : (
              <div className="empty-state">
                No recognition candidates crossed the evidence threshold. Try demo mode,
                add a token, or analyze a repo with recent public activity.
              </div>
            )}
          </div>
        </div>

        <div className="panel graph-panel">
          <div className="section-heading">
            <p className="eyebrow">Role and influence map</p>
            <h2>How visible credit compares with quiet influence</h2>
          </div>
          <InfluenceGraph candidates={analysis.candidates} />
        </div>
      </section>

      <section className="timeline-section">
        <div className="section-heading">
          <p className="eyebrow">Evidence timeline</p>
          <h2>Every claim stays attached to public links</h2>
        </div>
        <EvidenceTimeline evidence={analysis.evidence} />
      </section>

      <section className="architecture-section">
        <div>
          <p className="eyebrow">AI provider and BYOK architecture</p>
          <h2>Client-side first, provider-optional later</h2>
        </div>
        <div className="provider-console">
          <label>Optional AI adapter plan</label>
          <select aria-label="AI provider adapter" defaultValue="none">
            <option value="none">No AI — deterministic evidence scoring</option>
            <option value="openai-compatible">OpenAI-compatible / local endpoint</option>
            <option value="anthropic">Anthropic API key</option>
            <option value="command">Command adapter: claude -p, codex exec, ollama</option>
          </select>
          <input
            aria-label="Optional AI key or command"
            placeholder="Future BYOK value or command, kept local to your browser/CLI"
          />
        </div>
        <div className="architecture-grid">
          <ArchitectureCard
            title="Attribution core"
            body="Pure TypeScript scoring and role classification runs locally. The MVP can explain candidates without sending repo evidence to a model."
          />
          <ArchitectureCard
            title="BYOK-ready"
            body="The GitHub token is optional and held only in browser state. A future AI key should follow the same bring-your-own-key pattern."
          />
          <ArchitectureCard
            title="Provider adapter"
            body="LLM output should be constrained to summarization: cite evidence, preserve confidence labels, and avoid claiming hidden intent."
          />
        </div>
      </section>
    </main>
  )
}

function StatusLine({
  status,
  text,
  warnings,
}: {
  status: LoadState
  text: string
  warnings: string[]
}) {
  return (
    <div className={`status-line ${status}`}>
      <span className="pulse" aria-hidden="true" />
      <div>
        <strong>{text}</strong>
        {warnings.length > 0 && (
          <ul>
            {warnings.slice(0, 3).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function CandidateCard({
  candidate,
  isSelected,
  onSelect,
}: {
  candidate: RecognitionCandidate
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`candidate-card ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
    >
      <div className="candidate-topline">
        <span className="avatar">{candidate.actor.slice(0, 2).toUpperCase()}</span>
        <div>
          <h3>@{candidate.actor}</h3>
          <p>{candidate.headline}</p>
        </div>
        <strong>{candidate.score}</strong>
      </div>
      <p className="careful-copy">{candidate.rationale}</p>
      <div className="role-tags">
        {candidate.roles.map((role) => (
          <span key={role}>{role}</span>
        ))}
        <span>{candidate.confidence} confidence</span>
      </div>
    </button>
  )
}

function InfluenceGraph({ candidates }: { candidates: RecognitionCandidate[] }) {
  const maxScore = Math.max(...candidates.map((candidate) => candidate.score), 1)

  return (
    <div className="influence-graph">
      {candidates.length ? (
        candidates.map((candidate, index) => {
          const size = 96 + (candidate.score / maxScore) * 82
          const offset = index % 2 === 0 ? '12%' : '42%'

          return (
            <div
              key={candidate.actor}
              className="influence-node"
              style={{
                width: size,
                height: size,
                marginLeft: offset,
              }}
            >
              <strong>@{candidate.actor}</strong>
              <span>{candidate.roles[0]}</span>
              <small>{candidate.score} debt</small>
            </div>
          )
        })
      ) : (
        <div className="empty-state">No graph data yet.</div>
      )}
    </div>
  )
}

function EvidenceTimeline({ evidence }: { evidence: EvidenceItem[] }) {
  return (
    <div className="timeline">
      {evidence.slice(0, 14).map((item) => (
        <a
          key={item.id}
          className="timeline-item"
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span>{formatDate(item.createdAt)}</span>
          <strong>{item.title}</strong>
          <small>
            {item.kind.replace('_', ' ')} by @{item.actor}
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
  return (
    <aside className="award-card" aria-label="Shareable award preview">
      <div className="award-frame">
        <p className="eyebrow">Shareable award preview</p>
        {candidate ? (
          <>
            <h2>Public evidence suggests @{candidate.actor} is a silent hero.</h2>
            <p>{candidate.headline}</p>
            <div className="award-score">
              <strong>{candidate.score}</strong>
              <span>recognition debt score</span>
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
              <span>
                {analysis.repo.owner}/{analysis.repo.repo}
              </span>
            </div>
          </>
        ) : (
          <p>No candidate selected yet.</p>
        )}
      </div>
    </aside>
  )
}

function ArchitectureCard({ title, body }: { title: string; body: string }) {
  return (
    <article className="architecture-card">
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  )
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

export default App


function copyAwardMarkdown(candidate: RecognitionCandidate, analysis: AnalysisResult) {
  const note = `Silent Hero: @${candidate.actor}
Repo: ${analysis.repo.owner}/${analysis.repo.repo}
Role: ${candidate.roles.join(' / ')}
Confidence: ${candidate.confidence}

${candidate.rationale}

Evidence:
${candidate.evidence
    .map((item) => `- ${item.title}: ${item.url}`)
    .join('\n')}`

  void navigator.clipboard?.writeText(note)
}

function downloadAwardSvg(candidate: RecognitionCandidate, analysis: AnalysisResult) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#201b13"/><stop offset="1" stop-color="#0c1111"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <rect x="54" y="54" width="1092" height="522" rx="24" fill="none" stroke="#f4c76d" stroke-opacity="0.45" stroke-width="2"/>
  <text x="92" y="122" fill="#f4c76d" font-size="28" font-family="Arial" font-weight="800" letter-spacing="6">SILENT HERO</text>
  <text x="92" y="236" fill="#fff7e8" font-size="68" font-family="Georgia">@${escapeXml(candidate.actor)}</text>
  <text x="92" y="304" fill="#f6efe2" fill-opacity="0.78" font-size="32" font-family="Arial">${escapeXml(candidate.roles.join(' / '))}</text>
  <text x="92" y="384" fill="#f4c76d" font-size="96" font-family="Arial" font-weight="900">${candidate.score}</text>
  <text x="242" y="374" fill="#f6efe2" fill-opacity="0.72" font-size="26" font-family="Arial">recognition debt score</text>
  <text x="92" y="504" fill="#f6efe2" fill-opacity="0.68" font-size="26" font-family="Arial">Public evidence suggests this person helped shape ${escapeXml(analysis.repo.owner)}/${escapeXml(analysis.repo.repo)}.</text>
  <text x="92" y="548" fill="#f6efe2" fill-opacity="0.5" font-size="22" font-family="Arial">${candidate.confidence} confidence • evidence-backed attribution candidate</text>
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
