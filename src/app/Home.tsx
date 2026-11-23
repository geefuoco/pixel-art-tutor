import { Nav } from './Nav';
import { routeHref } from './router';

export function Home() {
  return (
    <div className="page">
      <Nav current="home" />
      <main className="card message-card">
        <h1>Learn pixel art by drawing it</h1>
        <p>Lessons are on the way. In the meantime, make something in the Studio.</p>
        <a className="btn primary" href={routeHref.studio}>
          Open the Studio
        </a>
      </main>
    </div>
  );
}
