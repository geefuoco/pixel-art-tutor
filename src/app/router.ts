import { useSyncExternalStore } from 'react';
import { isMode, type Mode } from '../core/lesson';

export type Page = 'home' | 'lessons' | 'studio' | 'gallery' | 'settings';

export type Route =
  | { readonly page: Page }
  | { readonly page: 'lesson'; readonly lessonId: string; readonly mode: Mode }
  | { readonly page: 'lesson-attempts'; readonly lessonId: string }
  | { readonly page: 'new-personal-lesson' }
  | { readonly page: 'not-found' };

export const routeHref: Record<Page, string> = {
  home: '#/',
  lessons: '#/lessons',
  studio: '#/studio',
  gallery: '#/gallery',
  settings: '#/settings',
};

export const newPersonalLessonHref = '#/lessons/new';

export function lessonHref(lessonId: string, mode: Mode): string {
  return `#/lessons/${encodeURIComponent(lessonId)}/${mode}`;
}

export function lessonAttemptsHref(lessonId: string): string {
  return `#/gallery/${encodeURIComponent(lessonId)}`;
}

const PAGES: Record<string, Page> = {
  '/': 'home',
  '/lessons': 'lessons',
  '/studio': 'studio',
  '/gallery': 'gallery',
  '/settings': 'settings',
};

function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  const page = PAGES[path];
  if (page) return { page };
  if (path === '/lessons/new') return { page: 'new-personal-lesson' };
  const lesson = /^\/lessons\/([^/]+)\/([^/]+)$/.exec(path);
  if (lesson && isMode(lesson[2]!)) {
    return { page: 'lesson', lessonId: decodeURIComponent(lesson[1]!), mode: lesson[2] };
  }
  const attempts = /^\/gallery\/([^/]+)$/.exec(path);
  if (attempts) return { page: 'lesson-attempts', lessonId: decodeURIComponent(attempts[1]!) };
  return { page: 'not-found' };
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useRoute(): Route {
  return parseRoute(useSyncExternalStore(subscribe, () => window.location.hash));
}
