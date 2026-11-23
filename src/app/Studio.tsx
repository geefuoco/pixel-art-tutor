import { Eraser, Pencil, type LucideIcon } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { createDrawing, type Point } from '../core/drawing';
import { createEditor } from '../core/editor';
import { STUDIO_PLACEHOLDER_PALETTE } from '../core/palettes';
import { Nav } from './Nav';
import { PixelCanvas } from './PixelCanvas';

type Tool = 'pencil' | 'eraser';

const TOOLS: { tool: Tool; label: string; Icon: LucideIcon }[] = [
  { tool: 'pencil', label: 'Pencil', Icon: Pencil },
  { tool: 'eraser', label: 'Eraser', Icon: Eraser },
];

const STUDIO_SIZE = 16;

export function Studio() {
  const [editor] = useState(() =>
    createEditor(
      createDrawing({
        width: STUDIO_SIZE,
        height: STUDIO_SIZE,
        palette: STUDIO_PLACEHOLDER_PALETTE,
      }),
    ),
  );
  const drawing = useSyncExternalStore(editor.subscribe, editor.getDrawing);
  const [tool, setTool] = useState<Tool>('pencil');
  const [color, setColor] = useState(0);

  function stroke(points: readonly Point[]) {
    editor.apply(
      tool === 'pencil' ? { type: 'pencil', color, points } : { type: 'eraser', points },
    );
  }

  return (
    <div className="page studio">
      <Nav current="studio" />
      <main className="studio-main">
        <div
          className="pill tool-pill"
          role="toolbar"
          aria-label="Tools"
          aria-orientation="vertical"
        >
          {TOOLS.map(({ tool: t, label, Icon }) => (
            <button
              key={t}
              type="button"
              className="tool"
              aria-label={label}
              title={label}
              aria-pressed={tool === t}
              onClick={() => setTool(t)}
            >
              <Icon aria-hidden size={22} />
            </button>
          ))}
        </div>
        <div className="stage">
          <PixelCanvas drawing={drawing} onStroke={stroke} label="Studio canvas, 16 by 16 pixels" />
        </div>
        <div className="pill palette-pill" role="group" aria-label="Palette">
          {drawing.palette.map((c, i) => (
            <button
              key={c}
              type="button"
              className="swatch"
              style={{ background: c }}
              aria-label={`Color ${c}`}
              title={c}
              aria-pressed={color === i}
              onClick={() => setColor(i)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
