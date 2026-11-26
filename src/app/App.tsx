import { DailyPromptPage } from './DailyPromptPage';
import { Gallery, LessonAttempts } from './Gallery';
import { Home } from './Home';
import { LessonPlayer } from './LessonPlayer';
import { Lessons } from './Lessons';
import { MobileNotice } from './MobileNotice';
import { useShowMobileNotice } from './mobile-notice-store';
import { NotFound } from './NotFound';
import { NewPersonalLesson } from './NewPersonalLesson';
import { useRoute } from './router';
import { Settings } from './Settings';
import { Studio } from './Studio';
import { UpcomingPrompts } from './UpcomingPrompts';

export function App() {
  const route = useRoute();
  if (useShowMobileNotice()) return <MobileNotice />;
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
    case 'new-personal-lesson':
      return <NewPersonalLesson />;
    case 'daily':
      return <DailyPromptPage />;
    case 'upcoming-prompts':
      return import.meta.env.DEV ? <UpcomingPrompts /> : <NotFound />;
    case 'studio':
      return <Studio />;
    case 'gallery':
      return <Gallery />;
    case 'lesson-attempts':
      return <LessonAttempts lessonId={route.lessonId} />;
    case 'settings':
      return <Settings />;
    case 'not-found':
      return <NotFound />;
  }
}
