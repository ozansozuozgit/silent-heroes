# Contributing to Silent Heroes

Thanks for wanting to help give quiet work its moment. This is a small, local-first React + TypeScript app — easy to run and easy to hack on.

## Getting set up

```bash
git clone https://github.com/ozansozuozgit/silent-heroes.git
cd silent-heroes
npm install
npm run dev
```

Before opening a PR, make sure all three pass:

```bash
npm test     # Vitest unit tests
npm run lint # ESLint
npm run build # type-check + production build
```

## Where to start

- **`src/core/scoring.ts`** — the heart of the project. Tuning the window (`WINDOW_DAYS`), the recognition gate, or the under-credit formula has the biggest impact. Pair any change with a test in `src/core/scoring.test.ts`.
- **`src/lib/githubClient.ts`** — what public evidence we collect. New signals (e.g. discussions, review comment depth) go here.
- **`src/App.tsx` / `src/App.css`** — the recognition stage UI, charts, and shareable card.

## Principles to preserve

1. **Evidence over assertion.** Every claim links to public evidence. Use cautious language ("public evidence suggests"); surface confidence, never certainty.
2. **Don't crown the already-credited.** The model exists to find *under*-credited people. Changes that resurface owners/top committers defeat the point.
3. **Honest empties.** It's correct for a scan to return no hero. Don't lower the bar just to fill the stage.
4. **Local-first.** No backend, no telemetry, no required keys. Secrets stay in tab memory.

## Pull requests

- Keep PRs focused and describe the behavior change.
- Include or update tests for any scoring/logic change.
- Note any visual changes with a before/after screenshot.

## Reporting issues

Open an issue with the repo you scanned, what you expected, and what you got. For scoring disputes, include the contributor and the evidence links — that's exactly the kind of feedback that improves the model.
