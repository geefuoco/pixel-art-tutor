import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './markdown';

describe('explanation Markdown', () => {
  it('splits paragraphs on blank lines and joins wrapped lines with a space', () => {
    expect(parseMarkdown('Draw the shape\nfirst.\n\nThen the outline.')).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'Draw the shape first.' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Then the outline.' }] },
    ]);
  });

  it('reads strong, emphasis and code spans, leaving unmatched markers as text', () => {
    expect(parseMarkdown('Keep **one** pixel *wide*, _always_, with `1px` lines. 2 * 3')).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Keep ' },
          { type: 'strong', text: 'one' },
          { type: 'text', text: ' pixel ' },
          { type: 'emphasis', text: 'wide' },
          { type: 'text', text: ', ' },
          { type: 'emphasis', text: 'always' },
          { type: 'text', text: ', with ' },
          { type: 'code', text: '1px' },
          { type: 'text', text: ' lines. 2 * 3' },
        ],
      },
    ]);
  });

  it('reads a bulleted list', () => {
    expect(parseMarkdown('Check:\n\n- no gaps\n- no **doubles**')).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'Check:' }] },
      {
        type: 'list',
        items: [
          [{ type: 'text', text: 'no gaps' }],
          [
            { type: 'text', text: 'no ' },
            { type: 'strong', text: 'doubles' },
          ],
        ],
      },
    ]);
  });

  it('shows a paragraph of only images as a row of Example Sprites, and keeps other images inline', () => {
    expect(
      parseMarkdown(
        '![Good: clean](examples/good.png) ![Bad: jaggy](examples/bad.png)\n\nSee ![it](examples/it.png) here.',
      ),
    ).toEqual([
      {
        type: 'examples',
        sprites: [
          { alt: 'Good: clean', src: 'examples/good.png' },
          { alt: 'Bad: jaggy', src: 'examples/bad.png' },
        ],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'See ' },
          { type: 'image', alt: 'it', src: 'examples/it.png' },
          { type: 'text', text: ' here.' },
        ],
      },
    ]);
  });
});
