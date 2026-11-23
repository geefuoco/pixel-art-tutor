import { useSyncExternalStore } from 'react';

export type Route = 'home' | 'studio' | 'settings' | 'not-found';

export const routeHref: Record<Exclude<Route, 'not-found'>, string> = {
  home: '#/',
  studio: '#/studio',
  settings: '#/settings',
};

function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  if (path === '/') return 'home';
  if (path === '/studio') return 'studio';
  if (path === '/settings') return 'settings';
  return 'not-found';
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useRoute(): Route {
  return parseRoute(useSyncExternalStore(subscribe, () => window.location.hash));
}
