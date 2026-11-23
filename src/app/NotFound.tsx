import { Nav } from './Nav';
import { routeHref } from './router';

export function NotFound() {
  return (
    <div className="page">
      <Nav />
      <main className="card message-card">
        <h1>Page not found</h1>
        <a className="btn primary" href={routeHref.home}>
          Go home
        </a>
      </main>
    </div>
  );
}
