import { Home } from './Home';
import { LessonPlayer } from './LessonPlayer';
import { Lessons } from './Lessons';
import { NotFound } from './NotFound';
import { useRoute } from './router';
import { Settings } from './Settings';
import { Studio } from './Studio';

export function App() {
  const route = useRoute();
  switch (route.page) {
    case 'home':
      return <Home />;
    case 'lessons':
      return <Lessons />;
    case 'lesson':
      return (
        <LessonPlayer
          key={`${route.lessonId}/${route.mode}`}
          lessonId={route.lessonId}
          mode={route.mode}
        />
      );
    case 'studio':
      return <Studio />;
    case 'settings':
      return <Settings />;
    case 'not-found':
      return <NotFound />;
  }
}
