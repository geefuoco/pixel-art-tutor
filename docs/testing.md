# Testing

Tests go through three seams. Each test drives a public interface and asserts on what comes out of it, so it stays valid through behaviour-preserving refactors.

| Seam               | What                                                                                                                    | Tool                      | Lives in                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------ |
| 1. Core public API | The framework-free core in `src/core`: apply commands, assert the resulting pixels, scores, Mistakes, prompts and so on | Vitest                    | `src/core/**/*.test.ts`        |
| 2. Persistence     | The store interface over IndexedDB (round-trips, autosave, backup and restore) and per-device choices in localStorage   | Vitest + `fake-indexeddb` | `src/persistence/**/*.test.ts` |
| 3. Running app     | A few smoke tests of what a user does, against the production build                                                     | Playwright                | `e2e/`                         |

Rules:

- **No React component unit tests.** Logic worth testing belongs in the core and is tested at Seam 1. Components stay a thin shell over it.
- Assert on outputs, never on internal structure. Expected values come from an independent source (a worked example or the spec), not recomputed the way the code does.
- Keep Seam 3 to a handful of user journeys. Anything that can be checked at Seam 1 is checked there.

Commands:

- `npm test`: Vitest (Seams 1 and 2).
- `npm run build && npm run test:e2e`: Playwright against the built site (Seam 3). Install the browser once with `npx playwright install chromium`.
- `npm run typecheck`, `npm run lint`, `npm run format:check`: the rest of what CI runs.
