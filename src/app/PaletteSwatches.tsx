import type { Color } from '../core/drawing';

export function PaletteSwatches({ colors }: { colors: readonly Color[] }) {
  return (
    <span className="palette-swatches" aria-hidden>
      {colors.map((c) => (
        <span key={c} style={{ background: c }} />
      ))}
    </span>
  );
}
