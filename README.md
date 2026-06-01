# Silent Heroes

Silent Heroes is an open-source, no-install attribution intelligence prototype for public GitHub repositories.

Paste a repo URL and the app builds a cautious recognition report for people whose work may not show up in normal commit-based contributor graphs: reviewers, issue originators, docs/test maintainers, release unblockers, and other quiet contributors.

Core principle: Git blame shows who changed the line. Silent Heroes shows who publicly helped shape the work.

## What works now

- Static client-side Vite/React app; no backend required.
- Public GitHub repo analyzer with optional token for higher rate limits.
- Demo mode that works without network/API quota.
- Evidence-backed recognition candidates with roles, confidence labels, and cautious copy.
- Recognition debt cards and influence-map style visualization.
- Evidence timeline with public links.
- Shareable award preview with copyable credit note and downloadable SVG.
- AI/BYOK architecture panel for future provider adapters.
- Pure TypeScript scoring core with unit tests.

## Accuracy stance

Silent Heroes does not claim hidden facts. It only analyzes public evidence it can retrieve and uses language like “public evidence suggests.”

Every attribution candidate should eventually have:

- role
- confidence
- evidence
- explanation
- correction/dispute path

## Local development

```bash
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5173/` or the URL Vite prints.

## Verification

```bash
pnpm test
pnpm lint
pnpm build
```

Current verified state: all three commands pass.

## Current MVP scan window

Live analysis intentionally uses a bounded window to avoid requiring repo installation or a backend worker:

- latest 18 closed/merged PRs
- latest 24 issues
- latest 24 commits
- review/file details for the newest merged PRs
- file details for the latest 12 commits

This is a quick public scan, not a complete historical attribution audit.

## AI provider direction

The deterministic scoring core works without AI. Future AI use should be optional and evidence-constrained:

- classify contribution roles from comments/diffs
- compare suggestion text to later diffs
- summarize evidence into shareable credit narratives
- never create claims without evidence IDs/links

Planned adapters:

- OpenAI-compatible API or local endpoint
- Anthropic API key
- command adapter for tools like `claude -p`, `codex exec`, or `ollama`

## Continuation notes

Implementation checkpoint and next-step notes live at `.hermes/continuation.md`.
