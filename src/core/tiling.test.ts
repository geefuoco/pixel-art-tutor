import { describe, expect, it } from 'vitest';
import { tilingPreview } from './tiling';
import { spriteOf } from './test-grids';

const PALETTE = ['#3e8948', '#eaa56c'];
const tile = (rows: string[]) => spriteOf(rows, 'gd', PALETTE);

describe('the Tiling Preview', () => {
  it('repeats the drawing three times across and three times down', () => {
    const preview = tilingPreview(tile(['gd', 'd.']));
    expect(preview).toEqual(tile(['gdgdgd', 'd.d.d.', 'gdgdgd', 'd.d.d.', 'gdgdgd', 'd.d.d.']));
  });
});
