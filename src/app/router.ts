import { useSyncExternalStore } from 'react';

export type Route = 'home' | 'studio' | 'not-found';

export const routeHref: Record<Exclude<Route, 'not-found'>, string> = {
  home: '#/',
  studio: '#/studio',
};

function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  if (path === '/') return 'home';
  if (path === '/studio') return 'studio';
  return 'not-found';
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useRoute(): Route {
  return parseRoute(useSyncExternalStore(subscribe, () => window.location.hash));
}
