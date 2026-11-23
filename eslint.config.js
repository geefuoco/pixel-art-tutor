import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const noUseEffect =
  'useEffect is banned in this project (see CLAUDE.md). Derive values during render, do work in event handlers, and subscribe to external stores with useSyncExternalStore.';

export default defineConfig(
  { ignores: ['dist', 'playwright-report', 'test-results', 'prototypes'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [{ name: 'react', importNames: ['useEffect'], message: noUseEffect }] },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "MemberExpression[property.name='useEffect']", message: noUseEffect },
      ],
    },
  },
  {
    // The core is framework-free: no React and no DOM.
    files: ['src/core/**/*.{ts,tsx}'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
              message: 'src/core must not depend on React.',
            },
            { group: ['**/app/*', '**/app'], message: 'src/core must not depend on the UI.' },
          ],
        },
      ],
    },
  },
  {
    // Persistence is framework-free too, but may use browser storage.
    files: ['src/persistence/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
              message: 'src/persistence must not depend on React.',
            },
            {
              group: ['**/app/*', '**/app'],
              message: 'src/persistence must not depend on the UI.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['*.config.{js,ts}', 'e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
