import { Home } from './Home';
import { NotFound } from './NotFound';
import { useRoute } from './router';
import { Settings } from './Settings';
import { Studio } from './Studio';

export function App() {
  const route = useRoute();
  switch (route) {
    case 'home':
      return <Home />;
    case 'studio':
      return <Studio />;
    case 'settings':
      return <Settings />;
    case 'not-found':
      return <NotFound />;
  }
}
