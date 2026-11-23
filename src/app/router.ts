import { useSyncExternalStore } from 'react';
import { MODES, type Mode } from '../core/lesson';

export type Page = 'home' | 'lessons' | 'studio' | 'settings';

export type Route =
  | { readonly page: Page }
  | { readonly page: 'lesson'; readonly lessonId: string; readonly mode: Mode }
  | { readonly page: 'not-found' };

export const routeHref: Record<Page, string> = {
  home: '#/',
  lessons: '#/lessons',
  studio: '#/studio',
  settings: '#/settings',
};

export function lessonHref(lessonId: string, mode: Mode): string {
  return `#/lessons/${encodeURIComponent(lessonId)}/${mode}`;
}

const PAGES: Record<string, Page> = {
  '/': 'home',
  '/lessons': 'lessons',
  '/studio': 'studio',
  '/settings': 'settings',
};

function isMode(value: string): value is Mode {
  return (MODES as readonly string[]).includes(value);
}

function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  const page = PAGES[path];
  if (page) return { page };
  const lesson = /^\/lessons\/([^/]+)\/([^/]+)$/.exec(path);
  if (lesson && isMode(lesson[2]!)) {
    return { page: 'lesson', lessonId: decodeURIComponent(lesson[1]!), mode: lesson[2] };
  }
  return { page: 'not-found' };
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useRoute(): Route {
  return parseRoute(useSyncExternalStore(subscribe, () => window.location.hash));
}
