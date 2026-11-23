import { routeHref, type Route } from './router';

export function Nav({ current }: { current: Route }) {
  return (
    <nav className="nav">
      <a className="brand" href={routeHref.home}>
        Pixel Art Tutor
      </a>
      <a
        className="nav-link"
        href={routeHref.studio}
        aria-current={current === 'studio' ? 'page' : undefined}
      >
        Studio
      </a>
      <a
        className="nav-link"
        href={routeHref.settings}
        aria-current={current === 'settings' ? 'page' : undefined}
      >
        Settings
      </a>
    </nav>
  );
}
