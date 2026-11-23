## React

- Never use `useEffect`. Derive values during render, do work in event handlers, and subscribe to external stores (the editor core, persistence) with `useSyncExternalStore`. Lint enforces this.

## Architecture

- `src/core` is framework-free TypeScript: no React, no DOM. Its typecheck config has no DOM lib and lint rejects React imports there. The UI never mutates pixels directly; it applies commands to the drawing document.
- `src/persistence` keeps data in IndexedDB behind one Store interface, and runs Studio autosave. Framework-free like the core (lint rejects React imports), but it may use browser storage APIs.
- `src/app` is the React shell. Routing is hash-based so deep links work on GitHub Pages.

## Testing

Test through the three seams in `docs/testing.md`. No React component unit tests.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on geefuoco/pixel-art-tutor via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the six default triage labels (needs-triage, needs-info, grilling, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
