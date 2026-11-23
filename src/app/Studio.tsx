import {
  Eraser,
  FilePlus,
  Grid3x3,
  PaintBucket,
  Pencil,
  Pipette,
  Redo2,
  Scan,
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
import { canZoom, FIT_VIEW, panView, viewZoom, zoomView, type View } from '../core/view';
import { Nav } from './Nav';
import { PixelCanvas } from './PixelCanvas';

type Tool = 'pencil' | 'eraser' | 'fill' | 'eyedropper';

/** A key press: `key` is KeyboardEvent.key lowercased. `shift` unset means either. */
interface Chord {
  key: string;
  mod?: boolean;
  shift?: boolean;
}

/** A toolbar button and its keyboard shortcuts; the first chord is the one shown. */
interface Control {
  label: string;
  Icon: LucideIcon;
  chords: Chord[];
  run: () => void;
  disabled?: boolean;
  pressed?: boolean;
}

/** How far one arrow key press pans, in screen pixels. */
const PAN_STEP = 32;
const DEFAULT_SIZE = 16;

function newEditor(width: number, height: number): Editor {
  return createEditor(createDrawing({ width, height, palette: STUDIO_PLACEHOLDER_PALETTE }));
}

function matches(chord: Chord, e: KeyboardEvent) {
  return (
    e.key.toLowerCase() === chord.key &&
    (e.ctrlKey || e.metaKey) === !!chord.mod &&
    (chord.shift === undefined || chord.shift === e.shiftKey)
  );
}

function chordLabel({ key, mod, shift }: Chord, ctrl = 'Ctrl', plus = '+') {
  return `${mod ? `${ctrl}+` : ''}${shift ? 'Shift+' : ''}${key === '+' ? plus : key.toUpperCase()}`;
}

function ControlButton({ control, iconSize }: { control: Control; iconSize: number }) {
  const { label, Icon, chords, run, disabled, pressed } = control;
  return (
    <button
      type="button"
      className="tool"
      aria-label={label}
      title={`${label} (${chordLabel(chords[0]!)})`}
      aria-keyshortcuts={chords.map((c) => chordLabel(c, 'Control', 'Plus')).join(' ')}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={run}
    >
      <Icon aria-hidden size={iconSize} />
    </button>
  );
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

  const tools: (Control & { tool: Tool })[] = (
    [
      { tool: 'pencil', label: 'Pencil', Icon: Pencil, key: 'b' },
      { tool: 'eraser', label: 'Eraser', Icon: Eraser, key: 'e' },
      { tool: 'fill', label: 'Fill', Icon: PaintBucket, key: 'f' },
      { tool: 'eyedropper', label: 'Eyedropper', Icon: Pipette, key: 'i' },
    ] as const
  ).map(({ key, ...t }) => ({
    ...t,
    chords: [{ key }],
    run: () => setTool(t.tool),
    pressed: tool === t.tool,
  }));

  const actions: Control[] = [
    {
      label: 'New drawing',
      Icon: FilePlus,
      chords: [{ key: 'n' }],
      run: () => setNewDrawingOpen(true),
    },
    {
      label: 'Undo',
      Icon: Undo2,
      chords: [{ key: 'z', mod: true, shift: false }],
      run: editor.undo,
      disabled: !canUndo,
    },
    {
      label: 'Redo',
      Icon: Redo2,
      chords: [
        { key: 'z', mod: true, shift: true },
        { key: 'y', mod: true },
      ],
      run: editor.redo,
      disabled: !canRedo,
    },
    {
      label: 'Zoom in',
      Icon: ZoomIn,
      chords: [{ key: '+' }, { key: '=' }],
      run: () => setView((v) => zoomView(v, 1)),
      disabled: !canZoom(view, 1),
    },
    {
      label: 'Zoom out',
      Icon: ZoomOut,
      chords: [{ key: '-' }],
      run: () => setView((v) => zoomView(v, -1)),
      disabled: !canZoom(view, -1),
    },
    {
      label: 'Fit to view',
      Icon: Scan,
      chords: [{ key: '0' }],
      run: () => setView(FIT_VIEW),
      disabled: view === FIT_VIEW,
    },
    {
      label: 'Pixel grid',
      Icon: Grid3x3,
      chords: [{ key: 'g' }],
      run: () => setShowGrid((g) => !g),
      pressed: showGrid,
    },
  ];

  const panKeys: Record<string, [number, number]> = {
    arrowleft: [PAN_STEP, 0],
    arrowright: [-PAN_STEP, 0],
    arrowup: [0, PAN_STEP],
    arrowdown: [0, -PAN_STEP],
  };

  function strokeCommand(points: readonly Point[]): Command {
    return tool === 'eraser' ? { type: 'eraser', points } : { type: 'pencil', color, points };
  }

  function press(at: Point) {
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

  function drag(from: Point, to: Point) {
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
    if (e.target instanceof HTMLInputElement || e.altKey) return;
    if (e.key === ' ') {
      setSpaceHeld(true);
      // Let Space still press a focused button.
      if (!(e.target instanceof HTMLButtonElement)) e.preventDefault();
      return;
    }
    const pan = !(e.ctrlKey || e.metaKey) && panKeys[e.key.toLowerCase()];
    if (pan) {
      setView((v) => panView(v, ...pan));
      e.preventDefault();
      return;
    }
    const control = [...tools, ...actions].find((c) => c.chords.some((chord) => matches(chord, e)));
    if (!control) return;
    e.preventDefault();
    if (!control.disabled) control.run();
  }

  // Studio-wide keyboard shortcuts. A ref callback with cleanup (not an effect):
  // it re-subscribes each render so the handler always sees current state.
  function listenForKeys(node: HTMLDivElement | null) {
    if (!node) return;
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpaceHeld(false);
    };
    const onBlur = () => setSpaceHeld(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }

  const zoom = viewZoom(view);
  const longest = Math.max(drawing.width, drawing.height);
  const zoomedStyle = {
    '--w': (zoom * drawing.width) / longest,
    '--h': (zoom * drawing.height) / longest,
    transform: `translate(${view.pan.x}px, ${view.pan.y}px)`,
  } as CSSProperties;

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
          {tools.map((t) => (
            <ControlButton key={t.label} control={t} iconSize={22} />
          ))}
        </div>
        <div className="studio-center">
          <div className="pill action-pill" role="toolbar" aria-label="Actions">
            {actions.map((a) => (
              <ControlButton key={a.label} control={a} iconSize={20} />
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
              const start = panDrag.current;
              if (!start) return;
              setView((v) => ({
                ...v,
                pan: {
                  x: start.pan.x + e.clientX - start.start.x,
                  y: start.pan.y + e.clientY - start.start.y,
                },
              }));
            }}
            onLostPointerCapture={() => (panDrag.current = null)}
          >
            <div className="zoomed-canvas" style={zoomedStyle}>
              <PixelCanvas
                drawing={drawing}
                onPress={press}
                onDrag={drag}
                showGrid={showGrid}
                label={`Studio canvas, ${drawing.width} by ${drawing.height} pixels`}
              />
            </div>
          </div>
          <p className="hint">Pan with Space+drag, the middle mouse button or the arrow keys.</p>
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
