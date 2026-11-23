import {
  Eraser,
  FilePlus,
  Grid3x3,
  PaintBucket,
  Pencil,
  Pipette,
  Redo2,
  Undo2,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react';
import { useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent } from 'react';
import {
  createDrawing,
  getPixel,
  MAX_DRAWING_SIZE,
  TRANSPARENT,
  type Command,
  type Point,
} from '../core/drawing';
import { createEditor, type Editor } from '../core/editor';
import { STUDIO_PLACEHOLDER_PALETTE } from '../core/palettes';
import { Nav } from './Nav';
import { PixelCanvas } from './PixelCanvas';

type Tool = 'pencil' | 'eraser' | 'fill' | 'eyedropper';

const TOOLS: { tool: Tool; label: string; shortcut: string; Icon: LucideIcon }[] = [
  { tool: 'pencil', label: 'Pencil', shortcut: 'B', Icon: Pencil },
  { tool: 'eraser', label: 'Eraser', shortcut: 'E', Icon: Eraser },
  { tool: 'fill', label: 'Fill', shortcut: 'F', Icon: PaintBucket },
  { tool: 'eyedropper', label: 'Eyedropper', shortcut: 'I', Icon: Pipette },
];

/** Multiples of the size at which the whole drawing fits the view. */
const ZOOM_LEVELS = [1, 2, 3, 4, 6, 8];
/** How far one arrow key press pans, in screen pixels. */
const PAN_STEP = 32;
const DEFAULT_SIZE = 16;

interface View {
  zoomIndex: number;
  /** Offset of the drawing's centre from the view's centre, in screen pixels. */
  pan: Point;
}
const FIT_VIEW: View = { zoomIndex: 0, pan: { x: 0, y: 0 } };

function newEditor(width: number, height: number): Editor {
  return createEditor(createDrawing({ width, height, palette: STUDIO_PLACEHOLDER_PALETTE }));
}

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

export function Studio() {
  const [editor, setEditor] = useState(() => newEditor(DEFAULT_SIZE, DEFAULT_SIZE));
  const { drawing, canUndo, canRedo } = useSyncExternalStore(editor.subscribe, editor.getState);
  const [tool, setTool] = useState<Tool>('pencil');
  const [color, setColor] = useState(0);
  const [showGrid, setShowGrid] = useState(false);
  const [view, setView] = useState<View>(FIT_VIEW);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [newDrawingOpen, setNewDrawingOpen] = useState(false);
  const panDrag = useRef<{ start: Point; pan: Point } | null>(null);

  function zoomBy(steps: number) {
    setView(({ zoomIndex, pan }) => {
      const next = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, zoomIndex + steps));
      // Scale the pan with the zoom so the point at the view's centre stays there.
      const ratio = ZOOM_LEVELS[next]! / ZOOM_LEVELS[zoomIndex]!;
      return { zoomIndex: next, pan: { x: pan.x * ratio, y: pan.y * ratio } };
    });
  }

  function panBy(dx: number, dy: number) {
    setView((v) => ({ ...v, pan: { x: v.pan.x + dx, y: v.pan.y + dy } }));
  }

  function strokeCommand(points: readonly Point[]): Command {
    return tool === 'eraser' ? { type: 'eraser', points } : { type: 'pencil', color, points };
  }

  function strokeStart(at: Point) {
    switch (tool) {
      case 'pencil':
      case 'eraser':
        editor.apply(strokeCommand([at]));
        return;
      case 'fill':
        editor.apply({ type: 'fill', color, at });
        return;
      case 'eyedropper': {
        const picked = getPixel(drawing, at.x, at.y);
        // Picking a transparent pixel means "draw transparency", which is the eraser.
        if (picked === TRANSPARENT) {
          setTool('eraser');
        } else {
          setColor(picked);
          setTool('pencil');
        }
        return;
      }
    }
  }

  function strokeMove(from: Point, to: Point) {
    if (tool === 'pencil' || tool === 'eraser') {
      editor.apply(strokeCommand([from, to]), { mergeWithLast: true });
    }
  }

  function createNewDrawing(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setEditor(newEditor(Number(form.get('width')), Number(form.get('height'))));
    setView(FIT_VIEW);
    setNewDrawingOpen(false);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (isTyping(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'z') {
      if (e.shiftKey) editor.redo();
      else editor.undo();
    } else if (mod && key === 'y') {
      editor.redo();
    } else if (mod || e.altKey) {
      return;
    } else if (key === ' ') {
      setSpaceHeld(true);
      // Let Space still press a focused button.
      if (e.target instanceof HTMLButtonElement) return;
    } else if (key === '+' || key === '=') {
      zoomBy(1);
    } else if (key === '-') {
      zoomBy(-1);
    } else if (key === '0') {
      setView(FIT_VIEW);
    } else if (key === 'arrowleft') {
      panBy(PAN_STEP, 0);
    } else if (key === 'arrowright') {
      panBy(-PAN_STEP, 0);
    } else if (key === 'arrowup') {
      panBy(0, PAN_STEP);
    } else if (key === 'arrowdown') {
      panBy(0, -PAN_STEP);
    } else if (key === 'g') {
      setShowGrid((g) => !g);
    } else if (key === 'n') {
      setNewDrawingOpen(true);
    } else {
      const match = TOOLS.find((t) => t.shortcut.toLowerCase() === key);
      if (!match) return;
      setTool(match.tool);
    }
    e.preventDefault();
  }

  // Studio-wide keyboard shortcuts. A ref callback with cleanup (not an effect):
  // it re-subscribes each render so the handler always sees current state.
  function listenForKeys(node: HTMLDivElement | null) {
    if (!node) return;
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpaceHeld(false);
    };
    const blur = () => setSpaceHeld(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }

  const zoom = ZOOM_LEVELS[view.zoomIndex]!;
  const longest = Math.max(drawing.width, drawing.height);
  const frameStyle = {
    '--w': (zoom * drawing.width) / longest,
    '--h': (zoom * drawing.height) / longest,
    transform: `translate(${view.pan.x}px, ${view.pan.y}px)`,
  } as CSSProperties;

  const actions: {
    label: string;
    shortcut: string;
    Icon: LucideIcon;
    onClick: () => void;
    disabled?: boolean;
    pressed?: boolean;
  }[] = [
    { label: 'New drawing', shortcut: 'N', Icon: FilePlus, onClick: () => setNewDrawingOpen(true) },
    { label: 'Undo', shortcut: 'Ctrl+Z', Icon: Undo2, onClick: editor.undo, disabled: !canUndo },
    {
      label: 'Redo',
      shortcut: 'Ctrl+Shift+Z',
      Icon: Redo2,
      onClick: editor.redo,
      disabled: !canRedo,
    },
    {
      label: 'Zoom in',
      shortcut: '+',
      Icon: ZoomIn,
      onClick: () => zoomBy(1),
      disabled: view.zoomIndex === ZOOM_LEVELS.length - 1,
    },
    {
      label: 'Zoom out',
      shortcut: '-',
      Icon: ZoomOut,
      onClick: () => zoomBy(-1),
      disabled: view.zoomIndex === 0,
    },
    {
      label: 'Pixel grid',
      shortcut: 'G',
      Icon: Grid3x3,
      onClick: () => setShowGrid((g) => !g),
      pressed: showGrid,
    },
  ];

  return (
    <div className="page studio" ref={listenForKeys}>
      <Nav current="studio" />
      <main className="studio-main">
        <div
          className="pill tool-pill"
          role="toolbar"
          aria-label="Tools"
          aria-orientation="vertical"
        >
          {TOOLS.map(({ tool: t, label, shortcut, Icon }) => (
            <button
              key={t}
              type="button"
              className="tool"
              aria-label={label}
              title={`${label} (${shortcut})`}
              aria-keyshortcuts={shortcut}
              aria-pressed={tool === t}
              onClick={() => setTool(t)}
            >
              <Icon aria-hidden size={22} />
            </button>
          ))}
        </div>
        <div className="studio-center">
          <div className="pill action-pill" role="toolbar" aria-label="Actions">
            {actions.map(({ label, shortcut, Icon, onClick, disabled, pressed }) => (
              <button
                key={label}
                type="button"
                className="tool"
                aria-label={label}
                title={`${label} (${shortcut})`}
                aria-keyshortcuts={shortcut.replace('Ctrl', 'Control')}
                aria-pressed={pressed}
                disabled={disabled}
                onClick={onClick}
              >
                <Icon aria-hidden size={20} />
              </button>
            ))}
          </div>
          {newDrawingOpen && (
            <form
              className="card new-drawing"
              aria-label="New drawing"
              onSubmit={createNewDrawing}
              onKeyDown={(e) => e.key === 'Escape' && setNewDrawingOpen(false)}
            >
              <label>
                Width
                <input
                  name="width"
                  type="number"
                  required
                  min={1}
                  max={MAX_DRAWING_SIZE}
                  step={1}
                  defaultValue={drawing.width}
                  autoFocus
                />
              </label>
              <label>
                Height
                <input
                  name="height"
                  type="number"
                  required
                  min={1}
                  max={MAX_DRAWING_SIZE}
                  step={1}
                  defaultValue={drawing.height}
                />
              </label>
              <button type="submit" className="btn primary">
                Create
              </button>
              <button type="button" className="btn" onClick={() => setNewDrawingOpen(false)}>
                Cancel
              </button>
              <p className="hint">
                Up to {MAX_DRAWING_SIZE}x{MAX_DRAWING_SIZE}. Replaces the current drawing.
              </p>
            </form>
          )}
          <div
            className={`stage${spaceHeld ? ' panning' : ''}`}
            onMouseDown={(e) => {
              // Stop the middle button's autoscroll so it can pan instead.
              if (e.button === 1) e.preventDefault();
            }}
            onPointerDownCapture={(e) => {
              if (!(e.button === 1 || (e.button === 0 && spaceHeld))) return;
              // Pan instead of drawing: keep the press from reaching the canvas.
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              panDrag.current = { start: { x: e.clientX, y: e.clientY }, pan: view.pan };
            }}
            onPointerMove={(e) => {
              const drag = panDrag.current;
              if (!drag) return;
              setView((v) => ({
                ...v,
                pan: {
                  x: drag.pan.x + e.clientX - drag.start.x,
                  y: drag.pan.y + e.clientY - drag.start.y,
                },
              }));
            }}
            onLostPointerCapture={() => (panDrag.current = null)}
          >
            <div className="canvas-frame" style={frameStyle}>
              <PixelCanvas
                drawing={drawing}
                onStrokeStart={strokeStart}
                onStrokeMove={strokeMove}
                showGrid={showGrid}
                label={`Studio canvas, ${drawing.width} by ${drawing.height} pixels`}
              />
            </div>
          </div>
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
