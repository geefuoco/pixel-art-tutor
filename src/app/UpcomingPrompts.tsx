import { addDays, localCalendarDate } from '../core/calendar-date';
import { dailyPrompt, type DailyPrompt, type DailyPromptKind } from '../core/daily-prompt';
import { themePromptText } from '../core/theme-prompt';
import { formatCalendarDate } from './calendar-date-format';
import { useGallery } from './gallery-store';
import { courseLessonIds, useCourse } from './lessons-store';
import { MODE_NAMES } from './mode-names';
import { Nav } from './Nav';

const DAYS = 365;

const KIND_NAMES: Record<DailyPromptKind, string> = {
  theme: 'Theme Prompt',
  technique: 'Technique Drill',
  review: 'Review Drill',
};

function exercise(prompt: DailyPrompt, lessonTitle: (id: string) => string): string {
  if (prompt.kind === 'review') {
    return `Replay ${lessonTitle(prompt.lessonId)} in ${MODE_NAMES[prompt.mode]}`;
  }
  const text = themePromptText(prompt.prompt);
  return prompt.drawn === 'theme' ? text : `Theme Prompt instead: ${text}`;
}

export function UpcomingPrompts() {
  const gallery = useGallery();
  const course = useCourse();
  const lessonTitle = (id: string) =>
    (course.status === 'ready' &&
      course.lessons.find((entry) => entry.lesson.id === id)?.lesson.title) ||
    id;
  const today = localCalendarDate(new Date());
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(today, i));
  const attempts = gallery.status === 'ready' ? [...gallery.attemptsByLesson.values()].flat() : [];
  const practice = { course: courseLessonIds, attempts };
  return (
    <div className="page">
      <Nav />
      <main className="card upcoming-prompts">
        <h1>Upcoming Daily Prompts</h1>
        <p className="hint">
          Development only. The first prompt for each of the next {DAYS} days. Review Drills are
          picked from your Attempts so far.
        </p>
        <table>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Kind</th>
              <th scope="col">Exercise</th>
            </tr>
          </thead>
          <tbody>
            {dates.map((date) => {
              const prompt = dailyPrompt(date, 0, practice);
              return (
                <tr key={date}>
                  <td>{formatCalendarDate(date)}</td>
                  <td>{KIND_NAMES[prompt.drawn]}</td>
                  <td>{exercise(prompt, lessonTitle)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </main>
    </div>
  );
}
