<div align="center">

# ⭐ Silent Heroes

**Find the under-credited people in any public GitHub repo — and give their quiet work a moment.**

[![License: MIT](https://img.shields.io/badge/License-MIT-059669.svg)](./LICENSE)
![Local-first](https://img.shields.io/badge/local--first-no%20backend-059669)
![React](https://img.shields.io/badge/React-19-14b8a6)
![Vite](https://img.shields.io/badge/Vite-7-c79a3b)

</div>

---

Git blame shows who changed the line. **Silent Heroes shows who quietly helped shape the work** — the reviewers, issue originators, docs/test maintainers, and release unblockers who rarely show up in a commit-based contributor graph.

Paste a public repo, and it builds a cautious, evidence-backed recognition report, then celebrates the top **silent hero** with a shareable card.

## Why it's different

Naïve "top contributor" tools just rank commit authors — which means they crown the people who are *already* the most visible. Silent Heroes deliberately does the opposite:

- **Stable, stated window.** Every report covers a fixed trailing window (default **120 days**), filtered by event date — not GitHub's "recently updated" fuzz. You always know what you're looking at.
- **Recognition-adjusted.** It pulls the all-time contributor graph and **excludes the repo owner and top-10 committers**, discounting anyone already prominent. A reviewer who never authors commits scores highest — that's the actual silent hero.
- **Under-credit, not volume.** Score = sqrt-damped collaborative contribution × (1 − recognition), so one heavy dimension can't saturate the result.
- **Honest empties.** Toy, dead, or maintainer-only repos return an empty stage instead of inventing a hero.

> It's a prompt for human recognition — **confidence, not certainty.** Never an automated award.

## Quick start

No backend, no API keys required.

```bash
git clone https://github.com/ozansozuozgit/silent-heroes.git
cd silent-heroes
npm install
npm run dev
```

Open the printed local URL. Hit **Demo** to explore the model offline, or paste any `owner/repo` (or full GitHub URL) and **Scan repo**.

> **Rate limits:** anonymous GitHub allows ~60 requests/hour and a healthy scan uses ~37. Add a read-only token under **Settings → GitHub access token** for comfortable use. The token stays in tab memory only — a refresh clears it.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm test` | Run the unit tests (Vitest) |
| `npm run lint` | Lint with ESLint |

## How it works

```
src/
  core/
    githubUrl.ts     # parse owner/repo or GitHub URLs
    scoring.ts       # the recognition model (windowing, recognition gate, under-credit score)
    sampleData.ts    # offline demo evidence + recognition graph
    types.ts         # shared domain types
  lib/
    githubClient.ts  # fetch evidence + the all-time contributor graph
  App.tsx            # the recognition stage UI
```

A live scan pulls a bounded slice of public activity (recent merged PRs, issues, commits with file detail, and reviews on the newest merged PRs) plus the all-time contributor graph — a quick public scan, not a full historical audit. The scoring core is pure TypeScript with unit tests (`src/core/scoring.test.ts`) — the easiest place to start contributing.

## Privacy

Fully client-side. No telemetry, no storage, no server. Tokens and any AI keys live only in the current tab's memory. All evidence links open directly on github.com.

## Contributing

Issues and PRs are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md). Good first areas: tuning the scoring window/gates, new contribution signals, chart polish, and accessibility.

## License

[MIT](./LICENSE) © 2026 Ozan Sozuoz

<!-- live-demo:start -->
## Live Demo

- Production URL: https://silent-heroes.vercel.app
- Source: https://github.com/ozansozuozgit/silent-heroes

<!-- live-demo:end -->
