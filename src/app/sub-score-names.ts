import type { FreehandSubScores } from '../core/freehand';

export const SUB_SCORE_NAMES: Record<keyof FreehandSubScores, string> = {
  shape: 'Shape',
  palette: 'Palette',
  lineQuality: 'Line quality',
};

export const SUB_SCORE_KEYS = Object.keys(SUB_SCORE_NAMES) as (keyof FreehandSubScores)[];
