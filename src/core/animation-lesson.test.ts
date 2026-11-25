import { describe, expect, it } from 'vitest';
import { frameDrawing, type Animation } from './animation';
import { createAnimationLesson, createLesson, type Role } from './lesson';
import { spriteOf } from './test-grids';

const PALETTE = ['#111111', '#cc3333'];
const ROLES: Role[] = ['outline', 'base'];
const frame = (rows: string[]) => spriteOf(rows, 'OB', PALETTE).pixels;

const HOP: Animation = {
  width: 8,
  height: 8,
  palette: PALETTE,
  fps: 6,
  frames: [
    frame([
      '........',
      '........',
      '........',
      '........',
      '..OOOO..',
      '.OBBBBO.',
      '.OBBBBO.',
      '..OOOO..',
    ]),
    frame([
      '........',
      '........',
      '........',
      '..OOOO..',
      '.OBBBBO.',
      '.OBBBBO.',
      '..OOOO..',
      '........',
    ]),
    frame([
      '........',
      '..OOOO..',
      '.OBBBBO.',
      '.OBBBBO.',
      '..OOOO..',
      '........',
      '........',
      '........',
    ]),
    frame([
      '........',
      '........',
      '........',
      '..OOOO..',
      '.OBBBBO.',
      '.OBBBBO.',
      '..OOOO..',
      '........',
    ]),
  ],
};

const STEPS = [
  { frame: 0, pose: 'key', explanation: 'Crouch.' },
  { frame: 2, pose: 'key', explanation: 'Top of the hop.' },
  { frame: 1, pose: 'in-between', explanation: 'Rising.' },
  { frame: 3, pose: 'in-between', explanation: 'Falling.' },
] as const;

const lessonOf = (
  frameSteps: readonly { frame: number; pose: 'key' | 'in-between'; explanation: string }[],
  animation = HOP,
) => createAnimationLesson({ id: 'hop', title: 'Hop', animation, roles: ROLES, frameSteps });

describe('an animation Lesson', () => {
  it('has one Step per Frame, key poses first, each targeting its whole Frame', () => {
    const lesson = lessonOf(STEPS);
    expect(lesson.steps.map((s) => s.kind === 'frame' && [s.frame, s.pose])).toEqual([
      [0, 'key'],
      [2, 'key'],
      [1, 'in-between'],
      [3, 'in-between'],
    ]);
    expect(lesson.steps.map((s) => s.explanation)).toEqual([
      'Crouch.',
      'Top of the hop.',
      'Rising.',
      'Falling.',
    ]);
    expect(lesson.steps[1]!.target).toEqual(HOP.frames[2]);
    expect(lesson.animation).toEqual(HOP);
    expect([lesson.size, lesson.palette, lesson.roles]).toEqual([8, PALETTE, ROLES]);
  });

  it('shows its first Frame wherever one still image of the Lesson is needed', () => {
    expect(lessonOf(STEPS).reference.pixels).toEqual(HOP.frames[0]);
  });

  it('treats a still Lesson as an Animation of one Frame', () => {
    const still = createLesson({
      id: 'still',
      title: 'Still',
      reference: frameDrawing(HOP, 0),
      roles: ROLES,
      explanations: { silhouette: '', outline: '', base: '' },
    });
    expect(still.animation.frames).toEqual([HOP.frames[0]]);
  });

  it.each([
    [
      'an in-between before a key pose',
      [STEPS[0], STEPS[2], STEPS[1], STEPS[3]],
      /key poses come before in-betweens/i,
    ],
    ['no key pose', STEPS.map((s) => ({ ...s, pose: 'in-between' as const })), /key pose/],
    ['a Frame with no Step', STEPS.slice(0, 3), /Frame 4 has no Step/],
    ['a Frame with two Steps', [...STEPS, STEPS[0]], /Frame 1 has more than one Step/],
    [
      'a Step for a Frame the animation lacks',
      [...STEPS, { frame: 4, pose: 'in-between', explanation: '' }],
      /no Frame 5/,
    ],
  ] as const)('rejects %s', (_, frameSteps, problem) => {
    expect(() => lessonOf(frameSteps)).toThrow(problem);
  });

  it('rejects an animation of one Frame, which is a still Lesson', () => {
    expect(() => lessonOf([STEPS[0]], { ...HOP, frames: [HOP.frames[0]!] })).toThrow(
      /at least 2 Frames/,
    );
  });
});
