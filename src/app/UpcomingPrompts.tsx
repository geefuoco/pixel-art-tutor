import { addDays, localCalendarDate } from '../core/calendar-date';
import { themePrompt, themePromptText } from '../core/theme-prompt';
import { formatCalendarDate } from './calendar-date-format';
import { Nav } from './Nav';

const DAYS = 365;

export function UpcomingPrompts() {
  const today = localCalendarDate(new Date());
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(today, i));
  return (
    <div className="page">
      <Nav />
      <main className="card upcoming-prompts">
        <h1>Upcoming Theme Prompts</h1>
        <p className="hint">Development only. The first prompt for each of the next {DAYS} days.</p>
        <table>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Theme Prompt</th>
            </tr>
          </thead>
          <tbody>
            {dates.map((date) => (
              <tr key={date}>
                <td>{formatCalendarDate(date)}</td>
                <td>{themePromptText(themePrompt(date))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </div>
  );
}
