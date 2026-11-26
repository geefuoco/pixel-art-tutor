import { Home } from './Home';
import { MobileNotice } from './MobileNotice';
import { useShowMobileNotice } from './mobile-notice-store';
import { NotFound } from './NotFound';
import { useRoute } from './router';
import { Studio } from './Studio';

export function App() {
  const route = useRoute();
  if (useShowMobileNotice()) return <MobileNotice />;
  switch (route) {
    case 'home':
      return <Home />;
    case 'studio':
      return <Studio />;
    case 'not-found':
      return <NotFound />;
  }
}
