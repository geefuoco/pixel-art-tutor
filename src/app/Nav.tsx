import { routeHref, type Page } from './router';

const LINKS: { page: Page; label: string }[] = [
  { page: 'lessons', label: 'Lessons' },
  { page: 'studio', label: 'Studio' },
  { page: 'settings', label: 'Settings' },
];

export function Nav({ current }: { current?: Page }) {
  return (
    <nav className="nav">
      <a className="brand" href={routeHref.home}>
        Pixel Art Tutor
      </a>
      {LINKS.map(({ page, label }) => (
        <a
          key={page}
          className="nav-link"
          href={routeHref[page]}
          aria-current={current === page ? 'page' : undefined}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
