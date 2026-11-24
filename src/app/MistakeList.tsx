import type { Mistake } from '../core/mistakes';
import { MISTAKE_EXPLANATIONS } from '../core/mistake-explanations';
import { Explanation } from './Explanation';
import { plural } from './plural';

const noExampleSprites = () => undefined;

export function MistakeList({ mistakes }: { mistakes: readonly Mistake[] }) {
  return (
    <section className="mistakes" aria-labelledby="mistakes-title">
      <h2 id="mistakes-title">Mistakes</h2>
      {mistakes.length === 0 ? (
        <p className="hint">No Mistakes found.</p>
      ) : (
        <>
          <p className="hint">
            Pixels with a Mistake are circled in violet. Open one to learn why.
          </p>
          <ul className="mistake-list">
            {mistakes.map(({ kind, pixels }) => {
              const { name, explanation } = MISTAKE_EXPLANATIONS[kind];
              return (
                <li key={kind}>
                  <details>
                    <summary>
                      {name}: {plural(pixels.length, 'pixel')}
                    </summary>
                    <Explanation markdown={explanation} resolve={noExampleSprites} />
                  </details>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
