import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium, devices, type Locator, type Page } from '@playwright/test';
import { build, preview } from 'vite';

export type Side = 'before' | 'after';
export type Shot = (page: Page, side: Side) => Promise<Locator | void>;

const USAGE = `Usage: npm run screenshot -- --shot <file.ts> --out <dir> [--before <ref>]

Builds <ref> (default origin/main) in a throwaway git worktree and the working tree as it is,
serves each, runs the shot against both and writes <dir>/before.png and <dir>/after.png.

The shot file default-exports a Shot (import type { Shot } from '<repo>/scripts/screenshot.ts'):
  export default (async (page, side) => {
    await page.goto('#/studio');
    return page.getByRole('form', { name: 'Export PNG' });
  }) satisfies Shot;
It returns the Locator to capture, or nothing for the whole page. side says which build it is
on, for steps the before build cannot do. Keep the shot file outside the repo, e.g. in a scratchpad.`;

const repo = resolve(import.meta.dirname, '..');

function options() {
  const { values } = parseArgs({
    options: {
      shot: { type: 'string' },
      out: { type: 'string' },
      before: { type: 'string', default: 'origin/main' },
      help: { type: 'boolean' },
    },
  });
  if (values.help || !values.shot || !values.out) {
    console.log(USAGE);
    process.exit(values.help ? 0 : 1);
  }
  return { shot: resolve(values.shot), out: resolve(values.out), before: values.before };
}

async function capture(root: string, outDir: string, shot: Shot, side: Side, path: string) {
  await build({ root, logLevel: 'warn', build: { outDir, emptyOutDir: true } });
  const server = await preview({
    root,
    logLevel: 'warn',
    build: { outDir },
    preview: { port: 0, open: false },
  });
  const browser = await chromium.launch();
  try {
    const baseURL = server.resolvedUrls?.local[0];
    if (!baseURL) throw new Error('vite preview did not report a URL');
    const page = await browser.newPage({ ...devices['Desktop Chrome'], baseURL });
    const target = await shot(page, side);
    await (target ?? page).screenshot({ path });
    console.log(`${side}: ${path}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

async function main() {
  const { shot: shotFile, out, before } = options();
  const shot = ((await import(pathToFileURL(shotFile).href)) as { default: Shot }).default;
  const scratch = mkdtempSync(join(tmpdir(), 'screenshot-'));
  const worktree = join(scratch, 'worktree');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'inherit' });
  try {
    git('worktree', 'add', '--detach', '--quiet', worktree, before);
    symlinkSync(join(repo, 'node_modules'), join(worktree, 'node_modules'));
    await capture(worktree, join(scratch, 'dist-before'), shot, 'before', join(out, 'before.png'));
    await capture(repo, join(scratch, 'dist-after'), shot, 'after', join(out, 'after.png'));
  } finally {
    git('worktree', 'remove', '--force', worktree);
    rmSync(scratch, { recursive: true, force: true });
  }
}

await main();
