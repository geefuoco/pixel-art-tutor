## React

- Never use `useEffect`. Derive values during render, do work in event handlers, and subscribe to external stores (the editor core, persistence) with `useSyncExternalStore`. Lint enforces this.

## Comments

- Do not write comments. Not JSDoc, not inline notes, not section headers, not comments restating what the code does. Make the code carry the meaning instead: clear names, small functions, precise types, and tests that pin down behaviour. Explanations of intent or tradeoffs belong in the commit message, the PR, or an ADR.
- Lint enforces this everywhere (`local/no-comments` in `eslint-rules/`). Only tool directives pass: `@ts-expect-error`, `prettier-ignore` and `/// <reference>`. Inline `eslint-disable` is turned off (`noInlineConfig`), so a needed rule exception goes in `eslint.config.js`. CSS is not linted; keep it comment-free too.
- Do not work around the rule (comment-like strings, `@ts-expect-error` used as a note, new escape hatches).

## Architecture

- `src/core` is framework-free TypeScript: no React, no DOM. Its typecheck config has no DOM lib and lint rejects React imports there. The UI never mutates pixels directly; it applies commands to the drawing document.
- `src/persistence` keeps data in IndexedDB behind one Store interface, and holds the Studio session that saves to it (the drawing being edited, the kept drawings, autosave). Per-device UI choices that must be read synchronously on first render (such as continuing past the mobile notice) use localStorage instead, and fall back to memory when storage is blocked. Framework-free like the core (lint rejects React imports), but it may use browser storage APIs.
- `src/app` is the React shell. Routing is hash-based so deep links work on GitHub Pages.

## Testing

Test through the three seams in `docs/testing.md`. No React component unit tests.

Before/after screenshots of the app, e.g. for a PR: `npm run screenshot -- --help`.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on geefuoco/pixel-art-tutor via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the six default triage labels (needs-triage, needs-info, grilling, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
