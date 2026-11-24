import { describe, expect, it } from 'vitest';
import { MODES } from './lesson';
import { lessonUnlocked, modeUnlocked, recordPass, type Progress } from './progress';

const COURSE = ['silhouette', 'outline', 'shading'];

describe('Mode unlocking within a Lesson', () => {
  it('unlocks Trace from the start and nothing else', () => {
    expect(MODES.map((mode) => [mode, modeUnlocked([], 'outline', mode)])).toEqual([
      ['trace', true],
      ['hint', false],
      ['freehand', false],
    ]);
  });

  it('unlocks Hint by passing Trace, and Freehand by passing Hint', () => {
    const tracePassed = recordPass([], 'outline', 'trace');
    expect(modeUnlocked(tracePassed, 'outline', 'hint')).toBe(true);
    expect(modeUnlocked(tracePassed, 'outline', 'freehand')).toBe(false);
    expect(modeUnlocked(tracePassed, 'shading', 'hint')).toBe(false);

    const hintPassed = recordPass(tracePassed, 'outline', 'hint');
    expect(modeUnlocked(hintPassed, 'outline', 'freehand')).toBe(true);
  });
});

describe('Lesson unlocking in the Course', () => {
  it('unlocks only the first Lesson from the start', () => {
    expect(COURSE.map((id) => lessonUnlocked(COURSE, [], id))).toEqual([true, false, false]);
  });

  it("unlocks the next Lesson by passing a Lesson's Trace", () => {
    const progress = recordPass([], 'silhouette', 'trace');
    expect(COURSE.map((id) => lessonUnlocked(COURSE, progress, id))).toEqual([true, true, false]);
  });

  it('does not unlock the next Lesson by passing a later Mode alone', () => {
    const progress: Progress = [{ lessonId: 'silhouette', passedModes: ['hint'] }];
    expect(lessonUnlocked(COURSE, progress, 'outline')).toBe(false);
  });

  it('keeps a Lesson that has been passed unlocked when a new Lesson is put before it', () => {
    const progress = recordPass(recordPass([], 'silhouette', 'trace'), 'outline', 'trace');
    const reordered = ['silhouette', 'new', 'outline', 'shading'];
    expect(reordered.map((id) => lessonUnlocked(reordered, progress, id))).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it('does not unlock a Lesson that is not in the Course', () => {
    expect(lessonUnlocked(COURSE, recordPass([], 'shading', 'trace'), 'elsewhere')).toBe(false);
  });
});

describe('recording a pass', () => {
  it('records each Mode once, leaving the progress it was given unchanged', () => {
    const before = recordPass([], 'outline', 'trace');
    const after = recordPass(recordPass(before, 'outline', 'trace'), 'shading', 'trace');
    expect(before).toEqual([{ lessonId: 'outline', passedModes: ['trace'] }]);
    expect(after).toEqual([
      { lessonId: 'outline', passedModes: ['trace'] },
      { lessonId: 'shading', passedModes: ['trace'] },
    ]);
  });
});
