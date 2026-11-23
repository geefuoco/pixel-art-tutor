export type Inline =
  | { readonly type: 'text' | 'strong' | 'emphasis' | 'code'; readonly text: string }
  | { readonly type: 'image'; readonly alt: string; readonly src: string };

export interface ExampleSprite {
  readonly alt: string;
  readonly src: string;
}

export type Block =
  | { readonly type: 'paragraph'; readonly content: readonly Inline[] }
  | { readonly type: 'list'; readonly items: readonly (readonly Inline[])[] }
  | { readonly type: 'examples'; readonly sprites: readonly ExampleSprite[] };

const INLINE =
  /!\[([^\]]*)\]\(([^)\s]+)\)|\*\*([^*]+?)\*\*|\*([^*\s][^*]*?)\*|_([^_\s][^_]*?)_|`([^`]+)`/g;

function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const addText = (t: string) => {
    if (t === '') return;
    const last = out[out.length - 1];
    if (last?.type === 'text') out[out.length - 1] = { type: 'text', text: last.text + t };
    else out.push({ type: 'text', text: t });
  };
  let end = 0;
  for (const m of text.matchAll(INLINE)) {
    addText(text.slice(end, m.index));
    end = m.index + m[0].length;
    const [, alt, src, strong, star, underscore, code] = m;
    if (src !== undefined) out.push({ type: 'image', alt: alt!, src });
    else if (strong !== undefined) out.push({ type: 'strong', text: strong });
    else if (code !== undefined) out.push({ type: 'code', text: code });
    else out.push({ type: 'emphasis', text: (star ?? underscore)! });
  }
  addText(text.slice(end));
  return out;
}

function parseBlock(lines: readonly string[]): Block {
  if (lines.every((line) => line.startsWith('- '))) {
    return { type: 'list', items: lines.map((line) => parseInline(line.slice(2).trim())) };
  }
  const content = parseInline(lines.join(' '));
  const images = content.filter((i) => i.type === 'image');
  const onlyImages = content.every((i) => i.type === 'image' || i.text.trim() === '');
  if (images.length > 0 && onlyImages) {
    return { type: 'examples', sprites: images.map(({ alt, src }) => ({ alt, src })) };
  }
  return { type: 'paragraph', content };
}

export function parseMarkdown(text: string): Block[] {
  return text
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== ''),
    )
    .filter((lines) => lines.length > 0)
    .map(parseBlock);
}

export function imagesIn(blocks: readonly Block[]): ExampleSprite[] {
  return blocks.flatMap((block) => {
    if (block.type === 'examples') return [...block.sprites];
    const inlines = block.type === 'list' ? block.items.flat() : block.content;
    return inlines.flatMap((i) => (i.type === 'image' ? [{ alt: i.alt, src: i.src }] : []));
  });
}
