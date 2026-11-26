import { Nav } from './Nav';
import { routeHref } from './router';

export function Home() {
  return (
    <div className="page">
      <Nav current="home" />
      <main className="card message-card">
        <h1>Learn pixel art by drawing it</h1>
        <p>
          Each Lesson builds a sprite step by step: silhouette, outline, base colors, shadow and
          highlight. Trace each Step, check your pixels, and see how a finished sprite comes
          together.
        </p>
        <div className="message-actions">
          <a className="btn primary" href={routeHref.lessons}>
            Start a Lesson
          </a>
          <a className="btn" href={routeHref.daily}>
            Today's Daily Prompt
          </a>
          <a className="btn" href={routeHref.studio}>
            Open the Studio
          </a>
        </div>
      </main>
    </div>
  );
}
