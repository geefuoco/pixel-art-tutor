import { parseMarkdown, type ExampleSprite, type Inline } from '../core/markdown';

type Resolve = (src: string) => string | undefined;

function Sprite({ sprite, resolve }: { sprite: ExampleSprite; resolve: Resolve }) {
  return <img className="example-sprite" src={resolve(sprite.src)} alt={sprite.alt} />;
}

function Inlines({ content, resolve }: { content: readonly Inline[]; resolve: Resolve }) {
  return content.map((inline, i) => {
    switch (inline.type) {
      case 'text':
        return <span key={i}>{inline.text}</span>;
      case 'strong':
        return <strong key={i}>{inline.text}</strong>;
      case 'emphasis':
        return <em key={i}>{inline.text}</em>;
      case 'code':
        return <code key={i}>{inline.text}</code>;
      case 'image':
        return <Sprite key={i} sprite={inline} resolve={resolve} />;
    }
  });
}

export function Explanation({ markdown, resolve }: { markdown: string; resolve: Resolve }) {
  return (
    <div className="explanation">
      {parseMarkdown(markdown).map((block, i) => {
        switch (block.type) {
          case 'paragraph':
            return (
              <p key={i}>
                <Inlines content={block.content} resolve={resolve} />
              </p>
            );
          case 'list':
            return (
              <ul key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>
                    <Inlines content={item} resolve={resolve} />
                  </li>
                ))}
              </ul>
            );
          case 'examples':
            return (
              <div key={i} className="examples">
                {block.sprites.map((sprite, j) => (
                  <figure key={j}>
                    <Sprite sprite={sprite} resolve={resolve} />
                    <figcaption>{sprite.alt}</figcaption>
                  </figure>
                ))}
              </div>
            );
        }
      })}
    </div>
  );
}
